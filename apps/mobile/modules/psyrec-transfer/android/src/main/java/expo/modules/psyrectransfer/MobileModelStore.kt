package expo.modules.psyrectransfer

import android.content.Context
import android.net.Uri
import android.os.Build
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

/** Public model verification and an encrypted, bounded journal of local model runs. */
internal class MobileModelStore(private val context: Context) {
  companion object {
    private val guard = Any()
    private var epoch = 0L
    private val issuedRunIds = mutableMapOf<String, Long>()
    private const val MODEL_BYTES = 382156480L
    private const val MODEL_SHA = "33bcc57074ec7b6eada5a90651ee546ec0c2b271002c22baf9f1b2dd1e8f75cb"
    private const val MODEL_ID = "QWEN3_600M_INST_Q4"
    private const val KEY_ALIAS = "psyrec-history-runs-v1"
    private const val DIRECTORY = "psyrec-history-runs"
    private const val MAX_RUN_BYTES = 128 * 1024
    private const val MAX_FILES = 100
    private const val IV_BYTES = 12
    private val ownedName = Regex("[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.enc(?:\\.bak|\\.new)?")
  }

  /** A run must be issued in this process generation before any journal write. */
  fun newRunId(): String = synchronized(guard) {
    check(issuedRunIds.size < MAX_FILES) { "Local run evidence capacity reached." }
    UUID.randomUUID().toString().also { issuedRunIds[it] = epoch }
  }

  /** Backgrounding invalidates unfinished writes without erasing retained evidence. */
  fun lock(): Unit = synchronized(guard) { invalidateIssuedRuns() }

  private fun invalidateIssuedRuns() {
    epoch++
    issuedRunIds.clear()
  }

  fun verifyModel(uri: String): String {
    try {
      require(uri.length <= 4096)
      val parsed = Uri.parse(uri)
      require(parsed.scheme == "file" && parsed.authority.isNullOrEmpty() && parsed.query == null && parsed.fragment == null)
      val target = File(requireNotNull(parsed.path)).canonicalFile
      val roots = listOf(context.filesDir.canonicalFile, context.cacheDir.canonicalFile)
      require(roots.any { target.path.startsWith(it.path + File.separator) })
      require(target.isFile && target.length() == MODEL_BYTES)
      val digest = MessageDigest.getInstance("SHA-256")
      val buffer = ByteArray(128 * 1024)
      var readBytes = 0L
      try {
        target.inputStream().use { input ->
          while (true) {
            val size = input.read(buffer)
            if (size < 0) break
            readBytes += size
            require(readBytes <= MODEL_BYTES)
            digest.update(buffer, 0, size)
          }
        }
      } finally { buffer.fill(0) }
      val actualSha = digest.digest().joinToString("") { "%02x".format(it.toInt() and 255) }
      require(readBytes == MODEL_BYTES && actualSha == MODEL_SHA)
      return JSONObject().put("path", target.path).put("modelId", MODEL_ID)
        .put("bytes", readBytes).put("sha256", actualSha).toString()
    } catch (_: Exception) { throw IllegalStateException("Bundled local model verification failed.") }
  }

