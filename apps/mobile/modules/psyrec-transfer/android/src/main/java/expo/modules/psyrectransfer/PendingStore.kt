package expo.modules.psyrectransfer

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.AtomicFile
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.security.KeyStore
import java.security.MessageDigest
import java.util.UUID
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

internal fun sha256(bytes: ByteArray) = MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }
internal object NativeProcess { val id: String = UUID.randomUUID().toString() }

/** The photo, receipt and observation journal share one authenticated encrypted record. */
internal class PendingStore(private val context: Context) {
  companion object { private val lock = Any() }
  private val dir get() = File(context.noBackupFilesDir, "psyrec-pending").also { it.mkdirs() }
  private val build by lazy {
    val info = context.packageManager.getPackageInfo(context.packageName, 0)
    val digest = MessageDigest.getInstance("SHA-256")
    File(context.applicationInfo.sourceDir).inputStream().use { input ->
      val chunk = ByteArray(65536)
      while (true) { val count = input.read(chunk); if (count < 0) break; digest.update(chunk, 0, count) }
    }
    JSONObject().put("packageName", context.packageName).put("versionName", info.versionName ?: "unknown")
      .put("versionCode", if (android.os.Build.VERSION.SDK_INT >= 28) info.longVersionCode else info.versionCode.toLong())
      .put("apkSha256", digest.digest().joinToString("") { "%02x".format(it) })
  }
  private fun key(): SecretKey {
    val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    (store.getKey("psyrec-pending-v1", null) as? SecretKey)?.let { return it }
    return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply {
      init(KeyGenParameterSpec.Builder("psyrec-pending-v1", KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
        .setKeySize(256).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build())
    }.generateKey()
  }
  private fun file(id: String): AtomicFile {
    require(id.matches(Regex("[a-f0-9-]{36}"))) { "Invalid pending capture id." }
    return AtomicFile(File(dir, "$id.enc"))
  }
  fun save(value: JSONObject) = synchronized(lock) {
    val id = value.getString("transferId")
    val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.ENCRYPT_MODE, key()); updateAAD(id.toByteArray()) }
    val clear = value.toString().toByteArray()
    val encrypted = try { cipher.doFinal(clear) } finally { clear.fill(0) }
    val target = file(id); val output = target.startWrite()
    try { output.write(byteArrayOf(1)); output.write(cipher.iv); output.write(encrypted); target.finishWrite(output) }
    catch (error: Exception) { target.failWrite(output); throw error }
  }
  fun read(id: String): JSONObject = synchronized(lock) {
    val encrypted = file(id).readFully()
    require(encrypted.size > 29 && encrypted[0] == 1.toByte()) { "Damaged encrypted capture." }
    val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply {
      init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, encrypted.copyOfRange(1, 13))); updateAAD(id.toByteArray())
    }
    val clear = cipher.doFinal(encrypted.copyOfRange(13, encrypted.size))
    try { JSONObject(String(clear, Charsets.UTF_8)) } finally { clear.fill(0) }
  }
  fun createCapture(value: JSONObject, provenance: String = "native-camera-capture") = synchronized(lock) {
    require(!hasCapture(value.getString("encounterId"))) { "Encounter already captured." }
    val binding = JSONObject().put("transferId", value.getString("transferId")).put("encounterId", value.getString("encounterId"))
      .put("imageSha256", value.getString("sha256")).put("deviceId", JSONObject.NULL).put("captureId", JSONObject.NULL)
    value.put("lifecycle", JSONObject().put("schemaVersion", 1).put("kind", "native-android-transfer-lifecycle")
      .put("platform", "android").put("provenance", provenance).put("binding", binding).put("build", build).put("events", JSONArray()))
    save(value)
    observe(value.getString("transferId"), "capture_encrypted")
  }
  fun observe(id: String, type: String, extra: JSONObject = JSONObject()) = synchronized(lock) {
    val value = read(id)
    val lifecycle = value.optJSONObject("lifecycle") ?: return@synchronized // Never reconstruct an old transfer's missing observations.
    val events = lifecycle.getJSONArray("events")
    require(events.length() < 200) { "Transfer observation limit reached. Keep encrypted data for review." }
    val event = JSONObject(extra.toString()).put("sequence", events.length() + 1).put("type", type)
      .put("observedAt", java.time.Instant.now().toString()).put("processSessionId", NativeProcess.id).put("apkSha256", build.getString("apkSha256"))
      .put("queueCiphertextSha256", sha256(file(id).readFully()))
    events.put(event); save(value)
  }
  fun observeReopened() = synchronized(lock) {
    for (value in records()) {
      if (value.has("receipt")) continue
      val events = value.optJSONObject("lifecycle")?.getJSONArray("events") ?: continue
      if (events.length() == 0 || events.getJSONObject(events.length() - 1).getString("processSessionId") == NativeProcess.id) continue
      val bytes = android.util.Base64.decode(value.getString("image"), android.util.Base64.NO_WRAP)
      val verified = try { sha256(bytes) == value.getString("sha256") } finally { bytes.fill(0) }
      require(verified) { "Reopened image digest does not match encrypted metadata. Keep app data intact for recovery." }
      observe(value.getString("transferId"), "queue_reopened", JSONObject().put("imageSha256Verified", true))
    }
  }
  fun bindDevice(id: String, deviceId: String) = synchronized(lock) {
    val value = read(id)
    require(!value.has("boundDeviceId") || value.getString("boundDeviceId") == deviceId) { "Pending capture belongs to its original paired device." }
    value.put("boundDeviceId", deviceId)
    value.optJSONObject("lifecycle")?.getJSONObject("binding")?.put("deviceId", deviceId)
    save(value)
  }
  private fun records() = dir.listFiles()?.filter { it.name.endsWith(".enc") }?.map { read(it.name.removeSuffix(".enc")) } ?: emptyList()
  fun list() = synchronized(lock) { records().filter { !it.has("receipt") }.map { obj ->
    mapOf("transferId" to obj.getString("transferId"), "encounterId" to obj.getString("encounterId"),
      "sha256" to obj.getString("sha256"), "createdAt" to obj.getString("createdAt"))
  } }
  fun hasCapture(encounterId: String) = synchronized(lock) { records().any { it.getString("encounterId") == encounterId } }
  fun completed(encounterId: String) = synchronized(lock) { records().any { it.getString("encounterId") == encounterId && it.has("receipt") } }
  fun completedTransferId(encounterId: String) = synchronized(lock) { records().firstOrNull { it.getString("encounterId") == encounterId && it.has("receipt") }?.getString("transferId") }
  fun evidence(id: String): JSONObject = synchronized(lock) { read(id).optJSONObject("lifecycle") ?: error("This capture predates native lifecycle evidence. No history has been reconstructed.") }
  fun complete(queued: JSONObject, receipt: JSONObject, attemptId: String) = synchronized(lock) {
    val id = queued.getString("transferId")
    val latest = read(id)
    require(latest.has("image") && !latest.has("receipt")) { "Only a pending image can be completed." }
    ReceiptPolicy.requireMatching(latest.getString("boundDeviceId"), id, latest.getString("encounterId"), latest.getString("sha256"),
      ReceiptFields(receipt.getString("deviceId"), receipt.getString("transferId"), receipt.getString("encounterId"), receipt.getString("sha256"), receipt.getString("captureId"), receipt.getString("receivedAt")))
    val completed = JSONObject().put("transferId", id).put("encounterId", latest.getString("encounterId"))
      .put("sha256", latest.getString("sha256")).put("createdAt", latest.getString("createdAt")).put("receipt", receipt)
    latest.optJSONObject("captureMetadata")?.let { completed.put("captureMetadata", it) }
    latest.optJSONObject("lifecycle")?.let { lifecycle ->
      lifecycle.getJSONObject("binding").put("deviceId", receipt.getString("deviceId")).put("captureId", receipt.getString("captureId"))
      completed.put("lifecycle", lifecycle)
    }
    // A crash leaves either the retryable encrypted photo or the matching encrypted receipt marker.
    save(completed)
    val persisted = read(id)
    require(!persisted.has("image") && persisted.getJSONObject("receipt").toString() == receipt.toString()) { "Receipt storage verification failed." }
    observe(id, "photo_replaced_by_encrypted_receipt", JSONObject().put("attemptId", attemptId).put("photoPresent", false).put("receiptPersisted", true).put("receipt", receipt))
  }
}
