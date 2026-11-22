import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../../src/index.css'
import '../../../src/App.css'
import { ChallengeReaderHarnessApp } from './HarnessApp.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ChallengeReaderHarnessApp />
  </StrictMode>,
)
