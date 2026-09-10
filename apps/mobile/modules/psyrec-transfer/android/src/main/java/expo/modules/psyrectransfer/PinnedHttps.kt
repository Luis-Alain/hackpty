package expo.modules.psyrectransfer

import org.json.JSONObject
import java.io.IOException
import java.net.URL
import java.security.cert.X509Certificate
import javax.net.ssl.HttpsURLConnection
import javax.net.ssl.SSLContext
import javax.net.ssl.TrustManager
import javax.net.ssl.X509TrustManager

internal class TransportFailure(val written: Int, val total: Int, val deliberateInterruption: Boolean, cause: Exception) : IOException("Encrypted transfer did not complete.", cause)

internal object PinnedHttps {
  private const val SMALL_RESPONSE_LIMIT = 16 * 1024
  private const val HISTORY_REQUEST_LIMIT = 2048
  private const val HISTORY_RESPONSE_LIMIT = 1024 * 1024

  fun post(endpoint: String, pin: String, path: String, body: JSONObject, token: String? = null,
           onCertificate: (Boolean) -> Unit = {}, interruptUpload: Boolean = false): JSONObject {
    require(path == "/pair" || path == "/captures" || path == "/phone-evidence")
    val url = PinnedPeer.endpoint(endpoint, pin)
    val connection = openConnection(endpoint, pin, path, url, onCertificate)
    token?.let { connection.setRequestProperty("Authorization", "Bearer $it") }
    var written = 0; var total = 0; var deliberatelyInterrupted = false
    val clear = body.toString().toByteArray(); total = clear.size
    var response = byteArrayOf()
    var chunk = ByteArray(8192)
    try {
      connection.setFixedLengthStreamingMode(total)
      try {
        val output = connection.outputStream
        try {
          val interruptionAt = minOf(65536, maxOf(1, total / 2))
          while (written < total) {
            val count = minOf(16384, total - written, if (interruptUpload) interruptionAt - written else total)
            output.write(clear, written, count); output.flush(); written += count
            if (interruptUpload && written >= interruptionAt && written < total) {
              deliberatelyInterrupted = true; connection.disconnect()
              throw IOException("Requested native mid-upload disconnect.")
            }
          }
        } finally { try { output.close() } catch (closeError: Exception) { if (!deliberatelyInterrupted) throw closeError } }
      } finally { clear.fill(0) }

      val responseLimit = SMALL_RESPONSE_LIMIT
      val status = connection.responseCode
      chunk = ByteArray(8192)
      try {
        val stream = if (status in 200..299) connection.inputStream else connection.errorStream
        val output = java.io.ByteArrayOutputStream()
        try {
          while (output.size() <= responseLimit) {
            val count = stream?.read(chunk, 0, minOf(chunk.size, responseLimit + 1 - output.size())) ?: -1
            if (count < 0) break
            output.write(chunk, 0, count)
          }
        } finally { stream?.close() }
        response = output.toByteArray()
      } finally { chunk.fill(0) }
      require(response.size <= responseLimit) { "PC response exceeds limit." }
      val result = JSONObject(String(response, Charsets.UTF_8))
      require(status == 200) { result.optString("error", "Transfer rejected ($status).") }
      return result
    } catch (error: Exception) { throw TransportFailure(written, total, deliberatelyInterrupted, error) }
    finally {
      response.fill(0)
      chunk.fill(0)
      connection.disconnect()
    }
  }

  fun postHistory(endpoint: String, pin: String, body: JSONObject, token: String): ByteArray {
    val url = PinnedPeer.endpoint(endpoint, pin)
    val clear = body.toString().toByteArray()
    require(clear.size <= HISTORY_REQUEST_LIMIT) { "History request too large." }
    val connection = openConnection(endpoint, pin, "/history", url, {})
    connection.setRequestProperty("Authorization", "Bearer $token")
    var response = byteArrayOf()
    try {
      connection.setFixedLengthStreamingMode(clear.size)
      connection.outputStream.use { it.write(clear) }
      val status = connection.responseCode
      when (status) {
        403 -> throw HistoryStatusException(403, "History access denied. Pair again with Allow patient history enabled on the PC.")
        423 -> throw HistoryStatusException(423, "PC vault is locked. Unlock and retry.")
        200 -> { /* Only successful response bodies are read; error text is untrusted. */ }
        else -> throw HistoryStatusException(status, "History unavailable.")
      }
      response = connection.inputStream.use { HistoryIo.readLimited(it, HISTORY_RESPONSE_LIMIT) }
      return response
    } catch (error: Exception) {
      if (error is HistoryStatusException) throw error
      throw TransportFailure(0, clear.size, false, error)
    } finally {
      clear.fill(0)
      connection.disconnect()
    }
  }

  private fun openConnection(endpoint: String, pin: String, path: String, url: URL, onCertificate: (Boolean) -> Unit): HttpsURLConnection {
    val trust = object : X509TrustManager {
      override fun getAcceptedIssuers(): Array<X509Certificate> = emptyArray()
      override fun checkClientTrusted(chain: Array<X509Certificate>, authType: String) { throw java.security.cert.CertificateException("Client certificates unsupported") }
      override fun checkServerTrusted(chain: Array<X509Certificate>, authType: String) {
        try { PinnedPeer.verify(chain, pin) } catch (error: java.security.cert.CertificateException) { onCertificate(false); throw error }
        onCertificate(true)
      }
    }
    val ssl = SSLContext.getInstance("TLS").apply { init(null, arrayOf<TrustManager>(trust), null) }
    val connectUrl = HyperswarmRoutes.resolve(endpoint, pin)
    val connection = URL(connectUrl.toString().trimEnd('/') + path).openConnection() as HttpsURLConnection
    connection.sslSocketFactory = ssl.socketFactory
    connection.hostnameVerifier = javax.net.ssl.HostnameVerifier { host, session ->
      host == connectUrl.host && (session.peerCertificates.firstOrNull() as? X509Certificate)?.let { PinnedPeer.fingerprint(it) == pin } == true
    }
    connection.instanceFollowRedirects = false
    connection.useCaches = false
    connection.connectTimeout = 10000; connection.readTimeout = 30000
    connection.requestMethod = "POST"; connection.doOutput = true
    connection.setRequestProperty("Content-Type", "application/json")
    connection.setRequestProperty("Cache-Control", "no-store")
    return connection
  }
}
