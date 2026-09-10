package expo.modules.psyrectransfer

import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
import java.util.UUID

internal object HistoryPolicy {
  const val MAX_RECORDS = 50
  const val MAX_ALIAS_LENGTH = 80
  const val MAX_TEXT_LENGTH = 30000
  const val MAX_CLEAR_BYTES = 1024 * 1024 - 29

  private val UUID_REGEX = Regex("[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")

  fun validate(snapshot: JSONObject, requestedDeviceId: String, requestedEncounterId: String, maxClearBytes: Int = MAX_CLEAR_BYTES) {
    requireKeys(snapshot, setOf("version", "snapshotId", "syncedAt", "binding", "patient", "records", "coverage"))
    require(snapshot.opt("version") is Int && snapshot.getInt("version") == 1) { "Invalid history snapshot version." }

    val clearBytes = snapshot.toString().toByteArray(Charsets.UTF_8)
    try { require(clearBytes.size <= maxClearBytes) { "History snapshot exceeds size limit." } } finally { clearBytes.fill(0) }

    requireUuid(snapshot, "snapshotId")
    requireInstant(snapshot, "syncedAt")

    val binding = requireObject(snapshot, "binding")
    requireKeys(binding, setOf("deviceId", "encounterId"))
    val bindingDeviceId = requireUuid(binding, "deviceId")
    val bindingEncounterId = requireUuid(binding, "encounterId")
    require(bindingDeviceId == requestedDeviceId) { "History binding device mismatch." }
    require(bindingEncounterId == requestedEncounterId) { "History binding encounter mismatch." }

    val patient = requireObject(snapshot, "patient")
    requireKeys(patient, setOf("id", "alias"))
    val patientId = requireUuid(patient, "id")
    require(requireString(patient, "alias").length <= MAX_ALIAS_LENGTH) { "Patient alias too long." }

    val recordsArray = requireArray(snapshot, "records")
    val recordCount = recordsArray.length()
    require(recordCount <= MAX_RECORDS) { "Too many history records." }

    val seenIds = mutableSetOf<String>()
    for (i in 0 until recordCount) {
      val record = recordsArray.get(i)
      require(record is JSONObject) { "Invalid history record type." }
      requireKeys(record, setOf("id", "patientId", "encounterId", "sourceRevision", "approvedAt", "text", "sourceText"))
      val recordId = requireUuid(record, "id")
      require(seenIds.add(recordId)) { "Duplicate history record id." }
      require(requireUuid(record, "patientId") == patientId) { "Record patient mismatch." }
      requireUuid(record, "encounterId")
      val sourceRevision = record.opt("sourceRevision")
      require(sourceRevision is Int && sourceRevision >= 1) { "Invalid sourceRevision." }
      requireInstant(record, "approvedAt")
      require(requireString(record, "text").length <= MAX_TEXT_LENGTH) { "Record text too long." }
      require(requireString(record, "sourceText").length <= MAX_TEXT_LENGTH) { "Record sourceText too long." }
    }

    val coverage = requireObject(snapshot, "coverage")
    requireKeys(coverage, setOf("totalRecords", "includedRecords", "partial"))
    val total = coverage.opt("totalRecords")
    val included = coverage.opt("includedRecords")
    require(total is Int && total >= 0) { "Invalid totalRecords." }
    require(included is Int && included >= 0) { "Invalid includedRecords." }
    require(included == recordCount) { "Invalid coverage record count." }
    require(total >= included) { "Invalid coverage totals." }
    val partial = coverage.opt("partial")
    require(partial is Boolean && partial == (total > included)) { "Invalid partial flag." }
  }

  fun isCanonicalUuid(value: String): Boolean {
    if (!value.matches(UUID_REGEX)) return false
    return try { UUID.fromString(value); true } catch (_: Exception) { false }
  }

  fun isCanonicalInstant(value: String): Boolean = try { Instant.parse(value); true } catch (_: Exception) { false }

  fun canonicalEndpoint(endpoint: String, pin: String): String {
    val url = PinnedPeer.endpoint(endpoint, pin)
    val port = if (url.port != -1) url.port else url.defaultPort
    return "${url.protocol}://${url.host}:$port"
  }

  fun aadBytes(endpoint: String, pin: String, deviceId: String, encounterId: String): ByteArray {
    val canonical = canonicalEndpoint(endpoint, pin)
    return encodeLengthPrefixed(listOf(canonical, pin, deviceId, encounterId))
  }

  private fun encodeLengthPrefixed(parts: List<String>): ByteArray {
    val bytes = parts.map { it.toByteArray(Charsets.UTF_8) }
    val total = bytes.sumOf { 4 + it.size }
    val out = ByteArray(total)
    var offset = 0
    for (b in bytes) {
      val len = b.size
      out[offset++] = (len shr 24).toByte()
      out[offset++] = (len shr 16).toByte()
      out[offset++] = (len shr 8).toByte()
      out[offset++] = len.toByte()
      b.copyInto(out, offset)
      offset += b.size
    }
    return out
  }

  private fun requireKeys(obj: JSONObject, keys: Set<String>) {
    require(obj.keys().asSequence().toSet() == keys) { "Unexpected history snapshot keys." }
  }

  private fun requireObject(obj: JSONObject, key: String): JSONObject {
    val value = obj.opt(key)
    require(value is JSONObject) { "Invalid JSON object field." }
    return value
  }

  private fun requireArray(obj: JSONObject, key: String): JSONArray {
    val value = obj.opt(key)
    require(value is JSONArray) { "Invalid JSON array field." }
    return value
  }

  private fun requireString(obj: JSONObject, key: String): String {
    val value = obj.opt(key)
    require(value is String) { "Invalid string field." }
    return value
  }

  private fun requireUuid(obj: JSONObject, key: String): String {
    val value = requireString(obj, key)
    require(isCanonicalUuid(value)) { "Invalid UUID field." }
    return value
  }

  private fun requireInstant(obj: JSONObject, key: String): String {
    val value = requireString(obj, key)
    require(isCanonicalInstant(value)) { "Invalid instant field." }
    return value
  }
}
