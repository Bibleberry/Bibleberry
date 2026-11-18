import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../../src/index.css'
import { HarnessApp } from './HarnessApp.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HarnessApp />
  </StrictMode>,
)
