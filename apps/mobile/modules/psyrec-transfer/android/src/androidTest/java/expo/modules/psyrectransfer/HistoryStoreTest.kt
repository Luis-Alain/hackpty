package expo.modules.psyrectransfer

import android.util.AtomicFile
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.io.ByteArrayInputStream
import java.io.File
import java.security.KeyStore
import java.time.Instant
import java.util.UUID

/** Synthetic library-UID tests; never touches PsyRec app data. */
@RunWith(AndroidJUnit4::class)
class HistoryStoreTest {
  private val context get() = InstrumentationRegistry.getInstrumentation().let {
    check(it.context.packageName == "expo.modules.psyrectransfer.test" && it.targetContext.packageName == "expo.modules.psyrectransfer.test") { "History tests refuse production application storage." }
    it.targetContext
  }
  private val endpoint = "https://10.0.0.1:9443"
  private val pin = "a".repeat(64)
  private val deviceId = UUID.randomUUID().toString()
  private val encounterId = UUID.randomUUID().toString()
  private val patientId = UUID.randomUUID().toString()

  private fun validSnapshot(records: List<JSONObject> = emptyList(), partial: Boolean = false, total: Int = records.size): JSONObject {
    val coverage = JSONObject().put("totalRecords", total).put("includedRecords", records.size).put("partial", partial)
    val patient = JSONObject().put("id", patientId).put("alias", "Alias")
    val binding = JSONObject().put("deviceId", deviceId).put("encounterId", encounterId)
    return JSONObject().put("version", 1).put("snapshotId", UUID.randomUUID().toString())
      .put("syncedAt", Instant.now().toString()).put("binding", binding).put("patient", patient)
      .put("records", JSONArray(records)).put("coverage", coverage)
  }

  private fun validRecord() = JSONObject().put("id", UUID.randomUUID().toString()).put("patientId", patientId)
    .put("encounterId", UUID.randomUUID().toString()).put("sourceRevision", 1)
    .put("approvedAt", Instant.now().toString()).put("text", "note").put("sourceText", "source")

  private fun historyDir() = File(context.noBackupFilesDir, "psyrec-history")
  private fun historyFile() = File(historyDir(), "snapshot.enc")
  private fun snapshotBytes(snapshot: JSONObject) = snapshot.toString().toByteArray(Charsets.UTF_8)

  private fun cleanup() {
    try { HistoryStore(context).clear() } catch (_: Exception) { }
  }

  @Test fun encryptedRoundTripAndNoPlaintextInCiphertext() {
    try {
      val snapshot = validSnapshot(listOf(validRecord()))
      HistoryStore(context) { _, _, _, _ -> snapshotBytes(snapshot) }.sync(endpoint, pin, deviceId, "token", encounterId)
      val loaded = HistoryStore(context).load(endpoint, pin, deviceId, encounterId)
      assertEquals(snapshot.toString(), JSONObject(loaded).toString())

      val cipher = historyFile().readBytes()
      val plaintext = snapshot.toString()
      assertFalse(String(cipher, Charsets.UTF_8).contains(plaintext))
      assertFalse(String(cipher, Charsets.ISO_8859_1).contains("Alias"))
      assertFalse(String(cipher, Charsets.ISO_8859_1).contains(patientId))
      assertFalse(String(cipher, Charsets.ISO_8859_1).contains("note"))
    } finally { cleanup() }
  }

  @Test fun tamperDetectionAndRecovery() {
    try {
      val snapshot = validSnapshot()
      HistoryStore(context) { _, _, _, _ -> snapshotBytes(snapshot) }.sync(endpoint, pin, deviceId, "token", encounterId)
      val bytes = historyFile().readBytes()
      val corrupted = bytes.copyOf(); corrupted[corrupted.lastIndex] = (corrupted.last().toInt() xor 1).toByte(); historyFile().writeBytes(corrupted)
      assertEquals("null", HistoryStore(context).load(endpoint, pin, deviceId, encounterId))
      historyFile().writeBytes(bytes)
      assertEquals(snapshot.toString(), JSONObject(HistoryStore(context).load(endpoint, pin, deviceId, encounterId)).toString())
    } finally { cleanup() }
  }

