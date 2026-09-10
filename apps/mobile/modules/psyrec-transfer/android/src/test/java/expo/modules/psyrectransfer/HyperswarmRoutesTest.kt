package expo.modules.psyrectransfer

import org.junit.Assert.*
import org.junit.Test

class HyperswarmRoutesTest {
  private val pin = "a".repeat(64)
  @Test fun selectedP2pFailsClosedBeforeRegistrationAndAfterBackground() {
    val endpoint = "https://192.168.11.91:9443"
    val ticket = HyperswarmRoutes.requireTunnel(endpoint, pin)
    assertThrows(IllegalStateException::class.java) { HyperswarmRoutes.resolve(endpoint, pin) }
    HyperswarmRoutes.register(endpoint, pin, 41001, ticket)
    assertEquals("https://127.0.0.1:41001", HyperswarmRoutes.resolve(endpoint, pin).toString())
    // Wrong-pin diagnostics still reach the same TLS peer, where the certificate is rejected.
    assertEquals("https://127.0.0.1:41001", HyperswarmRoutes.resolve(endpoint, "b".repeat(64)).toString())
    HyperswarmRoutes.clear()
    assertThrows(IllegalStateException::class.java) { HyperswarmRoutes.resolve(endpoint, pin) }
    assertThrows(IllegalArgumentException::class.java) { HyperswarmRoutes.register(endpoint, pin, 41001, ticket) }
  }
  @Test fun newPairingInvalidatesOldSetupAndNeverAllowsRemoteRedirects() {
    val old = HyperswarmRoutes.requireTunnel("https://192.168.11.92:9443", pin)
    HyperswarmRoutes.requireTunnel("https://192.168.11.93:9443", pin)
    assertThrows(IllegalArgumentException::class.java) { HyperswarmRoutes.register("https://192.168.11.92:9443", pin, 41002, old) }
    assertThrows(IllegalArgumentException::class.java) { HyperswarmRoutes.requireTunnel("https://8.8.8.8", pin) }
    assertEquals("https://192.168.11.94:9443", HyperswarmRoutes.resolve("https://192.168.11.94:9443", pin).toString())
  }
}

