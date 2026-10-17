import { existsSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, extname, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { assertSafePath, ensureDirectory, parseArguments, readSafeFile, resolveWorkspace, sha256, within, writeImmutable } from './workspace.mjs'

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const MEDIA = /^\/api\/(media\/([a-f0-9]{64})\.(webp|mp4|webm|jpg|jpeg|png|gif|avif))$/
const MIME = { '.webp': 'image/webp', '.mp4': 'video/mp4', '.webm': 'video/webm', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.avif': 'image/avif' }
const jsonBytes = value => Buffer.from(`${JSON.stringify(value, null, 2)}\n`)
const text = bytes => new TextDecoder('utf-8', { fatal: true }).decode(bytes)
const readJSON = path => JSON.parse(text(readSafeFile(path)))
const realDate = date => typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)
  && !Number.isNaN(Date.parse(`${date}T00:00:00Z`)) && new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date
const fields = new Set(['slug', 'title', 'excerpt', 'kind', 'category', 'date', 'readTime', 'media', 'sequence', 'sample', 'contentFile'])

function writeDerived(path, bytes) {
  assertSafePath(path)
  if (existsSync(path)) readSafeFile(path)
  ensureDirectory(dirname(path))
  const temporary = within(dirname(path), `.content-build-${randomUUID()}.tmp`)
  try {
    writeFileSync(temporary, bytes, { flag: 'wx', mode: 0o600 })
    assertSafePath(path)
    renameSync(temporary, path)
  } finally { rmSync(temporary, { force: true }) }
}

export function buildContent({ workspace: requestedWorkspace, now = new Date() } = {}) {
  const workspace = resolveWorkspace(requestedWorkspace)
  const postDirectory = within(workspace, 'posts')
  assertSafePath(postDirectory, { allowMissing: false })
  const entries = readdirSync(postDirectory, { withFileTypes: true })
  if (entries.some(entry => !entry.isFile() || !/^[a-z0-9]+(?:-[a-z0-9]+)*\.(json|md)$/.test(entry.name))) throw new Error('Posts must contain only regular slug.json and slug.md files.')
  const metadataFiles = entries.filter(entry => entry.name.endsWith('.json')).sort((a, b) => a.name.localeCompare(b.name))
  if (!metadataFiles.length) throw new Error('Content workspace contains no posts.')
  const mediaObjects = new Map()
  const referencedMarkdown = new Set()
  const posts = metadataFiles.map(entry => {
    const metadata = readJSON(within(postDirectory, entry.name))
    if (!metadata || Array.isArray(metadata) || typeof metadata !== 'object' || Object.keys(metadata).some(key => !fields.has(key))) throw new Error(`Invalid post metadata: ${entry.name}`)
    const { slug, title, excerpt, kind, category, date, readTime, media, sequence, sample, contentFile } = metadata
    if (typeof slug !== 'string' || !SLUG.test(slug) || entry.name !== `${slug}.json` || contentFile !== `${slug}.md`
      || ![title, excerpt, category].every(value => typeof value === 'string' && value.trim()) || !['advice', 'journey'].includes(kind)
      || !realDate(date) || !Number.isSafeInteger(readTime) || readTime < 1 || !Array.isArray(media)
      || (sequence !== undefined && (!Number.isSafeInteger(sequence) || sequence < 1)) || (sample !== undefined && typeof sample !== 'boolean')) throw new Error(`Invalid post metadata: ${entry.name}`)
    const markdown = text(readSafeFile(within(postDirectory, contentFile)))
    if (!markdown.trim()) throw new Error(`Post body is empty: ${slug}`)
    referencedMarkdown.add(contentFile)
    for (const item of media) {
      const matched = typeof item?.path === 'string' ? MEDIA.exec(item.path) : null
      if (!matched || !['image', 'video'].includes(item.type) || typeof item.alt !== 'string' || !item.alt.trim()
        || (item.type === 'video') !== ['mp4', 'webm'].includes(matched[3]) || Object.keys(item).some(key => !['type', 'path', 'alt'].includes(key))) throw new Error(`Invalid post media: ${slug}`)
      const [, key, hash] = matched
      if (!mediaObjects.has(key)) {
        const path = within(workspace, key)
        const bytes = readSafeFile(path)
        if (sha256(bytes) !== hash) throw new Error(`Media checksum mismatch: ${key}`)
        mediaObjects.set(key, { key, path, size: bytes.length, sha256: hash, contentType: MIME[extname(key)] })
      }
    }
    return { ...metadata, markdown }
  }).sort((a, b) => b.date.localeCompare(a.date) || (b.sequence ?? 0) - (a.sequence ?? 0) || a.slug.localeCompare(b.slug))
  if (entries.some(entry => entry.name.endsWith('.md') && !referencedMarkdown.has(entry.name))) throw new Error('An unreferenced Markdown post would be omitted from the catalog.')

  const instant = typeof now === 'function' ? now() : now
  const publishedAt = new Date(instant).toISOString()
  let catalog = { schemaVersion: 1, updatedAt: publishedAt, posts }
  const pointerPath = within(workspace, 'current.json')
  if (existsSync(pointerPath)) {
    const previous = readJSON(pointerPath)
    if (previous.schemaVersion !== 1 || !/^releases\/[a-f0-9]{64}\/catalog\.json$/.test(previous.catalogKey) || !/^[a-f0-9]{64}$/.test(previous.sha256)) throw new Error('Existing content pointer is invalid.')
    const previousBytes = readSafeFile(within(workspace, previous.catalogKey))
    if (sha256(previousBytes) !== previous.sha256 || previous.catalogKey !== `releases/${previous.sha256}/catalog.json`) throw new Error('Existing catalog checksum mismatch.')
    const previousCatalog = JSON.parse(text(previousBytes))
    if (previousCatalog.schemaVersion === 1 && JSON.stringify(previousCatalog.posts) === JSON.stringify(posts)) catalog = previousCatalog
  }
  const bytes = jsonBytes(catalog)
  const hash = sha256(bytes)
  const catalogKey = `releases/${hash}/catalog.json`
  const releaseDir = within(workspace, 'releases', hash)
  const catalogPath = within(workspace, catalogKey)
  const pointer = { schemaVersion: 1, catalogKey, sha256: hash, postCount: posts.length, publishedAt: catalog.updatedAt }
  const manifest = { schemaVersion: 1, catalogKey, postCount: posts.length, files: [
    ...[...mediaObjects.values()].sort((a, b) => a.key.localeCompare(b.key)),
    { key: catalogKey, path: catalogPath, size: bytes.length, sha256: hash, contentType: 'application/json; charset=utf-8' },
  ] }
  writeImmutable(catalogPath, bytes)
  writeDerived(within(releaseDir, 'publish-manifest.json'), jsonBytes(manifest))
  writeDerived(pointerPath, jsonBytes(pointer))
  return { workspace, releaseDir, catalogKey, manifest, pointer }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = parseArguments(process.argv.slice(2), ['--workspace'])
    const result = buildContent({ workspace: args['--workspace'] })
    console.log(`Built ${result.pointer.postCount} posts and ${result.manifest.files.length - 1} media objects in ${result.catalogKey}.`)
  } catch (error) { console.error(error.message); process.exitCode = 1 }
}
