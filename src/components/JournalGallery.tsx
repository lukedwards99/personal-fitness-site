import { useEffect, useId, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { PostMedia } from '../content';

export default function JournalGallery({ media }: { media: PostMedia[] }) {
  const [active, setActive] = useState(0);
  const viewport = useRef<HTMLDivElement>(null);
  const id = useId();
  const multiple = media.length > 1;

  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    // A video should stop playing when its slide leaves the viewport.
    element.querySelectorAll('video').forEach(video => {
      if (video.closest('figure') !== element.children[active]) video.pause();
    });
  }, [active]);

  function goTo(index: number) {
    const element = viewport.current;
    if (!element) return;
    const next = Math.max(0, Math.min(media.length - 1, index));
    element.scrollTo({
      left: next * element.clientWidth,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
    });
  }

  return <section className="journal-gallery" aria-label="Entry photos and videos" aria-roledescription="carousel">
    {multiple && <p className="sp-sr" id={`${id}-help`}>Swipe through the photos and videos, use the previous and next buttons, or focus the gallery and use the arrow keys.</p>}
    <div className="journal-gallery-viewport" ref={viewport} id={id} tabIndex={multiple ? 0 : undefined}
      role="group" aria-label="Photos and videos" aria-describedby={multiple ? `${id}-help` : undefined}
      onScroll={event => {
        const element = event.currentTarget;
        if (element.clientWidth) setActive(Math.max(0, Math.min(media.length - 1, Math.round(element.scrollLeft / element.clientWidth))));
      }}
      onKeyDown={event => {
        // Leave the native video controls' keyboard shortcuts alone.
        if (event.target !== event.currentTarget || event.altKey || event.ctrlKey || event.metaKey) return;
        const next = event.key === 'ArrowRight' ? active + 1 : event.key === 'ArrowLeft' ? active - 1
          : event.key === 'Home' ? 0 : event.key === 'End' ? media.length - 1 : undefined;
        if (next !== undefined) { event.preventDefault(); goTo(next); }
      }}>
      {media.map((item, index) => <figure className="journal-gallery-slide" key={`${item.path}-${index}`}
        role="group" aria-roledescription="slide" aria-label={`${index + 1} of ${media.length}`}>
        <div className="journal-gallery-frame">
          {item.type === 'image'
            ? <img src={item.path} alt={item.alt} loading="lazy" decoding="async"/>
            : <video src={item.path} controls preload="none" playsInline aria-label={item.alt || `Video ${index + 1}`}>
              <a href={item.path}>Download the video</a>
            </video>}
        </div>
        {item.alt && <figcaption>{item.alt}</figcaption>}
      </figure>)}
    </div>
    {multiple && <div className="journal-gallery-controls">
      <p className="journal-gallery-position" aria-live="polite" aria-atomic="true">{active + 1} / {media.length}</p>
      <div>
        <button type="button" aria-label="Previous photo or video" aria-controls={id} disabled={active === 0} onClick={() => goTo(active - 1)}><ChevronLeft size={20} aria-hidden="true"/></button>
        <button type="button" aria-label="Next photo or video" aria-controls={id} disabled={active === media.length - 1} onClick={() => goTo(active + 1)}><ChevronRight size={20} aria-hidden="true"/></button>
      </div>
    </div>}
  </section>;
}
