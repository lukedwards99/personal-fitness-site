import { execFileSync, spawn, spawnSync } from 'node:child_process'

const port = Number(process.env.PREVIEW_PORT ?? 5178)
const httpsPort = Number(process.env.PREVIEW_HTTPS_PORT ?? 8443)
for (const value of [port, httpsPort]) {
  if (!Number.isInteger(value) || value < 1 || value > 65535) throw new Error('Preview ports must be integers between 1 and 65535.')
}
const target = `http://127.0.0.1:${port}`
const children = new Set()
let stopping = false

function stop(code = 0) {
  if (stopping) return
  stopping = true
  process.exitCode = code
  for (const child of children) child.kill('SIGTERM')
}
process.on('SIGINT', () => stop(130))
process.on('SIGTERM', () => stop(143))

function start(command, args, label) {
  const child = spawn(command, args, { stdio: 'inherit' })
  children.add(child)
  child.on('error', (error) => { console.error(`${label}: ${error.message}`); stop(1) })
  child.on('exit', () => {
    children.delete(child)
    if (!stopping) { console.error(`${label} stopped.`); stop(1) }
  })
  return child
}

async function isOurApp(origin) {
  try {
    const response = await fetch(`${origin}/api/health`, { signal: AbortSignal.timeout(2000) })
    return response.ok && (await response.json()).app === 'personal-fitness-site'
  } catch { return false }
}

async function waitFor(check, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (!stopping && Date.now() < deadline) {
    if (await check()) return true
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  return false
}

async function main() {
  const tailscale = ['tailscale', '/Applications/Tailscale.app/Contents/MacOS/Tailscale'].find((binary) => {
    try { execFileSync(binary, ['version'], { stdio: 'ignore' }); return true } catch { return false }
  })
  if (!tailscale) throw new Error('Install and connect Tailscale before starting the tailnet preview.')
  const json = (...args) => JSON.parse(execFileSync(tailscale, [...args, '--json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }))
  const status = json('status')
  if (status.BackendState !== 'Running') throw new Error(`Tailscale is ${status.BackendState}; connect it first.`)
  const host = status.Self.DNSName.replace(/\.$/, '')
  const url = `https://${host}${httpsPort === 443 ? '' : `:${httpsPort}`}`
  const serve = json('serve', 'status')
  const configurations = [serve, ...Object.values(serve.Foreground ?? {})]
  const occupied = configurations.find((configuration) => configuration.TCP?.[httpsPort])
  const existingProxy = occupied?.Web?.[`${host}:${httpsPort}`]?.Handlers?.['/']?.Proxy
  if (occupied && existingProxy !== target) {
    throw new Error(`Tailscale HTTPS port ${httpsPort} is already used by another service. Set PREVIEW_HTTPS_PORT to a free port.`)
  }

  if (!await isOurApp(target)) {
    const setup = spawnSync('npm', ['run', 'db:setup'], { stdio: 'inherit' })
    if (setup.error) throw setup.error
    if (setup.status !== 0) throw new Error('Local sample database setup failed.')
    start(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], 'Local server')
    if (!await waitFor(() => isOurApp(target), 60000)) throw new Error(`The local application did not become ready at ${target}.`)
  } else {
    console.log(`Reusing ${target}.`)
  }

  if (!occupied) start(tailscale, ['serve', `--https=${httpsPort}`, target], 'Tailscale Serve')
  if (!await waitFor(() => isOurApp(url), 30000)) {
    console.log(`Local server ready. Tailscale is still preparing ${url}; follow any activation link printed above.`)
  } else {
    console.log(`\nPreview ready: ${url}\nOpen it from a device connected to the same tailnet. Press Ctrl+C to stop services started by this command.`)
  }
}

main().catch((error) => { console.error(error.message); stop(1) })
