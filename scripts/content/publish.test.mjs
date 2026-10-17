import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { backupContent, catalogMedia } from './backup.mjs'
import { buildContent } from './build.mjs'
import { hydrateLocalContent } from './local.mjs'
import { publishContent } from './publish.mjs'
import { BUCKETS, bucketForLane, loadCredentials, parseContentArgs, sha256, uploadImmutable, validateObjectKey } from './storage.mjs'

async function fixture(t, { extension = 'webp', type = 'image' } = {}) {
  const workspace = await mkdtemp(path.join(await realpath(os.tmpdir()), 'fitness-publish-test-'))
  t.after(() => rm(workspace, { recursive: true, force: true }))
  const mediaBytes = Buffer.from('synthetic test image')
  const mediaKey = `media/${sha256(mediaBytes)}.${extension}`
  const catalogBytes = Buffer.from(JSON.stringify({ schemaVersion: 1, updatedAt: '2026-10-17T00:00:00.000Z', posts: [{
    id: 1, title: 'Synthetic fixture', markdown: 'Test content only.', media: [{ type, path: `/api/${mediaKey}`, alt: 'Synthetic fixture' }],
  }] }))
  const hash = sha256(catalogBytes)
  const catalogKey = `releases/${hash}/catalog.json`
  const files = []
  for (const [key, bytes, contentType] of [[mediaKey, mediaBytes, `${type}/${extension}`], [catalogKey, catalogBytes, 'application/json']]) {
    const filename = path.join(workspace, key)
    await mkdir(path.dirname(filename), { recursive: true })
    await writeFile(filename, bytes)
    files.push({ key, path: filename, size: bytes.length, sha256: sha256(bytes), contentType })
  }
  const pointer = { schemaVersion: 1, catalogKey, sha256: hash, postCount: 1, publishedAt: '2026-10-17T00:00:00.000Z' }
  const release = { workspace, catalogKey, manifest: { schemaVersion: 1, catalogKey, postCount: 1, files }, pointer }
  return { workspace, release, mediaKey, catalogKey, mediaBytes, catalogBytes, build: async () => release }
}

function memoryStorage() {
  const objects = new Map()
  const events = []
  const missing = () => Object.assign(new Error('missing'), { name: 'NoSuchKey' })
  const precondition = () => Object.assign(new Error('changed'), { name: 'PreconditionFailed' })
  return {
    bucket: BUCKETS.dev, objects, events,
    async head(key) {
      events.push(`head:${key}`)
      const item = objects.get(key)
      return item ? { size: item.bytes.length, sha256: item.sha256, etag: item.etag } : null
    },
    async get(key) {
      events.push(`get:${key}`)
      const item = objects.get(key)
      if (!item) throw missing()
      return item.bytes
    },
    async put(key, bytes, options = {}) {
      events.push(`put:${key}`)
      const previous = objects.get(key)
      if ((options.immutable || options.ifNoneMatch) && previous) throw precondition()
      if (options.ifMatch && options.ifMatch !== previous?.etag) throw precondition()
      objects.set(key, { bytes: Buffer.from(bytes), sha256: sha256(bytes), etag: `"${sha256(bytes)}"`, options })
    },
    close() {},
  }
}

test('lane and CLI parsing never infer a production lane', () => {
  assert.equal(bucketForLane('dev'), BUCKETS.dev)
  assert.equal(bucketForLane('main'), BUCKETS.main)
  assert.throws(() => bucketForLane('production'), /dev or main/)
  assert.throws(() => parseContentArgs([]), /dev or main/)
  assert.throws(() => parseContentArgs(['dev', 'main']), /Unexpected argument/)
  assert.deepEqual(parseContentArgs(['dev', '--workspace', '/tmp/example']), { lane: 'dev', workspace: '/tmp/example' })
  assert.throws(() => parseContentArgs(['--workspace', '--oops']), /Unexpected argument/)
  assert.throws(() => parseContentArgs(['dev'], { laneRequired: false }), /Unexpected argument/)
})

test('credentials prefer complete environment and never expose a Keychain failure', () => {
  const credentials = { R2_ACCESS_KEY_ID: 'test-id', R2_SECRET_ACCESS_KEY: 'test-secret' }
  assert.deepEqual(loadCredentials(credentials, 'darwin', () => { throw new Error('unexpected') }), { accessKeyId: 'test-id', secretAccessKey: 'test-secret' })
  assert.throws(() => loadCredentials({ R2_ACCESS_KEY_ID: 'one' }, 'darwin'), /both/)
  let called
  assert.deepEqual(loadCredentials({}, 'darwin', (...args) => {
    called = args
    return JSON.stringify({ accessKeyId: 'keychain-id', secretAccessKey: 'keychain-secret' })
  }), { accessKeyId: 'keychain-id', secretAccessKey: 'keychain-secret' })
  assert.equal(called[0], '/usr/bin/security')
  assert.ok(called[1].includes('personal-fitness-content-r2'))
  assert.throws(() => loadCredentials({}, 'darwin', () => { throw new Error('private-secret-value') }), (error) => !error.message.includes('private-secret-value'))
})

