const { withAndroidManifest } = require('expo/config-plugins');
module.exports = config => withAndroidManifest(config, next => {
  const app = next.modResults.manifest.application[0].$;
  app['android:allowBackup'] = 'false';
  app['android:usesCleartextTraffic'] = 'false';
  return next;
});
