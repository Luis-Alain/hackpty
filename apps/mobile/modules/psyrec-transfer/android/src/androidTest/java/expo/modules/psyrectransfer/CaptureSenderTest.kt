package expo.modules.psyrectransfer

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import java.io.IOException
import java.util.UUID

/** Synthetic test UID only. Injected network outcomes are never physical TLS evidence. */
@RunWith(AndroidJUnit4::class)
class CaptureSenderTest {
  @Test fun rejectedReceiptsAndNetworkFailureRetainPhotoUntilExactReceiptIsPersisted() {
    val context = InstrumentationRegistry.getInstrumentation().targetContext
    val store = PendingStore(context)
    val id = UUID.randomUUID().toString(); val encounter = "SYNTHETIC-SENDER-" + UUID.randomUUID()
    val photo = "U1lOVEhFVElDLU5PVEEtUEFUSUVOVA=="
    val digest = sha256(android.util.Base64.decode(photo, android.util.Base64.NO_WRAP))
    val queued = JSONObject().put("transferId", id).put("encounterId", encounter).put("sha256", digest).put("image", photo).put("createdAt", "2026-09-09T21:00:00Z")
    val path = File(File(context.noBackupFilesDir, "psyrec-pending"), "$id.enc")
    fun valid() = JSONObject().put("deviceId", "synthetic-device").put("transferId", id).put("encounterId", encounter).put("sha256", digest)
      .put("captureId", "synthetic-capture").put("receivedAt", "2026-09-09T21:00:01Z").put("duplicate", false)
    try {
      store.createCapture(queued, "synthetic-instrumentation")
      assertEquals("synthetic-instrumentation", store.evidence(id).getString("provenance"))
      assertEquals(android.os.Build.MANUFACTURER, store.evidence(id).getJSONObject("device").getString("manufacturer"))
      assertEquals(android.os.Build.MODEL, store.evidence(id).getJSONObject("device").getString("model"))
      val failing = CaptureSender(store) { _, _, _, _, _, certificate, _ -> certificate(true); throw TransportFailure(64, 128, true, IOException("synthetic injected disconnect")) }
      assertThrows(Exception::class.java) { failing.send("https://192.168.1.2:9443", "a".repeat(64), "synthetic-device", "synthetic-token", encounter, id) }
      assertEquals(photo, PendingStore(context).read(id).getString("image"))
      for (field in listOf("deviceId", "transferId", "encounterId", "sha256", "captureId", "receivedAt")) {
        val mismatched = CaptureSender(store) { _, _, _, _, _, certificate, _ -> certificate(true); valid().put(field, "") }
        assertThrows(Exception::class.java) { mismatched.send("https://192.168.1.2:9443", "a".repeat(64), "synthetic-device", "synthetic-token", encounter, id) }
        assertEquals(photo, store.read(id).getString("image")); assertFalse(store.completed(encounter))
      }
      val success = CaptureSender(store) { _, _, _, _, _, certificate, _ -> certificate(true); valid().put("unexpectedPrivateField", "must-not-retain") }
      success.send("https://192.168.1.2:9443", "a".repeat(64), "synthetic-device", "synthetic-token", encounter, id)
      val reopened = PendingStore(context)
      assertFalse(reopened.read(id).has("image")); assertTrue(reopened.completed(encounter)); assertTrue(reopened.list().none { it["transferId"] == id })
      assertFalse(reopened.evidence(id).toString().contains("must-not-retain"))
      assertFalse(reopened.evidence(id).toString().contains("synthetic-token"))
      val events = reopened.evidence(id).getJSONArray("events")
      val matched = events.getJSONObject(events.length() - 2); val replaced = events.getJSONObject(events.length() - 1)
      assertEquals("matching_receipt_received", matched.getString("type")); assertEquals("photo_replaced_by_encrypted_receipt", replaced.getString("type"))
      assertEquals(matched.getString("attemptId"), replaced.getString("attemptId")); assertFalse(replaced.getBoolean("photoPresent")); assertTrue(replaced.getBoolean("receiptPersisted"))
      assertFalse(String(path.readBytes(), Charsets.UTF_8).contains(photo)); assertFalse(String(path.readBytes(), Charsets.UTF_8).contains("synthetic-token"))
    } finally { android.util.AtomicFile(path).delete() }
  }
}
