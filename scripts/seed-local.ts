import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { posts } from '../src/content'

// Content is authored once; the local read-only API receives the same sample posts.
// Boundaries stay local: this script never accepts a remote flag or environment.
mkdirSync('.wrangler', { recursive: true })
const seedPath = resolve('.wrangler/seed-local.sql')
const quote = (value: string) => `'${value.replaceAll("'", "''")}'`
const statements = posts.map((post) =>
  `INSERT INTO posts (slug, document) VALUES (${quote(post.slug)}, ${quote(JSON.stringify(post))}) ON CONFLICT(slug) DO UPDATE SET document = excluded.document;`,
)
writeFileSync(seedPath, `BEGIN TRANSACTION;\n${statements.join('\n')}\nCOMMIT;\n`)
try {
  const result = spawnSync(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'd1', 'execute', 'DB', '--local', '--file', seedPath], { stdio: 'inherit' })
  if (result.error) throw result.error
  if (result.status !== 0) process.exitCode = result.status ?? 1
} finally {
  rmSync(seedPath, { force: true })
}
