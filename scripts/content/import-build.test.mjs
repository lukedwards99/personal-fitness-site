import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { importBde } from './import-bde.mjs'
import { buildContent } from './build.mjs'
import { resolveWorkspace, sha256 } from './workspace.mjs'

const temporary = []
afterEach(() => { for (const path of temporary.splice(0)) rmSync(path, { recursive: true, force: true }) })
const fixture = () => {
  const root = mkdtempSync(join(realpathSync(tmpdir()), 'fitness-content-test-'))
  temporary.push(root)
  const source = join(root, 'source')
  const workspace = join(root, 'content')
  const posts = join(source, 'blogs/lukes-journey/posts')
  mkdirSync(posts, { recursive: true })
  writeFileSync(join(source, 'blogs/lukes-journey/blog.json'), JSON.stringify({ title: 'Synthetic journal', description: 'Test fixture', trainer: { id: 'fixture', name: 'Fixture' } }))
  const image = Buffer.from('synthetic image bytes')
  const path = 'blog-media/lukes-journey/journey-001/0123456789abcdef.webp'
  mkdirSync(join(source, 'public/blog-media/lukes-journey/journey-001'), { recursive: true })
  writeFileSync(join(source, 'public', path), image)
  const bodies = ['A synthetic caption with \\*literal stars\\*.\n\nSecond paragraph.\n', 'A different synthetic caption.\n']
  for (const [index, body] of bodies.entries()) {
    const slug = `journey-00${index + 1}`
    writeFileSync(join(posts, `${slug}.md`), body)
    writeFileSync(join(posts, `${slug}.json`), JSON.stringify({ title: `Synthetic entry ${index + 1}`, summary: 'Synthetic summary.', publishedDate: '2024-02-29', contentFile: `${slug}.md`, media: [{ type: 'image', path, alt: 'Synthetic image' }, ...(index === 0 ? [{ type: 'image', path, alt: 'Repeated reference retained' }] : [])] }))
  }
  return { root, source, workspace, posts, image, bodies, path }
}

test('import preserves full Markdown, source files, ordered duplicates, and idempotent content hashes', () => {
  const f = fixture()
  const result = importBde(f)
  assert.equal(result.postCount, 2)
  assert.equal(result.mediaCount, 1)
  assert.equal(result.mediaReferences, 3)
  assert.equal(readFileSync(join(f.workspace, 'posts/journey-001.md'), 'utf8'), f.bodies[0])
  assert.deepEqual(readFileSync(join(f.workspace, 'source/bde-web/blogs/lukes-journey/posts/journey-001.json')), readFileSync(join(f.posts, 'journey-001.json')))
  const post = JSON.parse(readFileSync(join(f.workspace, 'posts/journey-001.json'), 'utf8'))
  assert.equal(post.sequence, 1)
  assert.equal(post.sample, false)
  assert.equal(post.media.length, 2)
  assert.equal(post.media[0].path, `/api/media/${sha256(f.image)}.webp`)
  assert.equal(post.media[1].alt, 'Repeated reference retained')
  assert.equal(importBde(f).mediaCount, 1)
})

test('import collision preflight leaves other destinations unwritten', () => {
  const f = fixture()
  mkdirSync(join(f.workspace, 'posts'), { recursive: true })
  writeFileSync(join(f.workspace, 'posts/journey-002.md'), 'Existing authoring must survive.')
  assert.throws(() => importBde(f), /collision/)
  assert.equal(existsSync(join(f.workspace, 'posts/journey-001.json')), false)
  assert.equal(existsSync(join(f.workspace, 'source')), false)
  assert.equal(readFileSync(join(f.workspace, 'posts/journey-002.md'), 'utf8'), 'Existing authoring must survive.')
})

test('unsafe source media and impossible source dates fail before writing', () => {
  const f = fixture()
  const path = join(f.posts, 'journey-001.json')
  const metadata = JSON.parse(readFileSync(path, 'utf8'))
  metadata.publishedDate = '2024-02-30'
  writeFileSync(path, JSON.stringify(metadata))
  assert.throws(() => importBde(f), /Invalid BDE metadata/)
  metadata.publishedDate = '2024-02-29'
  metadata.media[0].path = '../outside.webp'
  writeFileSync(path, JSON.stringify(metadata))
  assert.throws(() => importBde(f), /Invalid media/)
  assert.equal(existsSync(f.workspace), false)
})

test('build validates hashes, preserves Markdown, orders same-day entries, and reuses unchanged release', () => {
  const f = fixture()
  importBde(f)
  const result = buildContent({ workspace: f.workspace, now: '2026-10-17T12:00:00Z' })
  const catalog = JSON.parse(readFileSync(join(f.workspace, result.catalogKey), 'utf8'))
  assert.deepEqual(catalog.posts.map(post => post.slug), ['journey-002', 'journey-001'])
  assert.equal(catalog.posts[1].markdown, f.bodies[0])
  assert.equal(result.manifest.files.length, 2)
  assert.equal(result.pointer.sha256, sha256(readFileSync(join(f.workspace, result.catalogKey))))
  assert.deepEqual(buildContent({ workspace: f.workspace, now: '2026-10-18T12:00:00Z' }).pointer, result.pointer)
  writeFileSync(join(f.workspace, `media/${sha256(f.image)}.webp`), 'Changed bytes')
  assert.throws(() => buildContent({ workspace: f.workspace }), /checksum mismatch/)
})

test('build rejects missing media, orphaned writing, and malformed normalized metadata', () => {
  const f = fixture()
  importBde(f)
  const path = join(f.workspace, 'posts/journey-001.json')
  const metadata = JSON.parse(readFileSync(path, 'utf8'))
  metadata.date = '2023-02-29'
  writeFileSync(path, JSON.stringify(metadata))
  assert.throws(() => buildContent({ workspace: f.workspace }), /Invalid post metadata/)
  metadata.date = '2024-02-29'
  writeFileSync(path, JSON.stringify(metadata))
  writeFileSync(join(f.workspace, 'posts/unpublished.md'), 'Unreferenced synthetic writing')
  assert.throws(() => buildContent({ workspace: f.workspace }), /unreferenced Markdown/)
  rmSync(join(f.workspace, 'posts/unpublished.md'))
  rmSync(join(f.workspace, `media/${sha256(f.image)}.webp`))
  assert.throws(() => buildContent({ workspace: f.workspace }), /Required path is missing/)
})

test('workspace rejects Git ancestors and symbolic links; source symlinks also fail closed', () => {
  const f = fixture()
  const git = join(f.root, 'git')
  mkdirSync(git)
  writeFileSync(join(git, '.git'), 'gitdir: synthetic-marker')
  assert.throws(() => resolveWorkspace(join(git, 'content')), /outside every Git/)
  symlinkSync(f.source, join(f.root, 'alias'))
  assert.throws(() => resolveWorkspace(join(f.root, 'alias/content')), /Symbolic links/)
  rmSync(join(f.source, 'public', f.path))
  symlinkSync(join(f.posts, 'journey-001.md'), join(f.source, 'public', f.path))
  assert.throws(() => importBde(f), /Symbolic links/)
  assert.equal(existsSync(f.workspace), false)
})
