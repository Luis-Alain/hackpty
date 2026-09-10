'use strict'
const net = require('bare-net')
const { createTunnelClient } = require('./tunnel-client.cjs')
const { IPC } = BareKit
let input = ''
let tunnel = null
let queue = Promise.resolve()
let stopped = false
function reply(value) { if (!stopped) IPC.write(Buffer.from(JSON.stringify(value) + '\n')) }
async function command(request) {
  if (stopped) return
  if (request.type === 'start' && !tunnel) {
    const created = await createTunnelClient(net, request.publicKey)
    if (stopped) { await created.stop(); return }
    tunnel = created
    reply({ ready: true, port: tunnel.port })
  } else if (request.type === 'stop') {
    if (tunnel) await tunnel.stop()
    tunnel = null
    reply({ stopped: true })
  } else reply({ error: 'Invalid tunnel control request.' })
}
IPC.on('data', chunk => {
  input += chunk.toString()
  if (input.length > 2048) { input = ''; reply({ error: 'Invalid tunnel control request.' }); return }
  let at
  while ((at = input.indexOf('\n')) >= 0) {
    const line = input.slice(0, at)
    input = input.slice(at + 1)
    queue = queue.then(() => command(JSON.parse(line))).catch(() => reply({ error: 'Hyperswarm connection could not start.' }))
  }
})
function close() {
  stopped = true
  if (tunnel) void tunnel.stop()
}
IPC.on('error', close)
IPC.on('close', close)

