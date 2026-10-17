import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { Check, Copy, ChevronLeft, Share2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Split, { ContentStatus, SplitLayout } from './designs/Split';
import { formatDate } from './content';
import { useContent } from './content-provider';
import { Arrow } from './components/Icons';

function ScrollAndTitle() {
  const { pathname, hash } = useLocation();
  const content = useContent();
  const path = pathname.replace(/^\/split(?=\/|$)/, '').replace(/\/+$/, '') || '/';
  const isArticle = path.startsWith('/post/');
  let slug: string | undefined;
  try { slug = isArticle ? decodeURIComponent(path.slice('/post/'.length)) : undefined; } catch { /* Malformed paths use the not-found title. */ }
  const post = content.status === 'ready' ? content.posts.find(item => item.slug === slug) : undefined;

  useEffect(() => {
    const page = post?.title ?? (path === '/training' ? 'Training' : path === '/journal' ? 'Journal' : path === '/' ? ''
      : isArticle && content.status === 'loading' ? 'Loading entry' : isArticle && content.status === 'error' ? 'Writing unavailable' : 'Page not found');
    document.title = `${page ? `${page} · ` : ''}Luke Edwards Fitness`;
    const graphite = path === '/journal' || post?.kind === 'journey' || (isArticle && content.status !== 'ready');
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', graphite ? '#161616' : '#f2f2ee');
  }, [path, isArticle, post, content.status]);

  useEffect(() => {
    if (!hash) window.scrollTo(0, 0);
  }, [pathname, hash]);

  useEffect(() => {
    if (!hash) return;
    let cancelled = false;
    void document.fonts.ready.then(() => {
      if (!cancelled) requestAnimationFrame(() => {
        if (!cancelled) document.getElementById(hash.slice(1))?.scrollIntoView();
      });
    });
    return () => { cancelled = true; };
  }, [pathname, hash, content.status]);
  return null;
}

function LegacySplitRedirect() {
  const { pathname, search, hash } = useLocation();
  const path = pathname.replace(/^\/split(?=\/|$)/, '').replace(/\/+$/, '') || '/';
  return <Navigate to={`${path}${search}${hash}`} replace/>;
}

function ReadingProgress() {
  const bar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      bar.current?.style.setProperty('--progress', String(max > 0 ? Math.min(1, window.scrollY / max) : 0));
    };
    const onChange = () => { if (!frame) frame = requestAnimationFrame(update); };
    const resize = new ResizeObserver(onChange);
    resize.observe(document.body);
    update();
    window.addEventListener('scroll', onChange, { passive: true });
    window.addEventListener('resize', onChange);
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      window.removeEventListener('scroll', onChange);
      window.removeEventListener('resize', onChange);
    };
  }, []);
  return <div className="reading-progress" ref={bar} aria-hidden="true"/>;
}

