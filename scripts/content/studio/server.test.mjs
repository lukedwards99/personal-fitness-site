import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { request as httpRequest } from 'node:http'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createStudioServer, parseStudioArguments, STUDIO_USAGE, studioStartupError } from './server.mjs'
import { BUCKETS } from '../storage.mjs'

const servers = [], directories = []
const secret = 'synthetic-r2-secret-never-in-http'
const accessToken = 'synthetic-launch-session-token'
const credentials = { accessKeyId: 'synthetic-r2-access', secretAccessKey: secret }
afterEach(async () => {
  for (const server of servers.splice(0)) await server.close()
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})
async function fixture(options = {}) {
  const workspace = mkdtempSync(join(realpathSync(tmpdir()), 'fitness-studio-http-test-'))
  directories.push(workspace)
  const studio = await createStudioServer({ workspace, port: 0, credentials, accessToken, maxUploadBytes: 1024, ...options })
  servers.push(studio)
  let cookie, csrfToken
  const request = (path, { method = 'GET', headers = {}, body } = {}) => fetch(`${studio.origin}${path}`, {
    method, headers: { ...(cookie ? { Cookie: cookie } : {}), ...(!['GET', 'HEAD'].includes(method) ? { Origin: studio.origin, 'X-CSRF-Token': csrfToken ?? '' } : {}), ...headers }, body,
  })
  const json = (path, value, options = {}) => request(path, { method: 'POST', ...options, headers: { 'Content-Type': 'application/json', ...options.headers }, body: JSON.stringify(value) })
  const login = async () => {
    const response = await json('/api/session', {}, { headers: { Authorization: `Bearer ${accessToken}` } })
    assert.equal(response.status, 200)
    cookie = response.headers.get('set-cookie').split(';')[0]
    csrfToken = (await response.json()).csrfToken
    return { cookie, csrfToken, response }
  }
  return { ...studio, workspace, request, json, login }
}
const draft = (changes = {}) => ({ slug: 'synthetic-entry', title: 'Synthetic entry', excerpt: 'A synthetic summary.', kind: 'journey', category: 'Journal', date: '2026-10-17', markdown: 'Synthetic local writing.\n\nSecond paragraph.\n', media: [], ...changes })
async function completed(f, id) {
  for (let index = 0; index < 100; index++) {
    const job = (await (await f.request(`/api/jobs/${id}`)).json()).job
    if (job.status !== 'running') return job
    await new Promise(resolve => setTimeout(resolve, 5))
  }
  throw new Error('Synthetic job did not complete.')
}
const raw = (origin, path, headers = {}) => new Promise((resolve, reject) => {
  const url = new URL(origin)
  const request = httpRequest({ hostname: '127.0.0.1', port: url.port, path, headers }, response => {
    let body = ''
    response.on('data', chunk => { body += chunk })
    response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body }))
  })
  request.on('error', reject)
  request.end()
})

