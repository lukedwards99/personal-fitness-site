import { createServer } from 'node:http'
import { createReadStream } from 'node:fs'
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { backupContent } from '../backup.mjs'
import { publishContent } from '../publish.mjs'
import { BUCKETS, createR2Storage, loadCredentials } from '../storage.mjs'
import { readSafeFile, resolveWorkspace } from '../workspace.mjs'
import { StudioError, importMedia, listLibrary, mediaInfo, readPost, savePost } from './library.mjs'

export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024
export const STUDIO_USAGE = `Usage: npm run content:studio -- [--workspace <path>] [--port <number>]

Local address: 127.0.0.1 only; default port 5186.
Default workspace: ~/Documents/personal-fitness-content.
Override the workspace with FITNESS_CONTENT_DIR or --workspace.
R2 credentials: R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY, or macOS Keychain
service personal-fitness-content-r2, account personal-fitness-site.
Use --help to show this information.`
const MAX_JSON_BYTES = 8 * 1024 * 1024
const MAX_MARKDOWN_BYTES = 2 * 1024 * 1024
const COOKIE_PREFIX = 'pfs_studio_session'
const HERE = new URL('./', import.meta.url)
const STATIC = new Map([
  ['/', { file: new URL('ui/index.html', HERE), type: 'text/html; charset=utf-8' }],
  ['/index.html', { file: new URL('ui/index.html', HERE), type: 'text/html; charset=utf-8' }],
  ['/app.js', { file: new URL('ui/app.js', HERE), type: 'text/javascript; charset=utf-8' }],
  ['/styles.css', { file: new URL('ui/styles.css', HERE), type: 'text/css; charset=utf-8' }],
  ['/font.woff2', { file: new URL('../../../node_modules/@fontsource-variable/inter-tight/files/inter-tight-latin-wght-normal.woff2', HERE), type: 'font/woff2' }],
])
const SECURITY = {
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; connect-src 'self'; img-src 'self' blob: data:; media-src 'self' blob:; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Opener-Policy': 'same-origin',
}
const failure = (status, message, fields) => new StudioError(status, message, fields)
const secretEqual = (first, second) => {
  if (typeof first !== 'string' || typeof second !== 'string') return false
  const a = Buffer.from(first), b = Buffer.from(second)
  return a.length === b.length && timingSafeEqual(a, b)
}
const sessionCookie = (header, cookieName) => {
  if (typeof header !== 'string') return undefined
  const values = header.split(';').map(value => value.trim()).filter(value => value.startsWith(`${cookieName}=`))
  return values.length === 1 ? values[0].slice(cookieName.length + 1) : undefined
}
const decodeParameter = (value) => {
  try { return decodeURIComponent(value) } catch { throw failure(400, 'The request path is invalid.') }
}

