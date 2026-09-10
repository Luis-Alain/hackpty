package tech.adwen.psyrec.historycheck

import android.app.Activity
import android.app.Instrumentation
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.os.Process
import android.os.SystemClock
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.InputStream
import java.security.KeyStore
import java.security.MessageDigest
import java.util.concurrent.atomic.AtomicReference
import java.util.zip.ZipFile
import javax.crypto.Cipher
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** Platform-only runner: no test dependency or production export API is added. */
class HistoryEvidenceInstrumentation : Instrumentation() {
  companion object {
    private const val APP = "tech.adwen.psyrec.capture.evidence"
    private const val TEST = "$APP.test"
    private const val PRODUCTION = "tech.adwen.psyrec.capture"
    private const val TEXT = "SYNTHETIC HISTORY CHECK: The recorded favorite color is cobalt blue."
    private const val QUESTION = "What favorite color is recorded?"
    private const val SHA = "33bcc57074ec7b6eada5a90651ee546ec0c2b271002c22baf9f1b2dd1e8f75cb"
    private const val LIMIT = 128 * 1024 + 29
    private val UUID_FILE = Regex("[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.enc")
  }
  private var syntheticRun: JSONObject? = null
  private var activity: Activity? = null
  private val checked = JSONArray()

  override fun onCreate(arguments: Bundle?) { super.onCreate(arguments); start() }

