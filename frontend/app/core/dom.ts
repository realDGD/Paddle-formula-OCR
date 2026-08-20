export const $ = <T extends Element = any>(selector: string, root: ParentNode = document): T => (
  root.querySelector(selector) as T
);

export function endpoint(path: string) {
  return new URL(path, document.baseURI).toString();
}

export function escapeHtml(value: unknown) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function closestAllowedValue(value: unknown, allowed: number[], fallback: number) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return allowed.reduce((closest, candidate) => (
    Math.abs(candidate - numeric) < Math.abs(closest - numeric) ? candidate : closest
  ), fallback);
}
