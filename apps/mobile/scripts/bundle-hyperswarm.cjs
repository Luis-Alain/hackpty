'use strict'
const { spawnSync } = require('node:child_process')
const { join, resolve, dirname } = require('node:path')
const { readFileSync, writeFileSync } = require('node:fs')
const root = resolve(__dirname, '..')
const output = join(root, 'p2p', 'worker.bundle.js')
const pack = join(dirname(require.resolve('bare-pack', { paths: [root] })), 'bin.js')
const args = [pack, '--host', 'android-arm64', '--linked', '--format', 'bundle', '--encoding', 'utf8', '--out', output, join(root, 'p2p', 'worker.entry.cjs')]
const result = spawnSync(process.execPath, args, { cwd: root, stdio: 'inherit' })
if (result.status !== 0) process.exit(result.status || 1)
const bundle = readFileSync(output, 'utf8')
// Match the SDK mobile bundle format: Metro imports the encoded Bare bundle as a string.
writeFileSync(output, 'module.exports = ' + JSON.stringify(bundle) + ';\n')
const Bundle = require(require.resolve('bare-bundle', { paths: [root] }))
const required = Bundle.from(bundle).addons
const manifestPath = join(root, 'qvac', 'addons.manifest.json')
const qvacBundlePath = join(root, 'qvac', 'worker.bundle.js')
if (!require('node:fs').existsSync(manifestPath) || !require('node:fs').existsSync(qvacBundlePath))
  throw new Error('Generate the QVAC mobile bundle with Expo prebuild before validating Hyperswarm native linking.')
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
const qvacBundle = readFileSync(qvacBundlePath, 'utf8')
for (const linked of required) {
  const match = /^linked:lib(.+)\.(\d+\.\d+\.\d+[^/]*)\.so$/.exec(linked)
  if (!match || !manifest.addons.includes(match[1]) || !qvacBundle.includes(linked))
    throw new Error('Hyperswarm native addon is absent or differs from the QVAC linker bundle: ' + linked)
}
console.log('Built Hyperswarm Android worklet; all ' + required.length + ' native addons match the QVAC linker bundle.')


