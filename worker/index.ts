import { Hono } from 'hono'
import { posts } from '../src/content'

type Bindings = {
  DB: D1Database
  APP_ENV: 'local' | 'dev' | 'production'
}

const app = new Hono<{ Bindings: Bindings }>()

app.use('/api/*', async (c, next) => {
  c.header('Cache-Control', 'no-store')
  await next()
})

app.get('/api/health', async (c) => {
  const row = await c.env.DB.prepare('SELECT COUNT(*) AS count FROM posts').first<{ count: number }>()
  return c.json({
    ok: true,
    app: 'personal-fitness-site',
    environment: c.env.APP_ENV,
    database: 'connected',
    posts: row?.count ?? 0,
    sampleContent: posts.length,
  })
})

app.get('/api/posts', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT document FROM posts ORDER BY json_extract(document, \'$.date\') DESC, slug').all<{ document: string }>()
  const kind = c.req.query('kind')
  const category = c.req.query('category')
  const query = c.req.query('q')?.trim().toLocaleLowerCase('en-US')
  const items = results.map((row) => JSON.parse(row.document) as (typeof posts)[number]).filter((post) =>
    (!kind || post.kind === kind)
    && (!category || post.category === category)
    && (!query || `${post.title} ${post.excerpt}`.toLocaleLowerCase('en-US').includes(query)),
  )
  return c.json({ posts: items, total: items.length })
})

app.get('/api/posts/:slug', async (c) => {
  const row = await c.env.DB.prepare('SELECT document FROM posts WHERE slug = ?').bind(c.req.param('slug')).first<{ document: string }>()
  if (!row) return c.json({ error: 'Post not found.' }, 404)
  return c.json({ post: JSON.parse(row.document) })
})

app.notFound((c) => c.json({ error: 'Route not found.' }, 404))
app.onError((error, c) => {
  console.error(error)
  return c.json({ error: 'The content service could not complete this request.' }, 500)
})

export default app
