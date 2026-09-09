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
  fun post(endpoint: String, pin: String, path: String, body: JSONObject, token: String? = null,
           onCertificate: (Boolean) -> Unit = {}, interruptUpload: Boolean = false): JSONObject {
    val url = PinnedPeer.endpoint(endpoint, pin)
    require(path == "/pair" || path == "/captures" || path == "/phone-evidence")
    val trust = object : X509TrustManager {
      override fun getAcceptedIssuers(): Array<X509Certificate> = emptyArray()
      override fun checkClientTrusted(chain: Array<X509Certificate>, authType: String) { throw java.security.cert.CertificateException("Client certificates unsupported") }
      override fun checkServerTrusted(chain: Array<X509Certificate>, authType: String) {
        try { PinnedPeer.verify(chain, pin) } catch (error: java.security.cert.CertificateException) { onCertificate(false); throw error }
        onCertificate(true)
      }
    }
    val ssl = SSLContext.getInstance("TLS").apply { init(null, arrayOf<TrustManager>(trust), null) }
    val connection = URL(endpoint.trimEnd('/') + path).openConnection() as HttpsURLConnection
    var written = 0; var total = 0; var deliberatelyInterrupted = false
    try {
      connection.sslSocketFactory = ssl.socketFactory
      connection.hostnameVerifier = javax.net.ssl.HostnameVerifier { host, session ->
        host == url.host && (session.peerCertificates.firstOrNull() as? X509Certificate)?.let { PinnedPeer.fingerprint(it) == pin } == true
      }
      connection.instanceFollowRedirects = false
      connection.connectTimeout = 10000; connection.readTimeout = 30000
      connection.requestMethod = "POST"; connection.doOutput = true
      connection.setRequestProperty("Content-Type", "application/json"); connection.setRequestProperty("Cache-Control", "no-store")
      token?.let { connection.setRequestProperty("Authorization", "Bearer $it") }
      val clear = body.toString().toByteArray(); total = clear.size
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
    } catch (error: Exception) { throw TransportFailure(written, total, deliberatelyInterrupted, error) }
    finally { connection.disconnect() }
  }
}
