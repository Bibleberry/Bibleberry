import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import './native/lifecycleService.ts'
import './index.css'
import App from './App.tsx'

const R06ReaderShell = import.meta.env.VITE_ENABLE_R06_SHELL === 'true'
  ? lazy(() => import('./readerShell/R06ReaderShell.tsx'))
  : null

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      {R06ReaderShell ? (
        <Suspense fallback={<p role="status">Opening Bibleberry…</p>}>
          <R06ReaderShell />
        </Suspense>
      ) : <App />}
    </BrowserRouter>
  </StrictMode>,
)
