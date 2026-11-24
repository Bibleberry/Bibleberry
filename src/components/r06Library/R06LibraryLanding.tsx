import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { Bookmark, BookOpen, ChevronRight, Library } from 'lucide-react'
import {
  LibraryShelfHost,
  type LibraryShelfHostProps,
} from '../libraryShelf/LibraryShelfHost.tsx'
import {
  buildR06LibraryLandingViewModel,
  canTransitionR06LibrarySurface,
  formatR06LibrarySurfaceAnnouncement,
  resolveActiveR06LibrarySurface,
  resolveInitialR06LibrarySurface,
  resolveNextR06LibraryReturnSurface,
  resolveR06LibraryHostBackAction,
  type R06LibraryEntranceAction,
  type R06LibrarySurface,
} from './r06LibraryModel.ts'

export interface R06LibraryLandingProps extends LibraryShelfHostProps {
  /**
   * Direct callback invoked when the reader selects the persistent Foundations
   * entrance. Supplied by the outer R06 shell so Foundations opens its overview first.
   */
  readonly onOpenFoundations: () => void
  /** The shell owns Back and focus restoration when mounted in its route stack. */
  readonly shellOwnsNavigation?: boolean
}

function focusVisibleSurfaceHeading(container: HTMLElement): boolean {
  if (container.querySelector('[role="dialog"]')) {
    return false
  }

  const visibleMains = Array.from(container.querySelectorAll<HTMLElement>('main')).filter(
    main => !main.closest('[hidden]') && main.getAttribute('aria-hidden') !== 'true',
  )
  const activeMain = visibleMains[0]
  if (!activeMain) {
    return false
  }

  const heading = activeMain.querySelector<HTMLElement>('h1')
  const target = heading ?? activeMain
  if (!target.hasAttribute('tabindex')) {
    target.setAttribute('tabindex', '-1')
  }
  target.focus()
  return document.activeElement === target
}

/**
 * Mountable, standalone R06 Library landing centered on the existing authorized
 * Shelf and Historical Library host (`LibraryShelfHost`), with persistent direct
 * entrances to Browse All Months / Your Shelf and Foundations (Juniper Signal / #289).
 *
 * Ownership and composition invariants:
 * - Does not instantiate a second Shelf store or fetch directly from Sanity.
 * - Consumes `LibraryShelfHost` read-only with injected durable state, conditional
 *   write callback, authorized provider, and origin-preserving `onOpenMonth`.
 * - Maintains one controlled/uncontrolled surface boundary (`shelf` <-> `library`)
 *   without adding a second router, duplicate primary navigation, or nested `<main>`.
 * - Does not intercept Challenge or Month-return scroll on initial mount; manages
 *   focus only on explicit surface transitions so keyboard/SR focus is never lost.
 */
