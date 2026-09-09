import CryptoKit
import Foundation
import Security

/// Only ciphertext reaches Application Support. The key never leaves this device's Keychain.
final class PendingStore {
  private static let lock = NSRecursiveLock()
  private let directory: URL
  private let keyProvider: (() throws -> SymmetricKey)?

  init(directory: URL? = nil, keyProvider: (() throws -> SymmetricKey)? = nil) throws {
    self.directory = try directory ?? FileManager.default.url(
      for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true
    ).appendingPathComponent("psyrec-pending", isDirectory: true)
    self.keyProvider = keyProvider
    #if os(iOS)
    let attributes: [FileAttributeKey: Any] = [.protectionKey: FileProtectionType.complete]
    #else
    let attributes: [FileAttributeKey: Any] = [:] // macOS policy tests only.
    #endif
    try FileManager.default.createDirectory(at: self.directory, withIntermediateDirectories: true, attributes: attributes)
    var location = self.directory
    var flags = URLResourceValues()
    flags.isExcludedFromBackup = true
    try location.setResourceValues(flags)
  }

  private func locked<T>(_ work: () throws -> T) rethrows -> T {
    Self.lock.lock()
    defer { Self.lock.unlock() }
    return try work()
  }

  private func files() throws -> [URL] {
    try FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil)
      .filter { $0.pathExtension == "enc" }.sorted { $0.lastPathComponent < $1.lastPathComponent }
  }

  private func key() throws -> SymmetricKey {
    if let keyProvider { return try keyProvider() }
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: "tech.adwen.psyrec.capture.pending",
      kSecAttrAccount as String: "aes256-v1",
      kSecAttrSynchronizable as String: false
    ]
    var read = query
    read[kSecReturnData as String] = true
    read[kSecMatchLimit as String] = kSecMatchLimitOne
    var value: CFTypeRef?
    let status = SecItemCopyMatching(read as CFDictionary, &value)
    if status == errSecSuccess, let bytes = value as? Data, bytes.count == 32 {
      return SymmetricKey(data: bytes)
    }
    // Never create a replacement key over unreadable queued records.
    guard status == errSecItemNotFound, try files().isEmpty else {
      throw CaptureFailure.rejected("Encrypted capture key is unavailable. Unlock the phone and keep app data intact.")
    }
    let generated = SymmetricKey(size: .bits256)
    var bytes = generated.withUnsafeBytes { Data($0) }
    defer { bytes.resetBytes(in: 0..<bytes.count) }
    var write = query
    write[kSecValueData as String] = bytes
    write[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
    guard SecItemAdd(write as CFDictionary, nil) == errSecSuccess else {
      throw CaptureFailure.rejected("Unable to create the device encryption key.")
    }
    return generated
  }

  private func file(_ id: String) throws -> URL {
    guard let uuid = UUID(uuidString: id), uuid.uuidString.lowercased() == id else {
      throw CaptureFailure.rejected("Invalid pending capture id.")
    }
    return directory.appendingPathComponent(id + ".enc")
  }

  private func save(_ record: CaptureRecord) throws {
    let target = try file(record.transferId)
    var clear = try JSONEncoder().encode(record)
    defer { clear.resetBytes(in: 0..<clear.count) }
    let box = try AES.GCM.seal(clear, using: key(), authenticating: Data(record.transferId.utf8))
    guard let combined = box.combined else { throw CaptureFailure.rejected("Capture encryption failed.") }
    var encrypted = Data([1])
    encrypted.append(combined)
    // Atomic replacement retains either the old encrypted photo or the encrypted receipt.
    #if os(iOS)
    try encrypted.write(to: target, options: [.atomic, .completeFileProtection])
    #else
    try encrypted.write(to: target, options: .atomic)
    #endif
  }

  func read(_ id: String) throws -> CaptureRecord {
    try locked {
      let encrypted = try Data(contentsOf: file(id))
      guard encrypted.count > 29, encrypted.first == 1 else {
        throw CaptureFailure.rejected("Damaged encrypted capture. Keep app data intact.")
      }
      let box = try AES.GCM.SealedBox(combined: encrypted.dropFirst())
      var clear = try AES.GCM.open(box, using: key(), authenticating: Data(id.utf8))
      defer { clear.resetBytes(in: 0..<clear.count) }
      let record = try JSONDecoder().decode(CaptureRecord.self, from: clear)
      guard record.transferId == id else { throw CaptureFailure.rejected("Capture identity mismatch.") }
      return record
    }
  }

  private func records() throws -> [CaptureRecord] {
    try files().map { try read($0.deletingPathExtension().lastPathComponent) }
  }

  func pending() throws -> [[String: String]] {
    try locked { try records().filter { $0.receipt == nil }.map(\.metadata) }
  }

  func completed(_ encounterId: String) throws -> Bool {
    try locked { try records().contains { $0.encounterId == encounterId && $0.receipt != nil } }
  }

  func capture(_ jpeg: Data, encounterId: String) throws -> [String: String] {
    try locked {
      guard !encounterId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
        !jpeg.isEmpty, jpeg.count <= 8 * 1024 * 1024 else {
        throw CaptureFailure.rejected("Capture is invalid or exceeds 8 MB.")
      }
      guard try !records().contains(where: { $0.encounterId == encounterId }) else {
        throw CaptureFailure.rejected("This encounter already has a pending or received capture. Pair a new encounter.")
      }
      let record = CaptureRecord(transferId: UUID().uuidString.lowercased(), encounterId: encounterId,
        sha256: PinnedPeer.fingerprint(jpeg), createdAt: ISO8601DateFormatter().string(from: Date()),
        image: jpeg.base64EncodedString(), receipt: nil)
      try save(record)
      return record.metadata
    }
  }

  func complete(_ record: CaptureRecord, receipt: CaptureReceipt, deviceId: String) throws {
    try locked {
      try receipt.validate(for: record, deviceId: deviceId)
      // Re-read the durable record before replacement, retaining the queue on any mismatch.
      var current = try read(record.transferId)
      try receipt.validate(for: current, deviceId: deviceId)
      current.image = nil
      current.receipt = receipt
      try save(current)
    }
  }
}