function Article() {
  const { slug } = useParams();
  const content = useContent();
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  useEffect(() => setCopyState('idle'), [slug]);

  if (content.status !== 'ready') return <SplitLayout section="journal"><ContentStatus entry/></SplitLayout>;
  const post = content.posts.find(item => item.slug === slug);
  if (!post) return <NotFound/>;

  const isAdvice = post.kind === 'advice';
  const series = isAdvice ? content.advice : content.journey;
  const position = series.findIndex(item => item.slug === post.slug);
  const earlier = series[position + 1];
  const later = series[position - 1];
  const entryNumber = String(post.sequence ?? series.length - position).padStart(2, '0');
  const crossover = (isAdvice ? content.journey : content.advice).slice(0, 2);
  const back = isAdvice ? '/training' : '/journal';
  const canShare = typeof navigator.share === 'function';

  async function shareLink() {
    if (canShare) {
      try { await navigator.share({ title: post!.title, url: window.location.href }); return; }
      catch (error) { if ((error as DOMException).name === 'AbortError') return; }
    }
    try { await navigator.clipboard.writeText(window.location.href); setCopyState('copied'); }
    catch { setCopyState('failed'); }
  }

  return <div className="reading reading-split">
    <ReadingProgress/>
    <header className="reading-header">
      <Link className="reading-brand" to="/">Luke Edwards</Link>
      <Link className="reading-back" to={back}><ChevronLeft size={16}/> {isAdvice ? 'Training & advice' : 'The journal'}</Link>
    </header>
    <main id="main-content">
      <article className="reading-article">
        <div className="reading-meta">
          <span>{isAdvice ? post.category : `Entry No. ${entryNumber} · ${post.category}`}</span>
          <span><time dateTime={post.date}>{formatDate(post.date)}</time> · {post.readTime} min read</span>
        </div>
        <h1>{post.title}</h1>
        {post.excerpt && <p className="reading-deck">{post.excerpt}</p>}
        <div className="reading-author">
          <span>By Luke Edwards · Certified personal trainer</span>
          <button type="button" onClick={shareLink}>
            {copyState === 'copied' ? <Check size={16}/> : canShare ? <Share2 size={16}/> : <Copy size={16}/>}
            <span aria-live="polite">{copyState === 'copied' ? 'Link copied' : copyState === 'failed' ? 'Copy unavailable' : canShare ? 'Share' : 'Copy link'}</span>
          </button>
        </div>
        {post.sample && <div className="reading-sample">Sample {isAdvice ? 'training article' : 'journal entry'}. This is illustrative writing.</div>}
        {post.markdown.trim() && <div className="reading-text reading-markdown">
          <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml components={{
            h1: ({ children }) => <h2>{children}</h2>,
            img: ({ src, alt }) => <img src={src} alt={alt ?? ''} loading="lazy" decoding="async"/>,
            table: ({ children }) => <div className="workout-table-wrap"><table>{children}</table></div>,
          }}>{post.markdown}</ReactMarkdown>
        </div>}
        {post.media.length > 0 && <div className="reading-gallery" aria-label="Entry photos and videos">
          {post.media.map((media, index) => <figure key={`${media.path}-${index}`}>
            {media.type === 'image'
              ? <img src={media.path} alt={media.alt} loading="lazy" decoding="async"/>
              : <video src={media.path} controls preload="metadata" playsInline aria-label={media.alt}>
                <a href={media.path}>Download the video</a>
              </video>}
            {media.alt && <figcaption>{media.alt}</figcaption>}
          </figure>)}
        </div>}
        {(earlier || later) && <nav className="reading-pager" aria-label={isAdvice ? 'More articles' : 'More journal entries'}>
          {earlier ? <Link to={`/post/${encodeURIComponent(earlier.slug)}`} className="reading-pager-earlier">
            <span><ChevronLeft size={14}/> {isAdvice ? 'Previous article' : 'Earlier entry'}</span>
            <strong>{earlier.title}</strong>
          </Link> : <span/>}
          {later && <Link to={`/post/${encodeURIComponent(later.slug)}`} className="reading-pager-later">
            <span>{isAdvice ? 'Next article' : 'Later entry'} <Arrow width="14" height="14"/></span>
            <strong>{later.title}</strong>
          </Link>}
        </nav>}
      </article>
      {crossover.length > 0 && <section className="reading-related" aria-labelledby="reading-related-title">
        <h2 id="reading-related-title">{isAdvice ? 'Meanwhile, in the journal.' : 'From the training library.'}</h2>
        <div>{crossover.map(item => <Link key={item.slug} to={`/post/${encodeURIComponent(item.slug)}`}>
          <span>{item.category} · {item.readTime} min</span>
          <h3>{item.title}</h3>
        </Link>)}</div>
      </section>}
    </main>
    <footer className="reading-footer"><span>Luke Edwards Fitness</span><span>{post.sample ? 'Sample writing' : 'Training & journal'}</span></footer>
  </div>;
}

function NotFound() {
  return <main id="main-content" className="not-found">
    <h1>This page is taking a rest day.</h1>
    <p>That page or entry could not be found.</p>
    <Link to="/">Back to home <Arrow/></Link>
  </main>;
}

export default function App() {
  return <>
    <a className="skip-link" href="#main-content">Skip to content</a>
    <ScrollAndTitle/>
    <Routes>
      <Route path="/" element={<Split/>}/>
      <Route path="/training" element={<Split section="training"/>}/>
      <Route path="/journal" element={<Split section="journal"/>}/>
      <Route path="/post/:slug" element={<Article/>}/>
      <Route path="/split" element={<LegacySplitRedirect/>}/>
      <Route path="/split/training" element={<LegacySplitRedirect/>}/>
      <Route path="/split/journal" element={<LegacySplitRedirect/>}/>
      <Route path="/split/post/:slug" element={<LegacySplitRedirect/>}/>
      <Route path="*" element={<NotFound/>}/>
    </Routes>
  </>;
}
