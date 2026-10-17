import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const lanes = {
  dev: { environment: 'dev', name: 'personal-fitness-dev' },
  main: { environment: 'production', name: 'personal-fitness-production' },
}
const lane = process.argv[2]

if (process.argv.length !== 3 || !Object.hasOwn(lanes, lane)) {
  console.error('Usage: node scripts/deploy-lane.mjs dev|main')
  process.exitCode = 1
} else {
  const root = fileURLToPath(new URL('../', import.meta.url))
  const { environment, name } = lanes[lane]
  const env = { ...process.env, CLOUDFLARE_ENV: environment }
  const run = (entry, args, commandEnv = env) => {
    const result = spawnSync(process.execPath, [resolve(root, entry), ...args], { cwd: root, env: commandEnv, stdio: 'inherit' })
    if (result.error) throw result.error
    if (result.status !== 0) process.exit(result.status ?? 1)
  }

  run('node_modules/typescript/bin/tsc', ['--noEmit'])
  run('node_modules/vite/bin/vite.js', ['build'])

  // The Vite plugin records the deployable bundle here. Check its lane before
  // changing a remote database or publishing, then deploy this exact config.
  const redirectPath = resolve(root, '.wrangler/deploy/config.json')
  const redirect = JSON.parse(readFileSync(redirectPath, 'utf8'))
  if (typeof redirect.configPath !== 'string') throw new Error('Build did not produce a deploy configuration.')
  const deployConfigPath = resolve(dirname(redirectPath), redirect.configPath)
  const outputPath = relative(resolve(root, 'dist'), deployConfigPath)
  if (outputPath.startsWith('..') || outputPath.startsWith('/')) throw new Error('Deploy configuration must be inside dist/.')
  const config = JSON.parse(readFileSync(deployConfigPath, 'utf8'))
  const database = config.d1_databases?.find((binding) => binding.binding === 'DB')
  if (config.name !== name || config.vars?.APP_ENV !== environment || database?.database_name !== name) {
    throw new Error(`Build configuration does not match the ${lane} lane.`)
  }

  // An explicit root config bypasses Vite's generated-config redirect. D1 then
  // resolves the selected environment and migrations relative to the source.
  run('node_modules/wrangler/bin/wrangler.js', ['d1', 'migrations', 'apply', 'DB', '--remote', '--env', environment, '--config', resolve(root, 'wrangler.jsonc')])
  // Generated configs already contain the selected environment; do not pass
  // --env here, which would select a second environment on that flattened file.
  // Wrangler also consults CLOUDFLARE_ENV, so remove it from this child process.
  const deployEnv = { ...process.env }
  delete deployEnv.CLOUDFLARE_ENV
  run('node_modules/wrangler/bin/wrangler.js', ['deploy', '--config', deployConfigPath], deployEnv)
}
