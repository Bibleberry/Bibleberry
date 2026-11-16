import { createRoot } from 'react-dom/client'
import '../../../src/index.css'
import '../../../src/App.css'
import '../../../src/components/hubContinue/hubContinue.css'
import { HarnessApp } from './HarnessApp.tsx'

createRoot(document.getElementById('root')!).render(<HarnessApp />)
