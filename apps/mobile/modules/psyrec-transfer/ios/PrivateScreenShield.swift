import UIKit

/// Cover the app before task-switcher snapshots and while screen recording/mirroring is detected.
/// iOS has no supported FLAG_SECURE equivalent that prevents every user screenshot.
final class PrivateScreenShield {
  private var observers: [NSObjectProtocol] = []
  private var covers: [UIView] = []

  func start() {
    guard observers.isEmpty else { return }
    for name in [UIApplication.willResignActiveNotification, UIApplication.didBecomeActiveNotification,
      UIScreen.capturedDidChangeNotification] {
      observers.append(NotificationCenter.default.addObserver(forName: name, object: nil, queue: .main) { [weak self] notification in
        self?.update(forceCover: notification.name == UIApplication.willResignActiveNotification)
      })
    }
    update()
  }

  private func update(forceCover: Bool = false) {
    for cover in covers { cover.removeFromSuperview() }
    covers.removeAll()
    let windows = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.flatMap(\.windows)
    for window in windows where !window.isHidden &&
      (forceCover || UIApplication.shared.applicationState != .active || window.screen.isCaptured) {
      let cover = UIView(frame: window.bounds)
      cover.autoresizingMask = [.flexibleWidth, .flexibleHeight]
      cover.backgroundColor = UIColor(red: 0.95, green: 0.96, blue: 0.98, alpha: 1)
      let label = UILabel(frame: cover.bounds.insetBy(dx: 24, dy: 24))
      label.autoresizingMask = [.flexibleWidth, .flexibleHeight]
      label.text = "PsyRec Capture locked"
      label.textAlignment = .center
      cover.addSubview(label)
      window.addSubview(cover)
      covers.append(cover)
    }
  }

  func stop() {
    for observer in observers { NotificationCenter.default.removeObserver(observer) }
    observers.removeAll()
    for cover in covers { cover.removeFromSuperview() }
    covers.removeAll()
  }
}
