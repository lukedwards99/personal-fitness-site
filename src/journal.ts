import type { Post, PostMedia } from './content';

export type JournalFilters = { year?: string; query?: string };
export type JournalPhotoGroup = { post: Post; photos: PostMedia[] };

export function getJournalYears(posts: readonly Post[]): string[] {
  return [...new Set(posts.map(post => post.date.slice(0, 4)))].sort((a, b) => b.localeCompare(a));
}

export function filterJournalPosts(posts: readonly Post[], { year, query = '' }: JournalFilters = {}): Post[] {
  const terms = query.trim().toLocaleLowerCase('en-US').split(/\s+/).filter(Boolean);
  return posts.filter(post => {
    if (year && year !== 'all' && post.date.slice(0, 4) !== year) return false;
    if (!terms.length) return true;
    const text = [post.title, post.excerpt, post.category, post.markdown].join(' ').toLocaleLowerCase('en-US');
    return terms.every(term => text.includes(term));
  }).sort((a, b) => b.date.localeCompare(a.date));
}

export function getJournalPhotoGroups(posts: readonly Post[]): JournalPhotoGroup[] {
  return posts.flatMap(post => {
    const photos = post.media.filter(item => item.type === 'image');
    return photos.length ? [{ post, photos }] : [];
  });
}
