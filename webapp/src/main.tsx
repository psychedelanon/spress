import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MiniKitProvider } from '@coinbase/onchainkit/minikit'
import { TelegramBridge } from './TelegramBridge'
import './index.css'
import App from './App.tsx'

// Initialize Telegram SDK if available. This calls WebApp.ready() and
// WebApp.expand() so the mini-app properly loads inside Telegram.
TelegramBridge.getInstance()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MiniKitProvider projectId="spress-base-demo">
      <App />
    </MiniKitProvider>
  </StrictMode>,
)
