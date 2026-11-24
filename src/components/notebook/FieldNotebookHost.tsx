import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { defaultGuestParticipationStore } from '../../participation/defaultGuestStore.ts'
import { parsePublicationYearMonth } from '../../participation/identity.ts'
import { acknowledgeNotebookEntry, type ReaderParticipationStore } from '../../participation/store.ts'
import type { CanonicalAwardId } from '../../participation/types.ts'
import { useReaderParticipation } from '../../participation/useReaderParticipation.ts'
import { FieldNotebookView } from './FieldNotebookView.tsx'
import {
  buildNotebookCollectionProjection,
  buildNotebookYearEntries,
  getCurrentCivilYearMonth,
  type NotebookBrowseMode,
  type NotebookEarnedCardItem,
} from './fieldNotebookModel.ts'

export interface FieldNotebookHostProps {
  readonly store?: ReaderParticipationStore
  readonly initialBrowseMode?: NotebookBrowseMode
  readonly initialYear?: number
  readonly initialSelectedYearMonth?: string | null
  readonly referenceYearMonth?: string
  readonly publishedYearMonths?: ReadonlySet<string>
  readonly onExit?: () => void
  readonly exitLabel?: string
}

/**
 * Store-injected container for the Field Notebook earned-only collection (R14-7).
 *
 * Connects `ReaderParticipationStore` (real local guest store or synthetic test store)
 * to `FieldNotebookView`, dispatches `markEarnedCardViewed` exclusively when opening
 * an individual valid Card in `EarnedScriptureCardViewer`, and never touches
 * `hubAnnouncementAcked`, `earnedOn`, or network endpoints.
 */
export function FieldNotebookHost({
  store = defaultGuestParticipationStore,
  initialBrowseMode = 'yearMonth',
  initialYear,
  initialSelectedYearMonth = null,
  referenceYearMonth,
  publishedYearMonths,
  onExit,
  exitLabel = 'Return',
}: FieldNotebookHostProps) {
  const participationSnapshot = useReaderParticipation(store)

  const resolvedReferenceMonth = useMemo(
    () => parsePublicationYearMonth(referenceYearMonth) ?? getCurrentCivilYearMonth(),
    [referenceYearMonth],
  )

  const initialValidMonth = useMemo(
    () => (initialSelectedYearMonth ? parsePublicationYearMonth(initialSelectedYearMonth) : null),
    [initialSelectedYearMonth],
  )

  const [browseMode, setBrowseMode] = useState<NotebookBrowseMode>(initialBrowseMode)
  const [selectedYear, setSelectedYear] = useState<number>(() => {
    if (initialValidMonth) {
      return Number(initialValidMonth.slice(0, 4))
    }
    if (typeof initialYear === 'number' && Number.isInteger(initialYear) && initialYear >= 1 && initialYear <= 9999) {
      return initialYear
    }
    return Number(resolvedReferenceMonth.slice(0, 4))
  })
  const [selectedYearMonth, setSelectedYearMonth] = useState<string | null>(initialValidMonth)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedTheme, setSelectedTheme] = useState<string | null>(null)
  const [activeAwardId, setActiveAwardId] = useState<CanonicalAwardId | null>(null)

  // The R06 shell retains this host inside Activity, which reconnects effects
  // when the Notebook becomes visible again. Award updates within a visit
  // leave this effect alone.
  useEffect(() => {
    if (participationSnapshot.status === 'ready') {
      void acknowledgeNotebookEntry(store)
    }
  }, [store, participationSnapshot.status])

  const projection = useMemo(
    () =>
      buildNotebookCollectionProjection(participationSnapshot.committedData, {
        referenceYearMonth: resolvedReferenceMonth,
        publishedYearMonths,
      }),
    [participationSnapshot.committedData, resolvedReferenceMonth, publishedYearMonths],
  )

  const monthEntries = useMemo(
    () =>
      buildNotebookYearEntries(projection.allEarnedCards, selectedYear, {
        referenceYearMonth: resolvedReferenceMonth,
        publishedYearMonths,
      }),
    [projection.allEarnedCards, selectedYear, resolvedReferenceMonth, publishedYearMonths],
  )

  const handleSelectYear = useCallback((year: number) => {
    if (!Number.isInteger(year) || year < 1 || year > 9999) return
    setSelectedYear(year)
    setSelectedYearMonth(null)
  }, [])

  const handleSelectMonth = useCallback((yearMonth: string | null) => {
    if (yearMonth === null) {
      setSelectedYearMonth(null)
      return
    }
    const valid = parsePublicationYearMonth(yearMonth)
    if (!valid) return
    setSelectedYear(Number(valid.slice(0, 4)))
    setSelectedYearMonth(valid)
  }, [])

  const handleOpenCard = useCallback(
    (item: NotebookEarnedCardItem) => {
      if (!item.hasCardSnapshot || !item.earnedCard) return
      setActiveAwardId(item.awardId)
      if (!item.cardViewed) {
        void store
          .dispatch({
            type: 'markEarnedCardViewed',
            awardId: item.awardId,
          })
          .catch(() => {
            // Viewer stays open even if persistence fails transiently
          })
      }
    },
    [store],
  )

  const handleCloseCard = useCallback(() => {
    setActiveAwardId(null)
  }, [])

  const loading = participationSnapshot.status === 'hydrating'
  const unavailable = participationSnapshot.health !== 'ok'
    && projection.allEarnedCards.length === 0
    && projection.lifetime.distinctCompletedChallenges === 0
  if (loading || unavailable) {
    return (
      <div className="standard-page notebook-page">
        {onExit && (
          <div className="notebook-topbar">
            <button type="button" className="back-link" onClick={onExit}>
              <ArrowLeft size={17} aria-hidden="true" /> {exitLabel}
            </button>
          </div>
        )}
        <h1>Field Notebook</h1>
        <p role="status">{loading ? 'Loading Field Notebook…' : 'Your Field Notebook is unavailable right now.'}</p>
      </div>
    )
  }

  const activeCard =
    activeAwardId !== null ? projection.itemsByAwardId[activeAwardId] ?? null : null

  return (
    <FieldNotebookView
      projection={projection}
      browseMode={browseMode}
      selectedYear={selectedYear}
      monthEntries={monthEntries}
      selectedYearMonth={selectedYearMonth}
      searchQuery={searchQuery}
      selectedTheme={selectedTheme}
      activeCard={activeCard}
      onChangeBrowseMode={setBrowseMode}
      onSelectYear={handleSelectYear}
      onSelectMonth={handleSelectMonth}
      onSearchQueryChange={setSearchQuery}
      onSelectTheme={setSelectedTheme}
      onOpenCard={handleOpenCard}
      onCloseCard={handleCloseCard}
      onExit={onExit}
      exitLabel={exitLabel}
    />
  )
}