  fun saveRun(endpoint: String, pin: String, deviceId: String, encounterId: String, runId: String, runJson: String): Unit = synchronized(guard) {
    try {
      require(issuedRunIds[runId] == epoch)
      PinnedPeer.endpoint(endpoint, pin)
      require(HistoryPolicy.isCanonicalUuid(deviceId) && HistoryPolicy.isCanonicalUuid(encounterId) && HistoryPolicy.isCanonicalUuid(runId))
      val supplied = runJson.toByteArray(Charsets.UTF_8)
      val run = try {
        require(supplied.size <= MAX_RUN_BYTES)
        HistoryJson.parseStrict(supplied)
      } finally { supplied.fill(0) }
      require(run.optInt("schemaVersion") == 1 && run.optString("runId") == runId)
      require(HistoryPolicy.isCanonicalUuid(run.optString("snapshotId")))
      require(HistoryPolicy.isCanonicalUuid(run.optString("patientId")))
      require(run.optString("status") in setOf("started", "succeeded", "failed", "cancelled"))
      rejectCredentials(run)
      val targetDir = directory()
      val target = AtomicFile(File(targetDir, "$runId.enc"))
      val scope = JSONObject().put("endpoint", endpoint).put("pin", pin).put("deviceId", deviceId).put("encounterId", encounterId)
      val aad = ("psyrec-history-run-v1:" + scope.toString() + ":" + runId).toByteArray(Charsets.UTF_8)
      try {
        val key = key()
        if (target.baseFile.exists() || File(target.baseFile.path + ".bak").exists()) {
          val previous = readRun(target, key, aad)
          require(previous.getJSONObject("run").optString("status") == "started")
          val earlier = previous.getJSONObject("run")
          require(run.optString("status") != "started")
          require(earlier.optString("snapshotId") == run.optString("snapshotId") && earlier.optString("patientId") == run.optString("patientId"))
          require(earlier.getJSONObject("request").toString() == run.getJSONObject("request").toString())
          require(earlier.getJSONObject("model").toString() == run.getJSONObject("model").toString())
        } else {
          require(run.optString("status") == "started")
          val names = requireNotNull(targetDir.listFiles())
          val occupied = names.filter { ownedName.matches(it.name) }.map { it.name.substringBefore(".enc") }.toSet()
          require(occupied.size < MAX_FILES)
        }
        val clear = JSONObject().put("version", 1).put("binding", scope).put("run", run).toString().toByteArray(Charsets.UTF_8)
        try {
          require(clear.size <= MAX_RUN_BYTES)
          val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.ENCRYPT_MODE, key); updateAAD(aad) }
          require(cipher.iv.size == IV_BYTES)
          val encrypted = cipher.doFinal(clear)
          try {
            val output = target.startWrite()
            try {
              output.write(byteArrayOf(1)); output.write(cipher.iv); output.write(encrypted)
              target.finishWrite(output)
            } catch (error: Exception) { target.failWrite(output); throw error }
          } finally { encrypted.fill(0) }
        } finally { clear.fill(0) }
      } finally { aad.fill(0) }
      if (run.optString("status") != "started") issuedRunIds.remove(runId)
    } catch (_: Exception) { throw IllegalStateException("Encrypted local run evidence could not be saved.") }
  }

  /** Only explicit cache removal/pairing reset calls this; normal capacity never evicts evidence. */
  fun clear(): Unit = synchronized(guard) {
    invalidateIssuedRuns()
    try {
      val dir = File(context.noBackupFilesDir, DIRECTORY).canonicalFile
      require(dir.parentFile == context.noBackupFilesDir.canonicalFile)
      if (dir.exists()) {
        for (file in requireNotNull(dir.listFiles())) {
          require(ownedName.matches(file.name) && file.canonicalFile.parentFile == dir && file.isFile)
          require(file.delete() || !file.exists())
        }
        require(dir.delete() || !dir.exists())
      }
      val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
      if (store.containsAlias(KEY_ALIAS)) store.deleteEntry(KEY_ALIAS)
      require(!store.containsAlias(KEY_ALIAS))
    } catch (_: Exception) { throw IllegalStateException("Local run evidence clear failed.") }
  }

  private fun directory(): File = File(context.noBackupFilesDir, DIRECTORY).canonicalFile.also {
    require(it.parentFile == context.noBackupFilesDir.canonicalFile)
    require(it.isDirectory || it.mkdirs())
  }

  private fun key(): SecretKey {
    val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    (store.getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }
    return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply {
      init(KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
        .setKeySize(256).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
        .apply { if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) setUnlockedDeviceRequired(true) }.build())
    }.generateKey()
  }

  private fun readRun(target: AtomicFile, key: SecretKey, aad: ByteArray): JSONObject {
    val bytes = target.openRead().use { HistoryIo.readLimited(it, MAX_RUN_BYTES + 29) }
    try {
      require(bytes.size >= 29 && bytes[0] == 1.toByte())
      val iv = bytes.copyOfRange(1, 13)
      val clear = try {
        Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(128, iv)); updateAAD(aad) }
          .doFinal(bytes, 13, bytes.size - 13)
      } finally { iv.fill(0) }
      return try { HistoryJson.parseStrict(clear) } finally { clear.fill(0) }
    } finally { bytes.fill(0) }
  }

  private fun rejectCredentials(value: Any?) {
    when (value) {
      is JSONObject -> for (key in value.keys()) {
        require(key.lowercase() !in setOf("token", "authorization", "accesstoken", "secret", "password", "passphrase"))
        rejectCredentials(value.get(key))
      }
      is JSONArray -> for (index in 0 until value.length()) rejectCredentials(value.get(index))
    }
  }
}
