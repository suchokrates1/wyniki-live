const EMAIL_RE = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;

export function escapeQuickInfoText(message) {
  return String(message || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function formatQuickInfoHtml(message) {
  return escapeQuickInfoText(message).replace(
    EMAIL_RE,
    '<a class="tournament-info-banner__mail" href="mailto:$1">$1</a>',
  );
}
