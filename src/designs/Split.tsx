import { useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, NavLink, useSearchParams } from 'react-router-dom';
import { X } from 'lucide-react';
import { formatDate } from '../content';
import type { Post } from '../content';
import { useContent } from '../content-provider';
import { Arrow } from '../components/Icons';
import JournalTimeline from '../components/JournalTimeline';
import { filterJournalPosts, getJournalPhotoGroups, getJournalYears } from '../journal';
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
  const [params, setParams] = useSearchParams();
  const query = params.get('q') ?? '';
  const photos = params.get('view') === 'photos';
  const years = useMemo(() => getJournalYears(posts), [posts]);
  const year = years.includes(params.get('year') ?? '') ? params.get('year')! : 'all';
  const input = useRef<HTMLInputElement>(null);
  const entries = useMemo(() => filterJournalPosts(posts, { year, query }), [posts, year, query]);
  const groups = useMemo(() => getJournalPhotoGroups(entries), [entries]);
  const photoCount = groups.reduce((total, group) => total + group.photos.length, 0);
  const search = query.trim();
  const scope = year === 'all' ? '' : ` in ${year}`;
  const matches = search ? ` matching “${search}”` : '';
  const status = photos
    ? `${count(photoCount, 'photo')} across ${count(groups.length, 'entry', 'entries')}${scope}${matches}, newest first.`
    : `${count(entries.length, 'entry', 'entries')}${scope}${matches}, newest first.`;

  function update(key: string, value: string) {
    setParams(current => {
      const next = new URLSearchParams(current);
      if (value) next.set(key, value); else next.delete(key);
      return next;
    }, { replace: true });
  }
  const clearSearch = () => { update('q', ''); input.current?.focus(); };
  const reset = () => {
    setParams(current => {
      const next = new URLSearchParams(current);
      next.delete('q'); next.delete('year');
      return next;
    }, { replace: true });
    input.current?.focus();
  };

  if (!posts.length) return <div className="sp-empty">
    <h2>The first entry is still to come.</h2>
    <p>There are no published journal entries yet.</p>
  </div>;

  return <>
    <div className="sp-journal-controls">
      <div className="sp-filter sp-journal-views" role="group" aria-label="Journal view">
        <button type="button" aria-pressed={!photos} onClick={() => update('view', '')}>Entries</button>
        <button type="button" aria-pressed={photos} onClick={() => update('view', 'photos')}>Photos</button>
      </div>
      <div className="sp-journal-year">
        <label htmlFor="sp-journal-year">Year</label>
        <select id="sp-journal-year" value={year} onChange={event => update('year', event.target.value === 'all' ? '' : event.target.value)}>
          <option value="all">All years</option>
          {years.map(item => <option key={item} value={item}>{item}</option>)}
        </select>
      </div>
    </div>
    <div className="sp-search" role="search">
      <label htmlFor="sp-search-input">Search the journal</label>
      <div className="sp-search-field">
        <input id="sp-search-input" ref={input} type="search" value={query} placeholder="Titles, summaries, full entries" autoComplete="off" enterKeyHint="search" aria-describedby="sp-search-status"
          onChange={event => update('q', event.target.value)} onKeyDown={event => { if (event.key === 'Escape' && query) { event.preventDefault(); update('q', ''); } }}/>
        {query && <button type="button" className="sp-search-clear" aria-label="Clear search" onClick={clearSearch}><X size={20} strokeWidth={1.5} aria-hidden="true"/></button>}
      </div>
      <p className="sp-search-status" id="sp-search-status" aria-live="polite" aria-atomic="true">{status}</p>
    </div>
    {photos && groups.length > 0 ? <JournalTimeline groups={groups}/> : !photos && entries.length > 0 ? <ol className="sp-list" aria-label="Journal entries">
      {entries.map(post => <Row key={post.slug} post={post} meta={<time dateTime={post.date}>{formatDate(post.date)}</time>} aside={`${post.readTime} min`} preview/>)}
    </ol> : <div className="sp-empty">
      <h2>{photos ? 'No photos to show.' : 'No entries found.'}</h2>
      <p>{photos && entries.length > 0 ? 'These entries have no photos. You can read the entries or choose another year.'
        : 'Try another year or a broader search. Search looks through every title, summary and full entry.'}</p>
      {(search || year !== 'all') && <button type="button" onClick={reset}>Clear filters <Arrow strokeWidth={1.4}/></button>}
      {photos && <button type="button" onClick={() => update('view', '')}>Browse entries <Arrow strokeWidth={1.4}/></button>}
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
