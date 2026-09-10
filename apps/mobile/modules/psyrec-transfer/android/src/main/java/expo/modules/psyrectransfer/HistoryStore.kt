package expo.modules.psyrectransfer

import android.content.Context
import android.os.Build
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.AtomicFile
import org.json.JSONObject
import java.io.File
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

internal typealias HistoryPost = (String, String, JSONObject, String) -> ByteArray

internal class HistoryStore(
  private val context: Context,
  private val post: HistoryPost = { endpoint, pin, body, token ->
    PinnedHttps.postHistory(endpoint, pin, body, token)
  }
) {
  companion object {
    private val lock = Any()
    @Volatile private var epoch = 0L

    private const val KEY_ALIAS = "psyrec-history-v1"
    private const val DIR_NAME = "psyrec-history"
    private const val FILE_NAME = "snapshot.enc"
    private const val ENVELOPE_VERSION = 1.toByte()
    private const val IV_SIZE = 12
    private const val MIN_ENVELOPE_SIZE = 29
    private const val MAX_CIPHER_BYTES = 1024 * 1024
    private const val MAX_RESPONSE_BYTES = 1024 * 1024
    private const val MAX_REQUEST_BYTES = 2048
    private const val MAX_TOKEN_LENGTH = 8192
  }

  fun sync(endpoint: String, pin: String, deviceId: String, token: String, encounterId: String): String {
    require(token.isNotBlank() && token.length <= MAX_TOKEN_LENGTH) { "Invalid history authorization token." }
    requireBinding(endpoint, pin, deviceId, encounterId)
    val requestEpoch = advanceEpoch()

    val body = JSONObject().put("deviceId", deviceId).put("encounterId", encounterId)
    val bodyBytes = body.toString().toByteArray()
    try { require(bodyBytes.size <= MAX_REQUEST_BYTES) { "History request too large." } } finally { bodyBytes.fill(0) }

    val responseBytes = try { post(endpoint, pin, body, token) } catch (e: HistoryStatusException) {
      if (e.status == 403) {
        synchronized(lock) {
          if (epoch == requestEpoch) {
            val owned = loadLocked(endpoint, pin, deviceId, encounterId)
            try { if (owned != null) clear() } finally { owned?.fill(0) }
          }
        }
      }
      throw IllegalStateException(e.message ?: "History unavailable.")
    } catch (_: Exception) {
      throw IllegalStateException("History connection unavailable.")
    }

    try {
      require(responseBytes.size <= MAX_RESPONSE_BYTES) { "History response exceeds size limit." }
      return synchronized(lock) {
        try {
          if (epoch != requestEpoch) throw IllegalStateException("History unavailable.")
          val snapshot = HistoryJson.parseStrict(responseBytes)
          HistoryPolicy.validate(snapshot, deviceId, encounterId, HistoryPolicy.MAX_CLEAR_BYTES)
          val clearBytes = snapshot.toString().toByteArray(Charsets.UTF_8)
          try { saveLocked(clearBytes, endpoint, pin, deviceId, encounterId) } finally { clearBytes.fill(0) }
          snapshot.toString()
        } catch (e: Exception) { throw sanitizedFailure(e) }
      }
    } finally { responseBytes.fill(0) }
  }

  fun load(endpoint: String, pin: String, deviceId: String, encounterId: String): String {
    requireBinding(endpoint, pin, deviceId, encounterId)
    return synchronized(lock) {
      val clearBytes = loadLocked(endpoint, pin, deviceId, encounterId) ?: return@synchronized "null"
      try {
        val snapshot = HistoryJson.parseStrict(clearBytes)
        HistoryPolicy.validate(snapshot, deviceId, encounterId, HistoryPolicy.MAX_CLEAR_BYTES)
        snapshot.toString()
      } catch (_: Exception) {
        "null"
      } finally { clearBytes.fill(0) }
    }
  }

  fun clear(): Unit = synchronized(lock) {
    epoch++
    var ok = true
    val dir = File(context.noBackupFilesDir, DIR_NAME)
    val base = File(dir, FILE_NAME)
    val bak = File(dir, "$FILE_NAME.bak")
    val newFile = File(dir, "$FILE_NAME.new")
    try { AtomicFile(base).delete() } catch (_: Exception) { ok = false }
    try { bak.delete() } catch (_: Exception) { ok = false }
    try { newFile.delete() } catch (_: Exception) { ok = false }
    if (!base.exists() && !bak.exists() && !newFile.exists()) { /* expected */ } else { ok = false }
    try {
      val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
      if (store.containsAlias(KEY_ALIAS)) {
        store.deleteEntry(KEY_ALIAS)
        if (store.containsAlias(KEY_ALIAS)) ok = false
      }
    } catch (_: Exception) { ok = false }
    require(ok) { "History clear failed." }
  }

  fun lock(): Unit = synchronized(lock) { epoch++ }

  private fun requireBinding(endpoint: String, pin: String, deviceId: String, encounterId: String) {
    PinnedPeer.endpoint(endpoint, pin)
    require(HistoryPolicy.isCanonicalUuid(deviceId)) { "Invalid deviceId." }
    require(HistoryPolicy.isCanonicalUuid(encounterId)) { "Invalid encounterId." }
  }

  private fun advanceEpoch(): Long = synchronized(lock) { ++epoch }

  private fun dir() = File(context.noBackupFilesDir, DIR_NAME).also { it.mkdirs() }
  private fun atomicFile() = AtomicFile(File(dir(), FILE_NAME))

  private fun saveLocked(clear: ByteArray, endpoint: String, pin: String, deviceId: String, encounterId: String) {
    val key = ensureKey()
    val aad = HistoryPolicy.aadBytes(endpoint, pin, deviceId, encounterId)
    val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.ENCRYPT_MODE, key); updateAAD(aad) }
    val encrypted = try { cipher.doFinal(clear) } finally { aad.fill(0) }
    val target = atomicFile()
    val output = target.startWrite()
    try {
      output.write(byteArrayOf(ENVELOPE_VERSION))
      output.write(cipher.iv)
      output.write(encrypted)
      target.finishWrite(output)
    } catch (e: Exception) {
      target.failWrite(output)
      throw e
    }
  }

  private fun loadLocked(endpoint: String, pin: String, deviceId: String, encounterId: String): ByteArray? {
    val key = loadKey() ?: return null
    val input = try { atomicFile().openRead() } catch (_: Exception) { return null }
    val encrypted = try { HistoryIo.readLimited(input, MAX_CIPHER_BYTES) } catch (_: Exception) { return null } finally { input.close() }
    if (encrypted.size < MIN_ENVELOPE_SIZE || encrypted[0] != ENVELOPE_VERSION) return null
    val iv = encrypted.copyOfRange(1, 1 + IV_SIZE)
    val ciphertext = encrypted.copyOfRange(1 + IV_SIZE, encrypted.size)
    val aad = HistoryPolicy.aadBytes(endpoint, pin, deviceId, encounterId)
    return try {
      Cipher.getInstance("AES/GCM/NoPadding").apply {
        init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(128, iv))
        updateAAD(aad)
      }.doFinal(ciphertext)
    } catch (_: Exception) { null } finally { aad.fill(0) }
  }

  private fun ensureKey(): SecretKey {
    val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    (store.getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }
    return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply {
      init(KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
        .setKeySize(256)
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
        .apply { if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) setUnlockedDeviceRequired(true) }
        .build())
    }.generateKey()
  }

  private fun loadKey(): SecretKey? {
    val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    return try { store.getKey(KEY_ALIAS, null) as? SecretKey } catch (_: Exception) { null }
  }

  private fun sanitizedFailure(e: Exception): IllegalStateException {
    return if (e is HistoryStatusException) IllegalStateException(e.message ?: "History unavailable.") else IllegalStateException("History unavailable.")
  }
}
