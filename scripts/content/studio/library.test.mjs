import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync,
  renameSync, rmSync, symlinkSync, writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { buildContent } from '../build.mjs'
import { sha256 } from '../workspace.mjs'
import { importMedia, listLibrary, mediaInfo, readPost, savePost, StudioError } from './library.mjs'

function fixture(t) {
  const root = mkdtempSync(join(realpathSync(tmpdir()), 'fitness-studio-library-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  return { root, workspace: join(root, 'content') }
}
const post = (extra = {}) => ({
  slug: 'synthetic-entry', title: 'Synthetic entry', excerpt: 'Synthetic excerpt.', kind: 'journey',
  category: 'Journal', date: '2026-10-17', markdown: 'A synthetic body.\n\nA second paragraph.\n', media: [], ...extra,
})
const errorStatus = status => error => error instanceof StudioError && error.status === status
function pendingTransaction(workspace, revision) {
  const root = join(workspace, '.studio', 'transactions')
  for (const name of readdirSync(root)) {
    const directory = join(root, name)
    const descriptor = JSON.parse(readFileSync(join(directory, 'transaction.json'), 'utf8'))
    if (descriptor.afterRevision === revision) {
      rmSync(join(directory, 'done.json'))
      return directory
    }
  }
  throw new Error('Synthetic transaction was not found.')
}
function png() {
  const bytes = Buffer.alloc(33)
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(bytes)
  bytes.writeUInt32BE(13, 8)
  bytes.write('IHDR', 12)
  bytes.writeUInt32BE(1, 16)
  bytes.writeUInt32BE(1, 20)
  return bytes
}
function ftyp(brand, compatible = brand) {
  const bytes = Buffer.alloc(24)
  bytes.writeUInt32BE(24, 0)
  bytes.write('ftyp', 4)
  bytes.write(brand, 8)
  bytes.write(compatible, 16)
  bytes.write('isom', 20)
  return bytes
}
function signatures() {
  const webp = Buffer.alloc(20)
  webp.write('RIFF', 0)
  webp.writeUInt32LE(12, 4)
  webp.write('WEBP', 8)
  webp.write('VP8 ', 12)
  return [
    ['png', png(), 'image', 'image/png'],
    ['jpg', Buffer.from([255, 216, 255, 224, 0, 16, 74, 70, 73, 70]), 'image', 'image/jpeg'],
    ['gif', Buffer.from([71, 73, 70, 56, 57, 97, 1, 0, 1, 0, 0, 0, 0]), 'image', 'image/gif'],
    ['webp', webp, 'image', 'image/webp'],
    ['avif', ftyp('avif'), 'image', 'image/avif'],
    ['mp4', ftyp('isom', 'mp42'), 'video', 'video/mp4'],
    ['webm', Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x87, 0x42, 0x82, 0x84, 119, 101, 98, 109]), 'video', 'video/webm'],
  ]
}

test('a new library is empty; saved posts use compatible metadata, computed reading time, and stable revisions', t => {
  const { workspace } = fixture(t)
  assert.deepEqual(listLibrary({ workspace }), { workspace, posts: [] })
  const saved = savePost({ workspace, post: post({ markdown: `${'word '.repeat(201)}\n` }), expectedRevision: null })
  assert.match(saved.revision, /^[a-f0-9]{64}$/)
  assert.equal(saved.post.readTime, 2)
  assert.equal(saved.post.contentFile, 'synthetic-entry.md')
  assert.equal(saved.post.sequence, 1)
  assert.equal(saved.post.sample, false)
  assert.deepEqual(readPost({ workspace, slug: saved.post.slug }), saved)
  assert.equal(listLibrary({ workspace }).posts[0].revision, saved.revision)
  assert.equal(listLibrary({ workspace }).posts[0].mediaCount, 0)
  const release = buildContent({ workspace })
  assert.equal(release.pointer.postCount, 1)
  const catalog = JSON.parse(readFileSync(join(workspace, release.catalogKey)))
  assert.equal(catalog.posts[0].markdown, saved.post.markdown)
})

