// swift-tools-version: 5.9
import PackageDescription

// Run swift test on a Mac. Camera/Expo views need the actual iOS application build.
let package = Package(
  name: "PsyRecTransferPolicy",
  platforms: [.macOS(.v12), .iOS(.v15)],
  products: [.library(name: "PsyRecTransferPolicy", targets: ["PsyRecTransferPolicy"])],
  targets: [
    .target(name: "PsyRecTransferPolicy", path: "ios",
      exclude: ["PrivateCameraView.swift", "PrivateScreenShield.swift", "PsyRecTransferModule.swift", "PsyRecTransfer.podspec"],
      sources: ["CaptureRecord.swift", "PendingStore.swift", "PinnedPeer.swift", "PinnedHTTPS.swift"]),
    .testTarget(name: "PsyRecTransferPolicyTests", dependencies: ["PsyRecTransferPolicy"],
      path: "ios-tests", resources: [.copy("Fixtures")])
  ]
)
