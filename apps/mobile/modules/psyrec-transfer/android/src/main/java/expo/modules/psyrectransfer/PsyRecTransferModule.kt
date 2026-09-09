package expo.modules.psyrectransfer

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.AtomicFile
import android.util.Base64
import android.view.WindowManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONObject
import java.io.File
import java.net.URL
import java.security.KeyStore
import java.security.MessageDigest
import java.security.cert.X509Certificate
import java.util.UUID
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import javax.net.ssl.HttpsURLConnection
import javax.net.ssl.SSLContext
import javax.net.ssl.TrustManager
import javax.net.ssl.X509TrustManager

internal fun sha256(bytes: ByteArray) = MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }

/** Only ciphertext is written, including metadata. Photos originate in a CameraX memory buffer. */
internal class PendingStore(private val context: Context) {
  private val dir get() = File(context.noBackupFilesDir, "psyrec-pending").also { it.mkdirs() }
  private fun key(): SecretKey {
    val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    (store.getKey("psyrec-pending-v1", null) as? SecretKey)?.let { return it }
    return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply {
      init(KeyGenParameterSpec.Builder("psyrec-pending-v1", KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build())
    }.generateKey()
  }
  private fun file(id: String): AtomicFile {
    require(id.matches(Regex("[a-f0-9-]{36}"))) { "Invalid pending capture id." }
    return AtomicFile(File(dir, "$id.enc"))
  }
  @Synchronized fun save(value: JSONObject) {
    val id = value.getString("transferId")
    val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.ENCRYPT_MODE, key()); updateAAD(id.toByteArray()) }
    val clear = value.toString().toByteArray()
    val encrypted = try { cipher.doFinal(clear) } finally { clear.fill(0) }
    val target = file(id); val output = target.startWrite()
    try { output.write(byteArrayOf(1)); output.write(cipher.iv); output.write(encrypted); target.finishWrite(output) }
    catch (error: Exception) { target.failWrite(output); throw error }
  }
  @Synchronized fun read(id: String): JSONObject {
    val encrypted = file(id).readFully()
    require(encrypted.size > 29 && encrypted[0] == 1.toByte()) { "Damaged encrypted capture." }
    val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply {
      init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, encrypted.copyOfRange(1, 13))); updateAAD(id.toByteArray())
    }
    val clear = cipher.doFinal(encrypted.copyOfRange(13, encrypted.size))
    return try { JSONObject(String(clear, Charsets.UTF_8)) } finally { clear.fill(0) }
  }
  @Synchronized fun list() = dir.listFiles()?.filter { it.name.endsWith(".enc") }?.map {
    val obj = read(it.name.removeSuffix(".enc"))
    mapOf("transferId" to obj.getString("transferId"), "encounterId" to obj.getString("encounterId"),
      "sha256" to obj.getString("sha256"), "createdAt" to obj.getString("createdAt"))
  } ?: emptyList()
  @Synchronized fun remove(id: String) { file(id).delete() }
}

internal object PinnedHttps {
  fun post(endpoint: String, pin: String, path: String, body: JSONObject, token: String? = null): JSONObject {
    val url = PinnedPeer.endpoint(endpoint, pin)
    require(path == "/pair" || path == "/captures")
    val trust = object : X509TrustManager {
      override fun getAcceptedIssuers(): Array<X509Certificate> = emptyArray()
      override fun checkClientTrusted(chain: Array<X509Certificate>, authType: String) { throw java.security.cert.CertificateException("Client certificates unsupported") }
      override fun checkServerTrusted(chain: Array<X509Certificate>, authType: String) {
        PinnedPeer.verify(chain, pin)
      }
    }
    val ssl = SSLContext.getInstance("TLS").apply { init(null, arrayOf<TrustManager>(trust), null) }
    val connection = URL(endpoint.trimEnd('/') + path).openConnection() as HttpsURLConnection
    try {
      // Self-signed PC identity is authenticated by the physically scanned certificate fingerprint.
      // These overrides are per connection; process/global TLS defaults are never modified.
      connection.sslSocketFactory = ssl.socketFactory
      connection.hostnameVerifier = javax.net.ssl.HostnameVerifier { host, session ->
        host == url.host && (session.peerCertificates.firstOrNull() as? X509Certificate)?.let { PinnedPeer.fingerprint(it) == pin } == true
      }
      connection.instanceFollowRedirects = false
      connection.connectTimeout = 10000; connection.readTimeout = 30000
      connection.requestMethod = "POST"; connection.doOutput = true
      connection.setRequestProperty("Content-Type", "application/json")
      connection.setRequestProperty("Cache-Control", "no-store")
      token?.let { connection.setRequestProperty("Authorization", "Bearer $it") }
      val clear = body.toString().toByteArray()
      connection.setFixedLengthStreamingMode(clear.size)
      try { connection.outputStream.use { it.write(clear) } } finally { clear.fill(0) }
      val status = connection.responseCode
      val stream = if (status in 200..299) connection.inputStream else connection.errorStream
      val response = stream?.use { input ->
        val output = java.io.ByteArrayOutputStream(); val chunk = ByteArray(2048)
        while (output.size() <= 16384) { val count = input.read(chunk, 0, minOf(chunk.size, 16385 - output.size())); if (count < 0) break; output.write(chunk, 0, count) }
        output.toByteArray()
      } ?: byteArrayOf()
      require(response.size <= 16384) { "PC response exceeds limit." }
      val result = JSONObject(String(response, Charsets.UTF_8))
      require(status == 200) { result.optString("error", "Transfer rejected ($status).") }
      return result
    } finally { connection.disconnect() }
  }
}

class PsyRecTransferModule : Module() {
  private val store by lazy { PendingStore(requireNotNull(appContext.reactContext)) }
  override fun definition() = ModuleDefinition {
    Name("PsyRecTransfer")
    OnCreate { appContext.currentActivity?.runOnUiThread { appContext.currentActivity?.window?.addFlags(WindowManager.LayoutParams.FLAG_SECURE) } }
    OnActivityEntersForeground { appContext.currentActivity?.window?.addFlags(WindowManager.LayoutParams.FLAG_SECURE) }
    AsyncFunction("pending") { store.list() }
    AsyncFunction("pair") { endpoint: String, pin: String, secret: String ->
      PinnedHttps.post(endpoint, pin, "/pair", JSONObject().put("secret", secret).put("deviceName", "PsyRec Android capture")).toString()
    }
    AsyncFunction("send") { endpoint: String, pin: String, deviceId: String, token: String, encounterId: String, id: String ->
      val queued = store.read(id)
      require(queued.getString("encounterId") == encounterId) { "Capture belongs to another encounter. Pair with its original encounter." }
      val payload = JSONObject().put("deviceId", deviceId).put("transferId", id).put("encounterId", encounterId).put("image", queued.getString("image"))
      val receipt = PinnedHttps.post(endpoint, pin, "/captures", payload, token)
      require(receipt.getString("deviceId") == deviceId && receipt.getString("transferId") == id && receipt.getString("encounterId") == encounterId &&
        receipt.getString("sha256") == queued.getString("sha256") && receipt.getString("captureId").isNotBlank() && receipt.getString("receivedAt").isNotBlank()) { "PC receipt does not match capture. Encrypted queue retained." }
      queued.put("receipt", receipt); store.save(queued)
      store.remove(id)
      receipt.toString()
    }
    View(PrivateCameraView::class) {
      AsyncFunction("capture") { view: PrivateCameraView, encounterId: String, promise: expo.modules.kotlin.Promise -> view.capture(encounterId, promise) }
    }
  }
}