  @Test fun alteredEndpointOrPinReturnsNull() {
    try {
      val snapshot = validSnapshot()
      HistoryStore(context) { _, _, _, _ -> snapshotBytes(snapshot) }.sync(endpoint, pin, deviceId, "token", encounterId)
      assertEquals("null", HistoryStore(context).load("https://10.0.0.2:9443", pin, deviceId, encounterId))
      assertEquals("null", HistoryStore(context).load(endpoint, "b".repeat(64), deviceId, encounterId))
    } finally { cleanup() }
  }

  @Test fun wrongBindingResponseRejectedWithoutReplacingCache() {
    try {
      val first = validSnapshot(listOf(validRecord()))
      HistoryStore(context) { _, _, _, _ -> snapshotBytes(first) }.sync(endpoint, pin, deviceId, "token", encounterId)
      val wrong = JSONObject(first.toString()).apply {
        getJSONObject("binding").put("encounterId", UUID.randomUUID().toString())
      }
      assertThrows(Exception::class.java) {
        HistoryStore(context) { _, _, _, _ -> snapshotBytes(wrong) }.sync(endpoint, pin, deviceId, "token", encounterId)
      }
      assertEquals(first.toString(), JSONObject(HistoryStore(context).load(endpoint, pin, deviceId, encounterId)).toString())
    } finally { cleanup() }
  }

  @Test fun replacementDropsObsoleteRecords() {
    try {
      val first = validSnapshot(listOf(validRecord().put("text", "first")))
      val second = validSnapshot(listOf(validRecord().put("text", "second")))
      HistoryStore(context) { _, _, _, _ -> snapshotBytes(first) }.sync(endpoint, pin, deviceId, "token", encounterId)
      HistoryStore(context) { _, _, _, _ -> snapshotBytes(second) }.sync(endpoint, pin, deviceId, "token", encounterId)
      val loaded = JSONObject(HistoryStore(context).load(endpoint, pin, deviceId, encounterId))
      assertEquals(second.getString("snapshotId"), loaded.getString("snapshotId"))
      assertEquals("second", loaded.getJSONArray("records").getJSONObject(0).getString("text"))
    } finally { cleanup() }
  }

  @Test fun emptyReplacementDropsRecords() {
    try {
      val first = validSnapshot(listOf(validRecord()))
      val second = validSnapshot()
      HistoryStore(context) { _, _, _, _ -> snapshotBytes(first) }.sync(endpoint, pin, deviceId, "token", encounterId)
      HistoryStore(context) { _, _, _, _ -> snapshotBytes(second) }.sync(endpoint, pin, deviceId, "token", encounterId)
      val loaded = JSONObject(HistoryStore(context).load(endpoint, pin, deviceId, encounterId))
      assertEquals(0, loaded.getJSONArray("records").length())
      assertFalse(loaded.getJSONObject("coverage").getBoolean("partial"))
    } finally { cleanup() }
  }

  @Test fun schemaRejectionRetainsPreviousSnapshot() {
    try {
      val valid = validSnapshot(listOf(validRecord()))
      HistoryStore(context) { _, _, _, _ -> snapshotBytes(valid) }.sync(endpoint, pin, deviceId, "token", encounterId)
      val malformed = JSONObject(valid.toString()).apply { remove("coverage") }
      assertThrows(Exception::class.java) {
        HistoryStore(context) { _, _, _, _ -> snapshotBytes(malformed) }.sync(endpoint, pin, deviceId, "token", encounterId)
      }
      assertEquals(valid.toString(), JSONObject(HistoryStore(context).load(endpoint, pin, deviceId, encounterId)).toString())
    } finally { cleanup() }
  }

