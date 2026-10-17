import assert from 'node:assert/strict'

const origin = process.env.PREVIEW_ORIGIN ?? 'http://127.0.0.1:5178'
async function get(path) {
  const response = await fetch(new URL(path, origin), { signal: AbortSignal.timeout(5000) })
  assert.equal(response.status, 200, `${path} must return HTTP 200`)
  return response.json()
}

const health = await get('/api/health')
assert.equal(health.app, 'personal-fitness-site')
assert.equal(health.database, 'connected')
assert.ok(health.posts > 0, 'Local D1 should contain seeded posts')

const archive = await get('/api/posts')
assert.equal(archive.total, health.posts)
assert.ok(archive.posts.some((post) => post.kind === 'advice'), 'Advice library should be populated')
assert.ok(archive.posts.some((post) => post.kind === 'journey'), 'Journey archive should be populated')

for (const kind of ['advice', 'journey']) {
  const filtered = await get(`/api/posts?kind=${kind}`)
  assert.ok(filtered.total > 0)
  assert.ok(filtered.posts.every((post) => post.kind === kind), `${kind} filter should exclude other post types`)
}

const first = archive.posts[0]
const detail = await get(`/api/posts/${encodeURIComponent(first.slug)}`)
assert.deepEqual(detail.post, first, 'Detail should return the archived post')
const searched = await get(`/api/posts?q=${encodeURIComponent(first.title)}`)
assert.ok(searched.posts.some((post) => post.slug === first.slug), 'Search should find an exact title')
const missing = await fetch(new URL('/api/posts/no-such-post', origin))
assert.equal(missing.status, 404, 'Unknown post should return 404')
console.log(`API checks passed against ${origin}: D1 connection, both archives, filtering, detail, search, and missing-post handling.`)
