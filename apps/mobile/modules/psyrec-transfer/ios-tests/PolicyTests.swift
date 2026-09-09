import CryptoKit
import Foundation
import Security
import XCTest
@testable import PsyRecTransferPolicy

final class PolicyTests: XCTestCase {
  func testPrivateEndpointsOnly() throws {
    let pin = String(repeating: "a", count: 64)
    for host in ["10.1.2.3", "192.168.0.3", "172.16.0.3", "172.31.255.3"] {
      XCTAssertEqual(try PinnedPeer.endpoint("https://\(host):9443", pin: pin).host, host)
    }
    for endpoint in ["http://192.168.0.3", "https://8.8.8.8", "https://172.32.0.1", "https://localhost",
      "https://user@10.0.0.1", "https://10.0.0.1/captures", "https://10.0.0.1?token=a",
      "https://10.0.0.1#fragment", "https://10.0.0.999", "https://010.0.0.1", "https://10.0.0.1:0",
      "https://10.0.0.1:65536", "https://[::1]", "https://10.0.0.1\n"] {
      XCTAssertThrowsError(try PinnedPeer.endpoint(endpoint, pin: pin), endpoint)
    }
    XCTAssertThrowsError(try PinnedPeer.endpoint("https://10.0.0.1", pin: "bad-pin"))
  }

  func testPhysicalPinAndCertificateDates() throws {
    let fixture = try XCTUnwrap(Bundle.module.url(forResource: "synthetic-certificate", withExtension: "pem", subdirectory: "Fixtures"))
    let pem = try String(contentsOf: fixture, encoding: .utf8)
    let base64 = pem.components(separatedBy: .newlines).filter { !$0.hasPrefix("-----") }.joined()
    let der = try XCTUnwrap(Data(base64Encoded: base64))
    let certificate = try XCTUnwrap(SecCertificateCreateWithData(nil, der as CFData))
    let pin = PinnedPeer.fingerprint(der)
    let dates = try PinnedPeer.validity(der)
    let middle = dates.lowerBound.addingTimeInterval(dates.upperBound.timeIntervalSince(dates.lowerBound) / 2)
    XCTAssertNoThrow(try PinnedPeer.verify(certificate, pin: pin, now: middle))
    XCTAssertThrowsError(try PinnedPeer.verify(certificate, pin: String(repeating: "0", count: 64), now: middle))
    XCTAssertThrowsError(try PinnedPeer.verify(certificate, pin: pin, now: dates.lowerBound.addingTimeInterval(-1)))
    XCTAssertThrowsError(try PinnedPeer.verify(certificate, pin: pin, now: dates.upperBound.addingTimeInterval(1)))
    for prefixLength in [0, 1, 4, 10] {
      XCTAssertThrowsError(try PinnedPeer.validity(Data(der.prefix(prefixLength))))
    }
  }

  func testEncryptedReloadTamperAndReceiptRetention() throws {
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
    defer { try? FileManager.default.removeItem(at: directory) }
    let key = SymmetricKey(size: .bits256)
    let store = try PendingStore(directory: directory, keyProvider: { key })
    let synthetic = Data("SYNTHETIC PHOTO BYTES - NOT A PATIENT RECORD".utf8)
    let metadata = try store.capture(synthetic, encounterId: "synthetic-encounter")
    let id = try XCTUnwrap(metadata["transferId"])
    let file = directory.appendingPathComponent(id + ".enc")
    let encrypted = try Data(contentsOf: file)
    XCTAssertNil(encrypted.range(of: synthetic))
    XCTAssertNil(encrypted.range(of: Data("synthetic-encounter".utf8)))
    let restored = try PendingStore(directory: directory, keyProvider: { key })
    let record = try restored.read(id)
    XCTAssertEqual(record.image, synthetic.base64EncodedString())
    XCTAssertEqual(try restored.pending().count, 1)
    XCTAssertFalse(try restored.completed(record.encounterId))
    XCTAssertThrowsError(try restored.capture(synthetic, encounterId: record.encounterId))
    let wrongKey = try PendingStore(directory: directory, keyProvider: { SymmetricKey(size: .bits256) })
    XCTAssertThrowsError(try wrongKey.read(id))
    XCTAssertEqual(try Data(contentsOf: file), encrypted)

    func receipt(device: String = "phone", transfer: String? = nil, encounter: String? = nil,
      hash: String? = nil, capture: String = "capture", received: String = "2026-09-09T12:00:00Z") -> CaptureReceipt {
      CaptureReceipt(deviceId: device, transferId: transfer ?? id, encounterId: encounter ?? record.encounterId,
        sha256: hash ?? record.sha256, captureId: capture, receivedAt: received)
    }
    for invalid in [receipt(device: "other"), receipt(transfer: UUID().uuidString.lowercased()),
      receipt(encounter: "other"), receipt(hash: "wrong"), receipt(capture: " "), receipt(received: "")] {
      XCTAssertThrowsError(try restored.complete(record, receipt: invalid, deviceId: "phone"))
      XCTAssertEqual(try Data(contentsOf: file), encrypted)
      XCTAssertEqual(try restored.pending().count, 1)
    }
    var damaged = encrypted
    damaged[damaged.count - 1] ^= 1
    try damaged.write(to: file)
    XCTAssertThrowsError(try restored.read(id))
    XCTAssertThrowsError(try restored.pending())
    try encrypted.write(to: file)

    try restored.complete(record, receipt: receipt(), deviceId: "phone")
    let completed = try PendingStore(directory: directory, keyProvider: { key })
    XCTAssertTrue(try completed.completed(record.encounterId))
    XCTAssertTrue(try completed.pending().isEmpty)
    XCTAssertNil(try completed.read(id).image)
    XCTAssertNotNil(try completed.read(id).receipt)
    XCTAssertThrowsError(try completed.capture(synthetic, encounterId: record.encounterId))
    XCTAssertThrowsError(try completed.read("../../outside"))
  }

  func testCiphertextCannotBeRenamedToAnotherTransfer() throws {
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
    defer { try? FileManager.default.removeItem(at: directory) }
    let key = SymmetricKey(size: .bits256)
    let store = try PendingStore(directory: directory, keyProvider: { key })
    let item = try store.capture(Data("synthetic".utf8), encounterId: "encounter")
    let id = try XCTUnwrap(item["transferId"])
    let replacement = UUID().uuidString.lowercased()
    try FileManager.default.copyItem(at: directory.appendingPathComponent(id + ".enc"),
      to: directory.appendingPathComponent(replacement + ".enc"))
    XCTAssertThrowsError(try store.read(replacement))
  }
}
