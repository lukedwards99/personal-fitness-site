import { useRef } from 'react';
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom';
import { advice, journey } from '../content';
import type { Post } from '../content';
import './logbook.css';

type SectionId = 'training' | 'journal';
type Section = { label: string; posts: Post[]; one: string; many: string; latest: string; all: string; placeholder: string };

const SECTIONS: Record<SectionId, Section> = {
  training: { label: 'Training', posts: advice, one: 'article', many: 'articles', latest: 'Latest training', all: 'All training', placeholder: 'Titles, topics, exercises' },
  journal: { label: 'Journal', posts: journey, one: 'entry', many: 'entries', latest: 'Latest journal entries', all: 'All journal entries', placeholder: 'Titles, themes, notes' },
};
const ORDER: SectionId[] = ['training', 'journal'];
const isSection = (value: string | undefined): value is SectionId => ORDER.includes(value as SectionId);

const fmt = (date: string, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-US', { ...options, timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`));
const shortDate = (date: string) => fmt(date, { month: 'short', day: '2-digit' });
const pad = (n: number) => String(n).padStart(2, '0');
const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const url = (post: Post) => `/logbook/post/${post.slug}`;

// Search covers everything a reader can see on the article page: title, summary, category, body and workout.
const normalize = (text: string) => text.toLowerCase().replace(/[’‘]/g, "'");
const index = new Map([...advice, ...journey].map(p => [p.slug, normalize([p.title, p.excerpt, p.category, p.workoutTitle ?? '', ...p.body.flatMap(s => [s.heading, s.text]), ...(p.workout ?? []).map(w => w.exercise)].join(' '))]));
const matches = (post: Post, terms: string[]) => terms.every(t => index.get(post.slug)?.includes(t));

function byMonth(posts: Post[]) {
  return posts.reduce<{ key: string; label: string; posts: Post[] }[]>((groups, post) => {
    const key = post.date.slice(0, 7);
    const group = groups.find(g => g.key === key);
    if (group) group.posts.push(post); else groups.push({ key, label: fmt(post.date, { month: 'long', year: 'numeric' }), posts: [post] });
    return groups;
  }, []);
}

export default function Logbook() {
  const { section } = useParams();
  if (section !== undefined && !isSection(section)) return <Navigate to="/logbook" replace/>;
  const current = section;
  return <div className="logbook">
    <header className="lb-masthead lb-wrap">
      {current ? <p className="lb-name"><Link to="/logbook">Luke Edwards</Link></p> : <h1 className="lb-name">Luke Edwards</h1>}
      <p className="lb-intro">Training advice and a bodybuilding journal from a certified personal trainer.</p>
    </header>
    <nav className="lb-switch" aria-label="Sections">
      <div className="lb-wrap lb-switch-in">{ORDER.map(id => <Link key={id} to={`/logbook/${id}`} aria-current={current === id ? 'page' : undefined}>
        <span className="lb-switch-label">{SECTIONS[id].label}</span>
        <span className="lb-count" aria-hidden="true">{pad(SECTIONS[id].posts.length)}</span>
      </Link>)}</div>
    </nav>
    <main id="main-content" className="lb-wrap">{current ? <SectionView key={current} id={current}/> : <Home/>}</main>
    <footer className="lb-wrap lb-footer"><p>Sample writing for design review. Not a record of Luke’s training.</p></footer>
  </div>;
}

function Row({ post, excerpt = false }: { post: Post; excerpt?: boolean }) {
  return <li className="lb-row">
    <time className="lb-date" dateTime={post.date}>{shortDate(post.date)}</time>
    <h3 className="lb-title"><Link to={url(post)}>{post.title}</Link></h3>
    {excerpt && <p className="lb-excerpt">{post.excerpt}</p>}
    <p className="lb-meta"><span>{post.category}</span><span className="lb-mono">{post.readTime} min</span></p>
  </li>;
}

function Home() {
  return <div className="lb-home">{ORDER.map(id => {
    const s = SECTIONS[id];
    return <section key={id} className="lb-col" aria-labelledby={`lb-latest-${id}`}>
      <h2 id={`lb-latest-${id}`} className="lb-label">{s.latest}</h2>
      <ol className="lb-rows">{s.posts.slice(0, 4).map(p => <Row key={p.slug} post={p}/>)}</ol>
      <Link className="lb-all" to={`/logbook/${id}`}>{s.all}<span aria-hidden="true">→</span></Link>
    </section>;
  })}</div>;
}

function SectionView({ id }: { id: SectionId }) {
  const s = SECTIONS[id];
  const other = ORDER.find(o => o !== id)!;
  const inputRef = useRef<HTMLInputElement>(null);
  // Search and filter live in the URL, so a result list survives opening an article and coming back.
  const [params, setParams] = useSearchParams();
  const query = params.get('q') ?? '';
  const categories = [...new Set(s.posts.map(p => p.category))];
  const category = categories.find(c => c === params.get('category')) ?? '';
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  const results = s.posts.filter(p => (!category || p.category === category) && matches(p, terms));
  const elsewhere = terms.length ? SECTIONS[other].posts.filter(p => matches(p, terms)).length : 0;
  const filtered = terms.length > 0 || category !== '';
  const shown = query.trim();

  const update = (next: Record<string, string>) => setParams(prev => {
    const p = new URLSearchParams(prev);
    Object.entries(next).forEach(([k, v]) => { if (v) p.set(k, v); else p.delete(k); });
    return p;
  }, { replace: true });
  const clearQuery = () => { update({ q: '' }); inputRef.current?.focus(); };
  const reset = () => { update({ q: '', category: '' }); inputRef.current?.focus(); };

  const scope = category ? ` in ${category}` : '';
  const quoted = shown ? ` ${results.length === 1 ? 'matches' : 'match'} “${shown}”` : '';
  const status = !filtered ? `${count(s.posts.length, s.one, s.many)}, newest first`
    : results.length ? `${results.length} of ${count(s.posts.length, s.one, s.many)}${scope}${quoted}`
    : `No ${s.many}${scope}${quoted}`;

  return <div className="lb-section">
    <h1 className="lb-sr">{s.label}</h1>
    <div className="lb-tools">
      <div className="lb-search">
        <label htmlFor="lb-search-input">Search</label>
        <input id="lb-search-input" ref={inputRef} type="search" value={query} placeholder={s.placeholder} autoComplete="off" autoCorrect="off" spellCheck={false} enterKeyHint="search" aria-describedby="lb-status" onChange={e => update({ q: e.target.value })} onKeyDown={e => { if (e.key === 'Escape' && query) { e.preventDefault(); update({ q: '' }); } }}/>
        {query && <button type="button" className="lb-clear" onClick={clearQuery} aria-label="Clear search">Clear</button>}
      </div>
      {categories.length > 1 && <div className="lb-filters" role="group" aria-label={`Filter ${s.many} by category`}>
        {['', ...categories].map(c => <button type="button" key={c || 'all'} aria-pressed={category === c} onClick={() => update({ category: c })}>{c || 'All'}</button>)}
      </div>}
      <p id="lb-status" className={results.length ? 'lb-status' : 'lb-status lb-sr'} aria-live="polite" aria-atomic="true">{status}</p>
    </div>
    {results.length > 0 ? byMonth(results).map(m => <section key={m.key} className="lb-month" aria-labelledby={`lb-month-${m.key}`}>
      <h2 id={`lb-month-${m.key}`} className="lb-label">{m.label}</h2>
      <ol className="lb-rows">{m.posts.map(p => <Row key={p.slug} post={p} excerpt/>)}</ol>
    </section>) : <div className="lb-empty">
      <h2>Nothing here matches {shown ? <>“{shown}”</> : 'that'}{scope}.</h2>
      <p>The search reads titles, summaries and the full text. Try a shorter word{category ? ', or look across every category' : ''}.</p>
      <div className="lb-empty-actions">
        <button type="button" onClick={reset}>Clear search{category ? ' and filter' : ''}</button>
        {elsewhere > 0 && <Link to={`/logbook/${other}?q=${encodeURIComponent(shown)}`}>{count(elsewhere, SECTIONS[other].one, SECTIONS[other].many)} in {SECTIONS[other].label}<span aria-hidden="true">→</span></Link>}
      </div>
    </div>}
  </div>;
}
