import Foundation

enum CaptureFailure: Error, LocalizedError {
  case rejected(String)
  var errorDescription: String? {
    switch self { case .rejected(let message): return message }
  }
}

struct CaptureReceipt: Codable {
  let deviceId: String
  let transferId: String
  let encounterId: String
  let sha256: String
  let captureId: String
  let receivedAt: String

  func validate(for record: CaptureRecord, deviceId: String) throws {
    guard self.deviceId == deviceId, transferId == record.transferId,
      encounterId == record.encounterId, sha256 == record.sha256,
      !captureId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
      !receivedAt.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
      throw CaptureFailure.rejected("PC receipt does not match capture. Encrypted queue retained.")
    }
  }
}

struct CaptureRecord: Codable {
  let transferId: String
  let encounterId: String
  let sha256: String
  let createdAt: String
  var image: String?
  var receipt: CaptureReceipt?

  var metadata: [String: String] {
    ["transferId": transferId, "encounterId": encounterId, "sha256": sha256, "createdAt": createdAt]
  }
}
