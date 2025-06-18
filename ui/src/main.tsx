import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Handle dynamic viewport height for mobile browsers
function setMobileViewportHeight() {
  // Calculate the actual viewport height
  const vh = window.innerHeight * 0.01;
  // Set the custom property to the actual viewport height
  document.documentElement.style.setProperty('--vh', `${vh}px`);
}

// Set initial height
setMobileViewportHeight();

// Listen for resize events to update the height
window.addEventListener('resize', setMobileViewportHeight);
window.addEventListener('orientationchange', setMobileViewportHeight);

// Also listen for visual viewport changes (for iOS Safari and modern Android browsers)
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', setMobileViewportHeight);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
