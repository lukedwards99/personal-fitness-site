import {
  closeSync, existsSync, fsyncSync, linkSync, openSync, readdirSync,
  renameSync, unlinkSync, writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { assertSafePath, ensureDirectory, readSafeFile, resolveWorkspace, sha256, within } from '../workspace.mjs'

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const HASH = /^[a-f0-9]{64}$/
const MEDIA = /^([a-f0-9]{64})\.(webp|jpe?g|png|gif|avif|mp4|webm)$/
const MIME = { webp: 'image/webp', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', avif: 'image/avif', mp4: 'video/mp4', webm: 'video/webm' }
const BODY_LIMIT = 2 * 1024 * 1024
const UPLOAD_LIMIT = 100 * 1024 * 1024
const POST_FIELDS = new Set(['slug', 'title', 'excerpt', 'kind', 'category', 'date', 'readTime', 'media', 'sequence', 'sample', 'contentFile', 'markdown'])
const json = value => Buffer.from(`${JSON.stringify(value, null, 2)}\n`)
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const decode = bytes => new TextDecoder('utf-8', { fatal: true }).decode(bytes)
const equal = (a, b) => a === null || b === null ? a === b : a.equals(b)
const revisionOf = (metadata, markdown) => sha256(Buffer.concat([Buffer.from(`${metadata.length}:`), metadata, Buffer.from(`${markdown.length}:`), markdown]))
const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && !Number.isNaN(Date.parse(`${value}T12:00:00Z`)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value

export class StudioError extends Error {
  constructor(status, message, fields) {
    super(message)
    this.name = 'StudioError'
    this.status = status
    if (fields !== undefined) this.fields = fields
  }
}

function invalid(message, fields) { throw new StudioError(400, message, fields) }
function conflict(message = 'This post changed outside this editor. Reload it before saving.') { throw new StudioError(409, message) }
function slugValue(slug) {
  if (typeof slug !== 'string' || slug.length > 128 || !SLUG.test(slug)) invalid('Use a stable slug with lowercase letters, numbers, and single hyphens.', { slug: 'Invalid slug.' })
  return slug
}
function nullableFile(path) {
  assertSafePath(path)
  return existsSync(path) ? readSafeFile(path) : null
}
function syncDirectory(path) {
  assertSafePath(path, { allowMissing: false })
  const fd = openSync(path, 'r')
  try { fsyncSync(fd) } finally { closeSync(fd) }
}
function durableFile(path, bytes) {
  bytes = Buffer.from(bytes)
  assertSafePath(path)
  ensureDirectory(dirname(path))
  const existing = nullableFile(path)
  if (existing) {
    if (!existing.equals(bytes)) conflict('An existing saved version differs. No file was overwritten.')
    return
  }
  const temporary = within(dirname(path), `.write-${randomUUID()}`)
  const fd = openSync(temporary, 'wx', 0o600)
  try {
    try { writeFileSync(fd, bytes); fsyncSync(fd) } finally { closeSync(fd) }
    // Publish only a complete durable file; a crash cannot leave a truncated
    // transaction descriptor, saved version, or imported media at its final name.
    try { linkSync(temporary, path) } catch (error) {
      if (error.code !== 'EEXIST') throw error
      if (!equal(nullableFile(path), bytes)) conflict('An existing saved version differs. No file was overwritten.')
    }
    syncDirectory(dirname(path))
  } finally { if (existsSync(temporary)) unlinkSync(temporary) }
}
function workspacePath(requested) {
  try { return resolveWorkspace(requested) } catch {
    invalid('Choose a content workspace outside Git with no symbolic links.', { workspace: 'Unsafe content workspace.' })
  }
}
function postPaths(workspace, slug) {
  return { metadata: within(workspace, 'posts', `${slug}.json`), markdown: within(workspace, 'posts', `${slug}.md`) }
}
function readPair(workspace, slug) {
  const paths = postPaths(workspace, slug)
  const metadata = nullableFile(paths.metadata)
  const markdown = nullableFile(paths.markdown)
  if ((metadata === null) !== (markdown === null)) conflict('This post has an incomplete file pair. Its files were preserved for recovery.')
  return metadata === null ? null : { metadata, markdown, revision: revisionOf(metadata, markdown) }
}

function mediaFile(file) {
  const matched = typeof file === 'string' && MEDIA.exec(file)
  if (!matched) invalid('The media path is invalid.', { media: 'Use media imported into this content workspace.' })
  return matched
}
function validateMedia(media) {
  if (!Array.isArray(media) || media.length > 1000) invalid('Choose up to 1,000 media items.', { media: 'Invalid media list.' })
  return media.map(item => {
    if (!record(item) || Object.keys(item).some(key => !['type', 'path', 'alt'].includes(key)) || typeof item.path !== 'string' || !item.path.startsWith('/api/media/')) invalid('A media item is invalid.', { media: 'Invalid media item.' })
    const matched = mediaFile(item.path.slice('/api/media/'.length))
    if (!['image', 'video'].includes(item.type) || (item.type === 'video') !== ['mp4', 'webm'].includes(matched[2])) invalid('A media type does not match its file.', { media: 'Invalid media type.' })
    if (typeof item.alt !== 'string' || !item.alt.trim() || item.alt.length > 1000) invalid('Add a description for every image or video, up to 1,000 characters.', { media: 'A media description is required.' })
    return { type: item.type, path: item.path, alt: item.alt.trim() }
  })
}

function validatePost(post, { stored = false } = {}) {
  if (!record(post) || Object.keys(post).some(key => !POST_FIELDS.has(key))) invalid('The post contains unsupported fields.')
  const slug = slugValue(post.slug)
  const fields = {}
  for (const [field, limit] of [['title', 200], ['excerpt', 1200], ['category', 80]]) {
    if (typeof post[field] !== 'string' || !post[field].trim() || post[field].length > limit) fields[field] = `Enter between 1 and ${limit} characters.`
  }
  if (!['journey', 'advice'].includes(post.kind)) fields.kind = 'Choose Journal or Training.'
  if (!validDate(post.date)) fields.date = 'Choose a valid date.'
  if (typeof post.markdown !== 'string' || !post.markdown.trim() || Buffer.byteLength(post.markdown) > BODY_LIMIT) fields.markdown = 'Enter a body up to 2 MiB.'
  if (post.sequence !== undefined && (!Number.isSafeInteger(post.sequence) || post.sequence < 1)) fields.sequence = 'The sequence must be a positive integer.'
  if (post.sample !== undefined && typeof post.sample !== 'boolean') fields.sample = 'Invalid sample flag.'
  if (post.contentFile !== undefined && post.contentFile !== `${slug}.md`) fields.contentFile = 'The body filename must match the slug.'
  if (stored && (!Number.isSafeInteger(post.readTime) || post.readTime < 1 || post.contentFile !== `${slug}.md`)) fields.readTime = 'Invalid stored post metadata.'
  if (Object.keys(fields).length) invalid('Check the highlighted post fields.', fields)
  return {
    slug, title: post.title.trim(), excerpt: post.excerpt.trim(), kind: post.kind,
    category: post.category.trim(), date: post.date, markdown: post.markdown,
    media: validateMedia(post.media),
    ...(post.sequence !== undefined ? { sequence: post.sequence } : {}),
    ...(post.sample !== undefined ? { sample: post.sample } : {}),
  }
}
function decodePair(pair, slug) {
  try {
    const metadata = JSON.parse(decode(pair.metadata))
    if (!record(metadata) || Object.hasOwn(metadata, 'markdown') || metadata.slug !== slug) throw new Error('Invalid metadata.')
    const post = { ...metadata, markdown: decode(pair.markdown) }
    validatePost(post, { stored: true })
    return { post, revision: pair.revision }
  } catch (error) {
    if (error instanceof StudioError) throw error
    throw new StudioError(422, 'This post has invalid metadata or text. Its files have been preserved.')
  }
}

function acquireLock(workspace) {
  const path = within(workspace, '.studio', 'lock.json')
  const bytes = json({ pid: process.pid, nonce: randomUUID() })
  const existing = nullableFile(path)
  if (existing) {
    let lock
    try { lock = JSON.parse(decode(existing)) } catch { conflict('The local library lock is invalid. No files were changed.') }
    if (!Number.isSafeInteger(lock.pid) || lock.pid <= 0 || typeof lock.nonce !== 'string') conflict('The local library lock is invalid. No files were changed.')
    let alive = true
    try { process.kill(lock.pid, 0) } catch (error) { if (error.code === 'ESRCH') alive = false }
    if (alive) conflict('The content library is busy in another process. Try again shortly.')
    if (!equal(nullableFile(path), existing)) conflict('The local library lock changed. Try again shortly.')
    unlinkSync(path)
    syncDirectory(dirname(path))
  }
  try { durableFile(path, bytes) } catch (error) {
    if (error.code === 'EEXIST') conflict('The content library is busy in another process. Try again shortly.')
    throw error
  }
  return () => {
    if (equal(nullableFile(path), bytes)) { unlinkSync(path); syncDirectory(dirname(path)) }
  }
}

function exclusiveCopy(sourceBytes, destination, transaction, part) {
  const temporary = within(transaction, `apply-${part}-${randomUUID()}`)
  durableFile(temporary, sourceBytes)
  try {
    assertSafePath(destination)
    // A hard link creates the complete staged file only if the target is absent.
    // It cannot overwrite a file created by an external editor during recovery.
    linkSync(temporary, destination)
    syncDirectory(dirname(destination))
  } catch (error) {
    if (error.code === 'EEXIST') conflict('A file changed while saving. The external edit and recovery files were preserved.')
    throw error
  } finally {
    assertSafePath(temporary)
    if (existsSync(temporary)) unlinkSync(temporary)
  }
}

function applyTransaction(workspace, directory) {
  const descriptorBytes = nullableFile(within(directory, 'transaction.json'))
  if (!descriptorBytes || existsSync(within(directory, 'done.json'))) return
  let descriptor
  try { descriptor = JSON.parse(decode(descriptorBytes)) } catch { conflict('A saved transaction has invalid recovery metadata. No files were overwritten.') }
  if (!record(descriptor) || descriptor.schemaVersion !== 1 || !HASH.test(descriptor.afterRevision)
    || (descriptor.beforeRevision !== null && !HASH.test(descriptor.beforeRevision))) conflict('A saved transaction has invalid recovery metadata. No files were overwritten.')
  const slug = slugValue(descriptor.slug)
  const after = { metadata: readSafeFile(within(directory, 'after.json')), markdown: readSafeFile(within(directory, 'after.md')) }
  if (revisionOf(after.metadata, after.markdown) !== descriptor.afterRevision) conflict('A staged save changed. No files were overwritten.')
  const before = descriptor.beforeRevision === null ? { metadata: null, markdown: null } : {
    metadata: readSafeFile(within(directory, 'before.json')), markdown: readSafeFile(within(directory, 'before.md')),
  }
  if (descriptor.beforeRevision !== null && revisionOf(before.metadata, before.markdown) !== descriptor.beforeRevision) conflict('A prior saved version changed. No files were overwritten.')
  const paths = postPaths(workspace, slug)
  const displaced = { metadata: [], markdown: [] }
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const match = /^displaced-(metadata|markdown)-[a-f0-9-]+$/.exec(entry.name)
    if (match) displaced[match[1]].push(readSafeFile(within(directory, entry.name)))
  }
  const state = {}
  for (const part of ['metadata', 'markdown']) {
    state[part] = nullableFile(paths[part])
    const unexpected = displaced[part].find(bytes => !equal(bytes, before[part]) && !equal(bytes, after[part]))
    if (unexpected) {
      if (state[part] === null) exclusiveCopy(unexpected, paths[part], directory, part)
      conflict('An external edit was found during recovery. It has been preserved; resolve the pending local save before continuing.')
    }
    const moved = state[part] === null && before[part] !== null && displaced[part].length > 0
    if (!equal(state[part], before[part]) && !equal(state[part], after[part]) && !moved) conflict('An external edit conflicts with an interrupted save. No files were overwritten.')
  }
  // Both parts are checked before either part changes. Every displaced version
  // remains in this external transaction directory until recovery completes.
  for (const part of ['metadata', 'markdown']) {
    if (!equal(nullableFile(paths[part]), state[part])) conflict('A file changed while saving. No external edit was overwritten.')
    if (equal(state[part], after[part])) continue
    if (state[part] !== null) {
      const movedPath = within(directory, `displaced-${part}-${randomUUID()}`)
      renameSync(paths[part], movedPath)
      syncDirectory(dirname(paths[part]))
      syncDirectory(directory)
      const movedBytes = readSafeFile(movedPath)
      if (!equal(movedBytes, state[part])) {
        if (!existsSync(paths[part])) exclusiveCopy(movedBytes, paths[part], directory, part)
        conflict('A file changed while saving. The external edit was preserved.')
      }
    }
    exclusiveCopy(after[part], paths[part], directory, part)
  }
  if (!equal(nullableFile(paths.metadata), after.metadata) || !equal(nullableFile(paths.markdown), after.markdown)) conflict('A file changed before the save completed. Recovery files were preserved.')
  durableFile(within(directory, 'done.json'), json({ schemaVersion: 1, revision: descriptor.afterRevision }))
}

function withLibrary(requested, operation) {
  const workspace = workspacePath(requested)
  ensureDirectory(within(workspace, 'posts'))
  ensureDirectory(within(workspace, '.studio', 'transactions'))
  const release = acquireLock(workspace)
  try {
    for (const entry of readdirSync(within(workspace, '.studio', 'transactions'), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (!entry.isDirectory() || !/^[a-f0-9-]{36}$/.test(entry.name)) conflict('An unexpected recovery file was found. No files were overwritten.')
      applyTransaction(workspace, within(workspace, '.studio', 'transactions', entry.name))
    }
    return operation(workspace)
  } catch (error) {
    if (!(error instanceof StudioError) && (/^(Symbolic links are not allowed:|Expected a regular file:|Required path is missing:)/.test(error.message)
      || ['EISDIR', 'ENOTDIR', 'ELOOP'].includes(error.code))) {
      throw new StudioError(409, 'The local library contains an unsafe or changed file. Its authored files were preserved.')
    }
    throw error
  } finally { release() }
}
function storedPosts(workspace) {
  const directory = within(workspace, 'posts')
  const entries = readdirSync(directory, { withFileTypes: true })
  if (entries.some(entry => !entry.isFile() || !/^[a-z0-9]+(?:-[a-z0-9]+)*\.(json|md)$/.test(entry.name))) conflict('The posts directory contains an unexpected file. No files were changed.')
  const metadata = entries.filter(entry => entry.name.endsWith('.json')).map(entry => entry.name.slice(0, -5))
  if (entries.some(entry => entry.name.endsWith('.md') && !metadata.includes(entry.name.slice(0, -3)))) conflict('A Markdown body has no matching metadata file. Its writing was preserved.')
  return metadata.map(slug => ({ slug, ...decodePair(readPair(workspace, slug), slug) }))
}

export function listLibrary({ workspace } = {}) {
  return withLibrary(workspace, resolved => ({ workspace: resolved, posts: storedPosts(resolved).map(({ post, revision }) => ({
    slug: post.slug, title: post.title, kind: post.kind, date: post.date, category: post.category,
    excerpt: post.excerpt, readTime: post.readTime, ...(post.sequence !== undefined ? { sequence: post.sequence } : {}),
    revision, mediaCount: post.media.length,
  })).sort((a, b) => b.date.localeCompare(a.date) || (b.sequence ?? 0) - (a.sequence ?? 0) || a.slug.localeCompare(b.slug)) }))
}

export function readPost({ workspace, slug } = {}) {
  slugValue(slug)
  return withLibrary(workspace, resolved => {
    const pair = readPair(resolved, slug)
    if (!pair) throw new StudioError(404, 'This post was not found in the local content workspace.')
    return decodePair(pair, slug)
  })
}

export function savePost({ workspace, post, expectedRevision } = {}) {
  const normalized = validatePost(post)
  if (expectedRevision !== null && (typeof expectedRevision !== 'string' || !HASH.test(expectedRevision))) invalid('Supply the saved revision, or null for a new post.', { expectedRevision: 'A revision is required.' })
  return withLibrary(workspace, resolved => {
    const current = readPair(resolved, normalized.slug)
    if ((current?.revision ?? null) !== expectedRevision) conflict()
    const previous = current ? decodePair(current, normalized.slug).post : null
    for (const item of normalized.media) inspectMedia(resolved, item.path.slice('/api/media/'.length))
    let sequence
    if (normalized.kind === 'journey') {
      sequence = previous?.kind === 'journey' && previous.sequence ? previous.sequence
        : Math.max(0, ...storedPosts(resolved).filter(({ post: saved }) => saved.kind === 'journey').map(({ post: saved }) => saved.sequence ?? 0)) + 1
      if (!Number.isSafeInteger(sequence)) conflict('The journal sequence has reached its supported limit.')
    }
    const words = normalized.markdown.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu)?.length ?? 0
    const { markdown, sequence: _sequence, ...metadata } = normalized
    metadata.readTime = Math.max(1, Math.ceil(words / 200))
    metadata.contentFile = `${normalized.slug}.md`
    metadata.sample = normalized.sample ?? previous?.sample ?? false
    if (sequence !== undefined) metadata.sequence = sequence
    const after = { metadata: json(metadata), markdown: Buffer.from(markdown) }
    const revision = revisionOf(after.metadata, after.markdown)
    if (revision === current?.revision) return decodePair(current, normalized.slug)
    if (current) {
      const history = within(resolved, '.studio', 'history', normalized.slug, current.revision)
      durableFile(within(history, 'post.json'), current.metadata)
      durableFile(within(history, 'post.md'), current.markdown)
    }
    const directory = within(resolved, '.studio', 'transactions', randomUUID())
    ensureDirectory(directory)
    syncDirectory(dirname(directory))
    if (current) {
      durableFile(within(directory, 'before.json'), current.metadata)
      durableFile(within(directory, 'before.md'), current.markdown)
    }
    durableFile(within(directory, 'after.json'), after.metadata)
    durableFile(within(directory, 'after.md'), after.markdown)
    durableFile(within(directory, 'transaction.json'), json({ schemaVersion: 1, slug: normalized.slug, beforeRevision: current?.revision ?? null, afterRevision: revision }))
    applyTransaction(resolved, directory)
    return decodePair(readPair(resolved, normalized.slug), normalized.slug)
  })
}

function readVint(bytes, offset) {
  if (offset >= bytes.length || bytes[offset] === 0) return null
  let length = 1
  let marker = 0x80
  while (!(bytes[offset] & marker)) { marker >>= 1; length++ }
  if (offset + length > bytes.length) return null
  let value = BigInt(bytes[offset] & (marker - 1))
  for (let index = 1; index < length; index++) value = (value << 8n) | BigInt(bytes[offset + index])
  return value <= BigInt(Number.MAX_SAFE_INTEGER) ? { length, value: Number(value) } : null
}
function detectMedia(bytes) {
  if (bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    && bytes.toString('ascii', 12, 16) === 'IHDR' && bytes.readUInt32BE(16) > 0 && bytes.readUInt32BE(20) > 0) return 'png'
  if (bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 && bytes[3] !== 0 && bytes[3] !== 255) return 'jpg'
  if (bytes.length >= 13 && ['GIF87a', 'GIF89a'].includes(bytes.toString('ascii', 0, 6)) && bytes.readUInt16LE(6) > 0 && bytes.readUInt16LE(8) > 0) return 'gif'
  if (bytes.length >= 20 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.readUInt32LE(4) + 8 === bytes.length
    && bytes.toString('ascii', 8, 12) === 'WEBP' && ['VP8 ', 'VP8L', 'VP8X'].includes(bytes.toString('ascii', 12, 16))) return 'webp'
  if (bytes.length >= 16 && bytes.toString('ascii', 4, 8) === 'ftyp') {
    const length = bytes.readUInt32BE(0)
    if (length >= 16 && length <= bytes.length && length % 4 === 0) {
      const brands = [bytes.toString('ascii', 8, 12)]
      for (let offset = 16; offset < length; offset += 4) brands.push(bytes.toString('ascii', offset, offset + 4))
      if (brands.some(brand => ['avif', 'avis'].includes(brand))) return 'avif'
      if (brands.some(brand => ['isom', 'iso2', 'iso3', 'iso4', 'iso5', 'iso6', 'mp41', 'mp42', 'avc1', 'M4V ', 'MSNV', 'dash', 'cmfc', 'cmfs'].includes(brand))) return 'mp4'
    }
  }
  if (bytes.length >= 9 && bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) {
    const header = readVint(bytes, 4)
    if (header && header.value <= 4096 && 4 + header.length + header.value <= bytes.length) {
      const end = 4 + header.length + header.value
      for (let offset = 4 + header.length; offset + 3 < end; offset++) {
        if (bytes[offset] === 0x42 && bytes[offset + 1] === 0x82) {
          const size = readVint(bytes, offset + 2)
          if (size?.value === 4 && offset + 2 + size.length + 4 <= end && bytes.toString('ascii', offset + 2 + size.length, offset + 2 + size.length + 4) === 'webm') return 'webm'
        }
      }
    }
  }
  invalid('Choose a WebP, JPEG, PNG, GIF, AVIF, MP4, or WebM file with a valid media signature.', { media: 'Unsupported or invalid media bytes.' })
}

function inspectMedia(workspace, file) {
  const matched = mediaFile(file)
  const path = within(workspace, 'media', file)
  if (!existsSync(path)) throw new StudioError(404, 'The local media file was not found.')
  const bytes = readSafeFile(path)
  if (sha256(bytes) !== matched[1]) throw new StudioError(409, 'A local media checksum differs from its filename. The file was preserved.')
  return { path, size: bytes.length, contentType: MIME[matched[2]] }
}

export function importMedia({ workspace, filename, bytes } = {}) {
  if (typeof filename !== 'string' || !filename.trim() || filename.length > 255 || /[\\/\x00-\x1f\x7f]/.test(filename)) invalid('Choose a media file with a valid filename.')
  if (!(bytes instanceof Uint8Array) && !(bytes instanceof ArrayBuffer)) invalid('The upload must contain binary media bytes.')
  if (bytes.byteLength > UPLOAD_LIMIT) throw new StudioError(413, 'Each media file must be 100 MiB or smaller.')
  bytes = Buffer.from(bytes)
  if (!bytes.length) invalid('The media file is empty.')
  if (bytes.length > UPLOAD_LIMIT) throw new StudioError(413, 'Each media file must be 100 MiB or smaller.')
  const extension = detectMedia(bytes)
  const type = ['mp4', 'webm'].includes(extension) ? 'video' : 'image'
  return withLibrary(workspace, resolved => {
    const file = `${sha256(bytes)}.${extension}`
    durableFile(within(resolved, 'media', file), bytes)
    return { media: { type, path: `/api/media/${file}`, alt: '' }, size: bytes.length }
  })
}

export function mediaInfo({ workspace, file } = {}) {
  mediaFile(file)
  return withLibrary(workspace, resolved => inspectMedia(resolved, file))
}
