package expo.modules.psyrectransfer

import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test
import java.security.cert.CertificateException
import java.security.cert.CertificateFactory
import java.security.cert.X509Certificate

class PinnedPeerTest {
  private val certificate: X509Certificate get() = javaClass.getResourceAsStream("/synthetic-certificate.pem")!!.use {
    CertificateFactory.getInstance("X.509").generateCertificate(it) as X509Certificate
  }
  @Test fun acceptsExactPhysicalCertificateAndRejectsWrongPeer() {
    val cert = certificate
    PinnedPeer.verify(arrayOf(cert), PinnedPeer.fingerprint(cert))
    assertThrows(CertificateException::class.java) { PinnedPeer.verify(arrayOf(cert), "0".repeat(64)) }
    assertThrows(CertificateException::class.java) { PinnedPeer.verify(emptyArray(), PinnedPeer.fingerprint(cert)) }
  }
  @Test fun restrictsPairingToPrivateHttpsWithoutCredentialsPathsOrDns() {
    val pin = "a".repeat(64)
    for (host in listOf("10.1.2.3", "192.168.0.3", "172.16.0.3", "172.31.255.3")) assertEquals(host, PinnedPeer.endpoint("https://$host:9443", pin).host)
    for (endpoint in listOf("http://192.168.0.3", "https://8.8.8.8", "https://172.32.0.1", "https://localhost", "https://10.bad.0.0.1", "https://user@10.0.0.1", "https://10.0.0.1/captures", "https://10.0.0.1?token=a", "https://10.0.0.1#fragment", "https://10.0.0.999")) {
      assertThrows("Rejected endpoint $endpoint", IllegalArgumentException::class.java) { PinnedPeer.endpoint(endpoint, pin) }
    }
    assertThrows(IllegalArgumentException::class.java) { PinnedPeer.endpoint("https://10.0.0.1", "bad-pin") }
  }
}
