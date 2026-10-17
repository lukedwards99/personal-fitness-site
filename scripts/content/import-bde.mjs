import { readdirSync } from 'node:fs'
import { basename, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { assertIdenticalOrMissing, assertSafePath, parseArguments, readSafeFile, resolveWorkspace, sha256, within, writeImmutable } from './workspace.mjs'

const jsonBytes = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`)
const text = (bytes) => new TextDecoder('utf-8', { fatal: true }).decode(bytes)
const realDate = (date) => typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)
  && !Number.isNaN(Date.parse(`${date}T00:00:00Z`)) && new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date

export function importBde({ source, workspace: requestedWorkspace } = {}) {
  if (!source) throw new Error('A BDE project root is required with --source.')
  const workspace = resolveWorkspace(requestedWorkspace)
  const sourceRoot = assertSafePath(resolve(source), { allowMissing: false })
  const blogRoot = within(sourceRoot, 'blogs', 'lukes-journey')
  const postsRoot = within(blogRoot, 'posts')
  const publicRoot = within(sourceRoot, 'public')
  const sourceFiles = new Map()
  const planned = new Map()
  const mediaFiles = new Map()
  let mediaReferences = 0

  const plan = (destination, bytes) => {
    const previous = planned.get(destination)
    if (previous && !previous.equals(bytes)) throw new Error(`Import has conflicting destination files: ${destination}`)
    planned.set(destination, bytes)
  }
  const retainSource = (sourcePath, destination, bytes) => {
    sourceFiles.set(sourcePath, { sourcePath, path: destination, size: bytes.length, sha256: sha256(bytes) })
  }
  const originalTree = (directory, relativePath) => {
    assertSafePath(directory, { allowMissing: false })
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = within(directory, entry.name)
      if (entry.isSymbolicLink()) throw new Error(`Symbolic links are not allowed: ${file}`)
      const sourcePath = `${relativePath}/${entry.name}`
      if (entry.isDirectory()) originalTree(file, sourcePath)
      else if (entry.isFile()) {
        const bytes = readSafeFile(file)
        const destination = `source/bde-web/${sourcePath}`
        plan(within(workspace, destination), bytes)
        retainSource(sourcePath, destination, bytes)
      } else throw new Error(`Unsupported source file: ${file}`)
    }
  }
  originalTree(blogRoot, 'blogs/lukes-journey')
  const blog = JSON.parse(text(readSafeFile(within(blogRoot, 'blog.json'))))
  if (!blog || typeof blog.title !== 'string' || !blog.trainer) throw new Error('Invalid BDE blog metadata.')
  const entries = readdirSync(postsRoot, { withFileTypes: true })
  if (entries.some(entry => !entry.isFile() || !/^journey-\d+\.(json|md)$/.test(entry.name))) throw new Error('BDE posts must contain only regular journey metadata and Markdown files.')
  const metadataFiles = entries.filter(entry => entry.isFile() && entry.name.endsWith('.json')).sort((a, b) => a.name.localeCompare(b.name))
  if (!metadataFiles.length) throw new Error('No BDE journal posts found.')
  if (entries.some(entry => entry.name.endsWith('.md') && !metadataFiles.some(metadata => `${basename(metadata.name, '.json')}.md` === entry.name))) throw new Error('An unreferenced BDE Markdown entry would be omitted.')
  const sequences = new Set()

  for (const entry of metadataFiles) {
    const slug = basename(entry.name, '.json')
    const matched = /^journey-(\d+)$/.exec(slug)
    const sequence = matched ? Number(matched[1]) : 0
    if (!Number.isSafeInteger(sequence) || sequence < 1 || sequences.has(sequence)) throw new Error(`Invalid or duplicate journey sequence: ${slug}`)
    sequences.add(sequence)
    const original = JSON.parse(text(readSafeFile(within(postsRoot, entry.name))))
    if (!original || typeof original.title !== 'string' || !original.title.trim() || typeof original.summary !== 'string' || !original.summary.trim()
      || !realDate(original.publishedDate) || original.contentFile !== `${slug}.md` || !Array.isArray(original.media) || !original.media.length) {
      throw new Error(`Invalid BDE metadata: ${entry.name}`)
    }
    const markdownBytes = readSafeFile(within(postsRoot, original.contentFile))
    const markdown = text(markdownBytes)
    if (!markdown.trim()) throw new Error(`Empty BDE journal body: ${slug}`)
    const media = original.media.map(item => {
      if (!item || !['image', 'video'].includes(item.type) || typeof item.path !== 'string'
        || !/^blog-media\/[a-z0-9-]+\/[a-z0-9-]+\/[a-f0-9]{16}\.(webp|mp4)$/.test(item.path)
        || typeof item.alt !== 'string' || !item.alt.trim()) throw new Error(`Invalid media reference in ${slug}`)
      const extension = extname(item.path)
      if ((item.type === 'image' && extension !== '.webp') || (item.type === 'video' && extension !== '.mp4')) throw new Error(`Media type mismatch in ${slug}`)
      const sourcePath = within(publicRoot, item.path)
      const bytes = readSafeFile(sourcePath)
      const hash = sha256(bytes)
      const key = `media/${hash}${extension}`
      if (!mediaFiles.has(key)) mediaFiles.set(key, bytes)
      retainSource(`public/${item.path}`, key, bytes)
      mediaReferences++
      return { type: item.type, path: `/api/${key}`, alt: item.alt }
    })
    const words = markdown.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu)?.length ?? 0
    const post = { slug, title: original.title, excerpt: original.summary, kind: 'journey', category: 'Journal', date: original.publishedDate,
      readTime: Math.max(1, Math.ceil(words / 200)), media, sequence, sample: false, contentFile: `${slug}.md` }
    plan(within(workspace, 'posts', `${slug}.json`), jsonBytes(post))
    plan(within(workspace, 'posts', `${slug}.md`), markdownBytes)
  }
  if ([...sequences].some(sequence => sequence > metadataFiles.length)) throw new Error('BDE journal sequence is incomplete; import would omit an entry.')
  for (const [key, bytes] of mediaFiles) plan(within(workspace, key), bytes)
  const manifest = { schemaVersion: 1, sourceRoot, blog: 'lukes-journey', postCount: metadataFiles.length, mediaReferences, mediaCount: mediaFiles.size,
    files: [...sourceFiles.values()].sort((a, b) => a.sourcePath.localeCompare(b.sourcePath)) }
  plan(within(workspace, 'source', 'bde-web', 'import-manifest.json'), jsonBytes(manifest))
  // Validate every destination before writing any of this import. The exclusive
  // write also catches a file introduced between preflight and copying.
  for (const [path, bytes] of planned) assertIdenticalOrMissing(path, bytes)
  for (const [path, bytes] of planned) writeImmutable(path, bytes)
  return { workspace, postCount: metadataFiles.length, mediaReferences, mediaCount: mediaFiles.size, manifest }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = parseArguments(process.argv.slice(2), ['--source', '--workspace'])
    const result = importBde({ source: args['--source'], workspace: args['--workspace'] })
    console.log(`Imported ${result.postCount} journal entries and ${result.mediaCount} media objects (${result.mediaReferences} ordered references) into ${result.workspace}.`)
  } catch (error) { console.error(error.message); process.exitCode = 1 }
}
