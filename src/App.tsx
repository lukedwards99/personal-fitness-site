import { useEffect, useRef, useState } from 'react';
import { Link, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { Check, Copy, LayoutGrid, ChevronLeft, Share2 } from 'lucide-react';
import Editorial from './designs/Editorial';
import Split from './designs/Split';
import Logbook from './designs/Logbook';
import { posts, advice, journey, formatDate } from './content';
import type { Post } from './content';
import { Arrow, Mark } from './components/Icons';

const designs = [
  {id:'editorial', name:'The Editorial', short:'Editorial', tone:'Warm. Confident. Considered.', description:'An independent training publication. Bold type, chalk paper, and a story worth opening.', color:'#bd402b', theme:'#f6f3ec'},
  {id:'split', name:'The Split', short:'Split', tone:'Two sides. Nothing extra.', description:'Training and the journal as two clear doors. Pick one and go.', color:'#161616', theme:'#f2f2ee'},
  {id:'logbook', name:'The Logbook', short:'Logbook', tone:'Quiet. Typed. Searchable.', description:'A text-first index of every article and entry, one tap between training and the journal.', color:'#2b4fd8', theme:'#f7f5f0'},
];

// Where each design keeps its two main sections. Editorial is one long page; the others give each section its own URL.
function sectionHref(design: string, kind: Post['kind']) {
  if(design === 'editorial') return `/editorial#${kind === 'advice' ? 'training' : 'journey'}`;
  return `/${design}/${kind === 'advice' ? 'training' : 'journal'}`;
}

function ScrollAndTitle() {
  const {pathname,hash} = useLocation();
  useEffect(() => {
    const design = designs.find(d=>pathname.startsWith(`/${d.id}`));
    const slug = pathname.split('/post/')[1];
    const post = posts.find(p=>p.slug===slug);
    document.title = `${post ? `${post.title} · ` : ''}${design?.name ?? 'Three Design Directions'} · Luke Edwards Fitness`;
    // The Split's journal half (section page and entries) is graphite, so the browser chrome follows it.
    const graphite = design?.id === 'split' && (pathname.startsWith('/split/journal') || post?.kind === 'journey');
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', graphite ? '#161616' : design?.theme ?? '#f2f0e9');
    // Wait for web fonts so condensed headlines don't shift the target after the jump.
    if(hash) document.fonts.ready.then(()=>requestAnimationFrame(()=>document.getElementById(hash.slice(1))?.scrollIntoView()));
    else window.scrollTo(0,0);
  },[pathname,hash]);
  return null;
}

function Switcher() {
  const { pathname } = useLocation();
  const [hidden,setHidden] = useState(false);
  useEffect(() => {
    // Tuck the review switcher away while scrolling down so it never sits on top of reading; bring it back on any upward scroll or at the page end.
    let last = window.scrollY, frame = 0;
    const update = () => {
      frame = 0;
      const y = window.scrollY;
      if(Math.abs(y-last) < 6) return;
      const atEnd = y + window.innerHeight >= document.documentElement.scrollHeight - 48;
      setHidden(y > last && y > 160 && !atEnd);
      last = y;
    };
    const onScroll = () => { if(!frame) frame = requestAnimationFrame(update); };
    setHidden(false);
    window.addEventListener('scroll',onScroll,{passive:true});
    return () => { cancelAnimationFrame(frame); window.removeEventListener('scroll',onScroll); };
  },[pathname]);
  if(pathname === '/') return null;
  const suffix = pathname.includes('/post/') ? `/post/${pathname.split('/post/')[1]}` : '';
  const kind: Post['kind'] | null = suffix ? null : /\/training\/?$/.test(pathname) ? 'advice' : /\/journal\/?$/.test(pathname) ? 'journey' : null;
  const target = (id: string) => suffix ? `/${id}${suffix}` : kind ? sectionHref(id, kind) : `/${id}`;
  return <nav className="design-switcher" data-hidden={hidden || undefined} aria-label="Compare site designs"><Link to="/" title="All designs" aria-label="All designs"><LayoutGrid size={15}/></Link><span aria-hidden="true"/>{designs.map(d=><Link to={target(d.id)} key={d.id} aria-current={pathname.startsWith(`/${d.id}`)?'page':undefined}>{d.short}</Link>)}</nav>;
}

function Gallery() {
  return <div className="gallery"><header className="gallery-header"><Link to="/" className="gallery-brand"><Mark/><span>LUKE EDWARDS <small>FITNESS & BODYBUILDING</small></span></Link><span>THREE DIRECTIONS. ONE JOURNEY.</span></header><main id="main-content" className="gallery-main"><div className="gallery-intro"><h1>Find the right<br/>kind of <em>strong.</em></h1><div><p>A home for practical training advice<br/>and the story behind the training.</p><p className="gallery-note">Three working designs to explore.<br/>Same purpose. A different point of view.</p></div></div><div className="gallery-designs">{designs.map(d=><Link className={`gallery-design gallery-${d.id}`} to={`/${d.id}`} key={d.id}><div className="gallery-mini" aria-hidden="true"><div className="mini-masthead">{d.id==='editorial'?'LUKE EDWARDS':'Luke Edwards'}<span>{d.id==='editorial'?'TRAINING / JOURNAL':'Training   Journal'}</span></div>{d.id==='editorial'?<div className="mini-ed"><div><strong>GOOD<br/>THINGS<br/>TAKE <em>REPS.</em></strong><span>Practical training.<br/>An honest journey.</span><b>Put it into practice ↗</b></div><img src="/images/athlete-editorial.webp" alt=""/></div>:d.id==='split'?<div className="mini-split"><div><strong>Training</strong><span>Workouts and advice →</span></div><div><strong>Journal</strong><span>The bodybuilding log →</span></div></div>:<div className="mini-log"><div className="mini-log-tabs"><b>Training</b><span>Journal</span></div>{posts.filter(p=>p.kind==='advice').slice(0,4).map(p=><p key={p.slug}><time>{formatDate(p.date,true)}</time><span>{p.title}</span></p>)}</div>}</div><div className="gallery-card-title"><h2>{d.name}</h2><Arrow diagonal/></div><p className="gallery-tone">{d.tone}</p><p className="gallery-description">{d.description}</p><span className="gallery-open">Explore this design <Arrow/></span></Link>)}</div><p className="gallery-disclosure">Each direction includes a training library, a searchable journal, and individual articles.<br/>Original demonstration content and stock photography are used throughout.</p></main><footer className="gallery-footer"><span>Luke Edwards · Certified personal trainer</span><span>LOCAL DESIGN EXPLORATION · OCTOBER 2026</span></footer></div>;
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
  const { design = 'editorial', slug } = useParams();
  const [remotePost,setRemotePost] = useState<Post | null>(null);
  const [copyState,setCopyState] = useState<'idle'|'copied'|'failed'>('idle');
  const post = remotePost?.slug === slug ? remotePost : posts.find(p=>p.slug===slug);
  const definition = designs.find(d=>d.id===design);
  useEffect(()=>{
    const controller = new AbortController();
    setRemotePost(null); setCopyState('idle');
    fetch(`/api/posts/${slug}`,{signal:controller.signal}).then(r=>r.ok?r.json() as Promise<{post: Post}>:null).then(data=>{if(data?.post) setRemotePost(data.post);}).catch(()=>{});
    return ()=>controller.abort();
  },[slug]);
  if(!post || !definition) return <NotFound/>;
  const isAdvice = post.kind === 'advice';
  const series = isAdvice ? advice : journey;
  const position = series.findIndex(p=>p.slug===post.slug);
  const earlier = series[position+1], later = series[position-1];
  const entryNumber = String(series.length - position).padStart(2,'0');
  const crossover = (isAdvice ? journey : advice).slice(0,2);
  const back = sectionHref(design, post.kind);
  const canShare = typeof navigator.share === 'function';
  async function shareLink() {
    if(canShare) {
      try { await navigator.share({title:post!.title, url:window.location.href}); return; }
      catch(error) { if((error as DOMException).name === 'AbortError') return; }
    }
    try { await navigator.clipboard.writeText(window.location.href); setCopyState('copied'); } catch { setCopyState('failed'); }
  }
  return <div className={`reading reading-${design}`}><ReadingProgress/><header className="reading-header"><Link className="reading-brand" to={`/${design}`}><Mark/><span>Luke Edwards <small>FITNESS & BODYBUILDING</small></span></Link><Link className="reading-back" to={back}><ChevronLeft size={16}/> {isAdvice?'Training & advice':'The journal'}</Link></header><main id="main-content"><article className="reading-article"><nav className="reading-breadcrumb" aria-label="Breadcrumb"><Link to={`/${design}`}>Home</Link><span aria-hidden="true">/</span><Link to={back}>{isAdvice?'Training & advice':'My journey'}</Link></nav><div className="reading-meta"><span>{isAdvice ? post.category : `Entry No. ${entryNumber} · ${post.category}`}</span><span><time dateTime={post.date}>{formatDate(post.date)}</time> · {post.readTime} min read</span></div><h1>{post.title}</h1><p className="reading-deck">{post.excerpt}</p><div className="reading-author"><span>By Luke Edwards · Certified personal trainer</span><button type="button" onClick={shareLink}>{copyState==='copied'?<Check size={16}/>:canShare?<Share2 size={16}/>:<Copy size={16}/>} <span aria-live="polite">{copyState==='copied'?'Link copied':copyState==='failed'?'Copy unavailable':canShare?'Share':'Copy link'}</span></button></div><div className="reading-sample">Sample {isAdvice?'training article':'journal entry'} for design review. {isAdvice?'Replace with your own published advice.':'This is illustrative writing, not a record of Luke’s training.'}</div><figure className="reading-image"><img src={post.image} alt={post.image.includes('athlete')?'Stock athlete training on a pull-up bar':'Stock photograph of gym training and equipment'}/><figcaption>Stock photography · People pictured are not Luke.</figcaption></figure><div className="reading-text">{post.body.map((part,i)=><section key={part.heading}><span className="reading-section-number" aria-hidden="true">{String(i+1).padStart(2,'0')}</span><h2>{part.heading}</h2><p>{part.text}</p>{post.workout && i===1 && <div className="reading-workout"><div className="reading-workout-head"><h3>{post.workoutTitle ?? 'Sample session'}</h3><span>{post.workout.length} exercises · {post.workout.reduce((total,row)=>total+Number(row.sets),0)} working sets</span></div><div className="workout-table-wrap"><table><thead><tr><th scope="col">Exercise</th><th scope="col">Sets</th><th scope="col">Reps</th></tr></thead><tbody>{post.workout.map((row,n)=><tr key={row.exercise}><th scope="row"><span aria-hidden="true">{String(n+1).padStart(2,'0')}</span>{row.exercise}</th><td>{row.sets}</td><td>{row.reps}</td></tr>)}</tbody></table></div><p>Adjust this example to your experience, equipment, and available time.</p></div>}</section>)}</div><div className="reading-end"><Mark/><p>The work continues.</p><Link to={back}>Back to {isAdvice?'training & advice':'the journal'} <Arrow/></Link></div>{(earlier || later) && <nav className="reading-pager" aria-label={isAdvice?'More articles':'More journal entries'}>{earlier ? <Link to={`/${design}/post/${earlier.slug}`} className="reading-pager-earlier"><span><ChevronLeft size={14}/> {isAdvice?'Previous article':'Earlier entry'}</span><strong>{earlier.title}</strong></Link> : <span/>}{later && <Link to={`/${design}/post/${later.slug}`} className="reading-pager-later"><span>{isAdvice?'Next article':'Later entry'} <Arrow width="14" height="14"/></span><strong>{later.title}</strong></Link>}</nav>}</article><section className="reading-related" aria-labelledby="reading-related-title"><h2 id="reading-related-title">{isAdvice?'Meanwhile, in the journal.':'From the training library.'}</h2><div>{crossover.map(p=><Link key={p.slug} to={`/${design}/post/${p.slug}`}><img src={p.image} alt="" loading="lazy"/><span>{p.category} · {p.readTime} min</span><h3>{p.title}</h3><Arrow diagonal/></Link>)}</div></section></main><footer className="reading-footer"><span>Luke Edwards Fitness</span><span>Sample posts · Stock photography</span></footer></div>;
}

function NotFound() { return <main id="main-content" className="not-found"><Mark/><h1>This page is taking a rest day.</h1><p>That entry or design could not be found.</p><Link to="/">Explore the three designs <Arrow/></Link></main>; }

export default function App() { return <><a className="skip-link" href="#main-content">Skip to content</a><ScrollAndTitle/><Routes><Route path="/" element={<Gallery/>}/><Route path="/editorial" element={<Editorial/>}/><Route path="/split/:section?" element={<Split/>}/><Route path="/logbook/:section?" element={<Logbook/>}/><Route path="/:design/post/:slug" element={<Article/>}/><Route path="*" element={<NotFound/>}/></Routes><Switcher/></>; }
