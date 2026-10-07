// The sign-in pages (admin, organizer) share one form: the show/hide eye on every password
// field, the Caps Lock hint, a plain error, and a busy button while the server answers.

export function storageGet(key) {
  try { return sessionStorage.getItem(key); } catch { return null; }
}

export function storageSet(key, value) {
  try { sessionStorage.setItem(key, value); } catch { /* private mode: the session ends with the page */ }
}

/** Every `.adl-eye` button shows or hides the password field it controls. */
export function wirePasswordEyes(root = document) {
  root.querySelectorAll('.adl-eye').forEach((toggle) => {
    const input = document.getElementById(toggle.getAttribute('aria-controls'));
    toggle.addEventListener('click', () => {
      const visible = input.type === 'password';
      input.type = visible ? 'text' : 'password';
      toggle.setAttribute('aria-pressed', String(visible));
      toggle.setAttribute('aria-label', visible ? 'Ukryj hasło' : 'Pokaż hasło');
      input.focus();
    });
  });
}

export function wireCapsLock(inputs, hint) {
  const watch = (event) => {
    if (typeof event.getModifierState === 'function') hint.hidden = !event.getModifierState('CapsLock');
  };
  inputs.forEach((input) => {
    input.addEventListener('keydown', watch);
    input.addEventListener('keyup', watch);
  });
}

/**
 * The form's behaviour. `submit()` posts and resolves to an error message, or to
 * nothing when it already moved on; `label` and `busyLabel` are the button's two texts.
 */
export function wireSignInForm(options) {
  // label and busyLabel are read when needed: a page may switch them (sign in / set password)
  const { form, fields, error, notice, button, validate, submit } = options;
  const invalidate = (message, field) => {
    error.textContent = message;
    error.hidden = !message;
    fields.forEach((input) => input.setAttribute('aria-invalid', message && (!field || field === input) ? 'true' : 'false'));
  };
  fields.forEach((input) => input.addEventListener('input', () => { if (!error.hidden) invalidate(''); }));

  const busy = (on) => {
    button.disabled = on;
    button.textContent = on ? options.busyLabel : options.label;
    form.setAttribute('aria-busy', String(on));
  };

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const problem = validate?.();
    if (problem) {
      invalidate(problem.message, problem.field);
      problem.field?.focus();
      return;
    }
    invalidate('');
    if (notice) notice.hidden = true;
    busy(true);
    let message;
    try {
      message = await submit();
    } catch {
      message = 'Brak połączenia z serwerem. Spróbuj ponownie.';
    }
    if (!message) return;
    busy(false);
    const last = fields.filter((input) => input.offsetParent !== null).pop() || fields[0];
    invalidate(message);
    last.select?.();
    last.focus();
  });

  return { invalidate };
}

export function showNotice(notice, text, tone = '') {
  if (!text) return;
  notice.textContent = text;
  notice.classList.toggle('is-warn', tone === 'warn');
  notice.hidden = false;
}
