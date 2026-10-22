import { Link } from 'react-router-dom';
import { formatDate } from '../content';
import type { JournalPhotoGroup } from '../journal';
import { Arrow } from './Icons';

export default function JournalTimeline({ groups }: { groups: JournalPhotoGroup[] }) {
  return <section className="sp-timeline" aria-labelledby="sp-timeline-title">
    <div className="sp-timeline-heading">
      <h2 id="sp-timeline-title">Photo timeline</h2>
      <p>Select a photo to view it full size.</p>
    </div>
    <ol className="sp-timeline-list">
      {groups.map(({ post, photos }) => <li className="sp-timeline-entry" key={post.slug}>
        <div className="sp-timeline-meta">
          <h3><time dateTime={post.date}>{formatDate(post.date)}</time></h3>
          <p>{post.title}</p>
          {post.sample && <p>Sample journal entry</p>}
          <Link to={`/post/${encodeURIComponent(post.slug)}`} aria-label={`Read ${post.title}`}>
            Read entry <Arrow width="16" height="16" aria-hidden="true"/>
          </Link>
        </div>
        <div className="sp-timeline-photos">
          {photos.map((photo, index) => <figure key={`${photo.path}-${index}`}>
            <a className="sp-timeline-photo" href={photo.path} target="_blank" rel="noreferrer"
              aria-label={`View full-size photo ${index + 1} from ${post.title} (opens in a new tab)`}>
              <img src={photo.path} alt={photo.alt || `Photo ${index + 1} from ${post.title}`} loading="lazy" decoding="async"/>
            </a>
            {photo.alt && <figcaption>{photo.alt}</figcaption>}
          </figure>)}
        </div>
      </li>)}
    </ol>
  </section>;
}
