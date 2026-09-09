import ExpoModulesCore
import Foundation

public final class PsyRecTransferModule: Module {
  private let shield = PrivateScreenShield()

  public func definition() -> ModuleDefinition {
    Name("PsyRecTransfer")
    OnCreate { DispatchQueue.main.async { self.shield.start() } }
    OnDestroy { DispatchQueue.main.async { self.shield.stop() } }

    AsyncFunction("pending") { () throws -> [[String: String]] in
      try PendingStore().pending()
    }
    AsyncFunction("completed") { (encounterId: String) throws -> Bool in
      try PendingStore().completed(encounterId)
    }
    AsyncFunction("pair") { (endpoint: String, pin: String, secret: String, promise: Promise) in
      do {
        guard try PendingStore().pending().isEmpty else {
          throw CaptureFailure.rejected("Finish pending captures before pairing another encounter.")
        }
        try PinnedHTTPS.post(endpoint: endpoint, pin: pin, path: "/pair",
          body: ["secret": secret, "deviceName": "PsyRec iPhone capture"]) { result in
          switch result {
          case .success(let data):
            guard let text = String(data: data, encoding: .utf8) else {
              promise.reject("PAIR_FAILED", "PC pairing response was invalid.")
              return
            }
            promise.resolve(text)
          case .failure: promise.reject("PAIR_FAILED", "Secure pairing failed. Check Wi-Fi, local-network permission and the current PC QR.")
          }
        }
      } catch { promise.reject("PAIR_FAILED", error.localizedDescription) }
    }
    AsyncFunction("send") { (endpoint: String, pin: String, deviceId: String, token: String,
      encounterId: String, id: String, promise: Promise) in
      do {
        let store = try PendingStore()
        let queued = try store.read(id)
        guard queued.encounterId == encounterId else {
          throw CaptureFailure.rejected("Capture belongs to another encounter. Pair with its original encounter.")
        }
        guard queued.receipt == nil, let image = queued.image else {
          throw CaptureFailure.rejected("This capture has already been received.")
        }
        try PinnedHTTPS.post(endpoint: endpoint, pin: pin, path: "/captures",
          body: ["deviceId": deviceId, "transferId": id, "encounterId": encounterId, "image": image], token: token) { result in
          do {
            let data = try result.get()
            let receipt = try JSONDecoder().decode(CaptureReceipt.self, from: data)
            try store.complete(queued, receipt: receipt, deviceId: deviceId)
            promise.resolve(String(decoding: data, as: UTF8.self))
          } catch {
            promise.reject("TRANSFER_FAILED", "Transfer or receipt validation failed. Encrypted queue retained; retry safely.")
          }
        }
      } catch { promise.reject("TRANSFER_FAILED", error.localizedDescription) }
    }
    View(PrivateCameraView.self) {
      AsyncFunction("capture") { (view: PrivateCameraView, encounterId: String, promise: Promise) in
        view.capture(encounterId: encounterId, promise: promise)
      }
    }
  }
}
