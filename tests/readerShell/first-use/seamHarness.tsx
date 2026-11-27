import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { SeamHarnessRoot } from './SeamHarnessApp.tsx'
import '../../../src/index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <SeamHarnessRoot />
    </BrowserRouter>
  </StrictMode>,
)
