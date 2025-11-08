/**
 * Modal Confirmation Dialog
 * Replaces window.confirm() with a nicer modal
 * Usage:
 *   const confirmed = await showConfirmDialog('Czy na pewno?', 'Ta akcja jest nieodwracalna');
 *   if (confirmed) { ... }
 */

/**
 * Show a confirmation dialog
 * @param {string} title - Dialog title
 * @param {string} message - Dialog message
 * @param {object} options - Options: { confirmText, cancelText, danger }
 * @returns {Promise<boolean>} True if confirmed, false if cancelled
 */
function showConfirmDialog(title, message, options = {}) {
  return new Promise((resolve) => {
    const {
      confirmText = 'OK',
      cancelText = 'Anuluj',
      danger = false
    } = options;
    
    // Create overlay
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'modal-title');
    
    // Create modal
    const modal = document.createElement('div');
    modal.className = 'modal';
    
    // Header
    const header = document.createElement('div');
    header.className = 'modal__header';
    const titleEl = document.createElement('h2');
    titleEl.className = 'modal__title';
    titleEl.id = 'modal-title';
    titleEl.textContent = title;
    header.appendChild(titleEl);
    
    // Body
    const body = document.createElement('div');
    body.className = 'modal__body';
    body.textContent = message;
    
    // Footer
    const footer = document.createElement('div');
    footer.className = 'modal__footer';
    
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'modal__button modal__button--secondary';
    cancelBtn.textContent = cancelText;
    cancelBtn.type = 'button';
    
    const confirmBtn = document.createElement('button');
    confirmBtn.className = `modal__button modal__button--${danger ? 'danger' : 'primary'}`;
    confirmBtn.textContent = confirmText;
    confirmBtn.type = 'button';
    
    footer.appendChild(cancelBtn);
    footer.appendChild(confirmBtn);
    
    // Assemble
    modal.appendChild(header);
    modal.appendChild(body);
    modal.appendChild(footer);
    overlay.appendChild(modal);
    
    // Event handlers
    const cleanup = (result) => {
      overlay.style.animation = 'modal-fade-in 0.2s ease-out reverse';
      setTimeout(() => {
        overlay.remove();
        resolve(result);
      }, 200);
    };
    
    cancelBtn.onclick = () => cleanup(false);
    confirmBtn.onclick = () => cleanup(true);
    
    // Click outside to cancel
    overlay.onclick = (e) => {
      if (e.target === overlay) {
        cleanup(false);
      }
    };
    
    // ESC to cancel
    const escHandler = (e) => {
      if (e.key === 'Escape') {
        cleanup(false);
        document.removeEventListener('keydown', escHandler);
      }
    };
    document.addEventListener('keydown', escHandler);
    
    // Show modal
    document.body.appendChild(overlay);
    confirmBtn.focus();
  });
}

// Export
window.showConfirmDialog = showConfirmDialog;

// Override window.confirm for backwards compatibility (optional)
window.confirmOriginal = window.confirm;
window.confirm = function(message) {
  // If called without async context, fall back to original
  if (!window.Promise) {
    return window.confirmOriginal(message);
  }
  // For async code, this won't work properly, but we can try
  // Better to use showConfirmDialog directly
  return window.confirmOriginal(message);
};