  override fun onStart() {
    val result = Bundle()
    try {
      // These checks precede every filesystem/Keystore operation, including APK hashing.
      check(context.packageName == TEST && targetContext.packageName == APP) { "Evidence package isolation failed." }
      check(Process.myUid() == targetContext.applicationInfo.uid) { "Runner is outside the evidence UID." }
      checked.put("evidence package and process UID")
      val productionUidCheck = try {
        val production = targetContext.packageManager.getApplicationInfo(PRODUCTION, 0)
        check(production.uid != Process.myUid()) { "Evidence shares the production UID." }
        "distinct UID verified"
      } catch (_: PackageManager.NameNotFoundException) { "production package not visible or not installed" }
      val directory = File(targetContext.noBackupFilesDir, "psyrec-history-runs").canonicalFile
      check(directory.parentFile == targetContext.noBackupFilesDir.canonicalFile)
      check(!directory.exists() || directory.listFiles()?.isEmpty() == true) {
        "Evidence journal already exists; this runner never clears or overwrites an earlier run."
      }
      val intent = requireNotNull(targetContext.packageManager.getLaunchIntentForPackage(APP))
      check(intent.component?.packageName == APP)
      activity = startActivitySync(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
      val deadline = SystemClock.elapsedRealtime() + 180_000L
      var journal: File? = null
      var completed: JSONObject? = null
      while (SystemClock.elapsedRealtime() < deadline) {
        val files = directory.listFiles()?.filter { UUID_FILE.matches(it.name) } ?: emptyList()
        check(files.size <= 1) { "More than one evidence run was created." }
        if (files.size == 1) {
          journal = files.single().canonicalFile
          check(journal.parentFile == directory && journal.isFile)
          val envelope = decrypt(journal)
          val run = validateSyntheticIdentity(envelope)
          syntheticRun = run
          if (run.getString("status") != "started") completed = run
        }
        val screen = screenText()
        check(!screen.contains("FAILED:")) { screen.take(1200) }
        if (completed != null && screen.contains("PASSED:")) break
        if (completed != null && completed.getString("status") != "succeeded") error("The real runtime saved a failed or cancelled run.")
        SystemClock.sleep(250)
      }
      val run = requireNotNull(completed) { "No terminal encrypted run within 180 seconds." }
      check(screenText().contains("PASSED:")) { "The entry did not confirm exact passages and worker close." }
      checked.put("authenticated fixed synthetic journal and terminal status")
      validateMeasurements(run)
      checked.put("immutable model configuration, exact sources, native counters and timing units")
      val targetJournal = requireNotNull(journal)
      val apk = File(targetContext.applicationInfo.sourceDir)
      val packageInfo = targetContext.packageManager.getPackageInfo(APP, 0)
      val bundleHash = ZipFile(apk).use { zip ->
        val entry = requireNotNull(zip.getEntry("assets/index.android.bundle")) { "Bundled Hermes entry is missing." }
        zip.getInputStream(entry).use { digest(it) }
      }
      val report = JSONObject().put("status", "passed").put("syntheticOnly", true)
        .put("candidatePackage", APP).put("testPackage", TEST).put("productionUidCheck", productionUidCheck)
        .put("versionName", packageInfo.versionName).put("versionCode", packageInfo.longVersionCode)
        .put("debuggable", targetContext.applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE != 0)
        .put("apkSha256", apk.inputStream().use { digest(it) }).put("hermesBundleSha256", bundleHash)
        .put("device", JSONObject().put("manufacturer", Build.MANUFACTURER).put("model", Build.MODEL)
          .put("osRelease", Build.VERSION.RELEASE).put("apiLevel", Build.VERSION.SDK_INT).put("abis", JSONArray(Build.SUPPORTED_ABIS.toList())))
        .put("encryptedJournal", JSONObject().put("name", targetJournal.name).put("bytes", targetJournal.length())
          .put("sha256", targetJournal.inputStream().use { digest(it) }).put("authenticatedReadback", true))
        .put("checksCompleted", checked).put("workerCloseVerification", "Production SDK close promise resolved; native termination is not independently observed.")
        .put("run", run)
      result.putString("historyEvidence", report.toString())
      result.putString("stream", "\nHISTORY_EVIDENCE_PASSED\n" + report.toString() + "\n")
      finish(Activity.RESULT_OK, result)
    } catch (error: Throwable) {
      val report = JSONObject().put("status", "failed").put("reason", error.message ?: error.javaClass.simpleName)
        .put("checksCompleted", checked).put("runEvidenceAvailable", syntheticRun != null)
      syntheticRun?.let { report.put("syntheticRun", it) }
      result.putString("historyEvidence", report.toString())
      result.putString("stream", "\nHISTORY_EVIDENCE_FAILED\n" + report.toString() + "\n")
      finish(Activity.RESULT_CANCELED, result)
    }
  }

  private fun scope() = JSONObject().put("endpoint", "https://10.0.0.1:9443").put("pin", "a".repeat(64))
    .put("deviceId", "00000000-0000-4000-8000-000000000013").put("encounterId", "00000000-0000-4000-8000-000000000014")

  private fun decrypt(file: File): JSONObject {
    val runId = file.name.removeSuffix(".enc")
    // Read only the committed base file; never invoke AtomicFile recovery while its writer runs.
    val bytes = file.inputStream().use { input ->
      val output = java.io.ByteArrayOutputStream()
      val buffer = ByteArray(8192)
      while (true) {
        val size = input.read(buffer)
        if (size < 0) break
        check(output.size() + size <= LIMIT)
        output.write(buffer, 0, size)
      }
      buffer.fill(0)
      output.toByteArray()
    }
    try {
      check(bytes.size >= 29 && bytes[0] == 1.toByte())
      check(!bytes.toString(Charsets.ISO_8859_1).contains(TEXT)) { "Fixture appeared in plaintext journal." }
      val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
      val key = requireNotNull(keyStore.getKey("psyrec-history-runs-v1", null) as? SecretKey)
      val aad = ("psyrec-history-run-v1:" + scope().toString() + ":" + runId).toByteArray(Charsets.UTF_8)
      val clear = try {
        Cipher.getInstance("AES/GCM/NoPadding").apply {
          init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(128, bytes.copyOfRange(1, 13)))
          updateAAD(aad)
        }.doFinal(bytes, 13, bytes.size - 13)
      } finally { aad.fill(0) }
      return try {
        JSONObject(clear.toString(Charsets.UTF_8)).also { check(it.getJSONObject("run").getString("runId") == runId) }
      } finally { clear.fill(0) }
    } finally { bytes.fill(0) }
  }

