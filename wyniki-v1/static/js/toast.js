/**
 * Toast Notification System
 * Usage:
 *   showToast('success', 'Zapisano!', 'Zmiany zostały pomyślnie zapisane');
 *   showToast('error', 'Błąd', 'Nie udało się połączyć z serwerem');
 *   showToast('warning', 'Uwaga', 'Zbliżasz się do limitu zapytań');
 *   showToast('info', 'Info', 'Nowa wersja jest dostępna');
 */

let toastContainer = null;
let toastIdCounter = 0;

/**
 * Initialize toast container (called automatically on first toast)
 */
function initToastContainer() {
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.className = 'toast-container';
    document.body.appendChild(toastContainer);
  }
}

/**
 * Get icon for toast type
 */
function getToastIcon(type) {
  const icons = {
    success: '✓',
    error: '✕',
    warning: '⚠',
    info: 'ℹ'
  };
  return icons[type] || icons.info;
}

/**
 * Show a toast notification
 * @param {string} type - 'success', 'error', 'warning', or 'info'
 * @param {string} title - Toast title
 * @param {string} message - Toast message (optional)
 * @param {number} duration - Duration in ms (default: 5000, 0 = no auto-hide)
 * @returns {object} Toast controller with dismiss() method
 */
function showToast(type, title, message = '', duration = 5000) {
  initToastContainer();
  
  const toastId = `toast-${++toastIdCounter}`;
  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.id = toastId;
  toast.setAttribute('role', 'alert');
  toast.setAttribute('aria-live', 'polite');
  
  const icon = document.createElement('div');
  icon.className = 'toast__icon';
  icon.textContent = getToastIcon(type);
  
  const content = document.createElement('div');
  content.className = 'toast__content';
  
  const titleEl = document.createElement('div');
  titleEl.className = 'toast__title';
  titleEl.textContent = title;
  content.appendChild(titleEl);
  
  if (message) {
    const messageEl = document.createElement('div');
    messageEl.className = 'toast__message';
    messageEl.textContent = message;
    content.appendChild(messageEl);
  }
  
  const closeBtn = document.createElement('button');
  closeBtn.className = 'toast__close';
  closeBtn.innerHTML = '×';
  closeBtn.setAttribute('aria-label', 'Zamknij powiadomienie');
  closeBtn.onclick = () => dismissToast(toastId);
  
  toast.appendChild(icon);
  toast.appendChild(content);
  toast.appendChild(closeBtn);
  
  // Add progress bar if auto-hide is enabled
  if (duration > 0) {
    const progress = document.createElement('div');
    progress.className = 'toast__progress';
    const progressBar = document.createElement('div');
    progressBar.className = 'toast__progress-bar';
    progressBar.style.animationDuration = `${duration}ms`;
    progress.appendChild(progressBar);
    toast.appendChild(progress);
  }
  
  toastContainer.appendChild(toast);
  
  // Auto-hide after duration
  let timeoutId = null;
  if (duration > 0) {
    timeoutId = setTimeout(() => dismissToast(toastId), duration);
  }
  
  // Return controller
  return {
    dismiss: () => {
      if (timeoutId) clearTimeout(timeoutId);
      dismissToast(toastId);
    }
  };
}

/**
 * Dismiss a toast by ID
 */
function dismissToast(toastId) {
  const toast = document.getElementById(toastId);
  if (!toast) return;
  
  toast.classList.add('toast-exit');
  toast.addEventListener('animationend', () => {
    toast.remove();
    // Clean up container if empty
    if (toastContainer && toastContainer.children.length === 0) {
      toastContainer.remove();
      toastContainer = null;
    }
  }, { once: true });
}

/**
 * Dismiss all toasts
 */
function dismissAllToasts() {
  if (!toastContainer) return;
  const toasts = toastContainer.querySelectorAll('.toast');
  toasts.forEach(toast => dismissToast(toast.id));
}

// Export for use in other scripts
window.showToast = showToast;
window.dismissToast = dismissToast;
window.dismissAllToasts = dismissAllToasts;
