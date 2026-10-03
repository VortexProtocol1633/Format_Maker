/**
 * Format_Maker — shared helpers
 * - escapeHtml: prevents XSS when injecting user/scanned content into innerHTML
 * - openOverlay / closeOverlay / trapFocus: accessible modal behavior
 *   (focus moves into the overlay, Tab is trapped, focus is restored on close)
 */

export function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function getFocusable(overlay) {
  return Array.from(overlay.querySelectorAll(FOCUSABLE_SELECTOR)).filter(
    (el) => el.offsetParent !== null || el === document.activeElement
  );
}

/** Show an overlay, remember what was focused, and move focus inside it. */
export function openOverlay(overlay) {
  overlay.classList.remove('hidden');
  overlay._lastFocused = document.activeElement;
  const first = getFocusable(overlay)[0];
  if (first) first.focus();
}

/** Hide an overlay and restore focus to the previously focused element. */
export function closeOverlay(overlay) {
  overlay.classList.add('hidden');
  if (overlay._lastFocused && overlay._lastFocused.focus) {
    overlay._lastFocused.focus();
  }
  overlay._lastFocused = null;
}

// ---- Fonts offered by the block editor / preview / exports ----
// System families (Times New Roman, Arial, Aptos, Georgia, …) render wherever
// they're installed; Inter, Sora and Poppins are loaded from Google Fonts.
export const FONT_OPTIONS = [
  { value: 'Arial', label: 'Arial (default)' },
  { value: 'Inter', label: 'Inter' },
  { value: 'Sora', label: 'Sora' },
  { value: 'Poppins', label: 'Poppins' },
  { value: 'Times New Roman', label: 'Times New Roman' },
  { value: 'Aptos', label: 'Aptos' },
  { value: 'Georgia', label: 'Georgia' },
  { value: 'Courier New', label: 'Courier New' },
  { value: 'Verdana', label: 'Verdana' },
  { value: 'Tahoma', label: 'Tahoma' },
  { value: 'Trebuchet MS', label: 'Trebuchet MS' }
];

export const DEFAULT_FONT = 'Arial';

/** Resolve a block's font family (older blocks fall back to the default). */
export function blockFontName(block) {
  return (block && block.fontFamily) || DEFAULT_FONT;
}

/** CSS font-family declaration for a block's on-screen preview. */
export function blockFontCss(block) {
  return `font-family:"${blockFontName(block)}", sans-serif;`;
}

/** Show a small toast notification (success | error | info). */
export function showToast(message, type = 'info') {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  const icons = { success: 'fa-check-circle', error: 'fa-exclamation-circle', info: 'fa-info-circle' };
  const icon = document.createElement('i');
  icon.className = `fas ${icons[type] || icons.info}`;
  const span = document.createElement('span');
  span.textContent = message;
  toast.appendChild(icon);
  toast.appendChild(span);
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('toast-out');
    setTimeout(() => toast.remove(), 400);
  }, 3200);
}

/** Trap Tab focus inside an overlay while it is visible. */
export function trapFocus(overlay) {
  overlay.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab' || overlay.classList.contains('hidden')) return;
    const focusables = getFocusable(overlay);
    if (focusables.length === 0) {
      e.preventDefault();
      return;
    }
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || !overlay.contains(active))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (active === last || !overlay.contains(active))) {
      e.preventDefault();
      first.focus();
    }
  });
}