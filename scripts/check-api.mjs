import assert from 'node:assert/strict'
const origin = process.env.PREVIEW_ORIGIN ?? 'http://127.0.0.1:5178'
async function get(path) {
  const response = await fetch(new URL(path, origin), { signal: AbortSignal.timeout(15000) })
  assert.equal(response.status, 200, `${path} must return HTTP 200`)
  return response.json()
}
const health = await get('/api/health')
assert.equal(health.app, 'personal-fitness-site')
assert.equal(health.storage, 'r2')
const archive = await get('/api/posts')
assert.equal(archive.total, health.posts)
assert.equal(archive.version, health.version)
for (const kind of ['advice', 'journey']) {
  const filtered = await get(`/api/posts?kind=${kind}`)
  assert.equal(filtered.total, archive.posts.filter(post => post.kind === kind).length)
  assert.ok(filtered.posts.every(post => post.kind === kind))
}
if (archive.posts.length) {
  const first = archive.posts[0]
  assert.deepEqual((await get(`/api/posts/${encodeURIComponent(first.slug)}`)).post, first)
  const searched = await get(`/api/posts?q=${encodeURIComponent(first.title)}`)
  assert.ok(searched.posts.some(post => post.slug === first.slug))
  const media = archive.posts.flatMap(post => post.media)
  for (const type of ['image', 'video']) {
    const item = media.find(item => item.type === type)
    if (!item) continue
    const response = await fetch(new URL(item.path, origin), { headers: { Range: 'bytes=0-15' } })
    assert.equal(response.status, 206)
    assert.equal((await response.arrayBuffer()).byteLength, 16)
    assert.match(response.headers.get('content-range') ?? '', /^bytes 0-15\//)
    assert.equal((await fetch(new URL(item.path, origin), { headers: { 'If-None-Match': response.headers.get('etag') } })).status, 304)
  }
}
assert.equal((await fetch(new URL('/api/posts/no-such-post', origin))).status, 404)
console.log(`API checks passed against ${origin}: R2 release integrity, archive/filter/detail/search consistency, empty sections, image/video ranges, caching, and missing posts.`)
