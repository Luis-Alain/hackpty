package expo.modules.psyrectransfer

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class HistoryPolicyTest {
  private val canonicalUuid = "550e8400-e29b-41d4-a716-446655440000"

  @Test fun canonicalUuidAcceptsLowercaseAndRejectsOthers() {
    assertTrue(HistoryPolicy.isCanonicalUuid(canonicalUuid))
    assertTrue(HistoryPolicy.isCanonicalUuid("00000000-0000-0000-0000-000000000000"))
    assertFalse(HistoryPolicy.isCanonicalUuid(canonicalUuid.uppercase()))
    assertFalse(HistoryPolicy.isCanonicalUuid("not-a-uuid"))
    assertFalse(HistoryPolicy.isCanonicalUuid("550e8400e29b41d4a716446655440000"))
    assertFalse(HistoryPolicy.isCanonicalUuid("550e8400-e29b-41d4-a716-44665544000g"))
    assertFalse(HistoryPolicy.isCanonicalUuid(""))
  }

  @Test fun canonicalInstantAcceptsUtcInstantAndRejectsOthers() {
    assertTrue(HistoryPolicy.isCanonicalInstant("2026-09-09T21:00:00Z"))
    assertFalse(HistoryPolicy.isCanonicalInstant("2026-09-09T21:00:00"))
    assertFalse(HistoryPolicy.isCanonicalInstant("not-a-time"))
    assertFalse(HistoryPolicy.isCanonicalInstant(""))
  }

  @Test fun canonicalEndpointNormalizesEquivalentUrls() {
    val pin = "a".repeat(64)
    val a = HistoryPolicy.canonicalEndpoint("https://10.0.0.1:9443", pin)
    val b = HistoryPolicy.canonicalEndpoint("https://10.0.0.1:9443/", pin)
    assertEquals(a, b)
    assertEquals("https://10.0.0.1:9443", a)
  }

  @Test fun aadIsDeterministicAndCollisionResistant() {
    val endpoint = "https://10.0.0.1:9443"
    val pin = "a".repeat(64)
    val encounter = "11111111-1111-1111-1111-111111111111"
    val a = HistoryPolicy.aadBytes(endpoint, pin, canonicalUuid, encounter)
    val b = HistoryPolicy.aadBytes(endpoint, pin, canonicalUuid, encounter)
    assertArrayEquals(a, b)

    val changedEndpoint = HistoryPolicy.aadBytes("https://10.0.0.2:9443", pin, canonicalUuid, encounter)
    val changedPin = HistoryPolicy.aadBytes(endpoint, "b".repeat(64), canonicalUuid, encounter)
    val changedDevice = HistoryPolicy.aadBytes(endpoint, pin, "22222222-2222-2222-2222-222222222222", encounter)
    val changedEncounter = HistoryPolicy.aadBytes(endpoint, pin, canonicalUuid, "33333333-3333-3333-3333-333333333333")
    assertFalse(a.contentEquals(changedEndpoint))
    assertFalse(a.contentEquals(changedPin))
    assertFalse(a.contentEquals(changedDevice))
    assertFalse(a.contentEquals(changedEncounter))

    // Length-prefixing prevents simple concatenation collisions.
    val part1 = HistoryPolicy.aadBytes(endpoint, pin, canonicalUuid, encounter)
    val part2 = HistoryPolicy.aadBytes(endpoint, pin, "a$canonicalUuid", "1$encounter")
    assertNotEquals(part1.toList(), part2.toList())
  }
}
