package expo.modules.psyrectransfer

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import java.security.KeyStore
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

/** Synthetic library self-instrumentation only; no model is loaded or executed. */
@RunWith(AndroidJUnit4::class)
class MobileModelStoreTest {
  private val context get() = InstrumentationRegistry.getInstrumentation().let {
    check(it.context.packageName == "expo.modules.psyrectransfer.test" && it.targetContext.packageName == "expo.modules.psyrectransfer.test") {
      "Model journal tests refuse production application storage."
    }
    it.targetContext
  }
  private val store get() = MobileModelStore(context)
  private val endpoint = "https://10.0.0.1:9443"
  private val pin = "a".repeat(64)
  private val deviceId = UUID.randomUUID().toString()
  private val encounterId = UUID.randomUUID().toString()
  private val snapshotId = UUID.randomUUID().toString()
  private val patientId = UUID.randomUUID().toString()
  private val directory get() = File(context.noBackupFilesDir, "psyrec-history-runs")

  @Before fun prepareIsolatedJournal() { store.clear() }
  @After fun cleanIsolatedJournal() { store.clear() }

  private fun run(id: String, status: String = "started") = JSONObject()
    .put("schemaVersion", 1).put("runId", id).put("snapshotId", snapshotId).put("patientId", patientId)
    .put("status", status).put("request", JSONObject().put("prompt", "SYNTHETIC JOURNAL TEST ONLY"))
    .put("model", JSONObject().put("id", "SYNTHETIC_NO_MODEL_EXECUTION"))

  private fun save(id: String, value: JSONObject = run(id)) {
    store.saveRun(endpoint, pin, deviceId, encounterId, id, value.toString())
  }

  private fun file(id: String) = File(directory, "$id.enc")

  private fun assertNoJournal() {
    assertFalse(directory.exists())
    val keys = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    assertFalse(keys.containsAlias("psyrec-history-runs-v1"))
  }

  @Test fun unissuedIdIsRejectedBeforeAnyStorageOrKeyCreation() {
    val unissued = UUID.randomUUID().toString()
    assertThrows(IllegalStateException::class.java) { save(unissued) }
    assertNoJournal()
  }

  @Test fun issuedIdWorksAcrossStoreInstancesAndFailedInitialWriteDoesNotConsumeIt() {
    val id = store.newRunId()
    assertEquals(id, UUID.fromString(id).toString())
    assertThrows(IllegalStateException::class.java) { save(id, run(id, "succeeded")) }
    save(id)
    assertTrue(file(id).isFile)
  }

  @Test fun lockRejectsLateInitialAndTerminalSavesAndPreservesEarlierEvidence() {
    val earlier = store.newRunId()
    save(earlier)
    val retained = file(earlier).readBytes()
    val delayed = store.newRunId()
    store.lock()
    assertThrows(IllegalStateException::class.java) { save(delayed) }
    assertThrows(IllegalStateException::class.java) { save(earlier, run(earlier, "cancelled")) }
    assertFalse(file(delayed).exists())
    assertArrayEquals(retained, file(earlier).readBytes())
    val fresh = store.newRunId()
    save(fresh)
    assertTrue(file(fresh).isFile)
  }

  @Test fun delayedInitialWriteCannotRecreateJournalAfterClear() {
    val delayed = store.newRunId()
    val waiting = CountDownLatch(1)
    val release = CountDownLatch(1)
    val failure = AtomicReference<Throwable?>()
    val writer = Thread {
      waiting.countDown()
      try {
        check(release.await(5, TimeUnit.SECONDS)) { "Synthetic writer timed out." }
        save(delayed)
      } catch (error: Throwable) { failure.set(error) }
    }
    writer.start()
    try {
      assertTrue(waiting.await(5, TimeUnit.SECONDS))
      store.clear()
      release.countDown()
      writer.join(5000)
      assertFalse("Synthetic writer must terminate.", writer.isAlive)
      assertTrue(failure.get() is IllegalStateException)
      assertNoJournal()
    } finally {
      release.countDown()
      writer.join(5000)
    }
  }

  @Test fun immutableBindingsRemainRequiredAndTerminalSaveIsFinal() {
    val id = store.newRunId()
    save(id)
    val original = file(id).readBytes()
    val invalid = listOf(
      run(id),
      run(id, "succeeded").put("snapshotId", UUID.randomUUID().toString()),
      run(id, "succeeded").put("patientId", UUID.randomUUID().toString()),
      run(id, "succeeded").put("request", JSONObject().put("prompt", "DIFFERENT SYNTHETIC INPUT")),
      run(id, "succeeded").put("model", JSONObject().put("id", "DIFFERENT SYNTHETIC MODEL"))
    )
    for (value in invalid) {
      assertThrows(IllegalStateException::class.java) { save(id, value) }
      assertArrayEquals(original, file(id).readBytes())
    }
    save(id, run(id, "succeeded"))
    val terminal = file(id).readBytes()
    assertThrows(IllegalStateException::class.java) { save(id, run(id, "failed")) }
    assertArrayEquals(terminal, file(id).readBytes())
  }

  @Test fun issuanceSlotIsRetiredOnlyAfterDurableTerminalSave() {
    val ids = List(100) { store.newRunId() }
    val id = ids.first()
    save(id)
    val changed = run(id, "succeeded").put("request", JSONObject().put("prompt", "CHANGED SYNTHETIC INPUT"))
    assertThrows(IllegalStateException::class.java) { save(id, changed) }
    assertThrows(IllegalStateException::class.java) { store.newRunId() }
    save(id, run(id, "cancelled"))
    assertTrue(HistoryPolicy.isCanonicalUuid(store.newRunId()))
    assertThrows(IllegalStateException::class.java) { store.newRunId() }
  }

  @Test fun failedClearStillInvalidatesIssuedIdsBeforeDeletion() {
    val delayed = store.newRunId()
    assertTrue(directory.mkdirs())
    val unexpected = File(directory, "synthetic-clear-guard")
    unexpected.writeBytes(byteArrayOf())
    try {
      assertThrows(IllegalStateException::class.java) { store.clear() }
      assertThrows(IllegalStateException::class.java) { save(delayed) }
      assertFalse(file(delayed).exists())
    } finally { assertTrue(unexpected.delete() || !unexpected.exists()) }
  }
}