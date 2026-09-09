package expo.modules.psyrectransfer

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import java.util.UUID

/** Runs in the library test application's separate UID; never opens PsyRec app data. */
@RunWith(AndroidJUnit4::class)
class EncryptedQueueTest {
  @Test fun encryptedRestartTamperDetectionAndCompletedEncounterGuard() {
    val context = InstrumentationRegistry.getInstrumentation().targetContext
    val id = UUID.randomUUID().toString(); val encounter = "SYNTHETIC-QUEUE-" + UUID.randomUUID()
    val photo = "U1lOVEhFVElDIE5BVElWRSBRVUVVRSBURVNUIE9OTFk="
    val metadata = JSONObject().put("schemaVersion", 1).put("mode", "synthetic-capture-metadata").put("emittedWidth", 2048).put("emittedHeight", 1536)
    val queued = JSONObject().put("transferId", id).put("encounterId", encounter).put("sha256", "a".repeat(64))
      .put("createdAt", "2026-09-09T00:00:00Z").put("image", photo).put("captureMetadata", metadata)
    val target = File(File(context.noBackupFilesDir, "psyrec-pending"), "$id.enc")
    try {
      val initial = PendingStore(context)
      assertFalse(initial.hasCapture(encounter))
      initial.save(queued)
      val disk = target.readBytes()
      assertEquals(1, disk[0].toInt())
      assertFalse(String(disk, Charsets.UTF_8).contains(encounter))
      assertFalse(String(disk, Charsets.UTF_8).contains(photo))
      assertFalse(String(disk, Charsets.UTF_8).contains("synthetic-capture-metadata"))
      val reopened = PendingStore(context)
      assertEquals(photo, reopened.read(id).getString("image"))
      assertTrue(reopened.list().any { it["transferId"] == id })
      assertTrue(reopened.hasCapture(encounter))
      assertFalse(reopened.completed(encounter))

      val changed = disk.copyOf(); changed[changed.lastIndex] = (changed.last().toInt() xor 1).toByte(); target.writeBytes(changed)
      assertThrows(Exception::class.java) { PendingStore(context).read(id) }
      target.writeBytes(disk)

      val receipt = JSONObject().put("deviceId", "synthetic-device").put("transferId", id).put("encounterId", encounter).put("sha256", "a".repeat(64)).put("captureId", "SYNTHETIC-RECEIPT").put("receivedAt", "2026-09-09T00:00:01Z")
      reopened.bindDevice(id, "synthetic-device")
      reopened.complete(queued, receipt, "synthetic-test")
      val afterReceipt = PendingStore(context)
      assertTrue(afterReceipt.hasCapture(encounter)) // A second photo would be refused by native camera.
      assertTrue(afterReceipt.completed(encounter))
      assertFalse(afterReceipt.list().any { it["transferId"] == id })
      assertFalse(afterReceipt.read(id).has("image"))
      assertEquals(metadata.toString(), afterReceipt.read(id).getJSONObject("captureMetadata").toString())
      assertEquals("SYNTHETIC-RECEIPT", afterReceipt.read(id).getJSONObject("receipt").getString("captureId"))
      assertFalse(String(target.readBytes(), Charsets.UTF_8).contains(encounter))
    } finally {
      android.util.AtomicFile(target).delete() // Only this test's synthetic UUID, in its separate test package.
    }
  }
}
