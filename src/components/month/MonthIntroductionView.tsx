import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, SkipForward, X } from 'lucide-react'
import type { MonthIntroductionScreen } from '../../cms/reader/monthProvider.ts'
import type { CmsBlock, CmsPortableText, CmsScripture } from '../../cms/sanity/types.ts'
import { CmsBlockView } from '../challenge/CmsContentBlocks.tsx'
import { formatYearMonthHeading } from './monthScreenModel.ts'

export type MonthIntroductionViewProps = {
  yearMonth: string
  monthTitle: string
  mode: 'preview' | 'active'
  previewScreens: readonly MonthIntroductionScreen[]
  welcomeScreen?: MonthIntroductionScreen
  canSkipToWelcome?: boolean
  onComplete: () => void
  onClose?: () => void
  closeLabel?: string
  saving?: boolean
  saveFailed?: boolean
}

function mapIntroBlockToCmsBlock(rawBlock: Record<string, unknown>, fallbackId: string): CmsBlock | null {
  const id = typeof rawBlock._key === 'string' && rawBlock._key.trim() ? rawBlock._key.trim() : fallbackId
  const type = rawBlock._type

  if (type === 'statementBlock') {
    const text = typeof rawBlock.text === 'string' ? rawBlock.text : ''
    const label = typeof rawBlock.label === 'string' ? rawBlock.label : undefined
    return {
      id,
      type: 'statement',
      requiredForCompletion: false,
      ...(label ? { label } : {}),
      text,
    }
  }

  if (type === 'richTextBlock' || type === 'teachingText') {
    const body = Array.isArray(rawBlock.body) ? (rawBlock.body as CmsPortableText) : []
    return {
      id,
      type: 'teachingText',
      requiredForCompletion: false,
      body,
    }
  }

  if (type === 'scriptureBlock' && rawBlock.scripture && typeof rawBlock.scripture === 'object') {
    const s = rawBlock.scripture as Record<string, unknown>
    const reference = typeof s.reference === 'string' ? s.reference : ''
    const translation = typeof s.translation === 'string' ? s.translation : 'WEBP'
    const textStatus = s.textStatus === 'provided' ? 'provided' : 'referenceOnly'
    const practiceStatus = s.practiceStatus === 'configured' ? 'configured' : 'notConfigured'
    const usageRightsConfirmed = s.usageRightsConfirmed === true
    const passage = typeof s.passage === 'string' ? s.passage : undefined
    if (!reference) return null

    const scripture: CmsScripture = {
      id: `${id}-scripture`,
      reference,
      translation,
      textStatus,
      practiceStatus,
      usageRightsConfirmed,
      ...(passage ? { passage } : {}),
    }
    return {
      id,
      type: 'scripture',
      requiredForCompletion: false,
      scripture,
    }
  }

  return null
}

/**
 * Swipeable and keyboard-accessible monthly introduction view.
 *
 * Supports any schema-valid number of `previewScreens[]` and appends `welcomeScreen`
 * strictly in active/historical mode (`mode === 'active'`), never during advance preview.
 */
