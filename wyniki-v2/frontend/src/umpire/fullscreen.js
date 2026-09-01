export function fullscreenElement() {
  return document.fullscreenElement || document.webkitFullscreenElement || null;
}

export function canRequestFullscreen(doc = document) {
  const el = doc.documentElement;
  return Boolean(el.requestFullscreen || el.webkitRequestFullscreen);
}

export function isFullscreen(doc = document, win = window) {
  return Boolean(doc.fullscreenElement || doc.webkitFullscreenElement)
    || Boolean(win.matchMedia?.('(display-mode: fullscreen)').matches);
}

export async function toggleFullscreen(doc = document) {
  const root = doc.documentElement;
  if (fullscreenElement()) {
    const exit = doc.exitFullscreen || doc.webkitExitFullscreen;
    if (exit) await exit.call(doc);
    return;
  }
  const enter = root.requestFullscreen || root.webkitRequestFullscreen;
  if (enter) await enter.call(root);
}

export function bindFullscreenChange(onChange, doc = document) {
  const handler = () => onChange(isFullscreen(doc));
  doc.addEventListener('fullscreenchange', handler);
  doc.addEventListener('webkitfullscreenchange', handler);
  return () => {
    doc.removeEventListener('fullscreenchange', handler);
    doc.removeEventListener('webkitfullscreenchange', handler);
  };
}
