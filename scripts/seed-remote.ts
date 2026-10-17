import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { posts } from '../src/content'

const lane = process.argv[2]

if (process.argv.length !== 3 || (lane !== 'dev' && lane !== 'main')) {
  console.error('Usage: tsx scripts/seed-remote.ts dev|main')
  process.exitCode = 1
} else {
  const environment = lane === 'dev' ? 'dev' : 'production'
  const root = fileURLToPath(new URL('../', import.meta.url))
  const statePath = resolve(root, '.wrangler')
  mkdirSync(statePath, { recursive: true })
  const seedDirectory = mkdtempSync(resolve(statePath, 'seed-remote-'))
  const seedPath = resolve(seedDirectory, 'seed.sql')
  const quote = (value: string) => `'${value.replaceAll("'", "''")}'`

  try {
    // D1 executes the SQL file as a batch. Existing published content is kept,
    // and no explicit SQL transaction statements are needed for remote import.
    const statements = posts.map((post) =>
      `INSERT INTO posts (slug, document) VALUES (${quote(post.slug)}, ${quote(JSON.stringify(post))}) ON CONFLICT(slug) DO NOTHING;`,
    )
    writeFileSync(seedPath, `${statements.join('\n')}\n`, { mode: 0o600 })
    const result = spawnSync(process.execPath, [
      resolve(root, 'node_modules/wrangler/bin/wrangler.js'),
      'd1', 'execute', 'DB', '--remote', '--env', environment,
      '--config', resolve(root, 'wrangler.jsonc'), '--file', seedPath,
    ], { cwd: root, env: { ...process.env, CLOUDFLARE_ENV: environment }, stdio: 'inherit' })
    if (result.error) throw result.error
    if (result.status !== 0) process.exitCode = result.status ?? 1
  } finally {
    rmSync(seedDirectory, { recursive: true, force: true })
  }
}