export function MonthIntroductionView({
  yearMonth,
  monthTitle,
  mode,
  previewScreens,
  welcomeScreen,
  canSkipToWelcome = false,
  onComplete,
  onClose,
  closeLabel,
  saving = false,
  saveFailed = false,
}: MonthIntroductionViewProps) {
  const screens: readonly MonthIntroductionScreen[] =
    mode === 'active' && welcomeScreen ? [...previewScreens, welcomeScreen] : previewScreens

  const scopeKey = `${yearMonth}:${mode}`
  const [navState, setNavState] = useState<{ scopeKey: string; index: number }>({
    scopeKey,
    index: 0,
  })
  const index = navState.scopeKey === scopeKey ? navState.index : 0
  const setIndex = (updater: number | ((prev: number) => number)) => {
    setNavState(prev => {
      const current = prev.scopeKey === scopeKey ? prev.index : 0
      const nextIndex = typeof updater === 'function' ? updater(current) : updater
      return { scopeKey, index: nextIndex }
    })
  }
  const headingRef = useRef<HTMLHeadingElement>(null)
  const touchStartRef = useRef<{ x: number; y: number } | null>(null)

  const safeIndex = Math.min(Math.max(index, 0), Math.max(screens.length - 1, 0))
  const currentScreen = screens[safeIndex]
  const isFirst = safeIndex === 0
  const isLast = safeIndex === screens.length - 1
  const showSkipToWelcome = mode === 'active' && canSkipToWelcome && Boolean(welcomeScreen) && !isLast

  useEffect(() => {
    if (!currentScreen) return
    headingRef.current?.focus({ preventScroll: true })
  }, [safeIndex, currentScreen])

  if (!currentScreen) {
    return null
  }

  const goPrevious = () => {
    if (!saving && !isFirst) setIndex(prev => Math.max(0, prev - 1))
  }

  const goNext = () => {
    if (!saving && !isLast) setIndex(prev => Math.min(screens.length - 1, prev + 1))
  }

  const skipToWelcome = () => {
    if (!saving && showSkipToWelcome) {
      setIndex(screens.length - 1)
    }
  }

  const mappedBlocks = currentScreen.blocks
    .map((rawBlock, idx) => mapIntroBlockToCmsBlock(rawBlock, `${currentScreen.id}-block-${idx}`))
    .filter((b): b is CmsBlock => b !== null)

  const monthHeading = formatYearMonthHeading(yearMonth)
  const finalCtaLabel =
    mode === 'preview'
      ? 'View Preview Calendar'
      : currentScreen.ctaLabel || 'Open Calendar'

  return (
    <section
      className="standard-page month-intro"
      aria-busy={saving}
      aria-labelledby={`month-intro-title-${currentScreen.id}`}
      onKeyDown={event => {
        const tag = (event.target as HTMLElement | null)?.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA') return
        if (event.key === 'ArrowRight' && !isLast) {
          event.preventDefault()
          goNext()
        } else if (event.key === 'ArrowLeft' && !isFirst) {
          event.preventDefault()
          goPrevious()
        }
      }}
      onTouchStart={event => {
        const touch = event.changedTouches[0]
        if (touch) {
          touchStartRef.current = { x: touch.clientX, y: touch.clientY }
        }
      }}
      onTouchEnd={event => {
        const start = touchStartRef.current
        touchStartRef.current = null
        const touch = event.changedTouches[0]
        if (!start || !touch) return
        const dx = touch.clientX - start.x
        const dy = touch.clientY - start.y
        if (Math.abs(dx) < 48 || Math.abs(dx) <= Math.abs(dy)) return
        if (dx < 0) goNext()
        else goPrevious()
      }}
    >
      <div className="month-intro__topbar">
        <div>
          <p className="eyebrow">
            {mode === 'preview' ? `${monthHeading} · ADVANCE PREVIEW` : `${monthHeading} · INTRODUCTION`}
          </p>
          <p className="month-intro__theme">{monthTitle}</p>
        </div>
        <div className="month-intro__top-actions">
          {showSkipToWelcome && (
            <button
              type="button"
              className="button button--secondary button--small"
              onClick={skipToWelcome}
            >
              <SkipForward size={15} aria-hidden="true" /> Skip to Welcome
            </button>
          )}
          {onClose && (
            <button
              type="button"
              className="button button--text month-intro__close"
              onClick={onClose}
              aria-label={closeLabel ?? 'Close introduction'}
              disabled={saving}
            >
              <X size={16} aria-hidden="true" /> {closeLabel ?? 'Close'}
            </button>
          )}
        </div>
      </div>

      <div className="month-intro__progress">
        <span>
          Screen {safeIndex + 1} of {screens.length}
        </span>
        <div
          className="lab-progress__segments"
          role="progressbar"
          aria-label="Monthly introduction progress"
          aria-valuemin={1}
          aria-valuemax={screens.length}
          aria-valuenow={safeIndex + 1}
          aria-valuetext={`Screen ${safeIndex + 1} of ${screens.length}`}
        >
          {screens.map((item, idx) => (
            <span key={item.id} className={idx <= safeIndex ? 'is-filled' : ''} />
          ))}
        </div>
      </div>

      <article className="lab-screen month-intro__card">
        {currentScreen.stepLabel && <p className="eyebrow">{currentScreen.stepLabel}</p>}
        <h1
          id={`month-intro-title-${currentScreen.id}`}
          ref={headingRef}
          tabIndex={-1}
          className="month-intro__heading"
        >
          {currentScreen.title || monthTitle}
        </h1>
        <div className="lab-screen__blocks">
          {mappedBlocks.map(block => (
            <CmsBlockView key={block.id} block={block} />
          ))}
        </div>
      </article>

      {saveFailed && <p role="alert">Unable to save Monthly Introduction status. Try again or go back.</p>}
      <nav className="lab-screen-nav month-intro__nav" aria-label="Monthly introduction navigation">
        <button
          type="button"
          className="button button--secondary"
          disabled={isFirst || saving}
          onClick={goPrevious}
        >
          <ArrowLeft size={17} aria-hidden="true" /> Back
        </button>

        {!isLast ? (
          <button type="button" className="button button--primary" onClick={goNext}>
            Continue <ArrowRight size={17} aria-hidden="true" />
          </button>
        ) : (
          <button
            type="button"
            className="button button--primary"
            onClick={onComplete}
            disabled={saving}
          >
            {saveFailed ? 'Retry' : finalCtaLabel} <ArrowRight size={17} aria-hidden="true" />
          </button>
        )}
      </nav>
    </section>
  )
}