export function R06LibraryLanding({
  referenceCurrentYearMonth,
  shelfState,
  initialShelfState,
  onShelfStateChange,
  currentLocalDate,
  libraryProvider,
  monthProgressProvider,
  participationStore,
  libraryPageSize,
  timeZone,
  monthMetadata,
  surface: controlledSurface,
  initialSurface = 'shelf',
  onSurfaceChange,
  onOpenMonth,
  onOpenFoundations,
  shelfFallback,
  shellOwnsNavigation = false,
  onExit,
  exitLabel,
}: R06LibraryLandingProps) {
  const [mountedInitialSurface] = useState<R06LibrarySurface>(() =>
    resolveInitialR06LibrarySurface(controlledSurface ?? initialSurface),
  )
  const [uncontrolledSurface, setUncontrolledSurface] = useState<R06LibrarySurface>(
    mountedInitialSurface,
  )
  const [observedUncontrolledShelfState, setObservedUncontrolledShelfState] = useState(
    initialShelfState,
  )
  const activeSurface = resolveActiveR06LibrarySurface({
    controlledSurface,
    uncontrolledSurface,
  })
  const [lastObservedSurface, setLastObservedSurface] = useState<R06LibrarySurface>(activeSurface)
  const [returnSurface, setReturnSurface] = useState<R06LibrarySurface | null>(null)
  const [surfaceAnnouncement, setSurfaceAnnouncement] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const previousSurfaceRef = useRef<R06LibrarySurface>(activeSurface)
  const entrancesHeadingId = useId()

  if (lastObservedSurface !== activeSurface) {
    const nextReturnSurface = resolveNextR06LibraryReturnSurface({
      currentSurface: lastObservedSurface,
      nextSurface: activeSurface,
      currentReturnSurface: returnSurface,
    })
    setLastObservedSurface(activeSurface)
    setReturnSurface(nextReturnSurface)
    setSurfaceAnnouncement(formatR06LibrarySurfaceAnnouncement(activeSurface))
  }

  const effectiveShelfState = shelfState ?? observedUncontrolledShelfState
  const viewModel = useMemo(
    () =>
      buildR06LibraryLandingViewModel({
        activeSurface,
        shelfState: effectiveShelfState,
        referenceCurrentYearMonth,
      }),
    [activeSurface, effectiveShelfState, referenceCurrentYearMonth],
  )

  const handleShelfStateChange = useCallback(
    (nextState: NonNullable<LibraryShelfHostProps['shelfState']>, expectedState?: LibraryShelfHostProps['shelfState']) => {
      if (shelfState === undefined) {
        setObservedUncontrolledShelfState(nextState)
      }
      return onShelfStateChange?.(nextState, expectedState)
    },
    [onShelfStateChange, shelfState],
  )

  const handleSurfaceChange = useCallback(
    (nextSurface: R06LibrarySurface) => {
      if (!canTransitionR06LibrarySurface(activeSurface, nextSurface)) {
        return
      }
      if (controlledSurface === undefined) {
        setUncontrolledSurface(nextSurface)
      }
      onSurfaceChange?.(nextSurface)
    },
    [activeSurface, controlledSurface, onSurfaceChange],
  )

  // Move focus to the newly revealed surface heading only on actual surface
  // transitions so mount/return scroll restoration is never intercepted.
  useEffect(() => {
    if (previousSurfaceRef.current === activeSurface) {
      return
    }
    previousSurfaceRef.current = activeSurface

    const container = containerRef.current
    if (!container) {
      return
    }
    if (!shellOwnsNavigation) focusVisibleSurfaceHeading(container)
  }, [activeSurface, shellOwnsNavigation])

  const hostBackAction = useMemo(
    () =>
      resolveR06LibraryHostBackAction({
        activeSurface,
        returnSurface: shellOwnsNavigation ? null : returnSurface,
        hasOuterExit: Boolean(onExit),
        exitLabel,
      }),
    [activeSurface, exitLabel, onExit, returnSurface, shellOwnsNavigation],
  )

  const handleHostExit = useCallback(() => {
    if (hostBackAction.mode === 'returnToSurface' && hostBackAction.targetSurface) {
      handleSurfaceChange(hostBackAction.targetSurface)
      return
    }
    onExit?.()
  }, [handleSurfaceChange, hostBackAction.mode, hostBackAction.targetSurface, onExit])

  const hostOnExit = hostBackAction.mode === 'none' ? undefined : handleHostExit

  const handleEntranceAction = useCallback(
    (action: R06LibraryEntranceAction) => {
      switch (action) {
        case 'openLibrary':
          handleSurfaceChange('library')
          break
        case 'openShelf':
          handleSurfaceChange('shelf')
          break
        case 'openFoundations':
          onOpenFoundations()
          break
      }
    },
    [handleSurfaceChange, onOpenFoundations],
  )

  return (
    <div
      ref={containerRef}
      className="r06-library-landing"
      data-r06-library-surface={activeSurface}
      data-r06-shelf-count={shelfFallback ? undefined : viewModel.shelfCount}
    >
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {surfaceAnnouncement}
      </div>

      <LibraryShelfHost
        referenceCurrentYearMonth={referenceCurrentYearMonth}
        shelfState={shelfState}
        initialShelfState={initialShelfState}
        onShelfStateChange={shelfState === undefined ? handleShelfStateChange : onShelfStateChange}
        currentLocalDate={currentLocalDate}
        libraryProvider={libraryProvider}
        monthProgressProvider={monthProgressProvider}
        participationStore={participationStore}
        libraryPageSize={libraryPageSize}
        timeZone={timeZone}
        monthMetadata={monthMetadata}
        surface={activeSurface}
        initialSurface={mountedInitialSurface}
        onSurfaceChange={handleSurfaceChange}
        onOpenMonth={onOpenMonth}
        onExit={hostOnExit}
        exitLabel={hostBackAction.label}
        shellOwnsNavigation={shellOwnsNavigation}
        shelfFallback={shelfFallback}
      />

      <section
        className="r06-library-entrances"
        aria-labelledby={entrancesHeadingId}
        data-testid="r06-library-entrances"
      >
        <div className="r06-library-entrances__header">
          <h2 id={entrancesHeadingId} className="r06-library-entrances__title">
            Explore Library
          </h2>
          <p className="r06-library-entrances__subtitle">
            Browse every published past month or open optional Foundations anytime.
          </p>
        </div>

        <ul className="r06-library-entrances__list">
          {viewModel.entrances.map(entrance => (
            <li key={entrance.id} className="r06-library-entrances__item">
              <button
                type="button"
                className="r06-library-entrance-btn"
                data-testid={`r06-library-entrance-${entrance.id}`}
                aria-labelledby={`${entrancesHeadingId}-${entrance.id}-label`}
                aria-describedby={`${entrancesHeadingId}-${entrance.id}-description`}
                onClick={() => handleEntranceAction(entrance.action)}
              >
                <span className="r06-library-entrance-btn__icon" aria-hidden="true">
                  {entrance.id === 'browse-all-months' ? (
                    <Library size={18} />
                  ) : entrance.id === 'shelf-overview' ? (
                    <Bookmark size={18} />
                  ) : (
                    <BookOpen size={18} />
                  )}
                </span>
                <span className="r06-library-entrance-btn__body">
                  <span id={`${entrancesHeadingId}-${entrance.id}-label`} className="r06-library-entrance-btn__label">
                    {entrance.label}
                  </span>
                  <span id={`${entrancesHeadingId}-${entrance.id}-description`} className="r06-library-entrance-btn__desc">
                    {shelfFallback && entrance.id === 'shelf-overview'
                      ? 'Return to the Shelf overview.'
                      : entrance.description}
                  </span>
                </span>
                <ChevronRight
                  size={18}
                  className="r06-library-entrance-btn__chevron"
                  aria-hidden="true"
                />
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
