const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const mobile = path.resolve(__dirname, '..');
const destinationArg = process.argv[2];
if (!destinationArg) throw Error('Usage: node scripts/stage-ios-build.cjs <new-output-directory>');
const destination = path.resolve(destinationArg);
if (destination === mobile || destination.startsWith(mobile + path.sep) || mobile.startsWith(destination + path.sep))
  throw Error('Build snapshot must be outside the working mobile directory');
if (fs.existsSync(destination)) throw Error('Use a new output directory; existing files are never overwritten');
const files = [
  'app.json','package.json','package-lock.json','eas.json','.easignore','App.tsx','index.ts','tsconfig.json',
  'plugins/with-private-android.cjs','plugins/with-private-ios.cjs',
  'modules/psyrec-transfer/expo-module.config.json','modules/psyrec-transfer/Package.swift',
  'modules/psyrec-transfer/ios-tests/PolicyTests.swift',
  'modules/psyrec-transfer/ios-tests/Fixtures/synthetic-certificate.pem',
  'scripts/eas-ios-post-install.cjs'
];
function addSource(directory, extensions) {
  for (const entry of fs.readdirSync(path.join(mobile,directory), {withFileTypes:true})) {
    if(entry.isSymbolicLink()) throw Error('Unexpected source symlink');
    const relative = path.posix.join(directory,entry.name);
    if(entry.isDirectory()) {
      if(['.build','.swiftpm','.git','node_modules'].includes(entry.name)) continue;
      addSource(relative,extensions);
    } else if(extensions.includes(path.extname(entry.name))) files.push(relative);
  }
}
addSource('src',['.ts','.tsx']);
addSource('modules/psyrec-transfer/ios',['.swift','.podspec']);
const certificate = fs.readFileSync(path.join(mobile,'modules/psyrec-transfer/ios-tests/Fixtures/synthetic-certificate.pem'),'utf8');
if(!certificate.includes('-----BEGIN CERTIFICATE-----') || certificate.includes('PRIVATE KEY')) throw Error('Fixture must be public certificate only');
fs.mkdirSync(destination,{recursive:true});
const manifest = [];
for (const relative of files.sort()) {
  const source = path.join(mobile,relative);
  if(!fs.statSync(source).isFile()) throw Error('Missing required source '+relative);
  const bytes = fs.readFileSync(source);
  const target = path.join(destination,relative);
  fs.mkdirSync(path.dirname(target),{recursive:true});
  fs.writeFileSync(target,bytes,{flag:'wx'});
  manifest.push({path:relative,bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')});
}
// The existing dependency link is only for local Expo inspection; .easignore excludes it.
if(fs.existsSync(path.join(mobile,'node_modules')))
  fs.symlinkSync(path.join(mobile,'node_modules'),path.join(destination,'node_modules'),process.platform==='win32'?'junction':'dir');
fs.writeFileSync(path.join(destination,'source-manifest.json'),JSON.stringify({files:manifest},null,2)+'\n');
console.log(JSON.stringify({destination,sourceFiles:manifest.length,totalBytes:manifest.reduce((sum,f)=>sum+f.bytes,0)},null,2));
