package expo.modules.psyrectransfer

internal data class ReceiptFields(val deviceId: String, val transferId: String, val encounterId: String, val sha256: String, val captureId: String, val receivedAt: String)
internal object ReceiptPolicy {
  fun requireMatching(deviceId: String, transferId: String, encounterId: String, imageSha256: String, receipt: ReceiptFields) {
    require(receipt.deviceId == deviceId && receipt.transferId == transferId && receipt.encounterId == encounterId && receipt.sha256 == imageSha256 &&
      receipt.captureId.isNotBlank() && receipt.receivedAt.isNotBlank()) { "Receipt mismatch." }
    java.time.Instant.parse(receipt.receivedAt)
  }
}
