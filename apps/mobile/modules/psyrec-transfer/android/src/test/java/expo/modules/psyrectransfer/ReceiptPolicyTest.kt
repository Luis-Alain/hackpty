package expo.modules.psyrectransfer

import org.junit.Assert.assertThrows
import org.junit.Test

class ReceiptPolicyTest {
  private val valid = ReceiptFields("device-1", "transfer-1", "encounter-1", "a".repeat(64), "capture-1", "2026-09-09T21:00:00Z")
  @Test fun acceptsOnlyAnExactCompleteReceipt() {
    ReceiptPolicy.requireMatching("device-1", "transfer-1", "encounter-1", "a".repeat(64), valid)
    for (invalid in listOf(valid.copy(deviceId = "other"), valid.copy(transferId = "other"), valid.copy(encounterId = "other"),
      valid.copy(sha256 = "b".repeat(64)), valid.copy(captureId = ""), valid.copy(receivedAt = ""), valid.copy(receivedAt = "not-a-timestamp"))) {
      assertThrows(Exception::class.java) { ReceiptPolicy.requireMatching("device-1", "transfer-1", "encounter-1", "a".repeat(64), invalid) }
    }
  }
}
