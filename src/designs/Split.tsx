import { useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { X } from 'lucide-react';
import { formatDate } from '../content';
import type { Post } from '../content';
import { useContent } from '../content-provider';
import { Arrow } from '../components/Icons';
import './split.css';

const url = (post: Post) => `/post/${encodeURIComponent(post.slug)}`;
const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const ALL = 'All';
const SECTIONS = {
  training: { name: 'Training', line: 'Practical advice and workouts.', tone: 'light' },
  journal: { name: 'Journal', line: 'A bodybuilding journal, week by week.', tone: 'dark' },
} as const;
type SectionId = keyof typeof SECTIONS;

function Header() {
  return <header className="sp-header">
    <Link to="/" className="sp-brand">Luke Edwards</Link>
    <nav className="sp-nav" aria-label="Sections">
      <NavLink to="/training">Training</NavLink>
      <NavLink to="/journal">Journal</NavLink>
    </nav>
  </header>;
}

function Footer() {
  return <footer className="sp-footer"><span>Luke Edwards · Certified personal trainer</span><span>Training & journal</span></footer>;
}

export function SplitLayout({ section, children }: { section: SectionId; children: ReactNode }) {
  return <div className={`split sp-${SECTIONS[section].tone} sp-page sp-page-${section}`}>
    <Header/>
    <main id="main-content" className="sp-main">{children}</main>
    <Footer/>
  </div>;
}

export function ContentStatus({ entry = false }: { entry?: boolean }) {
  const content = useContent();
  if (content.status === 'ready') return null;
  const Heading = entry ? 'h1' : 'h2';
  return <div className="sp-empty sp-status" role={content.status === 'loading' ? 'status' : undefined}>
    <Heading>{content.status === 'loading' ? `Loading the ${entry ? 'entry' : 'writing'}…` : 'The writing couldn’t be loaded.'}</Heading>
    {content.status === 'error' && <>
      <p>Please try again in a moment.</p>
      <button type="button" onClick={content.retry}>Try again <Arrow strokeWidth={1.4}/></button>
    </>}
  </div>;
}

function Home() {
  const content = useContent();
  return <div className="split sp-light sp-home">
    <Header/>
    <main id="main-content" className="sp-doors">
      <h1 className="sp-sr">Luke Edwards: training advice and a bodybuilding journal</h1>
      {(Object.keys(SECTIONS) as SectionId[]).map(id => {
        const section = SECTIONS[id];
        const latest = content.status === 'ready' ? (id === 'training' ? content.advice[0] : content.journey[0]) : undefined;
        return <Link key={id} to={`/${id}`} className={`sp-door sp-${section.tone}`} aria-labelledby={`sp-door-${id}`} aria-describedby={`sp-door-${id}-line${latest ? ` sp-door-${id}-latest` : ''}`}>
          <span className="sp-door-head"><h2 className="sp-door-name" id={`sp-door-${id}`}>{section.name}</h2><Arrow className="sp-door-arrow" strokeWidth={1.25}/></span>
          <p className="sp-door-line" id={`sp-door-${id}-line`}>{section.line}</p>
          {latest && <p className="sp-door-latest" id={`sp-door-${id}-latest`}><span>Latest</span><span>{latest.title}</span></p>}
        </Link>;
      })}
    </main>
    {content.status === 'error' && <div className="sp-home-status"><ContentStatus/></div>}
    <Footer/>
  </div>;
}

function Row({ post, meta, aside, preview = false }: { post: Post; meta: ReactNode; aside: string; preview?: boolean }) {
  const cover = preview ? post.media.find(item => item.type === 'image') : undefined;
  return <li><Link className={`sp-row${cover ? ' sp-row-with-preview' : ''}`} to={url(post)}>
    {cover && <span className="sp-row-preview"><img src={cover.path} alt="" loading="lazy" decoding="async" width={160} height={200}/></span>}
    <span className="sp-row-meta">{meta}</span>
    <span className="sp-row-body"><h2 className="sp-row-title">{post.title}</h2>{post.excerpt && <p className="sp-row-excerpt">{post.excerpt}</p>}</span>
    <span className="sp-row-aside">{aside}</span>
  </Link></li>;
}

function Intro({ id, note }: { id: SectionId; note?: string }) {
  return <header className="sp-intro">
    <h1 className="sp-title">{SECTIONS[id].name}</h1>
    <div className="sp-intro-text"><p className="sp-lede">{SECTIONS[id].line}</p>{note && <p className="sp-note">{note}</p>}</div>
  </header>;
}

function Training({ posts }: { posts: Post[] }) {
  const [category, setCategory] = useState(ALL);
  const categories = [ALL, ...new Set(posts.map(post => post.category))];
  const selected = categories.includes(category) ? category : ALL;
  const list = selected === ALL ? posts : posts.filter(post => post.category === selected);
  const [lead, ...rest] = list;
  const cover = lead?.media.find(item => item.type === 'image');

  if (!posts.length) return <div className="sp-empty">
    <h2>The library is taking shape.</h2>
    <p>Training advice and workouts will appear here when they’re published.</p>
    <Link to="/journal">Read the journal <Arrow strokeWidth={1.4}/></Link>
  </div>;

  return <>
    <div className="sp-filter" role="group" aria-label="Filter articles by category">
      {categories.map(item => <button type="button" key={item} aria-pressed={selected === item} onClick={() => setCategory(item)}>{item}</button>)}
    </div>
    <p className="sp-sr" aria-live="polite" aria-atomic="true">Showing {count(list.length, 'article')}{selected === ALL ? '' : ` in ${selected}`}.</p>
    {lead && <Link className={`sp-lead${cover ? '' : ' sp-lead-text-only'}`} to={url(lead)}>
      {cover && <span className="sp-lead-media"><img src={cover.path} alt={cover.alt} loading="lazy" decoding="async"/></span>}
      <span className="sp-lead-text">
        <span className="sp-lead-meta">Latest{selected === ALL ? '' : ` in ${selected}`} · {lead.readTime} min read</span>
        <h2 className="sp-lead-title">{lead.title}</h2>
        {lead.excerpt && <p className="sp-lead-excerpt">{lead.excerpt}</p>}
        <span className="sp-lead-more">Read the article <Arrow strokeWidth={1.4}/></span>
      </span>
    </Link>}
    {rest.length > 0 && <ol className="sp-list" aria-label={selected === ALL ? 'More articles' : `More in ${selected}`}>
      {rest.map(post => <Row key={post.slug} post={post} meta={post.category} aside={`${post.readTime} min`}/>)}
    </ol>}
  </>;
}

function Journal({ posts }: { posts: Post[] }) {
  const [query, setQuery] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const index = useMemo(() => posts.map(post => ({ post, text: [post.title, post.excerpt, post.category, post.markdown].join(' ').toLocaleLowerCase('en-US') })), [posts]);
  const search = query.trim();
  const terms = search.toLocaleLowerCase('en-US').split(/\s+/).filter(Boolean);
  const entries = terms.length ? index.filter(item => terms.every(term => item.text.includes(term))).map(item => item.post) : posts;
  const status = !terms.length ? `${count(posts.length, 'entry', 'entries')}, newest first.`
    : entries.length ? `${count(entries.length, 'entry', 'entries')} of ${posts.length} match “${search}”.`
    : `No entries match “${search}”.`;
  const reset = () => { setQuery(''); input.current?.focus(); };

  if (!posts.length) return <div className="sp-empty">
    <h2>The first entry is still to come.</h2>
    <p>There are no published journal entries yet.</p>
  </div>;

  return <>
    <div className="sp-search" role="search">
      <label htmlFor="sp-search-input">Search the journal</label>
      <div className="sp-search-field">
        <input id="sp-search-input" ref={input} type="search" value={query} placeholder="Titles, summaries, full entries" autoComplete="off" enterKeyHint="search" aria-describedby="sp-search-status"
          onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === 'Escape' && query) { event.preventDefault(); setQuery(''); } }}/>
        {query && <button type="button" className="sp-search-clear" aria-label="Clear search" onClick={reset}><X size={20} strokeWidth={1.5} aria-hidden="true"/></button>}
      </div>
      <p className="sp-search-status" id="sp-search-status" aria-live="polite" aria-atomic="true">{status}</p>
    </div>
    {entries.length > 0 ? <ol className="sp-list" aria-label="Journal entries">
      {entries.map(post => <Row key={post.slug} post={post} meta={<time dateTime={post.date}>{formatDate(post.date)}</time>} aside={`${post.readTime} min`} preview/>)}
    </ol> : <div className="sp-empty">
      <h2>Try a broader word.</h2>
      <p>Search looks through every title, summary and full entry. Try a single word or a different phrase.</p>
      <button type="button" onClick={reset}>Show all entries <Arrow strokeWidth={1.4}/></button>
    </div>}
  </>;
}

export default function Split({ section }: { section?: SectionId }) {
  const content = useContent();
  if (section === undefined) return <Home/>;
  return <SplitLayout section={section}>
    <Intro id={section}/>
    {content.status !== 'ready' ? <ContentStatus/> : section === 'training' ? <Training posts={content.advice}/> : <Journal posts={content.journey} key="journal"/>}
  </SplitLayout>;
}