function bodyBytes(request, limit) {
  return new Promise((resolveBody, reject) => {
    const declared = request.headers['content-length']
    if (declared && (!/^\d+$/.test(declared) || Number(declared) > limit)) {
      request.resume()
      reject(failure(413, 'The upload or request exceeds the size limit.'))
      return
    }
    const chunks = []
    let length = 0, finished = false
    const cleanup = () => { request.off('data', data); request.off('end', end); request.off('error', error); request.off('aborted', aborted) }
    const fail = (problem) => {
      if (finished) return
      finished = true
      cleanup()
      request.resume()
      reject(problem)
    }
    const data = (chunk) => {
      length += chunk.length
      if (length > limit) return fail(failure(413, 'The upload or request exceeds the size limit.'))
      chunks.push(chunk)
    }
    const end = () => {
      if (finished) return
      finished = true
      cleanup()
      resolveBody(Buffer.concat(chunks, length))
    }
    const error = () => fail(failure(400, 'The request body could not be read.'))
    const aborted = () => fail(failure(400, 'The request was interrupted.'))
    request.on('data', data).on('end', end).on('error', error).on('aborted', aborted)
  })
}
async function jsonBody(request) {
  if (request.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') throw failure(415, 'Send this request as application/json.')
  try {
    const value = JSON.parse((await bodyBytes(request, MAX_JSON_BYTES)).toString('utf8'))
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw failure(400, 'Expected a JSON object.')
    return value
  } catch (error) {
    if (error instanceof StudioError) throw error
    throw failure(400, 'The request contains invalid JSON.')
  }
}
const sendJSON = (response, status, value, headers = {}) => {
  const bytes = Buffer.from(JSON.stringify(value))
  response.writeHead(status, { ...SECURITY, 'Cache-Control': 'no-store', 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': bytes.length, ...headers })
  response.end(bytes)
}
function byteRange(value, size) {
  if (!value) return undefined
  if (typeof value === 'string' && (!value.startsWith('bytes=') || value.includes(','))) return undefined
  if (typeof value !== 'string' || !/^bytes=\d*-\d*$/.test(value) || value === 'bytes=-') throw failure(416, 'Requested media range is invalid.')
  const [start, end] = value.slice(6).split('-')
  if ((start && !Number.isSafeInteger(Number(start))) || (end && !Number.isSafeInteger(Number(end)))) throw failure(416, 'Requested media range is invalid.')
  const first = start ? Number(start) : Math.max(0, size - Number(end))
  const last = start ? (end ? Math.min(Number(end), size - 1) : size - 1) : size - 1
  if (size <= 0 || !Number.isSafeInteger(first) || !Number.isSafeInteger(last) || (!start && Number(end) <= 0) || first < 0 || first >= size || last < first) throw failure(416, 'Requested media range is unavailable.')
  return { start: first, end: last }
}
function cleanResult(action, result) {
  if (action === 'backup') return { postCount: result.postCount, mediaCount: result.mediaCount, snapshot: result.snapshot }
  return { postCount: result.pointer?.postCount, catalogKey: result.pointer?.catalogKey, sha256: result.pointer?.sha256,
    objectCount: result.objectCount, uploadedMedia: result.uploadedMedia, existingMedia: result.existingMedia, receiptPath: result.receiptPath }
}

export async function createStudioServer(options = {}) {
  const workspace = resolveWorkspace(options.workspace)
  const port = options.port ?? 5186
  if (!Number.isSafeInteger(port) || port < 0 || port > 65535) throw new Error('Studio port must be an integer from 0 to 65535.')
  const maxUploadBytes = options.maxUploadBytes ?? MAX_UPLOAD_BYTES
  if (!Number.isSafeInteger(maxUploadBytes) || maxUploadBytes < 1 || maxUploadBytes > MAX_UPLOAD_BYTES) throw new Error('Invalid upload limit.')
  // Capture credentials once on the server. They never enter API payloads,
  // rendered documents, the launch URL, or error/log messages.
  const supplied = options.credentials ?? loadCredentials()
  if (!supplied || typeof supplied.accessKeyId !== 'string' || !supplied.accessKeyId || typeof supplied.secretAccessKey !== 'string' || !supplied.secretAccessKey) throw new Error('R2 credentials are unavailable.')
  const credentials = Object.freeze({ accessKeyId: supplied.accessKeyId, secretAccessKey: supplied.secretAccessKey })
  const credentialsSource = options.credentialsSource ?? (options.credentials || process.env.R2_ACCESS_KEY_ID || process.env.R2_SECRET_ACCESS_KEY ? 'environment' : 'Keychain')
  if (!['environment', 'Keychain'].includes(credentialsSource)) throw new Error('Invalid credential source.')
  const accessToken = options.accessToken ?? randomBytes(32).toString('hex')
  if (typeof accessToken !== 'string' || accessToken.length < 16) throw new Error('Studio launch token is invalid.')
  const cookie = randomBytes(32).toString('hex')
  const csrfToken = randomBytes(32).toString('hex')
  const publish = options.publish ?? publishContent
  const backup = options.backup ?? backupContent
  const createStorage = options.createStorage ?? (lane => createR2Storage(lane, { credentials }))
  const jobs = new Map()
  let mutationBusy = false
  let origin
  let cookieName
  let closed = false
  const mutate = async (operation) => {
    if (mutationBusy) throw failure(423, 'Another save, upload, or content job is running. Wait for it to finish.')
    mutationBusy = true
    try { return await operation() } finally { mutationBusy = false }
  }
  const launchJob = (action, lane) => {
    if (!['publish', 'backup'].includes(action) || !Object.hasOwn(BUCKETS, lane)) throw failure(400, 'Choose publish or backup and an explicit dev or main lane.')
    if (mutationBusy) throw failure(423, 'Another save, upload, or content job is running. Wait for it to finish.')
    while (jobs.size >= 50) jobs.delete(jobs.keys().next().value)
    const job = { id: randomUUID(), action, lane, bucket: BUCKETS[lane], status: 'running' }
    jobs.set(job.id, job)
    mutationBusy = true
    void (async () => {
      let storage
      try {
        // Finish interrupted local pair transactions before the standalone
        // builder captures metadata and Markdown for a new remote release.
        if (action === 'publish') await listLibrary({ workspace })
        storage = await createStorage(lane)
        if (!storage || storage.bucket !== BUCKETS[lane]) throw new Error('Content bucket mismatch.')
        const operation = action === 'publish' ? publish : backup
        const result = await operation({ lane, workspace, storage, onProgress: value => {
          if (value && ['upload', 'verify'].includes(value.phase) && Number.isSafeInteger(value.completed) && Number.isSafeInteger(value.total)) {
            job.progress = { phase: value.phase, completed: value.completed, total: value.total }
          }
        } })
        job.result = cleanResult(action, result)
        job.status = 'succeeded'
      } catch {
        job.status = 'failed'
        job.error = `${action === 'publish' ? 'Publishing' : 'Backup'} failed. Check the saved library, R2 permissions, and connectivity, then try again.`
      } finally {
        try { await storage?.close?.() } catch { /* Credentials and SDK errors stay server-side. */ }
        mutationBusy = false
      }
    })()
    return { ...job }
  }
  const server = createServer((request, response) => {
    // A disconnected or rejected upload must not produce an unhandled stream
    // error after its bounded body reader has detached its own listeners.
    request.on('error', () => {})
    void (async () => {
      if (request.headers.host !== new URL(origin).host) throw failure(403, 'This studio accepts only its exact loopback address.')
      if (request.headers['sec-fetch-site'] === 'cross-site') throw failure(403, 'Cross-site requests are not allowed.')
      if (!request.url?.startsWith('/') || request.url.startsWith('//') || request.url.includes('\\')) throw failure(404, 'Not found.')
      const url = new URL(request.url, origin)
      const rawPath = request.url.split('?')[0]
      if (url.origin !== origin || url.pathname !== rawPath) throw failure(404, 'Not found.')
      const method = request.method ?? 'GET'
      const mutation = !['GET', 'HEAD'].includes(method)
      if (mutation && request.headers.origin !== origin) throw failure(403, 'The request must originate from this studio.')
      const path = url.pathname
      if (path === '/api/session' && method === 'POST') {
        if (!secretEqual(request.headers.authorization, `Bearer ${accessToken}`)) throw failure(401, 'Open the studio using its launch link.')
        sendJSON(response, 200, { csrfToken }, { 'Set-Cookie': `${cookieName}=${cookie}; Path=/; HttpOnly; SameSite=Strict` })
        request.resume()
        return
      }
      if (path.startsWith('/api/')) {
        if (!secretEqual(sessionCookie(request.headers.cookie, cookieName), cookie)) throw failure(401, 'Open the studio using its launch link.')
        if (mutation && !secretEqual(request.headers['x-csrf-token'], csrfToken)) throw failure(403, 'The studio session could not verify this request. Reload and try again.')
        if (path === '/api/session' && method === 'GET') return sendJSON(response, 200, { csrfToken })
        if (path === '/api/library' && method === 'GET') return sendJSON(response, 200, { ...await listLibrary({ workspace }), credentialsSource, buckets: BUCKETS, maxUploadBytes, activeJob: [...jobs.values()].find(job => job.status === 'running') ?? null })
        const postMatch = /^\/api\/posts\/([^/]+)$/.exec(path)
        if (postMatch && method === 'GET') return sendJSON(response, 200, await readPost({ workspace, slug: decodeParameter(postMatch[1]) }))
        if (path === '/api/posts' && method === 'POST') return await mutate(async () => {
          const { post, expectedRevision } = await jsonBody(request)
          if (expectedRevision !== null && (typeof expectedRevision !== 'string' || !expectedRevision.trim())) throw failure(400, 'Provide the current revision, or explicit null for a new entry.', { expectedRevision: 'A revision is required.' })
          sendJSON(response, 200, await savePost({ workspace, post, expectedRevision }))
        })
        if (path === '/api/media' && method === 'POST') return await mutate(async () => {
          const filename = url.searchParams.get('filename')
          if (!filename) throw failure(400, 'Choose a file to upload.')
          const bytes = await bodyBytes(request, maxUploadBytes)
          sendJSON(response, 201, await importMedia({ workspace, filename, bytes }))
        })
        const mediaMatch = /^\/api\/media\/([^/]+)$/.exec(path)
        if (mediaMatch && ['GET', 'HEAD'].includes(method)) {
          const info = await mediaInfo({ workspace, file: decodeParameter(mediaMatch[1]) })
          let range
          try { range = method === 'GET' ? byteRange(request.headers.range, info.size) : undefined } catch (error) {
            if (error instanceof StudioError && error.status === 416) return sendJSON(response, 416, { error: error.message }, { 'Content-Range': `bytes */${info.size}` })
            throw error
          }
          const headers = { ...SECURITY, 'Cache-Control': 'no-store', 'Content-Type': info.contentType, 'Accept-Ranges': 'bytes', 'Content-Length': range ? range.end - range.start + 1 : info.size }
          if (range) headers['Content-Range'] = `bytes ${range.start}-${range.end}/${info.size}`
          response.writeHead(range ? 206 : 200, headers)
          if (method === 'HEAD') return response.end()
          const stream = createReadStream(info.path, range)
          stream.on('error', () => response.destroy())
          response.on('close', () => stream.destroy())
          stream.pipe(response)
          return
        }
        if (path === '/api/preview' && method === 'POST') {
          const { markdown } = await jsonBody(request)
          if (typeof markdown !== 'string') throw failure(400, 'Preview requires Markdown text.')
          if (Buffer.byteLength(markdown, 'utf8') > MAX_MARKDOWN_BYTES) throw failure(413, 'Markdown exceeds the 2 MiB limit.')
          const html = renderToStaticMarkup(React.createElement(ReactMarkdown, { remarkPlugins: [remarkGfm], skipHtml: true }, markdown))
          return sendJSON(response, 200, { html })
        }
        if (path === '/api/jobs' && method === 'POST') {
          const { action, lane } = await jsonBody(request)
          return sendJSON(response, 202, { job: launchJob(action, lane) })
        }
        const jobMatch = /^\/api\/jobs\/([a-f0-9-]+)$/.exec(path)
        if (jobMatch && method === 'GET') {
          const job = jobs.get(jobMatch[1])
          if (!job) throw failure(404, 'Content job not found.')
          return sendJSON(response, 200, { job })
        }
        throw failure(404, 'API route not found.')
      }
      const asset = STATIC.get(path)
      if (!asset || !['GET', 'HEAD'].includes(method)) throw failure(404, 'Not found.')
      const bytes = readSafeFile(fileURLToPath(asset.file))
      response.writeHead(200, { ...SECURITY, 'Cache-Control': 'no-store', 'Content-Type': asset.type, 'Content-Length': bytes.length })
      response.end(method === 'HEAD' ? undefined : bytes)
    })().catch(error => {
      request.resume()
      if (response.headersSent) { response.destroy(); return }
      if (error instanceof StudioError) sendJSON(response, error.status, { error: error.message, ...(error.fields ? { fields: error.fields } : {}) })
      else sendJSON(response, 500, { error: 'The studio could not complete this request.' })
    })
  })
  server.requestTimeout = 120_000
  server.headersTimeout = 15_000
  await new Promise((ready, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', () => { server.off('error', reject); ready() })
  })
  origin = `http://127.0.0.1:${server.address().port}`
  // Cookies are shared across a host's ports. Give each local studio its own
  // name so opening a second instance cannot replace the first one's session.
  cookieName = `${COOKIE_PREFIX}_${server.address().port}`
  return { server, origin, launchUrl: `${origin}/#session=${encodeURIComponent(accessToken)}`, async close() {
    if (closed) return
    closed = true
    await new Promise((resolveClose, reject) => {
      server.close(error => error ? reject(error) : resolveClose())
      server.closeIdleConnections()
    })
  } }
}

export function parseStudioArguments(args) {
  const invalid = () => { const error = new Error('Invalid studio arguments.'); error.code = 'STUDIO_USAGE'; throw error }
  if (args.length === 1 && args[0] === '--help') return { help: true }
  const options = {}
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index], value = args[index + 1]
    if (!['--workspace', '--port'].includes(flag) || !value || value.startsWith('--') || Object.hasOwn(options, flag.slice(2))) invalid()
    if (flag === '--port' && (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) > 65535)) invalid()
    options[flag.slice(2)] = flag === '--port' ? Number(value) : value
  }
  return options
}

export function studioStartupError(error) {
  if (error?.code === 'STUDIO_USAGE') return `Invalid studio arguments.\n\n${STUDIO_USAGE}`
  if (error?.code === 'EADDRINUSE') return 'The studio port is already in use. Choose another with --port <number>.'
  const credentialMessages = new Set([
    'R2 credentials are unavailable. Set R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY, or use the approved personal-fitness-content-r2 macOS Keychain item.',
    'Set both R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY.',
  ])
  if (credentialMessages.has(error?.message)) return error.message
  return 'The local studio could not start. Check its port, external workspace, and R2 credentials.'
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parseStudioArguments(process.argv.slice(2))
    if (options.help) console.log(STUDIO_USAGE)
    else {
      const studio = await createStudioServer(options)
      console.log(`Local content studio: ${studio.launchUrl}`)
    }
  } catch (error) { console.error(studioStartupError(error)); process.exitCode = 1 }
}