  @Test fun rejectsStringCoercedNumericAndFractionalRevision() {
    try {
      val base = validSnapshot(listOf(validRecord()))
      val coerced = JSONObject(base.toString()).apply { put("version", "1") }
      val fractional = JSONObject(base.toString()).apply { getJSONArray("records").getJSONObject(0).put("sourceRevision", 1.5) }
      assertThrows(Exception::class.java) { HistoryStore(context) { _, _, _, _ -> snapshotBytes(coerced) }.sync(endpoint, pin, deviceId, "token", encounterId) }
      assertThrows(Exception::class.java) { HistoryStore(context) { _, _, _, _ -> snapshotBytes(fractional) }.sync(endpoint, pin, deviceId, "token", encounterId) }
    } finally { cleanup() }
  }

  @Test fun rejectsDuplicateRecordIds() {
    try {
      val record = validRecord()
      val dup = validSnapshot(listOf(record, JSONObject(record.toString())))
      assertThrows(Exception::class.java) { HistoryStore(context) { _, _, _, _ -> snapshotBytes(dup) }.sync(endpoint, pin, deviceId, "token", encounterId) }
    } finally { cleanup() }
  }

  @Test fun rejectsPatientMismatchAndBadCoverage() {
    try {
      val base = validSnapshot(listOf(validRecord()))
      val mismatch = JSONObject(base.toString()).apply { getJSONArray("records").getJSONObject(0).put("patientId", UUID.randomUUID().toString()) }
      val badCoverage = JSONObject(base.toString()).apply { getJSONObject("coverage").put("includedRecords", 0).put("partial", false) }
      assertThrows(Exception::class.java) { HistoryStore(context) { _, _, _, _ -> snapshotBytes(mismatch) }.sync(endpoint, pin, deviceId, "token", encounterId) }
      assertThrows(Exception::class.java) { HistoryStore(context) { _, _, _, _ -> snapshotBytes(badCoverage) }.sync(endpoint, pin, deviceId, "token", encounterId) }
    } finally { cleanup() }
  }

  @Test fun rejectsTooManyRecordsAndOversizedStrings() {
    try {
      val tooMany = (1..51).map { validRecord() }.let { validSnapshot(it) }
      val longText = "x".repeat(30001)
      val longAlias = validSnapshot(listOf(validRecord().put("text", longText)))
        .apply { getJSONObject("patient").put("alias", "y".repeat(81)) }
      assertThrows(Exception::class.java) { HistoryStore(context) { _, _, _, _ -> snapshotBytes(tooMany) }.sync(endpoint, pin, deviceId, "token", encounterId) }
      assertThrows(Exception::class.java) { HistoryStore(context) { _, _, _, _ -> snapshotBytes(longAlias) }.sync(endpoint, pin, deviceId, "token", encounterId) }
    } finally { cleanup() }
  }

  @Test fun rejectsOversizedSnapshot() {
    try {
      val big = validSnapshot(listOf(validRecord().put("text", "x".repeat(HistoryPolicy.MAX_CLEAR_BYTES))))
      assertThrows(Exception::class.java) { HistoryStore(context) { _, _, _, _ -> snapshotBytes(big) }.sync(endpoint, pin, deviceId, "token", encounterId) }
    } finally { cleanup() }
  }

  @Test fun tinyBaseAndOversizedBackupRejection() {
    try {
      val snapshot = validSnapshot()
      HistoryStore(context) { _, _, _, _ -> snapshotBytes(snapshot) }.sync(endpoint, pin, deviceId, "token", encounterId)
      historyFile().writeBytes(byteArrayOf(1, 2, 3))
      assertEquals("null", HistoryStore(context).load(endpoint, pin, deviceId, encounterId))

      val oversize = ByteArray(1024 * 1024 + 1) { 0 }
      val backup = File(historyDir(), "snapshot.enc.bak")
      backup.writeBytes(oversize)
      assertEquals("null", HistoryStore(context).load(endpoint, pin, deviceId, encounterId))
    } finally { cleanup() }
  }