test('launch session requires exact Host, Origin and Bearer; session cookie is HttpOnly and resumes without exposing credentials', async () => {
  const f = await fixture()
  assert.equal(new URL(f.launchUrl).hash, `#session=${accessToken}`)
  assert.equal((await f.request('/api/library')).status, 401)
  assert.equal((await raw(f.origin, '/api/library', { Host: `localhost:${new URL(f.origin).port}` })).status, 403)
  assert.equal((await f.json('/api/session', {}, { headers: { Authorization: 'Bearer wrong' } })).status, 401)
  const noOrigin = await fetch(`${f.origin}/api/session`, { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` } })
  assert.equal(noOrigin.status, 403)
  const { response, csrfToken } = await f.login()
  assert.match(response.headers.get('set-cookie'), /HttpOnly/)
  assert.match(response.headers.get('set-cookie'), /SameSite=Strict/)
  assert.deepEqual(await (await f.request('/api/session')).json(), { csrfToken })
  const library = await f.request('/api/library')
  const body = await library.text()
  assert.equal(library.status, 200)
  assert.equal(library.headers.get('cache-control'), 'no-store')
  assert.equal(library.headers.get('access-control-allow-origin'), null)
  assert.ok(!body.includes(secret) && !body.includes(credentials.accessKeyId) && !body.includes(accessToken))
  assert.deepEqual(JSON.parse(body).buckets, BUCKETS)
  assert.equal(JSON.parse(body).activeJob, null)
})

test('two studio ports retain independent sessions when the browser sends both host cookies', async () => {
  const first = await fixture(), second = await fixture()
  const a = await first.login(), b = await second.login()
  assert.match(a.cookie, new RegExp(`^pfs_studio_session_${new URL(first.origin).port}=`))
  assert.match(b.cookie, new RegExp(`^pfs_studio_session_${new URL(second.origin).port}=`))
  assert.notEqual(a.cookie.split('=')[0], b.cookie.split('=')[0])
  const combined = `${a.cookie}; ${b.cookie}`
  for (const [studio, session] of [[first, a], [second, b]]) {
    const response = await studio.request('/api/session', { headers: { Cookie: combined } })
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { csrfToken: session.csrfToken })
    assert.equal((await studio.request('/api/library', { headers: { Cookie: combined } })).status, 200)
  }
  assert.equal((await first.request('/api/session', { headers: { Cookie: b.cookie } })).status, 401)
  assert.equal((await second.request('/api/session', { headers: { Cookie: a.cookie } })).status, 401)
})

test('authenticated mutations enforce Origin, fetch-site and CSRF; draft saves stay external and preserve revision conflicts', async () => {
  const f = await fixture()
  await f.login()
  assert.equal((await f.json('/api/posts', { post: draft(), expectedRevision: null }, { headers: { Origin: 'https://example.invalid' } })).status, 403)
  assert.equal((await f.json('/api/posts', { post: draft(), expectedRevision: null }, { headers: { 'X-CSRF-Token': '' } })).status, 403)
  assert.equal((await f.request('/api/library', { headers: { 'Sec-Fetch-Site': 'cross-site' } })).status, 403)
  assert.equal((await f.json('/api/posts', { post: draft() })).status, 400)
  assert.equal((await f.json('/api/posts', { post: draft(), expectedRevision: '' })).status, 400)
  const saved = await f.json('/api/posts', { post: draft(), expectedRevision: null })
  assert.equal(saved.status, 200)
  const { post, revision } = await saved.json()
  assert.match(revision, /^[a-f0-9]{64}$/)
  assert.equal(post.markdown, draft().markdown)
  assert.equal(readFileSync(join(f.workspace, 'posts/synthetic-entry.md'), 'utf8'), draft().markdown)
  assert.equal((await f.json('/api/posts', { post: draft({ markdown: 'Changed synthetic writing.' }), expectedRevision: null })).status, 409)
  assert.equal((await (await f.request('/api/posts/synthetic-entry')).json()).revision, revision)
  assert.equal((await f.json('/api/posts', { post: draft({ slug: '../escape' }), expectedRevision: null })).status, 400)
})

test('media uploads are bounded, immutable, authenticated and range-readable without allowing path traversal', async () => {
  const f = await fixture()
  await f.login()
  assert.equal((await f.request('/api/media?filename=large.png', { method: 'POST', body: Buffer.alloc(1025) })).status, 413)
  assert.equal((await f.request('/api/media?filename=..%2Fescape.png', { method: 'POST', body: Buffer.from('synthetic') })).status, 400)
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6QWYAAAAASUVORK5CYII=', 'base64')
  const uploaded = await f.request('/api/media?filename=synthetic.png', { method: 'POST', body: png })
  assert.equal(uploaded.status, 201)
  const { media, size } = await uploaded.json()
  assert.equal(size, png.length)
  assert.match(media.path, /^\/api\/media\/[a-f0-9]{64}\.png$/)
  assert.equal((await f.request(media.path, { method: 'HEAD' })).headers.get('content-length'), String(png.length))
  const part = await f.request(media.path, { headers: { Range: 'bytes=0-7' } })
  assert.equal(part.status, 206)
  assert.deepEqual(Buffer.from(await part.arrayBuffer()), png.subarray(0, 8))
  assert.equal((await f.request(media.path, { headers: { Range: 'bytes=9007199254740992-' } })).status, 416)
  assert.equal((await f.request(media.path, { headers: { Range: 'items=0-1' } })).status, 200)
  assert.equal((await f.request(media.path, { headers: { Range: 'bytes=0-1,4-5' } })).status, 200)
  assert.equal((await fetch(`${f.origin}${media.path}`)).status, 401)
  assert.equal((await f.request('/api/media/%2e%2e%2fserver.mjs')).status, 400)
})

test('Markdown SSR drops raw scripts and unsafe links; static files are whitelisted with restrictive CSP', async () => {
  const f = await fixture()
  await f.login()
  const response = await f.json('/api/preview', { markdown: '# Synthetic heading\n\n<script>alert(1)</script>\n\n[unsafe](javascript:alert(1))\n\n| A | B |\n|---|---|\n| 1 | 2 |' })
  assert.equal(response.status, 200)
  const { html } = await response.json()
  assert.match(html, /<h1>Synthetic heading<\/h1>/)
  assert.match(html, /<table>/)
  assert.ok(!html.includes('<script') && !html.includes('javascript:'))
  assert.match(response.headers.get('content-security-policy'), /script-src 'self'/)
  assert.match(response.headers.get('content-security-policy'), /frame-ancestors 'none'/)
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff')
  assert.equal((await f.json('/api/preview', { markdown: 'x'.repeat(2 * 1024 * 1024 + 1) })).status, 413)
  assert.equal((await raw(f.origin, '/../package.json')).status, 404)
  assert.equal((await f.request('/server.mjs')).status, 404)
  assert.equal((await f.request('/.git/config')).status, 404)
  const font = await f.request('/font.woff2')
  assert.equal(font.status, 200)
  assert.equal(font.headers.get('content-type'), 'font/woff2')
})

test('jobs use fixed lane storage, expose resumable progress and block overlapping writes; secrets never enter results', async () => {
  let releaseJob
  const wait = new Promise(resolve => { releaseJob = resolve })
  const calls = [], closed = []
  const f = await fixture({
    createStorage: lane => ({ bucket: BUCKETS[lane], close() { closed.push(lane) } }),
    publish: async ({ lane, workspace, storage, onProgress }) => {
      calls.push({ lane, workspace, bucket: storage.bucket })
      onProgress({ phase: 'upload', completed: 1, total: 2, secret })
      await wait
      return { pointer: { postCount: 2, catalogKey: `releases/${'a'.repeat(64)}/catalog.json`, sha256: 'a'.repeat(64) }, objectCount: 2, uploadedMedia: 1, existingMedia: 0, credential: secret }
    },
    backup: async ({ lane, storage }) => ({ postCount: 2, mediaCount: 1, snapshot: join(f.workspace, 'backups', lane), secret, bucket: storage.bucket }),
  })
  await f.login()
  assert.equal((await f.json('/api/jobs', { action: 'publish', lane: 'production' })).status, 400)
  assert.equal((await f.json('/api/jobs', { action: 'exec', lane: 'dev' })).status, 400)
  const started = await f.json('/api/jobs', { action: 'publish', lane: 'dev' })
  assert.equal(started.status, 202)
  const { job } = await started.json()
  assert.equal(job.bucket, BUCKETS.dev)
  assert.equal((await (await f.request('/api/library')).json()).activeJob.id, job.id)
  assert.equal((await f.json('/api/posts', { post: draft(), expectedRevision: null })).status, 423)
  assert.equal((await f.request('/api/media?filename=busy.png', { method: 'POST', body: 'synthetic' })).status, 423)
  assert.equal((await f.json('/api/jobs', { action: 'backup', lane: 'main' })).status, 423)
  releaseJob()
  const done = await completed(f, job.id)
  assert.equal(done.status, 'succeeded')
  assert.equal(done.result.postCount, 2)
  assert.equal(done.progress.completed, 1)
  assert.ok(!JSON.stringify(done).includes(secret))
  assert.deepEqual(calls, [{ lane: 'dev', workspace: f.workspace, bucket: BUCKETS.dev }])
  const backup = (await (await f.json('/api/jobs', { action: 'backup', lane: 'main' })).json()).job
  assert.equal((await completed(f, backup.id)).status, 'succeeded')
  assert.deepEqual(closed, ['dev', 'main'])
})

test('failed mock cloud operations return curated errors, close storage, and release the mutation lock', async () => {
  let closed = false
  const f = await fixture({ createStorage: () => ({ bucket: BUCKETS.main, close() { closed = true } }), publish: async () => { throw new Error(secret) } })
  await f.login()
  const { job } = await (await f.json('/api/jobs', { action: 'publish', lane: 'main' })).json()
  const failed = await completed(f, job.id)
  assert.equal(failed.status, 'failed')
  assert.ok(!JSON.stringify(failed).includes(secret))
  assert.match(failed.error, /saved library/)
  assert.equal(closed, true)
  assert.equal((await f.json('/api/posts', { post: draft(), expectedRevision: null })).status, 200)
})

test('publish recovers an interrupted metadata/body pair before the builder can capture the library', async () => {
  let captured
  const f = await fixture({
    createStorage: lane => ({ bucket: BUCKETS[lane], close() {} }),
    publish: async ({ workspace }) => {
      captured = {
        metadata: JSON.parse(readFileSync(join(workspace, 'posts/synthetic-entry.json'), 'utf8')),
        markdown: readFileSync(join(workspace, 'posts/synthetic-entry.md'), 'utf8'),
      }
      return { pointer: { postCount: 1 }, objectCount: 1, uploadedMedia: 0, existingMedia: 0 }
    },
  })
  await f.login()
  const first = await (await f.json('/api/posts', { post: draft(), expectedRevision: null })).json()
  const revised = draft({ title: 'Revised synthetic title', markdown: 'A complete revised synthetic body.\n' })
  const second = await (await f.json('/api/posts', { post: revised, expectedRevision: first.revision })).json()
  const transactions = join(f.workspace, '.studio/transactions')
  const pending = readdirSync(transactions).map(name => join(transactions, name)).find(path => JSON.parse(readFileSync(join(path, 'transaction.json'), 'utf8')).afterRevision === second.revision)
  rmSync(join(pending, 'done.json'))
  writeFileSync(join(f.workspace, 'posts/synthetic-entry.md'), readFileSync(join(pending, 'before.md')))
  const { job } = await (await f.json('/api/jobs', { action: 'publish', lane: 'dev' })).json()
  assert.equal((await completed(f, job.id)).status, 'succeeded')
  assert.equal(captured.metadata.title, revised.title)
  assert.equal(captured.markdown, revised.markdown)
})

test('CLI help skips credential access and startup errors expose only curated instructions', () => {
  const help = execFileSync(process.execPath, [fileURLToPath(new URL('./server.mjs', import.meta.url)), '--help'], {
    encoding: 'utf8', env: { ...process.env, R2_ACCESS_KEY_ID: 'synthetic-partial-environment-no-secret' },
  })
  assert.match(help, /default port 5186/)
  assert.match(help, /~\/Documents\/personal-fitness-content/)
  assert.match(help, /personal-fitness-content-r2/)
  assert.ok(!help.includes('synthetic-partial-environment-no-secret'))
  assert.deepEqual(parseStudioArguments(['--workspace', '/synthetic/content', '--port', '5187']), { workspace: '/synthetic/content', port: 5187 })
  for (const args of [['--host', '0.0.0.0'], ['--port', '65536'], ['--port', 'no'], ['--port'], ['--help', '--port', '5186']]) {
    assert.throws(() => parseStudioArguments(args), error => error.code === 'STUDIO_USAGE' && studioStartupError(error).includes(STUDIO_USAGE))
  }
  assert.match(studioStartupError(Object.assign(new Error(secret), { code: 'EADDRINUSE' })), /port.*in use.*--port/)
  const unavailable = 'R2 credentials are unavailable. Set R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY, or use the approved personal-fitness-content-r2 macOS Keychain item.'
  assert.equal(studioStartupError(new Error(unavailable)), unavailable)
  assert.equal(studioStartupError(new Error('Set both R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY.')), 'Set both R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY.')
  assert.ok(!studioStartupError(new Error(secret)).includes(secret))
})