  private fun validateSyntheticIdentity(envelope: JSONObject): JSONObject {
    check(envelope.getInt("version") == 1 && envelope.getJSONObject("binding").toString() == scope().toString())
    val run = envelope.getJSONObject("run")
    check(run.getInt("schemaVersion") == 1 && run.getString("snapshotId") == "00000000-0000-4000-8000-000000000012")
    check(run.getString("patientId") == "00000000-0000-4000-8000-000000000011")
    val request = run.getJSONObject("request")
    val sources = request.getJSONArray("sources")
    check(sources.length() == 1)
    val source = sources.getJSONObject(0)
    check(source.getString("id") == "S1" && source.getString("recordId") == "00000000-0000-4000-8000-000000000015")
    check(source.getString("text") == TEXT && source.getString("field") == "text" && source.getInt("sourceRevision") == 1)
    check(source.getInt("start") == 0 && source.getInt("end") == TEXT.length)
    val user = request.getJSONArray("history").getJSONObject(1).getString("content")
    val prompt = JSONObject(user.removeSuffix("\n/no_think"))
    check(prompt.getString("question") == QUESTION && prompt.getJSONArray("sources").length() == 1)
    check(prompt.getJSONArray("sources").getJSONObject(0).getString("text") == TEXT)
    return run
  }

  private fun validateMeasurements(run: JSONObject) {
    check(run.getString("status") == "succeeded")
    val model = run.getJSONObject("model")
    check(model.getString("sha256") == SHA && model.getLong("bytes") == 382156480L && model.getString("modelId") == "QWEN3_600M_INST_Q4")
    val config = model.getJSONObject("loadConfig")
    check(config.getString("device") == "cpu" && config.getInt("gpu_layers") == 0 && config.getInt("ctx_size") == 2048 && config.getInt("parallel") == 1)
    check(!model.getJSONObject("loadedInfo").optBoolean("isDelegated", false))
    val runtime = run.getJSONObject("runtime")
    check(runtime.getString("sdkVersion") == "0.18.2" && runtime.getString("platform") == "android")
    val request = run.getJSONObject("request")
    check(!request.getBoolean("kvCache") && request.getBoolean("stream"))
    check(request.getJSONObject("generationParams").getInt("predict") == 128)
    val native = run.getJSONObject("native")
    val metrics = run.getJSONObject("metrics")
    for (key in listOf("promptTokens", "emittedTokens")) {
      val value = native.getDouble(key)
      check(value.isFinite() && value > 0 && value == value.toLong().toDouble()) { "Missing native token counter: $key" }
    }
    check(metrics.getDouble("inputTokens") == native.getDouble("promptTokens"))
    check(metrics.getDouble("outputTokens") == native.getDouble("emittedTokens"))
    check(native.getDouble("timeToFirstToken").let { it.isFinite() && it >= 0 })
    check(native.getDouble("tokensPerSecond").let { it.isFinite() && it > 0 })
    val ttft = metrics.getJSONObject("nativeTimeToFirstToken")
    val tps = metrics.getJSONObject("nativeThroughput")
    check(ttft.getString("unit") == "ms" && ttft.getDouble("value") == native.getDouble("timeToFirstToken"))
    check(tps.getString("unit") == "tokens/s" && tps.getDouble("value") == native.getDouble("tokensPerSecond"))
    for (key in listOf("nativeTimeToFirstToken", "nativeThroughput", "timeToFirstContent", "completionWall", "modelLoadWall")) {
      check(metrics.getJSONObject(key).getString("method").isNotBlank())
      check(metrics.getJSONObject(key).getDouble("value").let { it.isFinite() && it >= 0 })
    }
    val output = run.getJSONObject("output")
    check(output.getBoolean("completionDoneObserved") && output.getBoolean("finalPromiseResolved") && output.getInt("contentDeltaCount") > 0)
    check(run.getJSONArray("selectedSourceIds").toString() == "[\"S1\"]")
    check(JSONObject(output.getString("contentText")).getJSONArray("sourceIds").toString() == "[\"S1\"]")
  }

  private fun screenText(): String {
    val result = AtomicReference("")
    runOnMainSync { result.set(activity?.window?.decorView?.let { collectText(it) } ?: "") }
    return result.get()
  }
  private fun collectText(view: View): String = when (view) {
    is TextView -> view.text.toString()
    is ViewGroup -> (0 until view.childCount).joinToString("\n") { collectText(view.getChildAt(it)) }
    else -> ""
  }
  private fun digest(input: InputStream): String {
    val digest = MessageDigest.getInstance("SHA-256")
    val buffer = ByteArray(128 * 1024)
    while (true) { val size = input.read(buffer); if (size < 0) break; digest.update(buffer, 0, size) }
    buffer.fill(0)
    return digest.digest().joinToString("") { "%02x".format(it.toInt() and 255) }
  }
}

