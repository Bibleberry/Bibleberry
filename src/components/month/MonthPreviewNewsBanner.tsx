import { useEffect, useState } from 'react'
import { ArrowRight, CalendarDays } from 'lucide-react'
import {
  defaultGatewayMonthProvider,
  type MonthGatewayProvider,
  type NewsArticle,
} from '../../cms/reader/monthProvider.ts'
import { formatCivilYearMonthFromDate, formatYearMonthHeading } from './monthScreenModel.ts'
import './monthScreen.css'

export type MonthPreviewNewsBannerProps = {
  monthProvider?: MonthGatewayProvider
  onOpenMonth: (yearMonth: string) => void
}

/**
 * Minimal, unobtrusive advance-preview ministry News entry point (R08A-6).
 *
 * Uses `monthProvider.loadNews({ category: 'monthlyPreview' })`. Fails closed to null
 * when unavailable or empty without inventing announcements or bypassing month endpoints.
 */
export function MonthPreviewNewsBanner({
  monthProvider = defaultGatewayMonthProvider,
  onOpenMonth,
}: MonthPreviewNewsBannerProps) {
  const [articles, setArticles] = useState<readonly NewsArticle[]>([])

  useEffect(() => {
    const controller = new AbortController()
    let ignore = false

    monthProvider
      .loadNews({ category: 'monthlyPreview', signal: controller.signal })
      .then(res => {
        if (!ignore && res.status === 'ready') {
          setArticles(res.articles.filter(a => a.destination?.kind === 'month'))
        }
      })
      .catch(() => {
        // Degrade gracefully with no fabricated announcement
      })

    return () => {
      ignore = true
      controller.abort()
    }
  }, [monthProvider])

  const first = articles[0]
  if (!first || first.destination?.kind !== 'month') {
    return null
  }

  const targetMonth = first.destination.monthId

  return (
    <aside className="announcement-bar month-preview-news" aria-label="Monthly preview announcement">
      <div>
        <strong>MINISTRY PREVIEW · {formatYearMonthHeading(targetMonth)}</strong>
        <p className="month-preview-news__title">{first.title}</p>
        <p>{first.summary}</p>
      </div>
      <div className="announcement-bar__links">
        <a
          href={`#/month/${targetMonth}`}
          onClick={event => {
            event.preventDefault()
            onOpenMonth(targetMonth)
          }}
        >
          View {formatYearMonthHeading(targetMonth)} preview <ArrowRight size={14} aria-hidden="true" />
        </a>
      </div>
    </aside>
  )
}

export function MonthScreenEntryBar({ onOpenMonth }: { onOpenMonth: (yearMonth: string) => void }) {
  const currentMonth = formatCivilYearMonthFromDate()
  return (
    <div className="standard-page month-entry-bar">
      <div>
        <p className="eyebrow">MONTHLY CALENDAR</p>
        <p>Open {formatYearMonthHeading(currentMonth)} or browse another month by calendar week.</p>
      </div>
      <button
        type="button"
        className="button button--secondary"
        onClick={() => onOpenMonth(currentMonth)}
      >
        <CalendarDays size={16} aria-hidden="true" />
        Open Month Calendar
      </button>
    </div>
  )
}
