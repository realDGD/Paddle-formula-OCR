export const $ = (selector, root = document) => root.querySelector(selector);

export function endpoint(path) {
  return new URL(path, document.baseURI).toString();
}

export function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function closestAllowedValue(value, allowed, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return allowed.reduce((closest, candidate) => (
    Math.abs(candidate - numeric) < Math.abs(closest - numeric) ? candidate : closest
  ), fallback);
}
