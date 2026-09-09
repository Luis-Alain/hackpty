package expo.modules.psyrectransfer

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.util.Base64
import android.util.Size
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleOwner
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.Promise
import expo.modules.kotlin.views.ExpoView
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.util.UUID

class PrivateCameraView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  override val shouldUseAndroidLayout = true
  private val preview = PreviewView(context)
  private var provider: ProcessCameraProvider? = null
  private var capture: ImageCapture? = null
  private var error: String? = null
  private var busy = false
  init { addView(preview, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT)) }
  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    val future = ProcessCameraProvider.getInstance(context)
    future.addListener({
      if (!isAttachedToWindow) return@addListener
      try {
        val owner = appContext.currentActivity as? LifecycleOwner ?: kotlin.error("Camera lifecycle unavailable")
        provider = future.get()
        val live = Preview.Builder().build().also { it.surfaceProvider = preview.surfaceProvider }
        val photo = ImageCapture.Builder().setTargetResolution(Size(1600, 1200)).setCaptureMode(ImageCapture.CAPTURE_MODE_MAXIMIZE_QUALITY).build()
        provider!!.unbindAll(); provider!!.bindToLifecycle(owner, CameraSelector.DEFAULT_BACK_CAMERA, live, photo)
        capture = photo
      } catch (e: Exception) { error = "Camera unavailable. Check permission and reopen the capture screen." }
    }, ContextCompat.getMainExecutor(context))
  }
  override fun onDetachedFromWindow() { provider?.unbindAll(); capture = null; super.onDetachedFromWindow() }
  fun capture(encounterId: String, promise: Promise) {
    try {
      if (PendingStore(context).hasCapture(encounterId)) { promise.reject("ENCOUNTER_CAPTURED", "This encounter already has a pending or received capture. Finish its transfer, then pair a new PC encounter.", null); return }
    } catch (e: Exception) { promise.reject("QUEUE_UNAVAILABLE", "Encrypted capture history could not be read. Keep app data intact for recovery.", null); return }
    val camera = capture
    if (camera == null || busy || encounterId.isBlank()) { promise.reject("CAPTURE_UNAVAILABLE", error ?: "Camera is starting or busy.", null); return }
    busy = true
    camera.targetRotation = display?.rotation ?: 0
    camera.takePicture(ContextCompat.getMainExecutor(context), object : ImageCapture.OnImageCapturedCallback() {
      override fun onError(exception: ImageCaptureException) { busy = false; promise.reject("CAPTURE_FAILED", "Camera capture failed. Retry.", null) }
      override fun onCaptureSuccess(image: ImageProxy) {
        try {
          val buffer = image.planes[0].buffer
          val raw = ByteArray(buffer.remaining()); buffer.get(raw)
          val bitmap = BitmapFactory.decodeByteArray(raw, 0, raw.size) ?: kotlin.error("Camera did not supply JPEG")
          raw.fill(0)
          val rotated = if (image.imageInfo.rotationDegrees == 0) bitmap else Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, Matrix().apply { postRotate(image.imageInfo.rotationDegrees.toFloat()) }, true)
          val output = ByteArrayOutputStream(); rotated.compress(Bitmap.CompressFormat.JPEG, 90, output)
          val bytes = output.toByteArray(); output.reset(); if (rotated !== bitmap) rotated.recycle(); bitmap.recycle()
          require(bytes.size <= 8 * 1024 * 1024) { "Capture exceeds 8 MB. Move closer and retry." }
          val id = UUID.randomUUID().toString()
          val queued = JSONObject().put("transferId", id).put("encounterId", encounterId).put("sha256", sha256(bytes))
            .put("createdAt", java.time.Instant.now().toString()).put("image", Base64.encodeToString(bytes, Base64.NO_WRAP))
          try { PendingStore(context).save(queued) } finally { bytes.fill(0) }
          promise.resolve(mapOf("transferId" to id, "encounterId" to encounterId, "sha256" to queued.getString("sha256"), "createdAt" to queued.getString("createdAt")))
        } catch (e: Exception) { promise.reject("CAPTURE_FAILED", "Capture could not be encrypted. No plaintext photo was saved.", null) }
        finally { image.close(); busy = false }
      }
    })
  }
}