test('publish exposes the pointer only after media and catalog verification, then records a local receipt', async (t) => {
  const f = await fixture(t)
  const storage = memoryStorage()
  const progress = []
  const receipt = await publishContent({ lane: 'dev', workspace: f.workspace, storage, build: f.build, onProgress: value => progress.push(value) })
  const writes = storage.events.filter((event) => event.startsWith('put:'))
  assert.deepEqual(writes, [`put:${f.mediaKey}`, `put:${f.catalogKey}`, 'put:current.json'])
  const pointerIndex = storage.events.indexOf('put:current.json')
  assert.ok(storage.events.lastIndexOf(`head:${f.mediaKey}`, pointerIndex) < pointerIndex)
  assert.ok(storage.events.lastIndexOf(`head:${f.catalogKey}`, pointerIndex) < pointerIndex)
  assert.equal(storage.objects.get(f.mediaKey).options.immutable, true)
  assert.equal(storage.objects.get('current.json').options.ifNoneMatch, true)
  assert.equal(storage.objects.get('current.json').options.cacheControl, 'no-cache, no-store, must-revalidate')
  assert.deepEqual(JSON.parse(await readFile(receipt.receiptPath, 'utf8')).pointer, f.release.pointer)
  assert.equal(receipt.uploadedMedia, 1)
  assert.deepEqual(progress, [
    { phase: 'upload', completed: 2, total: 2 },
    { phase: 'verify', completed: 2, total: 2 },
  ])
})

test('WebM video builds with the correct MIME type, publishes, and remains fully recoverable in backups', async (t) => {
  const f = await fixture(t, { extension: 'webm', type: 'video' })
  const metadata = {
    slug: 'synthetic-video', title: 'Synthetic video', excerpt: 'Synthetic summary.', kind: 'journey', category: 'Journal',
    date: '2026-10-17', readTime: 1, contentFile: 'synthetic-video.md',
    media: [{ type: 'video', path: `/api/${f.mediaKey}`, alt: 'Synthetic video' }],
  }
  await mkdir(path.join(f.workspace, 'posts'))
  const metadataPath = path.join(f.workspace, 'posts', 'synthetic-video.json')
  await writeFile(metadataPath, JSON.stringify(metadata))
  await writeFile(path.join(f.workspace, 'posts', metadata.contentFile), 'Synthetic fixture body.')
  const release = buildContent({ workspace: f.workspace, now: '2026-10-17T00:00:00Z' })
  assert.equal(release.manifest.files.find(file => file.key === f.mediaKey).contentType, 'video/webm')
  const storage = memoryStorage()
  await publishContent({ lane: 'dev', storage, build: async () => release })
  assert.equal(storage.objects.get(f.mediaKey).options.contentType, 'video/webm')
  const backup = await backupContent({ lane: 'dev', workspace: f.workspace, storage })
  assert.deepEqual(await readFile(path.join(backup.snapshot, f.mediaKey)), f.mediaBytes)
  metadata.media[0].type = 'image'
  await writeFile(metadataPath, JSON.stringify(metadata))
  assert.throws(() => buildContent({ workspace: f.workspace }), /Invalid post media/)
})

test('partial upload resumes without rewriting verified media', async (t) => {
  const f = await fixture(t)
  const storage = memoryStorage()
  const originalPut = storage.put.bind(storage)
  storage.put = async (key, bytes, options) => {
    if (key === f.catalogKey) throw new Error('synthetic network failure')
    return originalPut(key, bytes, options)
  }
  await assert.rejects(publishContent({ lane: 'dev', storage, build: f.build }), /synthetic network failure/)
  assert.equal(storage.objects.has('current.json'), false)
  storage.put = originalPut
  const receipt = await publishContent({ lane: 'dev', storage, build: f.build })
  assert.equal(receipt.existingMedia, 1)
  assert.equal(storage.events.filter((event) => event === `put:${f.mediaKey}`).length, 1)
})

test('an immutable media collision aborts before current.json is written', async (t) => {
  const f = await fixture(t)
  const storage = memoryStorage()
  storage.objects.set(f.mediaKey, { bytes: Buffer.from('unexpected'), sha256: '0'.repeat(64) })
  await assert.rejects(publishContent({ lane: 'dev', storage, build: f.build }), /Immutable object verification failed/)
  assert.equal(storage.objects.has('current.json'), false)
  assert.equal(storage.objects.has(f.catalogKey), false)
})