  @Test fun backupOnlyRecovery() {
    try {
      val snapshot = validSnapshot(listOf(validRecord()))
      HistoryStore(context) { _, _, _, _ -> snapshotBytes(snapshot) }.sync(endpoint, pin, deviceId, "token", encounterId)
      val base = historyFile(); val backup = File(historyDir(), "snapshot.enc.bak")
      base.inputStream().use { input -> backup.outputStream().use { output -> input.copyTo(output) } }
      base.writeBytes(byteArrayOf())
      assertEquals(snapshot.toString(), JSONObject(HistoryStore(context).load(endpoint, pin, deviceId, encounterId)).toString())
    } finally { cleanup() }
  }

  @Test fun transportErrorRetainsPriorCache() {
    try {
      val snapshot = validSnapshot()
      HistoryStore(context) { _, _, _, _ -> snapshotBytes(snapshot) }.sync(endpoint, pin, deviceId, "token", encounterId)
      assertThrows(Exception::class.java) {
        HistoryStore(context) { _, _, _, _ -> throw java.io.IOException("synthetic network failure") }.sync(endpoint, pin, deviceId, "token", encounterId)
      }
      assertEquals(snapshot.toString(), JSONObject(HistoryStore(context).load(endpoint, pin, deviceId, encounterId)).toString())
    } finally { cleanup() }
  }

  @Test fun status403ClearsCurrentCacheAndThrowsSafeMessage() {
    try {
      val snapshot = validSnapshot()
      HistoryStore(context) { _, _, _, _ -> snapshotBytes(snapshot) }.sync(endpoint, pin, deviceId, "token", encounterId)
      val ex = assertThrows(Exception::class.java) {
        HistoryStore(context) { _, _, _, _ -> throw HistoryStatusException(403, "History access denied. Pair again with Allow patient history enabled on the PC.") }
          .sync(endpoint, pin, deviceId, "token", encounterId)
      }
      assertEquals("History access denied. Pair again with Allow patient history enabled on the PC.", ex.message)
      assertEquals("null", HistoryStore(context).load(endpoint, pin, deviceId, encounterId))
      assertFalse(KeyStore.getInstance("AndroidKeyStore").apply { load(null) }.containsAlias("psyrec-history-v1"))
    } finally { cleanup() }
  }

  @Test fun status423RetainsPriorCacheAndThrowsSafeMessage() {
    try {
      val snapshot = validSnapshot()
      HistoryStore(context) { _, _, _, _ -> snapshotBytes(snapshot) }.sync(endpoint, pin, deviceId, "token", encounterId)
      val ex = assertThrows(Exception::class.java) {
        HistoryStore(context) { _, _, _, _ -> throw HistoryStatusException(423, "PC vault is locked. Unlock and retry.") }
          .sync(endpoint, pin, deviceId, "token", encounterId)
      }
      assertEquals("PC vault is locked. Unlock and retry.", ex.message)
      assertEquals(snapshot.toString(), JSONObject(HistoryStore(context).load(endpoint, pin, deviceId, encounterId)).toString())
    } finally { cleanup() }
  }

  @Test fun late403AfterNewerSyncPreservesNewCache() {
    try {
      val first = validSnapshot(listOf(validRecord().put("text", "first")))
      val second = validSnapshot(listOf(validRecord().put("text", "second")))
      val firstPost: HistoryPost = { e, p, _, token ->
        HistoryStore(context) { _, _, _, _ -> snapshotBytes(second) }.sync(e, p, deviceId, token, encounterId)
        throw HistoryStatusException(403, "History access denied. Pair again with Allow patient history enabled on the PC.")
      }
      val ex = assertThrows(Exception::class.java) { HistoryStore(context, firstPost).sync(endpoint, pin, deviceId, "token", encounterId) }
      assertEquals("History access denied. Pair again with Allow patient history enabled on the PC.", ex.message)
      val loaded = JSONObject(HistoryStore(context).load(endpoint, pin, deviceId, encounterId))
      assertEquals("second", loaded.getJSONArray("records").getJSONObject(0).getString("text"))
    } finally { cleanup() }
  }

