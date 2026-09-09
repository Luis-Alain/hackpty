package expo.modules.psyrectransfer

import java.net.URL
import java.security.MessageDigest
import java.security.cert.CertificateException
import java.security.cert.X509Certificate

internal object PinnedPeer {
  fun fingerprint(cert: X509Certificate) = MessageDigest.getInstance("SHA-256").digest(cert.encoded).joinToString("") { "%02x".format(it) }
  fun endpoint(endpoint: String, pin: String): URL {
    require(pin.matches(Regex("[a-f0-9]{64}"))) { "Invalid certificate fingerprint." }
    val url = URL(endpoint)
    require(url.host.matches(Regex("[0-9]{1,3}(\\.[0-9]{1,3}){3}"))) { "Pairing requires a private IPv4 HTTPS endpoint." }
    val octets = url.host.split('.').map { it.toInt() }
    require(url.protocol == "https" && url.userInfo == null && url.query == null && url.ref == null && (url.path.isEmpty() || url.path == "/") &&
      octets.all { it in 0..255 } && (octets[0] == 10 || (octets[0] == 192 && octets[1] == 168) || (octets[0] == 172 && octets[1] in 16..31))) { "Pairing requires a private IPv4 HTTPS endpoint." }
    return url
  }
  fun verify(chain: Array<X509Certificate>, pin: String) {
    if (chain.isEmpty()) throw CertificateException("No server certificate")
    chain[0].checkValidity()
    if (fingerprint(chain[0]) != pin) throw CertificateException("Paired PC certificate does not match")
  }
}
