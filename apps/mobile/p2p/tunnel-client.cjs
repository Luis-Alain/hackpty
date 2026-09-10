'use strict'
const Hyperswarm = require('hyperswarm')

// Opaque TCP bytes only: TLS remains inside the native Android transport.
exports.createTunnelClient = async function createTunnelClient(net, publicKey, options = {}) {
  if (!/^[a-f0-9]{64}$/.test(publicKey)) throw new Error('Invalid Hyperswarm peer key.')
  const peers = new Set()
  let stopped = false
  const server = net.createServer(local => {
    if (stopped || peers.size >= 4) { local.destroy(); return }
    const swarm = new Hyperswarm({ bootstrap: options.bootstrap, maxPeers: 1 })
    let remote = null
    let closed = false
    let timer
    const resetTimeout = () => { clearTimeout(timer); timer = setTimeout(close, options.timeoutMs || 30000) }
    const item = { close, done: null }
    peers.add(item)
    function close() {
      if (closed) return
      closed = true
      clearTimeout(timer)
      local.destroy()
      if (remote) remote.destroy()
      item.done = Promise.resolve(swarm.destroy()).catch(() => {}).finally(() => peers.delete(item))
    }
    local.on('error', close)
    local.on('close', close)
    local.pause()
    swarm.on('error', close)
    swarm.on('connection', connection => {
      if (closed || remote || connection.remotePublicKey.toString('hex') !== publicKey) { connection.destroy(); return }
      remote = connection
      remote.on('error', close)
      remote.on('close', close)
      remote.on('data', resetTimeout)
      local.on('data', resetTimeout)
      remote.pipe(local).pipe(remote)
      resetTimeout()
      local.resume()
    })
    resetTimeout()
    swarm.joinPeer(Buffer.from(publicKey, 'hex'))
  })
  server.on('error', () => {})
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => { server.removeListener('error', reject); resolve() })
  })
  return {
    port: server.address().port,
    get activeConnections() { return peers.size },
    async stop() {
      stopped = true
      const closing = new Promise(resolve => server.close(resolve))
      const current = [...peers]
      for (const item of current) item.close()
      await Promise.all(current.map(item => item.done))
      await closing
    }
  }
}