  @Test fun arbitraryExceptionWithDenialTextDoesNotClearCache() {
    try {
      val snapshot = validSnapshot()
      HistoryStore(context) { _, _, _, _ -> snapshotBytes(snapshot) }.sync(endpoint, pin, deviceId, "token", encounterId)
      val ex = assertThrows(Exception::class.java) {
        HistoryStore(context) { _, _, _, _ -> throw java.io.IOException("Pair again with Allow patient history enabled on the PC.") }
          .sync(endpoint, pin, deviceId, "token", encounterId)
      }
      assertEquals("History connection unavailable.", ex.message)
      assertEquals(snapshot.toString(), JSONObject(HistoryStore(context).load(endpoint, pin, deviceId, encounterId)).toString())
    } finally { cleanup() }
  }

  @Test fun clearPreservesPendingFileAndKey() {
    var pendingFile: File? = null
    try {
      val pendingId = UUID.randomUUID().toString()
      val pending = JSONObject().put("transferId", pendingId).put("encounterId", "PENDING-TEST").put("sha256", "a".repeat(64)).put("createdAt", Instant.now().toString())
      PendingStore(context).save(pending)
      pendingFile = File(File(context.noBackupFilesDir, "psyrec-pending"), "$pendingId.enc")
      assertTrue(pendingFile.exists())

      val snapshot = validSnapshot()
      HistoryStore(context) { _, _, _, _ -> snapshotBytes(snapshot) }.sync(endpoint, pin, deviceId, "token", encounterId)
      HistoryStore(context).clear()
      assertFalse(historyFile().exists())
      assertTrue(pendingFile.exists())
      assertTrue(KeyStore.getInstance("AndroidKeyStore").apply { load(null) }.containsAlias("psyrec-pending-v1"))
      assertFalse(KeyStore.getInstance("AndroidKeyStore").apply { load(null) }.containsAlias("psyrec-history-v1"))
    } finally {
      cleanup()
      pendingFile?.let { AtomicFile(it).delete() }
    }
  }

  @Test fun lockInvalidatesInFlightSync() {
    try {
      val snapshot = validSnapshot()
      val locker = HistoryStore(context)
      assertThrows(Exception::class.java) {
        HistoryStore(context) { _, _, _, _ -> locker.lock(); snapshotBytes(snapshot) }.sync(endpoint, pin, deviceId, "token", encounterId)
      }
      assertFalse(historyFile().exists())
    } finally { cleanup() }
  }

  @Test fun clearInjectedDuringNetworkPreventsWrite() {
    try {
      val snapshot = validSnapshot()
      val clearer = HistoryStore(context)
      assertThrows(Exception::class.java) {
        HistoryStore(context) { _, _, _, _ -> clearer.clear(); snapshotBytes(snapshot) }.sync(endpoint, pin, deviceId, "token", encounterId)
      }
      assertFalse(historyFile().exists())
    } finally { cleanup() }
  }

  @Test fun newerSyncWinsRace() {
    try {
      val first = validSnapshot(listOf(validRecord().put("text", "first")))
      val second = validSnapshot(listOf(validRecord().put("text", "second")))
      val firstPost: HistoryPost = { e, p, body, token ->
        HistoryStore(context) { _, _, _, _ -> snapshotBytes(second) }.sync(e, p, deviceId, token, encounterId)
        snapshotBytes(first)
      }
      assertThrows(Exception::class.java) { HistoryStore(context, firstPost).sync(endpoint, pin, deviceId, "token", encounterId) }
      val loaded = JSONObject(HistoryStore(context).load(endpoint, pin, deviceId, encounterId))
      assertEquals("second", loaded.getJSONArray("records").getJSONObject(0).getString("text"))
    } finally { cleanup() }
  }

  @Test fun boundedReaderRejectsOversizedStream() {
    val oversize = ByteArray(1024 * 1024 + 1) { 'x'.toByte() }
    assertThrows(Exception::class.java) { HistoryIo.readLimited(ByteArrayInputStream(oversize), 1024 * 1024) }
  }
}
