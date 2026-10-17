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
  // Workers Builds may override Wrangler's configured Worker name. Reject a
  // mismatched trigger before it can pair one lane's content bucket with another Worker.
  if (process.env.WRANGLER_CI_OVERRIDE_NAME && process.env.WRANGLER_CI_OVERRIDE_NAME !== name) {
    throw new Error(`Workers Builds targets ${process.env.WRANGLER_CI_OVERRIDE_NAME}, but the ${lane} lane targets ${name}.`)
  }
  const env = { ...process.env, CLOUDFLARE_ENV: environment }
  const run = (entry, args, commandEnv = env) => {
    const result = spawnSync(process.execPath, [resolve(root, entry), ...args], { cwd: root, env: commandEnv, stdio: 'inherit' })
    if (result.error) throw result.error
    if (result.status !== 0) process.exit(result.status ?? 1)
  }

  run('scripts/check-content-boundary.mjs', [])
  run('node_modules/typescript/bin/tsc', ['--noEmit'])
  run('node_modules/vite/bin/vite.js', ['build'])

  // The Vite plugin records the deployable bundle here. Check its lane before
  // publishing, then deploy this exact config.
  const redirectPath = resolve(root, '.wrangler/deploy/config.json')
  const redirect = JSON.parse(readFileSync(redirectPath, 'utf8'))
  if (typeof redirect.configPath !== 'string') throw new Error('Build did not produce a deploy configuration.')
  const deployConfigPath = resolve(dirname(redirectPath), redirect.configPath)
  const outputPath = relative(resolve(root, 'dist'), deployConfigPath)
  if (outputPath.startsWith('..') || outputPath.startsWith('/')) throw new Error('Deploy configuration must be inside dist/.')
  const config = JSON.parse(readFileSync(deployConfigPath, 'utf8'))
  const bucket = config.r2_buckets?.find((binding) => binding.binding === 'CONTENT')
  const expectedBucket = `personal-fitness-content-${environment}`
  if (config.name !== name || config.vars?.APP_ENV !== environment || bucket?.bucket_name !== expectedBucket) {
    throw new Error(`Build configuration does not match the ${lane} lane.`)
  }

  // Deployments never upload, seed, replace, or delete authored content.
  // Generated configs already contain the selected environment; do not pass
  // --env here, which would select a second environment on that flattened file.
  // Wrangler also consults CLOUDFLARE_ENV, so remove it from this child process.
  const deployEnv = { ...process.env }
  delete deployEnv.CLOUDFLARE_ENV
  run('node_modules/wrangler/bin/wrangler.js', ['deploy', '--config', deployConfigPath], deployEnv)
}
