import { useCallback } from 'react'
import { ArrowLeft, Library } from 'lucide-react'
import type { LibraryMonthIndexProvider } from '../cms/reader/libraryMonthIndexProvider.ts'
import { LibraryShelfHost } from '../components/libraryShelf/LibraryShelfHost.tsx'
import type {
  LibraryShelfSurface,
  OpenMonthContext,
} from '../components/libraryShelf/libraryShelfModel.ts'
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
  shelfStore = defaultGuestShelfStore,
  libraryProvider,
}: AppLibraryShelfHostProps) {
  const shelfSnapshot = useGuestShelfStore(shelfStore)
  const readBlocked = isShelfReadBlocked(shelfSnapshot.health)
  const writeWarning =
    shelfSnapshot.health === 'writeFailed' ||
    shelfSnapshot.health === 'storageUnavailable'

  const handleShelfStateChange = useCallback(
    (nextState: ShelfState) => {
      if (readBlocked) {
        return
      }
      void shelfStore.applyState(nextState)
    },
    [readBlocked, shelfStore],
  )

  if (shelfSnapshot.status === 'hydrating') {
    return (
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
      </main>
    )
  }

  if (readBlocked && surface === 'shelf') {
    return (
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
        </section>
      </main>
    )
  }

  return (
    <>
      {readBlocked ? (
        <aside
          className="provisional-collections-bar"
          role="status"
          aria-live="polite"
        >
          <p className="provisional-collections-bar__description">
            Saved Shelf data could not be read safely; Shelf changes are paused to
            protect existing device storage.
          </p>
        </aside>
      ) : writeWarning ? (
        <aside
          className="provisional-collections-bar"
          role="status"
          aria-live="polite"
        >
          <p className="provisional-collections-bar__description">
            Shelf changes could not be saved to device storage yet and will retry
            when storage is available.
          </p>
        </aside>
      ) : null}
      <LibraryShelfHost
        shelfState={shelfSnapshot.state}
        onShelfStateChange={handleShelfStateChange}
        libraryProvider={libraryProvider}
        surface={surface}
        initialSurface={surface}
        onSurfaceChange={onSurfaceChange}
        onOpenMonth={onOpenMonth}
        onExit={onExit}
        exitLabel={exitLabel}
      />
    </>
  )
}
