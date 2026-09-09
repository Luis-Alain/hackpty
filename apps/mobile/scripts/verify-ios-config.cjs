// Run with node scripts/verify-ios-config.cjs. Does not generate native projects or contact EAS.
const assert = require('node:assert/strict');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const mobile = path.resolve(__dirname, '..');
const env = {...process.env, EXPO_OFFLINE:'1', EXPO_NO_TELEMETRY:'1', CI:'1'};
function cli(relative, args) {
  return JSON.parse(execFileSync(process.execPath, [path.join(mobile, relative), ...args],
    {cwd:mobile, env, encoding:'utf8', maxBuffer:8 * 1024 * 1024}));
}
const config = cli('node_modules/expo/bin/cli', ['config', '--type', 'introspect', '--json']);
const info = config._internal.modResults.ios.infoPlist;
assert.equal(config.ios.bundleIdentifier, 'tech.adwen.psyrec.capture');
assert.equal(config.ios.supportsTablet, false);
assert.ok(info.NSCameraUsageDescription);
assert.ok(info.NSLocalNetworkUsageDescription);
assert.ok(!('NSMicrophoneUsageDescription' in info), 'Audio permission must be absent');
assert.ok(!('NSFaceIDUsageDescription' in info), 'Unused biometric permission must be absent');
assert.equal(info.NSAppTransportSecurity.NSAllowsArbitraryLoads, false);
assert.equal(info.NSAppTransportSecurity.NSAllowsLocalNetworking, true);
const ranges = ['10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16'];
const exceptions = info.NSAppTransportSecurity.NSExceptionDomains;
for (const range of ranges) {
  assert.equal(exceptions[range].NSExceptionAllowsInsecureHTTPLoads, true);
  assert.equal(exceptions[range].NSExceptionMinimumTLSVersion, 'TLSv1.2');
}
assert.ok(Object.keys(exceptions).every(key => key === 'localhost' || ranges.includes(key)));
for (const platform of ['ios', 'android']) {
  const modules = cli('node_modules/expo-modules-autolinking/bin/expo-modules-autolinking.js',
    ['search', '--platform', platform, '--json']);
  assert.ok(modules['psyrec-transfer'], 'PsyRecTransfer must autolink on ' + platform);
}
console.log('PASS: Expo iOS permission/ATS configuration; native module discovered on iOS and Android.');
console.log('NOT RUN: Swift compilation/tests, iOS signing, camera, Keychain, TLS and physical iPhone workflow.');
