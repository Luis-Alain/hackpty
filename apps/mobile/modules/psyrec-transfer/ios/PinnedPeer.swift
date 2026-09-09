import CryptoKit
import Foundation
import Security

enum PinnedPeer {
  static func fingerprint(_ bytes: Data) -> String {
    SHA256.hash(data: bytes).map { String(format: "%02x", $0) }.joined()
  }

  static func endpoint(_ text: String, pin: String) throws -> URL {
    guard pin.range(of: "\\A[a-f0-9]{64}\\z", options: .regularExpression) != nil,
      text.range(of: "\\Ahttps://[0-9]{1,3}(\\.[0-9]{1,3}){3}(:[0-9]{1,5})?/?\\z", options: .regularExpression) != nil,
      let url = URL(string: text), let host = url.host else {
      throw CaptureFailure.rejected("Pairing requires a private IPv4 HTTPS endpoint and certificate fingerprint.")
    }
    let parts = host.split(separator: ".")
    let octets = parts.compactMap { Int($0) }
    guard octets.count == 4, zip(parts, octets).allSatisfy({ String($0.1) == String($0.0) }),
      octets.allSatisfy({ (0...255).contains($0) }), (1...65535).contains(url.port ?? 443),
      octets[0] == 10 || (octets[0] == 192 && octets[1] == 168) ||
        (octets[0] == 172 && (16...31).contains(octets[1])) else {
      throw CaptureFailure.rejected("Pairing requires a private IPv4 HTTPS endpoint.")
    }
    return url
  }

  static func verify(_ certificate: SecCertificate, pin: String, now: Date = Date()) throws {
    let der = SecCertificateCopyData(certificate) as Data
    guard fingerprint(der) == pin else { throw CaptureFailure.rejected("Paired PC certificate does not match.") }
    let dates = try validity(der)
    guard dates.lowerBound <= now, now <= dates.upperBound else {
      throw CaptureFailure.rejected("Paired PC certificate is not currently valid. Refresh pairing on the PC.")
    }
    // The physical QR authenticates the exact leaf; the TLS handshake proves private-key possession.
    // This deliberately matches Android: the PC's self-signed certificate has no IP subjectAltName.
  }

  /// Read only X.509 validity (RFC 5280). SecCertificate has already parsed the certificate.
  /// Explicit dates are required because a locally trusted anchor can bypass expiry policy.
  static func validity(_ der: Data) throws -> ClosedRange<Date> {
    var outer = DER(bytes: Array(der))
    var certificate = try outer.sequence()
    var tbs = try certificate.sequence()
    if tbs.peek == 0xa0 { _ = try tbs.take(0xa0) }
    _ = try tbs.take(0x02) // serial
    _ = try tbs.take(0x30) // signature algorithm
    _ = try tbs.take(0x30) // issuer
    var dates = try tbs.sequence()
    let start = try dates.date()
    let end = try dates.date()
    guard dates.atEnd, start <= end else { throw CaptureFailure.rejected("Invalid certificate validity.") }
    return start...end
  }

  private struct DER {
    let bytes: [UInt8]
    var cursor = 0
    var peek: UInt8? { cursor < bytes.count ? bytes[cursor] : nil }
    var atEnd: Bool { cursor == bytes.count }

    mutating func take(_ tag: UInt8) throws -> [UInt8] {
      guard peek == tag, cursor + 2 <= bytes.count else { throw CaptureFailure.rejected("Invalid certificate encoding.") }
      cursor += 1
      let first = Int(bytes[cursor]); cursor += 1
      var length = first
      if first & 0x80 != 0 {
        let count = first & 0x7f
        guard (1...4).contains(count), cursor + count <= bytes.count, bytes[cursor] != 0 else {
          throw CaptureFailure.rejected("Invalid certificate length.")
        }
        length = 0
        for _ in 0..<count { length = length * 256 + Int(bytes[cursor]); cursor += 1 }
        guard length >= 128 else { throw CaptureFailure.rejected("Invalid certificate length.") }
      }
      guard length <= bytes.count - cursor else { throw CaptureFailure.rejected("Truncated certificate.") }
      defer { cursor += length }
      return Array(bytes[cursor..<(cursor + length)])
    }

    mutating func sequence() throws -> DER { DER(bytes: try take(0x30)) }

    mutating func date() throws -> Date {
      guard let tag = peek, tag == 0x17 || tag == 0x18,
        let raw = String(bytes: try take(tag), encoding: .ascii) else {
        throw CaptureFailure.rejected("Invalid certificate date.")
      }
      let pattern = tag == 0x17 ? "^[0-9]{12}Z$" : "^[0-9]{14}Z$"
      guard raw.range(of: pattern, options: .regularExpression) != nil else {
        throw CaptureFailure.rejected("Invalid certificate date.")
      }
      let expanded = tag == 0x17 ? ((Int(raw.prefix(2))! >= 50 ? "19" : "20") + raw) : raw
      let formatter = DateFormatter()
      formatter.locale = Locale(identifier: "en_US_POSIX")
      formatter.calendar = Calendar(identifier: .gregorian)
      formatter.timeZone = TimeZone(secondsFromGMT: 0)
      formatter.dateFormat = "yyyyMMddHHmmss'Z'"
      formatter.isLenient = false
      guard let parsed = formatter.date(from: expanded), formatter.string(from: parsed) == expanded else {
        throw CaptureFailure.rejected("Invalid certificate date.")
      }
      return parsed
    }
  }
}
