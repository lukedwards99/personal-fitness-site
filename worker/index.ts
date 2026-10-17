import { Hono } from 'hono'
import { MEDIA_PATH, SLUG, parseCatalog, sortPosts } from '../src/content'
import type { ContentCatalog } from '../src/content'

export type Bindings = { CONTENT: R2Bucket; APP_ENV: 'local' | 'dev' | 'production' }
const app = new Hono<{ Bindings: Bindings }>()
const RELEASE_KEY = /^releases\/([a-f0-9]{64})\/catalog\.json$/
export async function loadCatalog(bucket: R2Bucket): Promise<{ catalog: ContentCatalog; version: string }> {
  const pointerObject = await bucket.get('current.json')
  if (!pointerObject) throw new Error('No content release is published.')
  const pointer = await pointerObject.json<{ schemaVersion: number; catalogKey: string; sha256: string }>()
  const match = typeof pointer.catalogKey === 'string' && RELEASE_KEY.exec(pointer.catalogKey)
  if (pointer.schemaVersion !== 1 || !match || pointer.sha256 !== match[1]) throw new Error('Invalid content release pointer.')
  const object = await bucket.get(pointer.catalogKey)
  if (!object) throw new Error('Content release is missing.')
  const bytes = await object.arrayBuffer()
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(n => n.toString(16).padStart(2, '0')).join('')
  if (hash !== pointer.sha256) throw new Error('Content release checksum does not match.')
  const catalog = parseCatalog(JSON.parse(new TextDecoder().decode(bytes)))
  return { catalog: { ...catalog, posts: sortPosts(catalog.posts) }, version: hash }
}
app.use('/api/*', async (c, next) => {
  c.header('Cache-Control', 'no-store')
  c.header('X-Content-Type-Options', 'nosniff')
  await next()
})
app.get('/api/health', async (c) => {
  const { catalog, version } = await loadCatalog(c.env.CONTENT)
  return c.json({ ok: true, app: 'personal-fitness-site', environment: c.env.APP_ENV, storage: 'r2', posts: catalog.posts.length, version })
})
app.get('/api/posts', async (c) => {
  const { catalog, version } = await loadCatalog(c.env.CONTENT)
  const kind = c.req.query('kind')
  if (kind && kind !== 'advice' && kind !== 'journey') return c.json({ error: 'Unknown content kind.' }, 400)
  const category = c.req.query('category')
  const terms = c.req.query('q')?.trim().toLocaleLowerCase('en-US').split(/\s+/).filter(Boolean) ?? []
  const posts = catalog.posts.filter(post => (!kind || post.kind === kind) && (!category || post.category === category)
    && terms.every(term => `${post.title} ${post.excerpt} ${post.category} ${post.markdown}`.toLocaleLowerCase('en-US').includes(term)))
  return c.json({ posts, total: posts.length, updatedAt: catalog.updatedAt, version })
})
app.get('/api/posts/:slug', async (c) => {
  const slug = c.req.param('slug')
  if (!SLUG.test(slug)) return c.json({ error: 'Post not found.' }, 404)
  const { catalog, version } = await loadCatalog(c.env.CONTENT)
  const post = catalog.posts.find(post => post.slug === slug)
  return post ? c.json({ post, version }) : c.json({ error: 'Post not found.' }, 404)
})

export function parseRange(header: string | undefined, size: number): { offset: number; length: number } | null | undefined {
  if (!header || !header.startsWith('bytes=') || header.includes(',')) return undefined
  const match = /^bytes=(\d*)-(\d*)$/.exec(header)
  if (!match || (!match[1] && !match[2]) || size === 0) return null
  if (!match[1]) {
    const suffix = Number(match[2])
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return null
    const length = Math.min(suffix, size)
    return { offset: size - length, length }
  }
  const offset = Number(match[1])
  const last = match[2] ? Number(match[2]) : size - 1
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(last) || offset >= size || last < offset) return null
  return { offset, length: Math.min(last, size - 1) - offset + 1 }
}
const mime: Record<string, string> = { webp: 'image/webp', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', avif: 'image/avif', mp4: 'video/mp4', webm: 'video/webm' }
app.on(['GET', 'HEAD'], '/api/media/:file', async (c) => {
  const path = `/api/media/${c.req.param('file')}`
  if (!MEDIA_PATH.test(path)) return c.json({ error: 'Media not found.' }, 404)
  const key = path.slice('/api/'.length)
  const info = await c.env.CONTENT.head(key)
  if (!info) return c.json({ error: 'Media not found.' }, 404)
  const headers = new Headers({
    'Content-Type': mime[key.split('.').at(-1)!],
    'Cache-Control': 'public, max-age=31536000, immutable',
    'X-Content-Type-Options': 'nosniff',
    'Accept-Ranges': 'bytes', ETag: info.httpEtag,
    'Last-Modified': info.uploaded.toUTCString(),
  })
  const tags = c.req.header('If-None-Match')?.split(',').map(tag => tag.trim().replace(/^W\//, ''))
  if (tags?.includes('*') || tags?.includes(info.httpEtag)) return new Response(null, { status: 304, headers })
  if (c.req.method === 'HEAD') {
    headers.set('Content-Length', String(info.size))
    return new Response(null, { headers })
  }
  const ifRange = c.req.header('If-Range')
  const range = parseRange(!ifRange || ifRange === info.httpEtag || ifRange === info.uploaded.toUTCString() ? c.req.header('Range') : undefined, info.size)
  if (range === null) {
    headers.set('Content-Range', `bytes */${info.size}`)
    return new Response(null, { status: 416, headers })
  }
  const object = await c.env.CONTENT.get(key, range ? { range } : undefined)
  if (!object || !('body' in object)) return c.json({ error: 'Media not found.' }, 404)
  if (range) headers.set('Content-Range', `bytes ${range.offset}-${range.offset + range.length - 1}/${info.size}`)
  headers.set('Content-Length', String(range?.length ?? info.size))
  return new Response(object.body, { status: range ? 206 : 200, headers })
})
app.notFound((c) => c.json({ error: 'Route not found.' }, 404))
app.onError((_error, c) => {
  // Never log authored content or credential values from storage/parser errors.
  console.error('Content storage request failed.')
  return c.json({ error: 'The content library is temporarily unavailable. Please try again.' }, 503)
})
export default app
