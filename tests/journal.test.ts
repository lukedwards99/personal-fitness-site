import assert from 'node:assert/strict';
import test from 'node:test';
import type { Post, PostMedia } from '../src/content';
import { filterJournalPosts, getJournalPhotoGroups, getJournalYears } from '../src/journal';

function entry(slug: string, date: string, fields: Partial<Post> = {}): Post {
  return { slug, date, title: 'Fixture entry', excerpt: '', category: 'Journal', kind: 'journey', markdown: '', readTime: 1, media: [], ...fields };
}

test('journal years are unique and newest first, including an empty archive', () => {
  assert.deepEqual(getJournalYears([
    entry('old', '2023-12-31'), entry('new', '2025-01-01'), entry('middle', '2024-07-01'), entry('same-year', '2025-09-01'),
  ]), ['2025', '2024', '2023']);
  assert.deepEqual(getJournalYears([]), []);
});

test('journal browsing sorts by date without changing the source or reordering entries on the same day', () => {
  const posts = [
    entry('older', '2023-12-31'),
    entry('same-day-first', '2025-01-01', { sequence: 1 }),
    entry('middle', '2024-07-01'),
    entry('same-day-second', '2025-01-01', { sequence: 2 }),
  ];
  const original = [...posts];
  assert.deepEqual(filterJournalPosts(posts).map(post => post.slug), ['same-day-first', 'same-day-second', 'middle', 'older']);
  assert.deepEqual(posts, original);
});

test('year selection combines with case-insensitive full-text search across all entry fields', () => {
  const matching = entry('matching', '2024-05-01', { title: 'Heavy', excerpt: 'SQUATS', category: 'Preparation', markdown: 'Body-only detail' });
  const posts = [matching, { ...matching, slug: 'other-year', date: '2025-05-01' }, entry('missing-term', '2024-06-01', { title: 'Heavy squats preparation' })];
  assert.deepEqual(filterJournalPosts(posts, { year: '2024', query: '  HEAVY\tSquats \n preparation body-only  ' }), [matching]);
  assert.deepEqual(filterJournalPosts(posts, { year: '2025', query: 'body-only' }).map(post => post.slug), ['other-year']);
});

test('clearing year or search restores the appropriate entries', () => {
  const posts = [entry('old', '2023-12-31', { markdown: 'Deload' }), entry('new', '2025-01-01', { markdown: 'Deload' }), entry('other', '2025-02-01')];
  assert.deepEqual(filterJournalPosts(posts, { year: '2025', query: '   ' }).map(post => post.slug), ['other', 'new']);
  for (const year of [undefined, '', 'all']) {
    assert.deepEqual(filterJournalPosts(posts, { year, query: 'deload' }).map(post => post.slug), ['new', 'old']);
  }
  assert.equal(filterJournalPosts(posts, { year: 'all', query: '' }).length, 3);
});

test('unmatched queries and years return an empty list', () => {
  const posts = [entry('fixture', '2025-01-01')];
  assert.deepEqual(filterJournalPosts(posts, { query: 'absent-term' }), []);
  assert.deepEqual(filterJournalPosts(posts, { year: '2022' }), []);
  assert.deepEqual(filterJournalPosts([], { year: '2025', query: 'fixture' }), []);
});

test('photo timeline includes every image reference in entry order and excludes videos and text-only entries', () => {
  const first: PostMedia = { type: 'image', path: '/api/media/first.jpg', alt: 'First fixture photo' };
  const second: PostMedia = { type: 'image', path: '/api/media/second.jpg', alt: '' };
  const video: PostMedia = { type: 'video', path: '/api/media/video.mp4', alt: 'Fixture video' };
  const newest = entry('newest', '2025-01-01', { media: [video, first, second, first] });
  const older = entry('older', '2024-01-01', { media: [second] });
  const posts = [newest, entry('text-only', '2024-12-01'), entry('video-only', '2024-11-01', { media: [video] }), older];
  assert.deepEqual(getJournalPhotoGroups(posts), [{ post: newest, photos: [first, second, first] }, { post: older, photos: [second] }]);
  assert.deepEqual(newest.media, [video, first, second, first]);
  assert.deepEqual(getJournalPhotoGroups([]), []);
});
