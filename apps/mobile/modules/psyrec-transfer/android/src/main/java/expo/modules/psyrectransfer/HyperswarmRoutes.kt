package expo.modules.psyrectransfer

import java.net.URL

/** Only registered in-app loopback listeners may carry a P2P-selected native TLS connection. */
internal object HyperswarmRoutes {
  private data class Route(val generation: Long, var port: Int?)
  private val routes = mutableMapOf<String, Route>()
  private var generation = 0L

  private fun canonical(endpoint: String, pin: String): String {
    val url = PinnedPeer.endpoint(endpoint, pin)
    val port = if (url.port == -1) 443 else url.port
    require(port in 1..65535) { "Invalid PC port." }
    return "https://${url.host}:$port"
  }

  @Synchronized fun requireTunnel(endpoint: String, pin: String): Long {
    val key = canonical(endpoint, pin)
    require(routes.containsKey(key) || routes.size < 64) { "Too many P2P peers in this app session. Restart the app." }
    val ticket = ++generation
    routes[key] = Route(ticket, null)
    return ticket
  }

  @Synchronized fun register(endpoint: String, pin: String, port: Int, ticket: Long) {
    require(port in 1024..65535) { "Invalid tunnel listener port." }
    val route = routes[canonical(endpoint, pin)]
    require(route != null && route.generation == ticket && ticket == generation) { "P2P setup expired. Retry while the app is open." }
    route.port = port
  }

  @Synchronized fun resolve(endpoint: String, pin: String): URL {
    val key = canonical(endpoint, pin)
    val route = routes[key] ?: return URL(key)
    val port = route.port ?: error("Hyperswarm is disconnected. Reconnect the paired PC; Wi-Fi fallback is not automatic.")
    return URL("https://127.0.0.1:$port")
  }

  @Synchronized fun useLocalNetwork(endpoint: String, pin: String) {
    generation++
    routes.remove(canonical(endpoint, pin))
  }

  @Synchronized fun clear() {
    generation++
    routes.values.forEach { it.port = null }
  }
}

