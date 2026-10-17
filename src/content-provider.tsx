import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { parseCatalog, sortPosts } from './content';
import type { ContentCatalog, Post } from './content';

type LoadState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; catalog: ContentCatalog; version: string };

type ContentState = (
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; posts: Post[]; advice: Post[]; journey: Post[]; version: string }
) & { retry: () => void };

const ContentContext = createContext<ContentState | null>(null);

export function ContentProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt(value => value + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    const timeout = window.setTimeout(() => controller.abort(), 20_000);
    setState({ status: 'loading' });

    async function load() {
      try {
        const response = await fetch('/api/posts', { signal: controller.signal, headers: { Accept: 'application/json' } });
        if (!response.ok) throw new Error('Content request failed.');
        const data: unknown = await response.json();
        if (!data || typeof data !== 'object' || !('posts' in data) || !('updatedAt' in data)) {
          throw new Error('Content response is incomplete.');
        }
        const catalog = parseCatalog({ schemaVersion: 1, updatedAt: data.updatedAt, posts: data.posts });
        const version = 'version' in data && typeof data.version === 'string' ? data.version : catalog.updatedAt;
        if (!cancelled) setState({ status: 'ready', catalog, version });
      } catch {
        if (!cancelled) setState({ status: 'error' });
      } finally {
        window.clearTimeout(timeout);
      }
    }

    void load();
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [attempt]);

  const value = useMemo<ContentState>(() => {
    if (state.status !== 'ready') return { status: state.status, retry };
    const posts = sortPosts(state.catalog.posts);
    return {
      status: 'ready',
      posts,
      advice: posts.filter(post => post.kind === 'advice'),
      journey: posts.filter(post => post.kind === 'journey'),
      version: state.version,
      retry,
    };
  }, [state, retry]);

  return <ContentContext.Provider value={value}>{children}</ContentContext.Provider>;
}

export function useContent() {
  const content = useContext(ContentContext);
  if (!content) throw new Error('useContent must be used within ContentProvider.');
  return content;
}