test('optimistic revisions protect local edits and prior versions retain the exact file pair', t => {
  const { workspace } = fixture(t)
  const first = savePost({ workspace, post: post(), expectedRevision: null })
  const beforeMetadata = readFileSync(join(workspace, 'posts', 'synthetic-entry.json'))
  const beforeBody = readFileSync(join(workspace, 'posts', 'synthetic-entry.md'))
  const second = savePost({ workspace, post: { ...first.post, markdown: 'A revised synthetic body.' }, expectedRevision: first.revision })
  assert.notEqual(second.revision, first.revision)
  assert.deepEqual(readFileSync(join(workspace, '.studio', 'history', first.post.slug, first.revision, 'post.json')), beforeMetadata)
  assert.deepEqual(readFileSync(join(workspace, '.studio', 'history', first.post.slug, first.revision, 'post.md')), beforeBody)
  assert.throws(() => savePost({ workspace, post: first.post, expectedRevision: first.revision }), errorStatus(409))
  assert.equal(readPost({ workspace, slug: first.post.slug }).post.markdown, second.post.markdown)
  const unchanged = savePost({ workspace, post: second.post, expectedRevision: second.revision })
  assert.equal(unchanged.revision, second.revision)
  assert.throws(() => savePost({ workspace, post: { ...second.post, slug: 'renamed-entry', contentFile: 'renamed-entry.md' }, expectedRevision: second.revision }), errorStatus(409))
  assert.equal(existsSync(join(workspace, 'posts', 'renamed-entry.json')), false)
})

test('a direct external edit changes the revision and remains untouched after an editor conflict', t => {
  const { workspace } = fixture(t)
  const saved = savePost({ workspace, post: post(), expectedRevision: null })
  const path = join(workspace, 'posts', `${saved.post.slug}.md`)
  writeFileSync(path, 'An unpublished external edit.\n')
  assert.throws(() => savePost({ workspace, post: saved.post, expectedRevision: saved.revision }), errorStatus(409))
  const current = readPost({ workspace, slug: saved.post.slug })
  assert.equal(current.post.markdown, 'An unpublished external edit.\n')
  assert.notEqual(current.revision, saved.revision)
})

test('new posts require null revisions, existing posts require exact revisions, and missing posts return 404', t => {
  const { workspace } = fixture(t)
  assert.throws(() => savePost({ workspace, post: post() }), errorStatus(400))
  assert.throws(() => savePost({ workspace, post: post(), expectedRevision: '' }), errorStatus(400))
  const saved = savePost({ workspace, post: post(), expectedRevision: null })
  assert.throws(() => savePost({ workspace, post: post(), expectedRevision: null }), errorStatus(409))
  assert.throws(() => readPost({ workspace, slug: 'missing-entry' }), errorStatus(404))
  assert.deepEqual(readPost({ workspace, slug: saved.post.slug }), saved)
})

test('journal sequences advance automatically while training articles omit sequence', t => {
  const { workspace } = fixture(t)
  const first = savePost({ workspace, post: post({ sequence: 99 }), expectedRevision: null })
  assert.equal(first.post.sequence, 1)
  const training = savePost({ workspace, post: post({ slug: 'training-fixture', kind: 'advice', sequence: 99 }), expectedRevision: null })
  assert.equal(training.post.sequence, undefined)
  const second = savePost({ workspace, post: post({ slug: 'second-entry' }), expectedRevision: null })
  assert.equal(second.post.sequence, 2)
  const edited = savePost({ workspace, post: { ...first.post, title: 'Revised title', sequence: 200 }, expectedRevision: first.revision })
  assert.equal(edited.post.sequence, 1)
  assert.deepEqual(listLibrary({ workspace }).posts.filter(item => item.kind === 'journey').map(item => item.sequence), [2, 1])
})

test('field limits, real dates, stable slugs, media descriptions, and UTF-8 body limits fail before saving', t => {
  const { workspace } = fixture(t)
  for (const bad of [
    { title: 'x'.repeat(201) }, { excerpt: 'x'.repeat(1201) }, { category: 'x'.repeat(81) },
    { date: '2025-02-29' }, { date: '2026-02-30' }, { markdown: '  ' },
    { markdown: '😀'.repeat(524289) }, { slug: '../escape' }, { slug: 'Uppercase' },
    { contentFile: '../escape.md' }, { surprise: 'unknown' },
  ]) assert.throws(() => savePost({ workspace, post: post(bad), expectedRevision: null }), errorStatus(400))
  assert.deepEqual(listLibrary({ workspace }).posts, [])
  const imported = importMedia({ workspace, filename: 'fixture.png', bytes: png() })
  assert.throws(() => savePost({ workspace, post: post({ media: [imported.media] }), expectedRevision: null }), errorStatus(400))
  const missing = { ...imported.media, path: `/api/media/${'0'.repeat(64)}.png`, alt: 'Synthetic image' }
  assert.throws(() => savePost({ workspace, post: post({ media: [missing] }), expectedRevision: null }), errorStatus(404))
})

