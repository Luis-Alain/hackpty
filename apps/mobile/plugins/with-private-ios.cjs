const { withInfoPlist } = require('expo/config-plugins');

module.exports = config => withInfoPlist(config, next => {
  const info = next.modResults;
  info.NSCameraUsageDescription = 'Scan your PsyRec PC pairing QR and photograph a printed clinician note for encrypted transfer to that PC.';
  info.NSLocalNetworkUsageDescription = 'Connect to your physically paired PsyRec Windows PC on private Wi-Fi.';
  delete info.NSMicrophoneUsageDescription;
  delete info.NSFaceIDUsageDescription;
  const localExceptions = Object.fromEntries(['10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16'].map(range => [range, {
    // iOS 17+ requires IP exceptions. Permit custom trust only for private LAN ranges.
    // PinnedHTTPS still mandates HTTPS, TLS 1.2+, exact physical pin and certificate validity.
    NSExceptionAllowsInsecureHTTPLoads: true,
    NSExceptionMinimumTLSVersion: 'TLSv1.2',
  }]));
  info.NSAppTransportSecurity = {
    ...info.NSAppTransportSecurity,
    NSAllowsArbitraryLoads: false,
    NSAllowsLocalNetworking: true,
    NSExceptionDomains: { ...info.NSAppTransportSecurity?.NSExceptionDomains, ...localExceptions },
  };
  return next;
});
