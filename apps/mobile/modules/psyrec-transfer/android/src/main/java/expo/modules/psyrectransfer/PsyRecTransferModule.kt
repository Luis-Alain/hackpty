package expo.modules.psyrectransfer

import android.view.WindowManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONObject

class PsyRecTransferModule : Module() {
  private val store by lazy { PendingStore(requireNotNull(appContext.reactContext)) }
  private fun protectWindow() {
    val activity = appContext.currentActivity ?: return
    // Expo can replay the foreground event while initializing the module on the JS thread.
    activity.runOnUiThread { activity.window?.addFlags(WindowManager.LayoutParams.FLAG_SECURE) }
  }
  override fun definition() = ModuleDefinition {
    Name("PsyRecTransfer")
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
    View(PrivateCameraView::class) {
      AsyncFunction("capture") { view: PrivateCameraView, encounterId: String, promise: expo.modules.kotlin.Promise -> view.capture(encounterId, promise) }
    }
  }
}
