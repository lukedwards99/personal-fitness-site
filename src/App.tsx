import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { Check, Copy, ChevronLeft, Share2 } from 'lucide-react';
import Split from './designs/Split';
import { posts, advice, journey, formatDate } from './content';
import type { Post } from './content';
import { Arrow } from './components/Icons';

function ScrollAndTitle() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    const path = pathname.replace(/\/+$/, '') || '/';
    const slug = path.startsWith('/post/') ? path.slice('/post/'.length) : undefined;
    const post = posts.find(p => p.slug === slug);
    const page = post?.title ?? (path === '/training' ? 'Training' : path === '/journal' ? 'Journal' : path === '/' ? '' : 'Page not found');
    document.title = `${page ? `${page} · ` : ''}Luke Edwards Fitness`;
    const graphite = path === '/journal' || post?.kind === 'journey';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', graphite ? '#161616' : '#f2f2ee');
    let cancelled = false;
    if (hash) document.fonts.ready.then(() => {
      if (!cancelled) requestAnimationFrame(() => {
        if (!cancelled) document.getElementById(hash.slice(1))?.scrollIntoView();
      });
    });
    else window.scrollTo(0, 0);
    return () => { cancelled = true; };
  }, [pathname, hash]);
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
    const onScroll = () => { if(!frame) frame = requestAnimationFrame(update); };
    update();
    window.addEventListener('scroll',onScroll,{passive:true});
    window.addEventListener('resize',onScroll);
    return () => { cancelAnimationFrame(frame); window.removeEventListener('scroll',onScroll); window.removeEventListener('resize',onScroll); };
  },[]);
  return <div className="reading-progress" ref={bar} aria-hidden="true"/>;
}

function Article() {
  const { slug } = useParams();
  const [remotePost,setRemotePost] = useState<Post | null>(null);
  const [copyState,setCopyState] = useState<'idle'|'copied'|'failed'>('idle');
  const post = remotePost?.slug === slug ? remotePost : posts.find(p=>p.slug===slug);
  useEffect(()=>{
    const controller = new AbortController();
    setRemotePost(null); setCopyState('idle');
    fetch(`/api/posts/${encodeURIComponent(slug ?? '')}`,{signal:controller.signal}).then(r=>r.ok?r.json() as Promise<{post: Post}>:null).then(data=>{if(data?.post) setRemotePost(data.post);}).catch(()=>{});
    return ()=>controller.abort();
  },[slug]);
  useEffect(() => {
    if (!post) return;
    document.title = `${post.title} · Luke Edwards Fitness`;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', post.kind === 'journey' ? '#161616' : '#f2f2ee');
  }, [post]);
  if(!post) return <NotFound/>;
  const isAdvice = post.kind === 'advice';
  const series = isAdvice ? advice : journey;
  const position = series.findIndex(p=>p.slug===post.slug);
  const earlier = series[position+1], later = series[position-1];
  const entryNumber = String(series.length - position).padStart(2,'0');
  const crossover = (isAdvice ? journey : advice).slice(0,2);
  const back = isAdvice ? '/training' : '/journal';
  const canShare = typeof navigator.share === 'function';
  async function shareLink() {
    if(canShare) {
      try { await navigator.share({title:post!.title, url:window.location.href}); return; }
      catch(error) { if((error as DOMException).name === 'AbortError') return; }
    }
    try { await navigator.clipboard.writeText(window.location.href); setCopyState('copied'); } catch { setCopyState('failed'); }
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
        <p className="reading-deck">{post.excerpt}</p>
        <div className="reading-author">
          <span>By Luke Edwards · Certified personal trainer</span>
          <button type="button" onClick={shareLink}>
            {copyState === 'copied' ? <Check size={16}/> : canShare ? <Share2 size={16}/> : <Copy size={16}/>}
            <span aria-live="polite">{copyState === 'copied' ? 'Link copied' : copyState === 'failed' ? 'Copy unavailable' : canShare ? 'Share' : 'Copy link'}</span>
          </button>
        </div>
        <div className="reading-sample">Sample {isAdvice ? 'training article' : 'journal entry'}. {isAdvice ? 'Illustrative advice, supplied as an example.' : 'This is illustrative writing, not a record of Luke’s training.'}</div>
        <figure className="reading-image">
          <img src={post.image} alt={post.image.includes('athlete') ? 'Stock athlete training on a pull-up bar' : 'Stock photograph of gym training and equipment'}/>
          <figcaption>Stock photography · People pictured are not Luke.</figcaption>
        </figure>
        <div className="reading-text">
          {post.body.map((part, i) => <section key={part.heading}>
            <h2>{part.heading}</h2>
            <p>{part.text}</p>
            {post.workout && i === 1 && <div className="reading-workout">
              <div className="reading-workout-head">
                <h3>{post.workoutTitle ?? 'Sample session'}</h3>
                <span>{post.workout.length} exercises · {post.workout.reduce((total, row) => total + Number(row.sets), 0)} working sets</span>
              </div>
              <div className="workout-table-wrap">
                <table>
                  <thead><tr><th scope="col">Exercise</th><th scope="col">Sets</th><th scope="col">Reps</th></tr></thead>
                  <tbody>{post.workout.map((row, n) => <tr key={row.exercise}>
                    <th scope="row"><span aria-hidden="true">{String(n + 1).padStart(2, '0')}</span>{row.exercise}</th>
                    <td>{row.sets}</td><td>{row.reps}</td>
                  </tr>)}</tbody>
                </table>
              </div>
              <p>Adjust this example to your experience, equipment, and available time.</p>
            </div>}
          </section>)}
        </div>
        {(earlier || later) && <nav className="reading-pager" aria-label={isAdvice ? 'More articles' : 'More journal entries'}>
          {earlier ? <Link to={`/post/${earlier.slug}`} className="reading-pager-earlier">
            <span><ChevronLeft size={14}/> {isAdvice ? 'Previous article' : 'Earlier entry'}</span>
            <strong>{earlier.title}</strong>
          </Link> : <span/>}
          {later && <Link to={`/post/${later.slug}`} className="reading-pager-later">
            <span>{isAdvice ? 'Next article' : 'Later entry'} <Arrow width="14" height="14"/></span>
            <strong>{later.title}</strong>
          </Link>}
        </nav>}
      </article>
      <section className="reading-related" aria-labelledby="reading-related-title">
        <h2 id="reading-related-title">{isAdvice ? 'Meanwhile, in the journal.' : 'From the training library.'}</h2>
        <div>{crossover.map(p => <Link key={p.slug} to={`/post/${p.slug}`}>
          <span>{p.category} · {p.readTime} min</span>
          <h3>{p.title}</h3>
        </Link>)}</div>
      </section>
    </main>
    <footer className="reading-footer"><span>Luke Edwards Fitness</span><span>Sample posts · Stock photography</span></footer>
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
