import { StrictMode, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { SaveScriptureControl } from '../../../src/components/scriptureCapture/SaveScriptureControl.tsx'
import { admitTrustedCatalogChallenge } from '../../../src/participation/admission.ts'
import { defaultGuestParticipationStore } from '../../../src/participation/defaultGuestStore.ts'
import { parseLocalCalendarDate } from '../../../src/participation/identity.ts'
import {
  createEnvelopePersistenceAdapter,
  type KeyValueStorageDriver,
} from '../../../src/participation/persistence.ts'
import { createReaderParticipationStore } from '../../../src/participation/store.ts'
import { useReaderParticipation } from '../../../src/participation/useReaderParticipation.ts'

const FIXED_TODAY = parseLocalCalendarDate('2026-11-16')!
const HARNESS_STORAGE_KEY = 'bibleberry-r09-2-harness-v2'

const ADMITTED_CHALLENGE = admitTrustedCatalogChallenge({
  documentId: 'nov-16-gratitude',
  screens: [{ id: 'screen-1' }],
  editorial: { adaptationReviewed: true },
})!

function createAsyncHydratingHarnessStore() {
  const backing = new Map<string, string>()
  let resolveHydration!: (value: string | null) => void
  const hydrationPromise = new Promise<string | null>(resolve => {
    resolveHydration = resolve
  })

  const driver: KeyValueStorageDriver = {
    getItem: () => hydrationPromise,
    setItem: (key, value) => {
      backing.set(key, value)
    },
    removeItem: key => {
      backing.delete(key)
    },
  }

  const store = createReaderParticipationStore(
    createEnvelopePersistenceAdapter({ storageKey: HARNESS_STORAGE_KEY, driver }),
  )

  return {
    store,
    completeHydration: () => resolveHydration(null),
  }
}

function createWriteFailureHarnessStore() {
  const backing = new Map<string, string>()
  let failWrites = true

  const driver: KeyValueStorageDriver = {
    getItem: key => backing.get(key) ?? null,
    setItem: (key, value) => {
      if (failWrites) {
        throw new Error('QuotaExceededError')
      }
      backing.set(key, value)
    },
    removeItem: key => {
      backing.delete(key)
    },
  }

  const store = createReaderParticipationStore(
    createEnvelopePersistenceAdapter({ storageKey: HARNESS_STORAGE_KEY, driver }),
  )

  return {
    store,
    recoverStorage: () => {
      failWrites = false
    },
  }
}

function createCorruptHarnessStore() {
  const backing = new Map([[HARNESS_STORAGE_KEY, '{corrupt-json']])
  const driver: KeyValueStorageDriver = {
    getItem: key => backing.get(key) ?? null,
    setItem: (key, value) => {
      backing.set(key, value)
    },
    removeItem: key => {
      backing.delete(key)
    },
  }
  return createReaderParticipationStore(
    createEnvelopePersistenceAdapter({ storageKey: HARNESS_STORAGE_KEY, driver }),
  )
}

function HarnessApp() {
  const mode = new URLSearchParams(window.location.search).get('mode') ?? 'default'

  const setup = useMemo(() => {
    if (mode === 'async-hydrating') {
      return { type: 'async-hydrating' as const, ...createAsyncHydratingHarnessStore() }
    }
    if (mode === 'write-failure') {
      return { type: 'write-failure' as const, ...createWriteFailureHarnessStore() }
    }
    if (mode === 'corrupt') {
      return { type: 'corrupt' as const, store: createCorruptHarnessStore() }
    }
    return { type: 'default' as const, store: defaultGuestParticipationStore }
  }, [mode])

  const snapshot = useReaderParticipation(setup.store)
  const [hydratedClicked, setHydratedClicked] = useState(false)
  const [recoveredClicked, setRecoveredClicked] = useState(false)

  return (
    <main style={{ maxWidth: 640, margin: '24px auto', padding: '0 16px', fontFamily: 'system-ui, sans-serif' }}>
      <h1>R09-2 Save Scripture Control Harness</h1>
      <p data-testid="store-status">
        Status: {snapshot.status} | Health: {snapshot.health} | Saved count: {snapshot.data.savedScriptures.length}
      </p>

      {setup.type === 'async-hydrating' && (
        <button
          type="button"
          disabled={hydratedClicked}
          onClick={() => {
            setHydratedClicked(true)
            setup.completeHydration()
          }}
        >
          Complete Hydration
        </button>
      )}

      {setup.type === 'write-failure' && (
        <button
          type="button"
          disabled={recoveredClicked}
          onClick={() => {
            setRecoveredClicked(true)
            setup.recoverStorage()
          }}
        >
          Recover Storage
        </button>
      )}

      <section aria-label="John 3:16 WEBP">
        <h2>John 3:16 (WEBP)</h2>
        <SaveScriptureControl
          reference="John 3:16"
          translation="WEBP"
          sourceChallenge={ADMITTED_CHALLENGE}
          store={setup.store}
          getToday={() => FIXED_TODAY}
        />
      </section>

      <section aria-label="John 3:16 NIV">
        <h2>John 3:16 (NIV)</h2>
        <SaveScriptureControl
          reference="John 3:16"
          translation="NIV"
          store={setup.store}
          getToday={() => FIXED_TODAY}
        />
      </section>

      <section aria-label="Psalm 23:1">
        <h2>Psalm 23:1 (Compact)</h2>
        <SaveScriptureControl
          reference="Psalm 23:1"
          translation="Not configured"
          compact
          store={setup.store}
          getToday={() => FIXED_TODAY}
        />
      </section>

      <section aria-label="Malformed Reference">
        <h2>Malformed Reference</h2>
        <SaveScriptureControl
          reference="Not a verse"
          store={setup.store}
          getToday={() => FIXED_TODAY}
        />
      </section>
    </main>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HarnessApp />
  </StrictMode>,
)
