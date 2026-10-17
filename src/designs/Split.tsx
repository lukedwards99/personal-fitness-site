import { useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, NavLink, Navigate, useParams } from 'react-router-dom';
import { X } from 'lucide-react';
import { advice, journey, formatDate } from '../content';
import type { Post } from '../content';
import { Arrow } from '../components/Icons';
import './split.css';

// The Split: the site is two halves. Training lives on paper, the journal on graphite,
// from the home "doors" through each section page to the articles themselves.

const url = (post: Post) => `/split/post/${post.slug}`;
const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const ALL = 'All';
const CATEGORIES = [ALL, ...new Set(advice.map(p => p.category))];
const SEARCH_INDEX = journey.map(post => ({ post, text: [post.title, post.excerpt, post.category, ...post.body.flatMap(s => [s.heading, s.text])].join(' ').toLowerCase() }));

const SECTIONS = {
  training: { name: 'Training', line: 'Practical advice and workouts.', tone: 'light', latest: advice[0] },
  journal: { name: 'Journal', line: 'A bodybuilding journal, week by week.', tone: 'dark', latest: journey[0] },
} as const;
type SectionId = keyof typeof SECTIONS;

function Header() {
  return <header className="sp-header">
    <Link to="/split" className="sp-brand">Luke Edwards</Link>
    <nav className="sp-nav" aria-label="Sections">
      <NavLink to="/split/training">Training</NavLink>
      <NavLink to="/split/journal">Journal</NavLink>
    </nav>
  </header>;
}

function Footer() {
  return <footer className="sp-footer"><span>Luke Edwards · Certified personal trainer</span><span>Sample writing · Stock photos, not Luke.</span></footer>;
}

function Home() {
  return <div className="split sp-light sp-home">
    <Header/>
    <main id="main-content" className="sp-doors">
      <h1 className="sp-sr">Luke Edwards: training advice and a bodybuilding journal</h1>
      {(Object.keys(SECTIONS) as SectionId[]).map(id => {
        const s = SECTIONS[id];
        return <Link key={id} to={`/split/${id}`} className={`sp-door sp-${s.tone}`} aria-labelledby={`sp-door-${id}`} aria-describedby={`sp-door-${id}-line sp-door-${id}-latest`}>
          <span className="sp-door-head"><h2 className="sp-door-name" id={`sp-door-${id}`}>{s.name}</h2><Arrow className="sp-door-arrow" strokeWidth={1.25}/></span>
          <p className="sp-door-line" id={`sp-door-${id}-line`}>{s.line}</p>
          {s.latest && <p className="sp-door-latest" id={`sp-door-${id}-latest`}><span>Latest</span> <span>{s.latest.title}</span></p>}
        </Link>;
      })}
    </main>
    <Footer/>
  </div>;
}

function Row({ post, meta, aside }: { post: Post; meta: ReactNode; aside: string }) {
  return <li><Link className="sp-row" to={url(post)}>
    <span className="sp-row-meta">{meta}</span>
    <span className="sp-row-body"><h2 className="sp-row-title">{post.title}</h2><p className="sp-row-excerpt">{post.excerpt}</p></span>
    <span className="sp-row-aside">{aside}</span>
  </Link></li>;
}

function Intro({ id, note }: { id: SectionId; note: string }) {
  return <header className="sp-intro">
    <h1 className="sp-title">{SECTIONS[id].name}</h1>
    <div className="sp-intro-text"><p className="sp-lede">{SECTIONS[id].line}</p><p className="sp-note">{note}</p></div>
  </header>;
}

function Training() {
  const [category, setCategory] = useState(ALL);
  const list = category === ALL ? advice : advice.filter(p => p.category === category);
  const [lead, ...rest] = list;
  return <>
    <Intro id="training" note="Sample articles, written for design review."/>
    <div className="sp-filter" role="group" aria-label="Filter articles by category">
      {CATEGORIES.map(c => <button type="button" key={c} aria-pressed={category === c} onClick={() => setCategory(c)}>{c}</button>)}
    </div>
    <p className="sp-sr" aria-live="polite" aria-atomic="true">Showing {count(list.length, 'article')}{category === ALL ? '' : ` in ${category}`}.</p>
    {lead && <Link className="sp-lead" to={url(lead)}>
      <span className="sp-lead-media"><img src={lead.image} alt="" width="1600" height="1067"/><span className="sp-lead-credit">Stock photo</span></span>
      <span className="sp-lead-text">
        <span className="sp-lead-meta">Latest{category === ALL ? '' : ` in ${category}`} · {lead.readTime} min read</span>
        <h2 className="sp-lead-title">{lead.title}</h2>
        <p className="sp-lead-excerpt">{lead.excerpt}</p>
        <span className="sp-lead-more">Read the article <Arrow strokeWidth={1.4}/></span>
      </span>
    </Link>}
    {rest.length > 0 && <ol className="sp-list" aria-label={category === ALL ? 'More articles' : `More in ${category}`}>
      {rest.map(p => <Row key={p.slug} post={p} meta={p.category} aside={`${p.readTime} min`}/>)}
    </ol>}
  </>;
}

function Journal() {
  const [query, setQuery] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const search = query.trim();
  const terms = search.toLowerCase().split(/\s+/).filter(Boolean);
  const entries = terms.length ? SEARCH_INDEX.filter(e => terms.every(t => e.text.includes(t))).map(e => e.post) : journey;
  const status = !terms.length ? `${count(journey.length, 'entry', 'entries')}, newest first.`
    : entries.length ? `${count(entries.length, 'entry', 'entries')} of ${journey.length} match “${search}”.`
    : `No entries match “${search}”.`;
  const reset = () => { setQuery(''); input.current?.focus(); };
  return <>
    <Intro id="journal" note="Sample entries. Illustrative writing, not a record of Luke’s training."/>
    <div className="sp-search" role="search">
      <label htmlFor="sp-search-input">Search the journal</label>
      <div className="sp-search-field">
        <input id="sp-search-input" ref={input} type="search" value={query} placeholder="Titles, summaries, full entries" autoComplete="off" enterKeyHint="search" aria-describedby="sp-search-status"
          onChange={e => setQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Escape' && query) { e.preventDefault(); setQuery(''); } }}/>
        {query && <button type="button" className="sp-search-clear" aria-label="Clear search" onClick={reset}><X size={20} strokeWidth={1.5} aria-hidden="true"/></button>}
      </div>
      <p className="sp-search-status" id="sp-search-status" aria-live="polite" aria-atomic="true">{status}</p>
    </div>
    {entries.length > 0 ? <ol className="sp-list" aria-label="Journal entries">
      {entries.map(p => <Row key={p.slug} post={p} meta={<time dateTime={p.date}>{formatDate(p.date)}</time>} aside={`${p.readTime} min`}/>)}
    </ol> : <div className="sp-empty">
      <h2>Try a broader word.</h2>
      <p>Search looks through every title, summary and full entry. Single words such as “week” or “training” work best.</p>
      <button type="button" onClick={reset}>Show all entries <Arrow strokeWidth={1.4}/></button>
    </div>}
  </>;
}

export default function Split() {
  const { section } = useParams();
  if (section === undefined) return <Home/>;
  if (section !== 'training' && section !== 'journal') return <Navigate to="/split" replace/>;
  return <div className={`split sp-${SECTIONS[section].tone} sp-page sp-page-${section}`}>
    <Header/>
    <main id="main-content" className="sp-main">{section === 'training' ? <Training/> : <Journal key="journal"/>}</main>
    <Footer/>
  </div>;
}
