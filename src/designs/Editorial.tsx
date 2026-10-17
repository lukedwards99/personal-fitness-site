import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { X } from 'lucide-react';
import { advice, journey, formatDate } from '../content';
import type { Post } from '../content';
import { Arrow, Mark } from '../components/Icons';
import './editorial.css';

const ALL = 'All';
const SECTIONS = [{ id: 'training', label: 'Training & advice', short: 'Training' }, { id: 'journey', label: 'The journal', short: 'Journal' }];
const fmt = (date: string, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-US', { ...options, timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`));
const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const url = (post: Post) => `/editorial/post/${post.slug}`;
const haystack = (post: Post) => [post.title, post.excerpt, post.category, ...post.body.flatMap(s => [s.heading, s.text])].join(' ').toLowerCase();

const latestDate = [...advice, ...journey].reduce((latest, p) => (p.date > latest ? p.date : latest), '');
const ISSUE = `Issue 01${latestDate ? ` · ${fmt(latestDate, { month: 'long', year: 'numeric' })}` : ''}`;
const TABS = [{ name: ALL, total: advice.length }, ...[...new Set(advice.map(p => p.category))].map(name => ({ name, total: advice.filter(p => p.category === name).length }))];
const THEMES = [...new Set(journey.map(p => p.category))];

export default function Editorial() {
  const [category, setCategory] = useState(ALL);
  const [query, setQuery] = useState('');
  const [stuck, setStuck] = useState(false);
  const [active, setActive] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const articles = category === ALL ? advice : advice.filter(p => p.category === category);
  const [lead, ...more] = articles;
  const search = query.trim();
  const entries = useMemo(() => {
    const terms = search.toLowerCase().split(/\s+/).filter(Boolean);
    return terms.length ? journey.filter(p => { const text = haystack(p); return terms.every(t => text.includes(t)); }) : journey;
  }, [search]);
  const months = useMemo(() => entries.reduce<{ key: string; label: string; posts: Post[] }[]>((groups, post) => {
    const key = post.date.slice(0, 7);
    const group = groups.find(g => g.key === key);
    if (group) group.posts.push(post); else groups.push({ key, label: fmt(post.date, { month: 'long', year: 'numeric' }), posts: [post] });
    return groups;
  }, []), [entries]);
  const resultText = !search ? `${count(journey.length, 'sample entry', 'sample entries')}, newest first.` : entries.length ? `${count(entries.length, 'entry', 'entries')} of ${journey.length} match “${search}”.` : `No entries match “${search}”.`;
  const clearSearch = () => { setQuery(''); searchRef.current?.focus(); };

  // Compact header state: the header is sticky with a negative top, so only its bottom row stays in view.
  useEffect(() => {
    const header = headerRef.current;
    if (!header) return;
    let frame = 0;
    const update = () => { frame = 0; setStuck(header.getBoundingClientRect().top <= (parseFloat(getComputedStyle(header).top) || 0) + 1); };
    const queue = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    window.addEventListener('scroll', queue, { passive: true });
    window.addEventListener('resize', queue);
    return () => { cancelAnimationFrame(frame); window.removeEventListener('scroll', queue); window.removeEventListener('resize', queue); };
  }, []);

  // Highlight the section currently in the middle of the viewport.
  useEffect(() => {
    if (!('IntersectionObserver' in window)) return;
    const observer = new IntersectionObserver(items => items.forEach(item => {
      if (item.isIntersecting) setActive(item.target.id);
      else setActive(current => (current === item.target.id ? '' : current));
    }), { rootMargin: '-45% 0px -50% 0px' });
    SECTIONS.forEach(s => { const el = document.getElementById(s.id); if (el) observer.observe(el); });
    return () => observer.disconnect();
  }, []);

  // Reveal on scroll. Only elements still below the fold once the reader starts scrolling are hidden,
  // so the page is complete without JavaScript, in reduced motion, and before any scroll happens.
  useEffect(() => {
    const root = rootRef.current;
    if (!root || !('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const observer = new IntersectionObserver(items => items.forEach(item => {
      if (item.isIntersecting) { item.target.classList.add('is-in'); observer.unobserve(item.target); }
    }), { rootMargin: '0px 0px -6% 0px' });
    const arm = () => {
      window.removeEventListener('scroll', arm);
      root.querySelectorAll<HTMLElement>('.ed-reveal').forEach(el => {
        if (el.getBoundingClientRect().top > window.innerHeight) { el.classList.add('is-pending'); observer.observe(el); }
      });
    };
    window.addEventListener('scroll', arm, { passive: true });
    return () => { window.removeEventListener('scroll', arm); observer.disconnect(); };
  }, []);

  return <div className="editorial" id="top" ref={rootRef}>
    <div className="ed-topline"><div className="ed-wrap"><span className="ed-topline-tag">The practice of getting stronger</span><span>{ISSUE} · <b>Sample edition</b></span></div></div>
    <header ref={headerRef} className={`ed-header${stuck ? ' is-stuck' : ''}`}>
      <div className="ed-wrap ed-header-in">
        <Link to="/editorial" className="ed-brand"><Mark/><span>Luke Edwards<small>Fitness &amp; bodybuilding</small></span></Link>
        <nav className="ed-nav" aria-label="Main navigation">{SECTIONS.map(s => <a key={s.id} href={`#${s.id}`} aria-current={active === s.id ? 'location' : undefined}><span className="ed-nav-long">{s.label}</span><span className="ed-nav-short">{s.short}</span></a>)}</nav>
      </div>
    </header>
    <main id="main-content">
      <section className="ed-hero ed-wrap" aria-labelledby="ed-title">
        <div className="ed-hero-copy">
          <h1 id="ed-title">GOOD THINGS<br/>TAKE <em>REPS.</em></h1>
          <p>Practical training advice.<br/>An honest bodybuilding journey.<br/>The work behind getting stronger.</p>
          <div className="ed-hero-actions"><a className="ed-button" href="#training">Training &amp; advice <Arrow/></a><a className="ed-text-link" href="#journey">The journal <Arrow/></a></div>
          <div className="ed-hero-note"><span className="ed-small-mark" aria-hidden="true">LE.</span><span>Luke Edwards<strong>Certified personal trainer</strong></span></div>
        </div>
        <figure className="ed-hero-image"><img src="/images/athlete-editorial.webp" alt="Stock photograph of an athlete doing a pull-up, seen from behind" {...{ fetchpriority: 'high' }}/><figcaption>The work is the way. <span>Stock photo · not Luke</span></figcaption></figure>
      </section>

      <section id="training" className="ed-training ed-wrap" aria-labelledby="ed-training-title">
        <div className="ed-section-head ed-reveal"><div><p className="ed-kicker">Training &amp; advice</p><h2 id="ed-training-title">Put it into practice.</h2></div><p>Workouts, useful cues, and ideas to take into your next session.</p></div>
        <div className="ed-tabs" role="group" aria-label="Filter training articles by category">{TABS.map(tab => <button type="button" key={tab.name} onClick={() => setCategory(tab.name)} aria-pressed={category === tab.name}>{tab.name}{' '}<span className="ed-count">{tab.total}<span className="ed-sr"> {tab.total === 1 ? 'article' : 'articles'}</span></span></button>)}</div>
        <p className="ed-sr" aria-live="polite" aria-atomic="true">Showing {count(articles.length, 'article')}{category === ALL ? '' : ` in ${category}`}.</p>
        <div className={`ed-article-grid${more.length ? '' : ' is-single'}`}>
          {lead && <Link className="ed-lead" to={url(lead)} key={lead.slug}>
            <div className="ed-lead-image"><img src={lead.image} alt="" loading="lazy"/><span>Lead story</span></div>
            <div className="ed-lead-text">
              <div className="ed-meta"><span>{lead.category}</span><span>{lead.readTime} min read · Sample</span></div>
              <h3>{lead.title}</h3><p>{lead.excerpt}</p>
              {lead.workout && <p className="ed-lead-session"><b>Inside</b> {lead.workoutTitle ?? 'Sample session'} · {count(lead.workout.length, 'exercise')}</p>}
              <span className="ed-readmore">Read the article <Arrow/></span>
            </div>
          </Link>}
          {more.length > 0 && <div className="ed-more ed-reveal">
            <p className="ed-more-label"><span>{category === ALL ? 'More from the library' : `More in ${category}`}</span><span>{count(more.length, 'article')}</span></p>
            <ul>{more.map(post => <li key={post.slug}><Link className="ed-row" to={url(post)}><span className="ed-row-thumb"><img src={post.image} alt="" loading="lazy"/></span><span className="ed-row-text"><span className="ed-meta"><span>{post.category}</span><span>{post.readTime} min · Sample</span></span><h3>{post.title}</h3><p>{post.excerpt}</p></span></Link></li>)}</ul>
          </div>}
        </div>
      </section>

      <section id="journey" className="ed-journey" aria-labelledby="ed-journey-title"><div className="ed-wrap ed-journey-layout">
        <div className="ed-journey-intro">
          <p className="ed-kicker">The journal</p>
          <h2 id="ed-journey-title">More than<br/>the before<br/>and after.</h2>
          <p>A bodybuilding journal for the process itself. The decisions, the ordinary days, and everything learned along the way.</p>
          <div className="ed-search">
            <label htmlFor="ed-search-input">Search the journal</label>
            <div className="ed-search-field"><input id="ed-search-input" ref={searchRef} type="search" placeholder="Find an entry…" autoComplete="off" enterKeyHint="search" aria-describedby="ed-search-count" value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Escape' && query) { e.preventDefault(); setQuery(''); } }}/>{query && <button type="button" className="ed-search-clear" aria-label="Clear search" onClick={clearSearch}><X size={20} aria-hidden="true"/></button>}</div>
            <p className="ed-search-count" id="ed-search-count" aria-live="polite" aria-atomic="true">{resultText}</p>
          </div>
          <p className="ed-sample-label">Sample entries. Illustrative writing, not a record of Luke’s training.</p>
        </div>
        <div className="ed-timeline">
          {months.map(month => <div className="ed-month ed-reveal" key={month.key}>
            <h3>{month.label}<span>{count(month.posts.length, 'entry', 'entries')}</span></h3>
            <ol className="ed-entries">{month.posts.map(post => <li key={post.slug}><Link className="ed-entry" to={url(post)}>
              <span className="ed-date" aria-hidden="true"><b>{fmt(post.date, { day: '2-digit' })}</b><span>{fmt(post.date, { month: 'short' })}</span></span>
              <span className="ed-entry-body"><time className="ed-sr" dateTime={post.date}>{formatDate(post.date)}</time><span className="ed-meta"><span>{post.category}</span><span>{post.readTime} min read · Sample</span></span><h4>{post.title}</h4><p>{post.excerpt}</p><span className="ed-entry-read">Read entry <Arrow/></span></span>
            </Link></li>)}</ol>
          </div>)}
          {!entries.length && <div className="ed-empty">
            <h3>Nothing in the journal matches “{search}”.</h3>
            <p>Try a broader word, or browse by theme:</p>
            <div className="ed-empty-themes">{THEMES.map(theme => <button type="button" key={theme} onClick={() => setQuery(theme)}>{theme}</button>)}</div>
            <button type="button" className="ed-empty-reset" onClick={clearSearch}>Show all entries <Arrow/></button>
          </div>}
        </div>
      </div></section>
    </main>
    <footer className="ed-footer"><div className="ed-wrap">
      <div className="ed-footer-grid">
        <div className="ed-footer-brand"><Link to="/editorial" className="ed-brand"><Mark/><span>Luke Edwards<small>Fitness &amp; bodybuilding</small></span></Link><p>A little stronger.<br/>A little wiser.</p></div>
        <nav className="ed-footer-col" aria-labelledby="ed-footer-sections"><p id="ed-footer-sections" className="ed-footer-label">Sections</p><ul>{SECTIONS.map(s => <li key={s.id}><a href={`#${s.id}`}>{s.label}</a></li>)}</ul></nav>
        <a className="ed-top-link" href="#top">Back to top <Arrow/></a>
      </div>
      <div className="ed-footer-base"><p><b>{ISSUE} · Sample edition.</b> Articles and journal entries are sample writing for design review, not a record of Luke’s training. Photography is stock from Unsplash; the people pictured are not Luke.</p><p>Local design preview</p></div>
    </div></footer>
  </div>;
}