test('all supported signatures determine type and extension independently of the original filename', t => {
  const { workspace } = fixture(t)
  for (const [extension, bytes, type, contentType] of signatures()) {
    const result = importMedia({ workspace, filename: 'misleading-name.txt', bytes })
    assert.deepEqual(result, { media: { type, path: `/api/media/${sha256(bytes)}.${extension}`, alt: '' }, size: bytes.length })
    assert.deepEqual(importMedia({ workspace, filename: 'different-file.bin', bytes }), result)
    const info = mediaInfo({ workspace, file: `${sha256(bytes)}.${extension}` })
    assert.equal(info.contentType, contentType)
    assert.equal(info.size, bytes.length)
    assert.deepEqual(readFileSync(info.path), bytes)
    const saved = savePost({ workspace, post: post({ slug: `fixture-${extension}`, media: [{ ...result.media, alt: 'Synthetic media description' }] }), expectedRevision: null })
    assert.equal(saved.post.media[0].path, result.media.path)
  }
})

test('unsupported, disguised, oversized, and traversal uploads cannot create media objects', t => {
  const { workspace } = fixture(t)
  for (const bytes of [Buffer.from('<script>bad()</script>'), Buffer.from('<svg></svg>'), Buffer.from('GIF89a'), Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x87, 109, 97, 116, 114, 111, 115, 107])]) {
    assert.throws(() => importMedia({ workspace, filename: 'photo.png', bytes }), errorStatus(400))
  }
  assert.throws(() => importMedia({ workspace, filename: '../photo.png', bytes: png() }), errorStatus(400))
  assert.throws(() => importMedia({ workspace, filename: 'photo.png', bytes: 'not binary' }), errorStatus(400))
  assert.throws(() => importMedia({ workspace, filename: 'empty.png', bytes: Buffer.alloc(0) }), errorStatus(400))
  assert.throws(() => importMedia({ workspace, filename: 'too-large.png', bytes: Buffer.alloc(100 * 1024 * 1024 + 1) }), errorStatus(413))
  assert.equal(existsSync(join(workspace, 'media')), false)
})

test('media content hashes, traversal checks, regular-file checks, and symbolic-link checks fail closed', t => {
  const { root, workspace } = fixture(t)
  const bytes = png()
  const imported = importMedia({ workspace, filename: 'photo.png', bytes })
  const file = imported.media.path.split('/').at(-1)
  const path = join(workspace, 'media', file)
  assert.throws(() => mediaInfo({ workspace, file: '../photo.png' }), errorStatus(400))
  writeFileSync(path, 'An external change.')
  assert.throws(() => mediaInfo({ workspace, file }), errorStatus(409))
  assert.throws(() => importMedia({ workspace, filename: 'photo.png', bytes }), errorStatus(409))
  assert.equal(readFileSync(path, 'utf8'), 'An external change.')
  rmSync(path)
  const outside = join(root, 'outside.png')
  writeFileSync(outside, bytes)
  symlinkSync(outside, path)
  assert.throws(() => mediaInfo({ workspace, file }), errorStatus(409))
  rmSync(path)
  mkdirSync(path)
  assert.throws(() => mediaInfo({ workspace, file }), errorStatus(409))
})

test('a mixed old/new pair from an interrupted save recovers to the complete intended version', t => {
  const { workspace } = fixture(t)
  const first = savePost({ workspace, post: post(), expectedRevision: null })
  const second = savePost({ workspace, post: { ...first.post, title: 'Revised synthetic title', markdown: 'The complete revised body.' }, expectedRevision: first.revision })
  const directory = pendingTransaction(workspace, second.revision)
  writeFileSync(join(workspace, 'posts', `${first.post.slug}.md`), readFileSync(join(directory, 'before.md')))
  assert.deepEqual(readPost({ workspace, slug: first.post.slug }), second)
  assert.equal(existsSync(join(directory, 'done.json')), true)
})

test('an interrupted first save completes its missing body without discarding the saved metadata', t => {
  const { workspace } = fixture(t)
  const saved = savePost({ workspace, post: post(), expectedRevision: null })
  const directory = pendingTransaction(workspace, saved.revision)
  rmSync(join(workspace, 'posts', `${saved.post.slug}.md`))
  assert.deepEqual(readPost({ workspace, slug: saved.post.slug }), saved)
  assert.equal(existsSync(join(directory, 'done.json')), true)
})

