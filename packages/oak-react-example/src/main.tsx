import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app.js'

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Missing #root element for oak-react-example')
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
