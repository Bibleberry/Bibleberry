import { useCallback, useEffect, useState } from 'react'
import {
  defaultNewsGatewayProvider,
  type NewsArticle,
  type NewsCategory,
  type NewsGatewayProvider,
} from '../../cms/reader/newsProvider.ts'
import { filterNewsArticles, type NewsFilterCategory } from './newsModel.ts'
import { NewsErrorBoundary } from './NewsErrorBoundary.tsx'
import { NewsReaderView } from './NewsReaderView.tsx'
import './news.css'

export interface NewsReaderHostProps {
  readonly provider?: NewsGatewayProvider
  readonly initialCategory?: NewsFilterCategory
  readonly onNavigate?: (destination: { kind: 'month'; monthId: string }) => void
  readonly onBack?: () => void
}

/**
 * Connected stateful host component for the ministry News feed.
 *
 * Manages loading state, category switching, network recovery, retry logic,
 * and passes safe navigation events to consumer handlers.
 */
export function NewsReaderHost({
  provider = defaultNewsGatewayProvider,
  initialCategory = 'all',
  onNavigate,
  onBack,
}: NewsReaderHostProps) {
  const [activeCategory, setActiveCategory] = useState<NewsFilterCategory>(initialCategory)
  const [articles, setArticles] = useState<readonly NewsArticle[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'empty' | 'error' | 'offline'>('loading')
  const [errorMessage, setErrorMessage] = useState<string | undefined>()
  const [fetchKey, setFetchKey] = useState(0)

  const handleSelectCategory = useCallback((category: NewsFilterCategory) => {
    setActiveCategory(category)
    setStatus('loading')
    setErrorMessage(undefined)
  }, [])

  const handleRetry = useCallback(() => {
    setStatus('loading')
    setErrorMessage(undefined)
    setFetchKey(prev => prev + 1)
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    let cancelled = false

    const categoryParam: NewsCategory | undefined =
      activeCategory === 'all' ? undefined : activeCategory

    provider
      .loadNews({
        category: categoryParam,
        signal: controller.signal,
      })
      .then(res => {
        if (cancelled) return

        if (res.status === 'ready') {
          setArticles(res.articles)
          setStatus('ready')
        } else if (res.status === 'empty') {
          setArticles([])
          setStatus('empty')
        } else if (res.status === 'validationError') {
          setArticles([])
          setStatus('error')
          setErrorMessage(res.message)
        } else if (res.status === 'requestError') {
          setArticles([])
          const isOffline =
            (typeof navigator !== 'undefined' && !navigator.onLine) ||
            res.message.toLowerCase().includes('network') ||
            res.message.toLowerCase().includes('transport')
          setStatus(isOffline ? 'offline' : 'error')
          setErrorMessage(res.message)
        }
      })
      .catch(err => {
        if (cancelled) return
        setStatus('error')
        setErrorMessage(err instanceof Error ? err.message : 'An unexpected error occurred')
      })

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [provider, activeCategory, fetchKey])

  const displayedArticles = filterNewsArticles(articles, activeCategory)

  return (
    <NewsErrorBoundary onReset={handleRetry}>
      <NewsReaderView
        articles={displayedArticles}
        status={status}
        activeCategory={activeCategory}
        errorMessage={errorMessage}
        onSelectCategory={handleSelectCategory}
        onRetry={handleRetry}
        onNavigate={onNavigate}
        onBack={onBack}
      />
    </NewsErrorBoundary>
  )
}
