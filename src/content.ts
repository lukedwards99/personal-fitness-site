// Content contracts only. Authored entries and media live outside Git, in R2.
export type PostMedia = { type: 'image' | 'video'; path: string; alt: string };
export type Post = {
  slug: string;
  title: string;
  excerpt: string;
  kind: 'advice' | 'journey';
  category: string;
  date: string;
  readTime: number;
  markdown: string;
  media: PostMedia[];
  sequence?: number;
  sample?: boolean;
};
export type ContentCatalog = { schemaVersion: 1; updatedAt: string; posts: Post[] };

export const MEDIA_PATH = /^\/api\/media\/[a-f0-9]{64}\.(?:webp|png|jpe?g|gif|avif|mp4|webm)$/;
export const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === 'string';
export function validDate(value: unknown): value is string {
  if (!text(value) || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}
export function parseCatalog(value: unknown): ContentCatalog {
  if (!record(value) || value.schemaVersion !== 1 || !text(value.updatedAt) || Number.isNaN(Date.parse(value.updatedAt)) || !Array.isArray(value.posts)) {
    throw new Error('Unsupported content catalog.');
  }
  const slugs = new Set<string>();
  for (const post of value.posts) {
    if (!record(post) || !text(post.slug) || !SLUG.test(post.slug) || slugs.has(post.slug)
      || !text(post.title) || !post.title.trim() || !text(post.excerpt) || !text(post.category) || !post.category.trim()
      || (post.kind !== 'advice' && post.kind !== 'journey') || !validDate(post.date)
      || !Number.isSafeInteger(post.readTime) || Number(post.readTime) < 1 || !text(post.markdown)
      || !Array.isArray(post.media) || (post.sequence !== undefined && (!Number.isSafeInteger(post.sequence) || Number(post.sequence) < 1))
      || (post.sample !== undefined && typeof post.sample !== 'boolean')) throw new Error('Invalid or duplicate content entry.');
    slugs.add(post.slug);
    for (const media of post.media) {
      if (!record(media) || (media.type !== 'image' && media.type !== 'video') || !text(media.path) || !MEDIA_PATH.test(media.path) || !text(media.alt)
        || (media.type === 'video' ? !/\.(mp4|webm)$/.test(media.path) : /\.(mp4|webm)$/.test(media.path))) {
        throw new Error('Invalid content media.');
      }
    }
  }
  return value as ContentCatalog;
}
export function sortPosts(posts: Post[]): Post[] {
  return [...posts].sort((a, b) => b.date.localeCompare(a.date) || (b.sequence ?? 0) - (a.sequence ?? 0) || b.slug.localeCompare(a.slug));
}
export const formatDate = (date: string, short = false) => new Intl.DateTimeFormat('en-US', {
  month: short ? 'short' : 'long', day: 'numeric', year: short ? undefined : 'numeric', timeZone: 'UTC',
}).format(new Date(`${date}T12:00:00Z`));
