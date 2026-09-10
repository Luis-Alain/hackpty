package expo.modules.psyrectransfer

import android.view.WindowManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONObject

class PsyRecTransferModule : Module() {
  private val store by lazy { PendingStore(requireNotNull(appContext.reactContext)) }
  private val modelStore by lazy { MobileModelStore(requireNotNull(appContext.reactContext)) }
  private fun protectWindow() {
    val activity = appContext.currentActivity ?: return
    // Expo can replay the foreground event while initializing the module on the JS thread.
    activity.runOnUiThread { activity.window?.addFlags(WindowManager.LayoutParams.FLAG_SECURE) }
  }
  override fun definition() = ModuleDefinition {
    Name("PsyRecTransfer")
    Function("requireTunnel") { endpoint: String, pin: String -> HyperswarmRoutes.requireTunnel(endpoint, pin) }
    Function("registerTunnel") { endpoint: String, pin: String, port: Int, ticket: Long -> HyperswarmRoutes.register(endpoint, pin, port, ticket) }
    Function("clearTunnel") { HyperswarmRoutes.clear() }
    Function("useLocalNetwork") { endpoint: String, pin: String -> HyperswarmRoutes.useLocalNetwork(endpoint, pin) }
    OnCreate { protectWindow() }
    OnActivityEntersForeground { protectWindow() }
    AsyncFunction("pending") { store.observeReopened(); store.list() }
    AsyncFunction("completed") { encounterId: String -> store.completed(encounterId) }
    AsyncFunction("pair") { endpoint: String, pin: String, secret: String ->
      PinnedHttps.post(endpoint, pin, "/pair", JSONObject().put("secret", secret).put("deviceName", "PsyRec Android capture")).toString()
    }
    AsyncFunction("send") { endpoint: String, pin: String, deviceId: String, token: String, encounterId: String, id: String ->
      CaptureSender(store).send(endpoint, pin, deviceId, token, encounterId, id).toString()
    }
    AsyncFunction("verifyPending") { endpoint: String, pin: String, deviceId: String, token: String, encounterId: String, id: String, mode: String ->
      require(mode == "wrong-certificate" || mode == "interrupted-upload") { "Unknown verification mode." }
      CaptureSender(store).send(endpoint, pin, deviceId, token, encounterId, id, mode).toString()
    }
    AsyncFunction("syncEvidence") { endpoint: String, pin: String, deviceId: String, token: String, encounterId: String ->
      val id = store.completedTransferId(encounterId) ?: error("A matching durable receipt is required first.")
      CaptureSender(store).syncEvidence(endpoint, pin, deviceId, token, encounterId, id).toString()
    }
    AsyncFunction("historySync") { endpoint: String, pin: String, deviceId: String, token: String, encounterId: String ->
      HistoryStore(requireNotNull(appContext.reactContext)).sync(endpoint, pin, deviceId, token, encounterId)
    }
    AsyncFunction("historyLoad") { endpoint: String, pin: String, deviceId: String, encounterId: String ->
      HistoryStore(requireNotNull(appContext.reactContext)).load(endpoint, pin, deviceId, encounterId)
    }
    AsyncFunction("verifyHistoryModel") { uri: String -> modelStore.verifyModel(uri) }
    Function("historyNewRunId") { modelStore.newRunId() }
    AsyncFunction("historySaveRun") { endpoint: String, pin: String, deviceId: String, encounterId: String, runId: String, runJson: String ->
      modelStore.saveRun(endpoint, pin, deviceId, encounterId, runId, runJson)
    }
    Function("historyClear") { modelStore.clear(); HistoryStore(requireNotNull(appContext.reactContext)).clear() }
    Function("historyLock") { modelStore.lock(); HistoryStore(requireNotNull(appContext.reactContext)).lock() }
    OnActivityEntersBackground { HyperswarmRoutes.clear(); modelStore.lock(); HistoryStore(requireNotNull(appContext.reactContext)).lock() }
    OnDestroy { HyperswarmRoutes.clear(); modelStore.lock(); HistoryStore(requireNotNull(appContext.reactContext)).lock() }
    View(PrivateCameraView::class) {
      AsyncFunction("capture") { view: PrivateCameraView, encounterId: String, promise: expo.modules.kotlin.Promise -> view.capture(encounterId, promise) }
    }
  }
}