test('changed recovery payloads cannot replace the current authored files', t => {
  const { workspace } = fixture(t)
  const first = savePost({ workspace, post: post(), expectedRevision: null })
  const second = savePost({ workspace, post: { ...first.post, markdown: 'The committed second body.' }, expectedRevision: first.revision })
  const directory = pendingTransaction(workspace, second.revision)
  writeFileSync(join(directory, 'after.md'), 'An unexpected staged edit.')
  assert.throws(() => readPost({ workspace, slug: first.post.slug }), errorStatus(409))
  assert.equal(readFileSync(join(workspace, 'posts', `${first.post.slug}.md`), 'utf8'), second.post.markdown)
})

test('recovery finishes a crash between displacing a file and installing its complete replacement', t => {
  const { workspace } = fixture(t)
  const first = savePost({ workspace, post: post(), expectedRevision: null })
  const second = savePost({ workspace, post: { ...first.post, markdown: 'Revised recovery fixture.' }, expectedRevision: first.revision })
  const directory = pendingTransaction(workspace, second.revision)
  renameSync(join(workspace, 'posts', `${first.post.slug}.md`), join(directory, `displaced-markdown-${randomUUID()}`))
  assert.deepEqual(readPost({ workspace, slug: first.post.slug }), second)
})

test('recovery never overwrites an unexpected external edit in an interrupted save', t => {
  const { workspace } = fixture(t)
  const first = savePost({ workspace, post: post(), expectedRevision: null })
  const second = savePost({ workspace, post: { ...first.post, markdown: 'An intended revised body.' }, expectedRevision: first.revision })
  const directory = pendingTransaction(workspace, second.revision)
  const path = join(workspace, 'posts', `${first.post.slug}.md`)
  writeFileSync(path, 'An unexpected external revision must survive.')
  assert.throws(() => readPost({ workspace, slug: first.post.slug }), errorStatus(409))
  assert.equal(readFileSync(path, 'utf8'), 'An unexpected external revision must survive.')
  assert.equal(existsSync(join(directory, 'done.json')), false)
  assert.deepEqual(readFileSync(join(directory, 'before.md')), Buffer.from(first.post.markdown))
  assert.deepEqual(readFileSync(join(directory, 'after.md')), Buffer.from(second.post.markdown))
})

test('recovery restores a displaced unexpected external edit if its original path is absent', t => {
  const { workspace } = fixture(t)
  const first = savePost({ workspace, post: post(), expectedRevision: null })
  const second = savePost({ workspace, post: { ...first.post, markdown: 'Revised transaction body.' }, expectedRevision: first.revision })
  const directory = pendingTransaction(workspace, second.revision)
  const path = join(workspace, 'posts', `${first.post.slug}.md`)
  rmSync(path)
  writeFileSync(join(directory, `displaced-markdown-${randomUUID()}`), 'A displaced external edit.')
  assert.throws(() => listLibrary({ workspace }), errorStatus(409))
  assert.equal(readFileSync(path, 'utf8'), 'A displaced external edit.')
})

test('incomplete staging is harmless, dead process locks recover, and live process locks serialize operations', t => {
  const { workspace } = fixture(t)
  const saved = savePost({ workspace, post: post(), expectedRevision: null })
  const orphan = join(workspace, '.studio', 'transactions', randomUUID())
  mkdirSync(orphan)
  writeFileSync(join(orphan, 'after.md'), 'Incomplete synthetic staging.')
  const lock = join(workspace, '.studio', 'lock.json')
  writeFileSync(lock, JSON.stringify({ pid: 2147483647, nonce: 'dead-fixture' }))
  assert.deepEqual(readPost({ workspace, slug: saved.post.slug }), saved)
  assert.equal(existsSync(lock), false)
  writeFileSync(lock, JSON.stringify({ pid: process.pid, nonce: 'live-fixture' }))
  assert.throws(() => readPost({ workspace, slug: saved.post.slug }), errorStatus(409))
  assert.equal(existsSync(lock), true)
})

test('content workspaces cannot be in Git or traverse a symbolic-link directory', t => {
  const { root, workspace } = fixture(t)
  const gitRoot = join(root, 'repo')
  mkdirSync(gitRoot)
  writeFileSync(join(gitRoot, '.git'), 'gitdir: synthetic')
  assert.throws(() => listLibrary({ workspace: join(gitRoot, 'content') }), errorStatus(400))
  mkdirSync(workspace)
  const alias = join(root, 'alias')
  symlinkSync(workspace, alias)
  assert.throws(() => listLibrary({ workspace: alias }), errorStatus(400))
  assert.equal(existsSync(join(gitRoot, 'content')), false)
})
