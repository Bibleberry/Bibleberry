import { useCallback, type ReactNode } from 'react'
import { ArrowLeft, Library } from 'lucide-react'
import type { LibraryMonthIndexProvider } from '../cms/reader/libraryMonthIndexProvider.ts'
import { HistoricalLibraryHost } from '../components/library/HistoricalLibraryHost.tsx'
import { LibraryShelfHost } from '../components/libraryShelf/LibraryShelfHost.tsx'
import type {
  LibraryShelfSurface,
  OpenMonthContext,
} from '../components/libraryShelf/libraryShelfModel.ts'
import { R06LibraryLanding } from '../components/r06Library/index.ts'
import type { PersistenceHealth } from '../participation/persistence.ts'
import type { PublicationYearMonth } from '../participation/types.ts'
import type { ShelfState } from '../shelf/types.ts'
import { defaultGuestShelfStore } from '../shelfPersistence/defaultGuestShelfStore.ts'
import type { GuestShelfStore } from '../shelfPersistence/store.ts'
import { useGuestShelfStore } from '../shelfPersistence/useGuestShelfStore.ts'

export interface AppLibraryShelfHostProps {
  readonly surface: LibraryShelfSurface
  readonly onSurfaceChange: (surface: LibraryShelfSurface) => void
  readonly onOpenMonth: (yearMonth: PublicationYearMonth, context: OpenMonthContext) => void
  readonly onExit?: () => void
  readonly exitLabel?: string
  readonly onOpenFoundations?: () => void
  readonly shelfStore?: GuestShelfStore
  readonly libraryProvider?: LibraryMonthIndexProvider
}

function isShelfReadBlocked(health: PersistenceHealth): boolean {
  return (
    health === 'corruptStoredData' ||
    health === 'unsupportedNewerSchema'
  )
}

/**
 * Ordinary-reader adapter composing `LibraryShelfHost` with the durable
 * `defaultGuestShelfStore` (Phase 05 / R08 / Issue #227).
 *
 * Fails closed on hydration and unreadable storage so existing Shelf data is
 * never overwritten by an empty fallback state.
 */
export function AppLibraryShelfHost({
  surface,
  onSurfaceChange,
  onOpenMonth,
  onExit,
  exitLabel = 'Return',
  onOpenFoundations,
  shelfStore = defaultGuestShelfStore,
  libraryProvider,
}: AppLibraryShelfHostProps) {
  const shelfSnapshot = useGuestShelfStore(shelfStore)
  const readBlocked = isShelfReadBlocked(shelfSnapshot.health) || (
    Boolean(onOpenFoundations) &&
    shelfSnapshot.health === 'storageUnavailable' &&
    !shelfSnapshot.hasPendingWrites
  )
  const writeWarning =
    shelfSnapshot.health === 'writeFailed' ||
    shelfSnapshot.health === 'storageUnavailable'

  const handleShelfStateChange = useCallback(
    async (nextState: ShelfState, expectedState?: ShelfState) => {
      if (readBlocked) {
        return
      }
      const result = await shelfStore.applyState(nextState, undefined, expectedState)
      if (!result.ok) return result.message
    },
    [readBlocked, shelfStore],
  )

  const hostProps = {
    libraryProvider,
    surface,
    initialSurface: surface,
    onSurfaceChange,
    onOpenMonth,
    onExit,
    exitLabel,
  }

  function renderSurface(shelfFallback: ReactNode, catalogueNotice?: string) {
    const notice = !shelfFallback && writeWarning
      ? 'Shelf changes could not be saved to device storage yet and will retry when storage is available.'
      : surface === 'library' ? catalogueNotice : undefined
    return (
      <>
        {notice && (
          <aside className="provisional-collections-bar" role="status" aria-live="polite">
            <p className="provisional-collections-bar__description">{notice}</p>
          </aside>
        )}
        {onOpenFoundations ? (
          <R06LibraryLanding
            {...hostProps}
            shelfState={shelfSnapshot.state}
            onShelfStateChange={handleShelfStateChange}
            onOpenFoundations={onOpenFoundations}
            shelfFallback={shelfFallback}
            shellOwnsNavigation
          />
        ) : shelfFallback ?? (
          <LibraryShelfHost
            {...hostProps}
            shelfState={shelfSnapshot.state}
            onShelfStateChange={handleShelfStateChange}
          />
        )}
      </>
    )
  }

  if (shelfSnapshot.status === 'hydrating') {
    return renderSurface(
      <main
        className="standard-page shelf-page"
        role="main"
        aria-label="Shelf and Library loading"
      >
        {onExit ? (
          <div className="shelf-topbar">
            <button
              type="button"
              className="back-link shelf-back-link"
              onClick={onExit}
            >
              <ArrowLeft size={17} aria-hidden="true" />
              <span>{exitLabel}</span>
            </button>
          </div>
        ) : null}
        <section
          className="library-state-panel library-loading-panel"
          role="status"
          aria-live="polite"
        >
          <div className="library-spinner" aria-hidden="true" />
          <p className="library-loading-text">Preparing your Shelf…</p>
        </section>
      </main>,
      onOpenFoundations ? 'Preparing your Shelf…' : undefined,
    )
  }

  const readBlockedNotice = 'Saved Shelf data could not be read safely; Shelf actions are paused to protect existing device storage. You can still browse and open historical months from the Library.'
  if (readBlocked && (onOpenFoundations || surface === 'shelf')) {
    return renderSurface(
      <main
        className="standard-page shelf-page"
        role="main"
        aria-label="Shelf unavailable"
      >
        {onExit ? (
          <div className="shelf-topbar">
            <button
              type="button"
              className="back-link shelf-back-link"
              onClick={onExit}
            >
              <ArrowLeft size={17} aria-hidden="true" />
              <span>{exitLabel}</span>
            </button>
          </div>
        ) : null}
        <section className="library-state-panel" role="status" aria-live="polite">
          <h2>Shelf Unavailable</h2>
          <p>
            Saved Shelf data could not be read safely from this device, so your
            existing Shelf was left untouched.
          </p>
          {!onOpenFoundations && (
            <div className="provisional-collections-bar__actions">
              <button
                type="button"
                className="button button--secondary provisional-collections-btn"
                onClick={() => onSurfaceChange('library')}
              >
                <Library size={16} aria-hidden="true" />
                <span>Browse Historical Library</span>
              </button>
            </div>
          )}
        </section>
      </main>,
      onOpenFoundations ? readBlockedNotice : undefined,
    )
  }

  if (readBlocked) {
    return renderSurface(
      <>
        <aside
          className="provisional-collections-bar"
          role="status"
          aria-live="polite"
        >
          <p className="provisional-collections-bar__description">
            {readBlockedNotice}
          </p>
        </aside>
        <HistoricalLibraryHost
          provider={libraryProvider}
          onOpenMonth={yearMonth => {
            onOpenMonth(yearMonth as PublicationYearMonth, { origin: 'library' })
          }}
          onExit={onExit}
          exitLabel={exitLabel}
        />
      </>
    )
  }

  return renderSurface(null)
}
