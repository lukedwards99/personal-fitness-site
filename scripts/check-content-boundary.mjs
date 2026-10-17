import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const files = [...new Set(execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean))]
const authored = /(^|\/)(?:posts|entries|articles|journal|blogs|blog-media|content-backups|\.content|\.local-content)(\/|$)|^content\//
const forbidden = files.filter(file => {
  const path = resolve(root, file)
  if (!existsSync(path)) return false
  if (authored.test(file) || /(^|\/)current\.json$|(^|\/)releases\/[a-f0-9]{64}\//.test(file)) return true
  if (file.endsWith('.json') && !file.endsWith('package-lock.json')) {
    try {
      const value = JSON.parse(readFileSync(path, 'utf8'))
      return value && typeof value === 'object' && ((value.schemaVersion === 1 && Array.isArray(value.posts))
        || (typeof value.slug === 'string' && ('markdown' in value || 'contentFile' in value || 'publishedDate' in value)))
    } catch { return false }
  }
  return false
})
if (forbidden.length) {
  console.error(`Authored content cannot be committed. Move these files to the external content workspace:\n${forbidden.join('\n')}`)
  process.exitCode = 1
} else console.log('Content boundary passed: no authored entries, releases, or backups in Git.')
