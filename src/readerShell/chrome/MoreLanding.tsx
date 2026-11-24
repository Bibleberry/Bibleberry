import { NewsReaderHost } from '../../components/news/NewsReaderHost.tsx'

interface MoreLandingProps {
  readonly onOpenFeatured: (documentId: string) => void
  readonly onOpenNews: () => void
  readonly onOpenAbout: () => void
  readonly onReplayIntroduction: () => void
}

export function MoreLanding({ onOpenFeatured, onOpenNews, onOpenAbout, onReplayIntroduction }: MoreLandingProps) {
  return (
    <div className="r06-landing r06-more">
      <h1>More</h1>
      <NewsReaderHost onOpenFeatured={onOpenFeatured} />
      <ul className="r06-more__entries">
        <li><button type="button" className="button button--secondary" onClick={onOpenNews}>View All News</button></li>
        <li>
          <strong>Podcasts &amp; Resources</strong>
          <p>No resources are available here yet.</p>
        </li>
        <li><button type="button" className="button button--secondary" onClick={onOpenAbout}>About Bibleberry</button></li>
        <li>
          <strong>Appearance &amp; Settings</strong>
          <p>Unavailable in this reader.</p>
        </li>
        <li>
          <strong>Account &amp; Progress</strong>
          <p>Unavailable in this reader.</p>
        </li>
        <li>
          <button type="button" className="button button--secondary" onClick={onReplayIntroduction}>Review Introduction</button>
        </li>
        <li>
          <strong>App Tutorial</strong>
          <p>Unavailable in this reader.</p>
        </li>
      </ul>
    </div>
  )
}
