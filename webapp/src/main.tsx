import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MiniKitProvider } from '@coinbase/onchainkit/minikit'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MiniKitProvider projectId="spress-base-demo">
      <App />
    </MiniKitProvider>
  </StrictMode>,
)
