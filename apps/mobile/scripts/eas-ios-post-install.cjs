const {spawnSync} = require('node:child_process');
const path = require('node:path');
if (process.env.EAS_BUILD_PLATFORM !== 'ios') process.exit(0);
if (process.platform !== 'darwin') throw Error('iOS native checks require the Apple build worker');
const root = path.resolve(__dirname, '..');
function run(command, args, options = {}) {
  const result = spawnSync(command, args, {cwd: root, stdio: 'inherit', ...options});
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
run(process.execPath, [path.join(root, 'node_modules/typescript/bin/tsc'), '--noEmit']);
const env = {...process.env};
delete env.SDKROOT;
run('/usr/bin/xcrun', ['--sdk', 'macosx', 'swift', 'test', '--package-path',
  path.join(root, 'modules/psyrec-transfer')], {env});