test('pointer compare-and-swap prevents a concurrent publisher from being overwritten', async (t) => {
  const f = await fixture(t)
  const storage = memoryStorage()
  await storage.put('current.json', Buffer.from('{}'))
  const initialEtag = storage.objects.get('current.json').etag
  const originalPut = storage.put.bind(storage)
  storage.put = async (key, bytes, options) => {
    if (key === f.catalogKey) storage.objects.get('current.json').etag = '"concurrent-release"'
    return originalPut(key, bytes, options)
  }
  await assert.rejects(publishContent({ lane: 'dev', storage, build: f.build }), /Another publisher/)
  assert.notEqual(storage.objects.get('current.json').etag, initialEtag)
  assert.equal(storage.objects.get('current.json').bytes.toString(), '{}')
})

test('a corrupted remote catalog prevents a success receipt', async (t) => {
  const f = await fixture(t)
  const storage = memoryStorage()
  const get = storage.get.bind(storage)
  storage.get = async (key) => key === f.catalogKey ? Buffer.from('{}') : get(key)
  await assert.rejects(publishContent({ lane: 'dev', storage, build: f.build }), /Remote catalog checksum/)
  await assert.rejects(readdir(path.join(f.workspace, 'receipts')), { code: 'ENOENT' })
})

test('backup keeps authored files and prior snapshots, and verifies every downloaded checksum', async (t) => {
  const f = await fixture(t)
  const storage = memoryStorage()
  await publishContent({ lane: 'dev', storage, build: f.build })
  const authored = path.join(f.workspace, 'journal', 'edited.md')
  await mkdir(path.dirname(authored), { recursive: true })
  await writeFile(authored, 'An unpublished local edit.')
  const backup = await backupContent({ lane: 'dev', workspace: f.workspace, storage })
  assert.deepEqual(await readFile(path.join(backup.snapshot, f.mediaKey)), f.mediaBytes)
  assert.deepEqual(await readFile(path.join(backup.snapshot, f.catalogKey)), f.catalogBytes)
  assert.equal(await readFile(authored, 'utf8'), 'An unpublished local edit.')
  const second = await backupContent({ lane: 'dev', workspace: f.workspace, storage })
  assert.equal(second.snapshot, backup.snapshot)
  assert.equal(backup.mediaCount, 1)
  assert.equal(backup.postCount, 1)
})

test('backup stops on corrupt media without a completion pointer', async (t) => {
  const f = await fixture(t)
  const storage = memoryStorage()
  await publishContent({ lane: 'dev', storage, build: f.build })
  const get = storage.get.bind(storage)
  storage.get = async (key) => key === f.mediaKey ? Buffer.from('corrupted media') : get(key)
  await assert.rejects(backupContent({ lane: 'dev', workspace: f.workspace, storage }), /Backup media verification failed/)
  const [snapshotName] = await readdir(path.join(f.workspace, 'backups', 'dev'))
  await assert.rejects(readFile(path.join(f.workspace, 'backups', 'dev', snapshotName, 'current.json')), { code: 'ENOENT' })
})

test('unsafe media paths and object keys cannot escape a backup snapshot', () => {
  for (const key of ['../x', '/media/x', 'media/../x', 'media\\x', 'media//x', 'media/x?token=secret']) {
    assert.throws(() => validateObjectKey(key), /Invalid content object key/)
  }
  assert.throws(() => catalogMedia({ schemaVersion: 1, posts: [{ media: [{ path: '/api/media/../../outside' }] }] }, 1), /invalid media path/)
  assert.throws(() => catalogMedia({ schemaVersion: 1, posts: [] }, 1), /invalid entry count/)
})

test('local hydration uses one local proxy with remote bindings disabled and current.json last', async (t) => {
  const f = await fixture(t)
  const writes = []
  let options
  let disposed = false
  const result = await hydrateLocalContent({
    build: f.build,
    createProxy: async (value) => {
      options = value
      return { env: { CONTENT: {
        head: async () => null,
        put: async (key) => { writes.push(key) },
      } }, dispose: async () => { disposed = true } }
    },
  })
  assert.equal(options.remoteBindings, false)
  assert.deepEqual(options.envFiles, [])
  assert.ok(options.persist.path.endsWith(path.join('.wrangler', 'state', 'v3')))
  assert.equal(writes.at(-1), 'current.json')
  assert.equal(result.postCount, 1)
  assert.equal(disposed, true)
})

test('concurrent immutable upload collisions can only reuse matching objects', async () => {
  const bytes = Buffer.from('synthetic object')
  const file = { key: `media/${sha256(bytes)}.webp`, size: bytes.length, sha256: sha256(bytes), contentType: 'image/webp' }
  let calls = 0
  const storage = {
    head: async () => ++calls === 1 ? null : { size: bytes.length, sha256: sha256(bytes) },
    put: async () => { throw Object.assign(new Error('concurrent'), { name: 'PreconditionFailed' }) },
  }
  assert.equal(await uploadImmutable(storage, file, bytes), 'uploaded')
})
