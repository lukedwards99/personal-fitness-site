import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'
import app, { parseRange } from '../worker/index'
import type { Bindings } from '../worker/index'
import { parseCatalog, sortPosts } from '../src/content'
import type { Post } from '../src/content'

const hash = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex')
const media = Buffer.from('0123456789abcdef0123456789abcdef')
const mediaKey = `media/${hash(media)}.mp4`
const post: Post = { slug: 'test-entry', title: 'Fixture', excerpt: 'Summary', kind: 'journey', category: 'Journal', date: '2025-01-01', readTime: 1, markdown: 'body-only-query', sequence: 1, media: [{ type: 'video', path: `/api/${mediaKey}`, alt: 'Fixture video' }] }
function fixture(posts: Post[] = [post]) {
  const bytes = Buffer.from(JSON.stringify({ schemaVersion: 1, updatedAt: '2025-01-01T00:00:00Z', posts }))
  const version = hash(bytes)
  const catalogKey = `releases/${version}/catalog.json`
  const objects = new Map<string, Buffer>([['current.json', Buffer.from(JSON.stringify({ schemaVersion: 1, catalogKey, sha256: version }))], [catalogKey, bytes], [mediaKey, media]])
  const info = (key: string) => {
    const value = objects.get(key)
    return value ? { size: value.length, httpEtag: `"${hash(value)}"`, uploaded: new Date('2025-01-01T00:00:00Z') } : null
  }
  const CONTENT = {
    head: async (key: string) => info(key),
    get: async (key: string, options?: { range?: { offset: number; length: number } }) => {
      const value = objects.get(key)
      if (!value) return null
      const body = options?.range ? value.subarray(options.range.offset, options.range.offset + options.range.length) : value
      return { ...info(key), body: new ReadableStream({ start(controller) { controller.enqueue(body); controller.close() } }),
        arrayBuffer: async () => new Uint8Array(value).buffer, json: async () => JSON.parse(value.toString()) }
    },
  } as unknown as R2Bucket
  const env: Bindings = { CONTENT, APP_ENV: 'local' }
  return { objects, catalogKey, version, request: (path: string, init?: RequestInit) => app.request(path, init, env) }
}
async function json(response: Response | Promise<Response>) {
  return await (await response).json() as { storage: string; version: string; total: number; posts: Post[]; post: Post };
}
test('catalog validation rejects unsafe paths, duplicate slugs and impossible dates', () => {
  const catalog = { schemaVersion: 1, updatedAt: '2025-01-01T00:00:00Z', posts: [post] }
  assert.equal(parseCatalog(catalog).posts.length, 1)
  for (const changed of [{ ...catalog, posts: [post, post] }, { ...catalog, posts: [{ ...post, date: '2025-02-30' }] }, { ...catalog, posts: [{ ...post, media: [{ type: 'image', path: '/api/media/../secret', alt: 'Fixture' }] }] }]) assert.throws(() => parseCatalog(changed))
  assert.deepEqual(sortPosts([{ ...post, slug: 'one', sequence: 1 }, { ...post, slug: 'two', sequence: 2 }]).map(p => p.slug), ['two', 'one'])
})
test('runtime API supports empty sections, complete Markdown search and detail consistency', async () => {
  const f = fixture()
  const health = await json(f.request('/api/health'))
  assert.equal(health.storage, 'r2'); assert.equal(health.version, f.version)
  const archive = await json(f.request('/api/posts'))
  assert.equal(archive.total, 1); assert.deepEqual(archive.posts[0], post)
  assert.equal((await json(f.request('/api/posts?kind=advice'))).total, 0)
  assert.equal((await json(f.request('/api/posts?q=body-only-query'))).total, 1)
  assert.equal((await json(f.request('/api/posts?q=body-only-query%20absent'))).total, 0)
  assert.deepEqual((await json(f.request('/api/posts/test-entry'))).post, post)
  assert.equal((await f.request('/api/posts/missing')).status, 404)
  assert.equal((await f.request('/api/posts?kind=invalid')).status, 400)
})
test('unavailable, missing, corrupted, and invalid storage return 503 instead of fake empty archives or 404', async () => {
  for (const change of [
    (f: ReturnType<typeof fixture>) => f.objects.delete('current.json'),
    (f: ReturnType<typeof fixture>) => f.objects.delete(f.catalogKey),
    (f: ReturnType<typeof fixture>) => f.objects.set(f.catalogKey, Buffer.from('{}')),
    (f: ReturnType<typeof fixture>) => f.objects.set('current.json', Buffer.from(JSON.stringify({ schemaVersion: 1, catalogKey: '../secret', sha256: f.version }))),
  ]) {
    const f = fixture(); change(f)
    assert.equal((await f.request('/api/posts')).status, 503)
    assert.equal((await f.request('/api/posts/test-entry')).status, 503)
  }
  assert.equal((await json(fixture([]).request('/api/posts'))).total, 0)
})
test('media supports complete reads, HEAD, byte ranges, conditional caching and If-Range', async () => {
  const f = fixture(); const path = `/api/${mediaKey}`
  const response = await f.request(path)
  assert.equal(response.status, 200); assert.deepEqual(Buffer.from(await response.arrayBuffer()), media)
  assert.equal(response.headers.get('content-type'), 'video/mp4')
  assert.match(response.headers.get('cache-control')!, /immutable/)
  const etag = response.headers.get('etag')!
  assert.equal((await f.request(path, { headers: { 'If-None-Match': etag } })).status, 304)
  assert.equal((await f.request(path, { method: 'HEAD' })).headers.get('content-length'), '32')
  for (const [range, expected] of [['bytes=0-3', '0123'], ['bytes=-4', 'cdef'], ['bytes=28-', 'cdef']]) {
    const part = await f.request(path, { headers: { Range: range } })
    assert.equal(part.status, 206); assert.equal(await part.text(), expected)
    assert.match(part.headers.get('content-range')!, /^bytes \d+-\d+\/32$/)
  }
  assert.equal((await f.request(path, { headers: { Range: 'bytes=99-' } })).status, 416)
  assert.equal((await f.request(path, { headers: { Range: 'bytes=0-3', 'If-Range': '"older"' } })).status, 200)
  assert.equal((await f.request('/api/media/not-a-content-hash.mp4')).status, 404)
})
test('range parser rejects malformed and unsatisfiable requests', () => {
  for (const value of ['bytes=-0', 'bytes=4-1', 'bytes=a-b', 'bytes=100-', 'bytes=-']) assert.equal(parseRange(value, 32), null)
  assert.equal(parseRange(undefined, 32), undefined)
  assert.equal(parseRange('items=0-1', 32), undefined)
  assert.equal(parseRange('bytes=0-1,3-4', 32), undefined)
})
