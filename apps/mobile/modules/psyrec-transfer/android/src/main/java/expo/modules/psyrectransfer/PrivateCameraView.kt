package expo.modules.psyrectransfer

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
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
        val photo = ImageCapture.Builder()
          .setTargetResolution(Size(CaptureImagePolicy.requestedWidth, CaptureImagePolicy.requestedHeight))
          .setJpegQuality(CaptureImagePolicy.cameraJpegQuality)
          .setCaptureMode(ImageCapture.CAPTURE_MODE_MAXIMIZE_QUALITY).build()
        provider!!.unbindAll(); provider!!.bindToLifecycle(owner, CameraSelector.DEFAULT_BACK_CAMERA, live, photo)
        capture = photo
      } catch (e: Exception) { error = "Camera unavailable. Check permission and reopen the capture screen." }
    }, ContextCompat.getMainExecutor(context))
  }
  override fun onDetachedFromWindow() { provider?.unbindAll(); capture = null; super.onDetachedFromWindow() }
  private fun releaseBitmap(bitmap: Bitmap?) {
    if (bitmap == null || bitmap.isRecycled) return
    try { if (bitmap.isMutable) bitmap.eraseColor(Color.TRANSPARENT) } finally { bitmap.recycle() }
  }
  fun capture(encounterId: String, promise: Promise) {
    try {
      if (PendingStore(context).hasCapture(encounterId)) { promise.reject("ENCOUNTER_CAPTURED", "This encounter already has a pending or received capture. Finish its transfer, then pair a new PC encounter.", null); return }
    } catch (e: Exception) { promise.reject("QUEUE_UNAVAILABLE", "Encrypted capture history could not be read. Keep app data intact for recovery.", null); return }
    val camera = capture
    if (camera == null || busy || encounterId.isBlank()) { promise.reject("CAPTURE_UNAVAILABLE", error ?: "Camera is starting or busy.", null); return }
    busy = true
    try {
      camera.targetRotation = display?.rotation ?: 0
      camera.takePicture(ContextCompat.getMainExecutor(context), object : ImageCapture.OnImageCapturedCallback() {
        override fun onError(exception: ImageCaptureException) { busy = false; promise.reject("CAPTURE_FAILED", "Camera capture failed. Retry.", null) }
        override fun onCaptureSuccess(image: ImageProxy) {
          var raw: ByteArray? = null
          var bitmap: Bitmap? = null
          var normalized: Bitmap? = null
          var encoded: ByteArray? = null
          var output: WipingImageBuffer? = null
          var queued: JSONObject? = null
          try {
            val buffer = image.planes[0].buffer
            val source = ByteArray(buffer.remaining()); raw = source; buffer.get(source)
            val decoded = BitmapFactory.decodeByteArray(source, 0, source.size, BitmapFactory.Options().apply { inMutable = true })
              ?: kotlin.error("Camera did not supply JPEG")
            bitmap = decoded; source.fill(0); raw = null
            val rotation = image.imageInfo.rotationDegrees
            val expectedSize = CaptureImagePolicy.rotatedSize(decoded.width, decoded.height, rotation)
            val rotated = if (rotation == 0) decoded else Bitmap.createBitmap(decoded, 0, 0, decoded.width, decoded.height, Matrix().apply { postRotate(rotation.toFloat()) }, true)
            normalized = rotated
            check(rotated.width == expectedSize.first && rotated.height == expectedSize.second) { "Image normalization changed dimensions unexpectedly." }
            val encodedBuffer = WipingImageBuffer(); output = encodedBuffer
            // Even rotation zero is normalized to avoid forwarding uncertain EXIF orientation or camera metadata.
            // Quality 100 is still JPEG re-encoding, not a lossless or measured OCR improvement claim.
            val compressed = rotated.compress(Bitmap.CompressFormat.JPEG, CaptureImagePolicy.emittedJpegQuality, encodedBuffer)
            if (encodedBuffer.exceededLimit) throw CaptureTooLargeException()
            check(compressed) { "JPEG encoding failed." }
            val bytes = encodedBuffer.copyBytes(); encoded = bytes
            encodedBuffer.close(); output = null
            val emitted = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            BitmapFactory.decodeByteArray(bytes, 0, bytes.size, emitted)
            check(emitted.outWidth == rotated.width && emitted.outHeight == rotated.height) { "Encoded JPEG dimensions do not match normalized pixels." }
            val metadata = JSONObject().put("schemaVersion", 1).put("mode", "detail-preservation-candidate-v1")
              .put("requestedWidth", CaptureImagePolicy.requestedWidth).put("requestedHeight", CaptureImagePolicy.requestedHeight)
              .put("rawImageWidth", image.width).put("rawImageHeight", image.height)
              .put("decodedWidth", decoded.width).put("decodedHeight", decoded.height)
              .put("emittedWidth", emitted.outWidth).put("emittedHeight", emitted.outHeight).put("rawRotationDegrees", rotation)
              .put("cameraJpegQuality", CaptureImagePolicy.cameraJpegQuality).put("emittedJpegQuality", CaptureImagePolicy.emittedJpegQuality)
              .put("normalization", "decode-rotate-reencode").put("encodedBytes", bytes.size)
            val id = UUID.randomUUID().toString()
            val value = JSONObject().put("transferId", id).put("encounterId", encounterId).put("sha256", sha256(bytes))
              .put("createdAt", java.time.Instant.now().toString()).put("image", Base64.encodeToString(bytes, Base64.NO_WRAP)).put("captureMetadata", metadata)
            queued = value
            PendingStore(context).createCapture(value)
            promise.resolve(mapOf("transferId" to id, "encounterId" to encounterId, "sha256" to value.getString("sha256"), "createdAt" to value.getString("createdAt")))
          } catch (e: Exception) {
            if (e is CaptureTooLargeException || output?.exceededLimit == true) promise.reject("CAPTURE_TOO_LARGE", CaptureTooLargeException().message, null)
            else promise.reject("CAPTURE_FAILED", "Capture could not finish. Keep app data intact and reload pending captures before retrying. No plaintext photo was saved.", null)
          } finally {
            raw?.fill(0); encoded?.fill(0); output?.close(); queued?.remove("image")
            try { if (normalized !== bitmap) releaseBitmap(normalized) } finally {
              try { releaseBitmap(bitmap) } finally { try { image.close() } finally { busy = false } }
            }
          }
        }
      })
    } catch (e: Exception) { busy = false; promise.reject("CAPTURE_FAILED", "Camera capture could not start. Reopen the camera and retry.", null) }
  }
}
