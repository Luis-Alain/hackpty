import AVFoundation
import ExpoModulesCore
import UIKit

final class PrivateCameraView: ExpoView, AVCapturePhotoCaptureDelegate {
  private let session = AVCaptureSession()
  private let output = AVCapturePhotoOutput()
  private let queue = DispatchQueue(label: "tech.adwen.psyrec.camera")
  private lazy var preview = AVCaptureVideoPreviewLayer(session: session)
  private var observers: [NSObjectProtocol] = []
  // All camera state below is confined to queue.
  private var configured = false
  private var enabled = false
  private var pending: (encounterId: String, promise: Promise, captureId: Int64)?

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    preview.videoGravity = .resizeAspect
    layer.addSublayer(preview)
    for name in [UIApplication.willResignActiveNotification, UIApplication.didBecomeActiveNotification,
      UIScreen.capturedDidChangeNotification] {
      observers.append(NotificationCenter.default.addObserver(forName: name, object: nil, queue: .main) { [weak self] notification in
        self?.updateAvailability(forceOff: notification.name == UIApplication.willResignActiveNotification)
      })
    }
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    preview.frame = bounds
    if let connection = preview.connection, connection.isVideoOrientationSupported {
      connection.videoOrientation = .portrait
    }
  }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    updateAvailability()
  }

  private func updateAvailability(forceOff: Bool = false) {
    let available = !forceOff && window != nil && UIApplication.shared.applicationState == .active &&
      !(window?.screen.isCaptured ?? true)
    preview.isHidden = !available
    queue.async { [weak self] in
      guard let self else { return }
      self.enabled = available
      if available {
        do {
          try self.configure()
          if !self.session.isRunning { self.session.startRunning() }
        } catch { self.enabled = false }
      } else {
        self.pending?.promise.reject("CAPTURE_INTERRUPTED", "Capture interrupted. Reopen the camera and retry.")
        self.pending = nil
        if self.session.isRunning { self.session.stopRunning() }
      }
    }
  }

  private func configure() throws {
    guard !configured else { return }
    guard AVCaptureDevice.authorizationStatus(for: .video) == .authorized,
      let camera = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back) else {
      throw CaptureFailure.rejected("Allow camera permission and reopen the capture screen.")
    }
    let input = try AVCaptureDeviceInput(device: camera)
    session.beginConfiguration()
    defer { session.commitConfiguration() }
    session.sessionPreset = .photo
    guard session.canAddInput(input) else { throw CaptureFailure.rejected("Camera unavailable.") }
    session.addInput(input)
    guard session.canAddOutput(output) else {
      session.removeInput(input)
      throw CaptureFailure.rejected("Photo capture unavailable.")
    }
    session.addOutput(output)
    output.maxPhotoQualityPrioritization = .balanced
    configured = true
  }

  func capture(encounterId: String, promise: Promise) {
    guard window != nil, UIApplication.shared.applicationState == .active,
      !(window?.screen.isCaptured ?? true) else {
      promise.reject("CAPTURE_UNAVAILABLE", "Open the camera in the foreground to capture.")
      return
    }
    queue.async {
      guard self.enabled, self.configured, self.session.isRunning, self.pending == nil else {
        promise.reject("CAPTURE_UNAVAILABLE", "Camera is starting or busy. Check permission and retry.")
        return
      }
      guard self.output.availablePhotoCodecTypes.contains(.jpeg) else {
        promise.reject("CAPTURE_UNAVAILABLE", "JPEG capture is unavailable on this device.")
        return
      }
      let settings = AVCapturePhotoSettings(format: [AVVideoCodecKey: AVVideoCodecType.jpeg])
      self.pending = (encounterId, promise, settings.uniqueID)
      settings.photoQualityPrioritization = .balanced
      settings.flashMode = .off
      if let connection = self.output.connection(with: .video), connection.isVideoOrientationSupported {
        connection.videoOrientation = .portrait
      }
      self.output.capturePhoto(with: settings, delegate: self)
    }
  }

  func photoOutput(_ output: AVCapturePhotoOutput, didFinishProcessingPhoto photo: AVCapturePhoto, error: Error?) {
    queue.async {
      guard let pending = self.pending, pending.captureId == photo.resolvedSettings.uniqueID else { return }
      self.pending = nil
      do {
        guard error == nil, self.enabled, var raw = photo.fileDataRepresentation() else {
          throw CaptureFailure.rejected("Camera capture failed. Retry.")
        }
        defer { raw.resetBytes(in: 0..<raw.count) }
        guard let image = UIImage(data: raw), image.size.width > 0, image.size.height > 0 else {
          throw CaptureFailure.rejected("Camera did not supply a valid photo.")
        }
        // Re-render in memory to flatten orientation and discard camera metadata.
        let scale = min(1, 1600 / max(image.size.width, image.size.height))
        let size = CGSize(width: (image.size.width * scale).rounded(), height: (image.size.height * scale).rounded())
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.opaque = true
        let normalized = UIGraphicsImageRenderer(size: size, format: format).image { _ in
          image.draw(in: CGRect(origin: .zero, size: size))
        }
        guard var jpeg = normalized.jpegData(compressionQuality: 0.9) else {
          throw CaptureFailure.rejected("Photo encoding failed.")
        }
        defer { jpeg.resetBytes(in: 0..<jpeg.count) }
        let metadata = try PendingStore().capture(jpeg, encounterId: pending.encounterId)
        pending.promise.resolve(metadata)
      } catch {
        pending.promise.reject("CAPTURE_FAILED", "Capture could not be encrypted. Keep existing app data intact and retry.")
      }
    }
  }

  func photoOutput(_ output: AVCapturePhotoOutput, didFinishCaptureFor resolvedSettings: AVCaptureResolvedPhotoSettings,
    error: Error?) {
    guard error != nil else { return }
    queue.async {
      guard self.pending?.captureId == resolvedSettings.uniqueID else { return }
      self.pending?.promise.reject("CAPTURE_FAILED", "Camera capture failed. Retry.")
      self.pending = nil
    }
  }

  deinit {
    for observer in observers { NotificationCenter.default.removeObserver(observer) }
    let activeSession = session
    queue.async { if activeSession.isRunning { activeSession.stopRunning() } }
  }
}
