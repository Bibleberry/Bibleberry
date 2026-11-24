import { useCallback, useEffect, useState } from 'react'
import {
  defaultNewsGatewayProvider,
  type NewsArticle,
  type NewsCategory,
  type NewsGatewayProvider,
} from '../../cms/reader/newsProvider.ts'
import { filterNewsArticles, type NewsFilterCategory } from './newsModel.ts'
import { NewsErrorBoundary } from './NewsErrorBoundary.tsx'
import { NewsArticleCard } from './NewsArticleCard.tsx'
import { NewsBackButton, NewsReaderView } from './NewsReaderView.tsx'
import './news.css'

export interface NewsReaderHostProps {
  readonly provider?: NewsGatewayProvider
  readonly initialCategory?: NewsFilterCategory
  readonly onCategoryChange?: (category: NewsFilterCategory) => void
  readonly onNavigate?: (destination: { kind: 'month'; monthId: string }) => void
  readonly onBack?: () => void
  readonly onOpenFeatured?: (documentId: string) => void
  readonly articleDocumentId?: string
  readonly onOpenArticle?: (documentId: string) => void
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
  onCategoryChange,
  onNavigate,
  onBack,
  onOpenFeatured,
  articleDocumentId,
  onOpenArticle,
}: NewsReaderHostProps) {
  const [prevInitialCategory, setPrevInitialCategory] = useState<NewsFilterCategory>(initialCategory)
  const [activeCategory, setActiveCategory] = useState<NewsFilterCategory>(initialCategory)
  const [articles, setArticles] = useState<readonly NewsArticle[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'empty' | 'error' | 'offline'>('loading')
  const [errorMessage, setErrorMessage] = useState<string | undefined>()
  const [fetchKey, setFetchKey] = useState(0)

  if (prevInitialCategory !== initialCategory) {
    setPrevInitialCategory(initialCategory)
    if (activeCategory !== initialCategory) {
      setActiveCategory(initialCategory)
      setStatus('loading')
      setErrorMessage(undefined)
    }
  }

  const handleSelectCategory = useCallback((category: NewsFilterCategory) => {
    if (activeCategory === category) return
    setActiveCategory(category)
    setStatus('loading')
    setErrorMessage(undefined)
    onCategoryChange?.(category)
  }, [activeCategory, onCategoryChange])

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

  const article = articleDocumentId
    ? articles.find(item => item.documentId === articleDocumentId)
    : articles[0]
  const unavailable = status === 'offline' || status === 'error'

  if (onOpenFeatured) {
    return (
      <section className="r06-more__feature" aria-labelledby="r06-featured-news">
        <h2 id="r06-featured-news">Latest Ministry News</h2>
        {status === 'loading' && <p role="status">Checking for ministry news…</p>}
        {status === 'empty' && <p role="status">No ministry news has been published yet.</p>}
        {unavailable && (
          <>
            <p role="alert">Unable to load ministry news.</p>
            <button type="button" className="button button--secondary" onClick={handleRetry}>Retry</button>
          </>
        )}
        {status === 'ready' && article && (
          <button
            type="button"
            className="button button--secondary"
            onClick={() => onOpenFeatured(article.documentId)}
          >
            {article.title}
          </button>
        )}
      </section>
    )
  }

  if (articleDocumentId) {
    return (
      <main className="news-reader news-reader--r06">
        {onBack && <NewsBackButton onBack={onBack} />}
        <NewsErrorBoundary onReset={handleRetry}>
          {status === 'ready' && article ? (
            <NewsArticleCard article={article} onNavigate={onNavigate} detail />
          ) : (
            <>
              <h1 className="news-reader__heading">Ministry News</h1>
              {status === 'loading' && <p role="status">Checking for this article…</p>}
              {(status === 'ready' || status === 'empty') && <p role="status">This article is unavailable.</p>}
              {unavailable && (
                <>
                  <p role="alert">Unable to load this article.</p>
                  <button type="button" className="button button--secondary" onClick={handleRetry}>Retry</button>
                </>
              )}
            </>
          )}
        </NewsErrorBoundary>
      </main>
    )
  }

  return (
    <NewsErrorBoundary onReset={handleRetry}>
      <NewsReaderView
        articles={displayedArticles}
        status={status}
        activeCategory={activeCategory}
        errorMessage={onOpenArticle ? undefined : errorMessage}
        onSelectCategory={handleSelectCategory}
        onRetry={handleRetry}
        onNavigate={onNavigate}
        onBack={onBack}
        onOpenArticle={onOpenArticle}
      />
    </NewsErrorBoundary>
  )
}
