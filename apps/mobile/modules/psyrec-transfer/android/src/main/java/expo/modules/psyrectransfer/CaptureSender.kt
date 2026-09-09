package expo.modules.psyrectransfer

import org.json.JSONObject
import java.util.UUID

/** Production send and diagnostics use the same storage, TLS and receipt-validation path. */
internal class CaptureSender(private val store: PendingStore,
  private val post: (String, String, String, JSONObject, String?, (Boolean) -> Unit, Boolean) -> JSONObject = { endpoint, pin, path, body, token, certificate, interrupt ->
    PinnedHttps.post(endpoint, pin, path, body, token, certificate, interrupt)
  }) {
  fun send(endpoint: String, pin: String, deviceId: String, token: String, encounterId: String, id: String, verification: String? = null): JSONObject {
    val queued = store.read(id)
    require(queued.getString("encounterId") == encounterId) { "Capture belongs to another encounter. Pair with its original encounter." }
    require(queued.has("image") && !queued.has("receipt")) { "This capture already has a durable receipt." }
    require(verification == null || verification == "wrong-certificate" || verification == "interrupted-upload")
    store.bindDevice(id, deviceId)
    val attempt = UUID.randomUUID().toString()
    fun details() = JSONObject().put("attemptId", attempt)
    store.observe(id, "send_started", details())
    var certificateObserved = false; var certificateRejected = false
    val receipt: JSONObject
    try {
      val requestedPin = if (verification == "wrong-certificate") (if (pin.first() == '0') "1" else "0") + pin.drop(1) else pin
      val payload = JSONObject().put("deviceId", deviceId).put("transferId", id).put("encounterId", encounterId).put("image", queued.getString("image"))
      receipt = post(endpoint, requestedPin, "/captures", payload, token, { accepted ->
        if (!certificateObserved) {
          certificateObserved = true; certificateRejected = !accepted
          store.observe(id, if (accepted) "tls_pin_verified" else "tls_pin_rejected", if (accepted) details() else details().put("failureKind", "certificate"))
        }
      }, verification == "interrupted-upload")
    } catch (error: Exception) {
      val retained = store.read(id)
      require(retained.has("image") && !retained.has("receipt")) { "Interrupted transfer lost its pending image." }
      val event = details().put("failureKind", if (certificateRejected) "certificate" else if (error is TransportFailure) "network" else "other")
      if (error is TransportFailure && error.deliberateInterruption) event.put("interruption", JSONObject()
        .put("method", "native-mid-upload-disconnect").put("bytesWritten", error.written).put("totalBytes", error.total)
        .put("byteCountMethod", "application-output-stream-write-and-flush"))
      store.observe(id, "send_failed_queue_retained", event)
      if (verification == "wrong-certificate" && certificateRejected) return JSONObject().put("verification", verification).put("rejected", true).put("queueRetained", true)
      if (verification == "interrupted-upload" && error is TransportFailure && error.deliberateInterruption) return JSONObject().put("verification", verification).put("interrupted", true).put("queueRetained", true)
      throw error
    }
    try {
      ReceiptPolicy.requireMatching(deviceId, id, encounterId, queued.getString("sha256"), ReceiptFields(receipt.getString("deviceId"), receipt.getString("transferId"),
        receipt.getString("encounterId"), receipt.getString("sha256"), receipt.getString("captureId"), receipt.getString("receivedAt")))
      require(verification == null) { "Verification unexpectedly completed. Retaining photo for review." }
    } catch (error: Exception) {
      store.observe(id, "receipt_rejected_queue_retained", details().put("failureKind", "receipt"))
      throw IllegalArgumentException("PC receipt does not match capture. Encrypted queue retained.", error)
    }
    // Retain only the receipt contract, never arbitrary peer response fields.
    val canonical = JSONObject().put("deviceId", receipt.getString("deviceId")).put("transferId", receipt.getString("transferId"))
      .put("encounterId", receipt.getString("encounterId")).put("sha256", receipt.getString("sha256"))
      .put("captureId", receipt.getString("captureId")).put("receivedAt", receipt.getString("receivedAt"))
      .put("duplicate", receipt.optBoolean("duplicate", false))
    store.observe(id, "matching_receipt_received", details().put("receipt", canonical))
    store.complete(queued, canonical, attempt)
    return canonical
  }
  fun syncEvidence(endpoint: String, pin: String, deviceId: String, token: String, encounterId: String, id: String): JSONObject {
    val saved = store.read(id)
    require(saved.has("receipt") && !saved.has("image") && saved.getString("encounterId") == encounterId) { "Matching receipt required before syncing observations." }
    val evidence = store.evidence(id)
    require(evidence.getJSONObject("binding").getString("deviceId") == deviceId) { "Evidence belongs to another paired device." }
    val result = post(endpoint, pin, "/phone-evidence", JSONObject().put("deviceId", deviceId).put("transferId", id)
      .put("encounterId", encounterId).put("evidence", evidence), token, {}, false)
    require(result.optBoolean("stored") && result.getString("transferId") == id && result.getString("encounterId") == encounterId) { "PC did not acknowledge encrypted observation storage. Retry safely." }
    return result
  }
}
