import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'

// ── Native App Touch & Long-Press Hardening ────────────────────────────────────
// Suppress browser-like text selection and long-press floating menus (Copy, Share, etc.)
// on static UI elements (tabs, buttons, cards, headers), while preserving standard
// typing, selection, and clipboard operations inside genuine text entry fields.
if (typeof window !== 'undefined') {
  window.addEventListener(
    'contextmenu',
    (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const isEditable =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable ||
        Boolean(target.closest('input, textarea, [contenteditable="true"]'));
      if (!isEditable) {
        e.preventDefault();
      }
    },
    { passive: false }
  );

  window.addEventListener(
    'selectstart',
    (e: Event) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const isEditable =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable ||
        Boolean(target.closest('input, textarea, [contenteditable="true"], .selectable-text'));
      if (!isEditable) {
        e.preventDefault();
      }
    },
    { passive: false }
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
