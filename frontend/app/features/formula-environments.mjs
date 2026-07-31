const formulaEnvironmentNames = new Set([
  'eqnarray', 'align', 'aligned', 'gathered', 'cases', 'split', 'array',
]);

function unwrapOneFormulaEnvironment(value) {
  const source = String(value || '').trim();
  const match = source.match(/^\\begin\{(eqnarray|align|aligned|gathered|cases|split|array)(\*)?\}([\s\S]*?)\\end\{\1\2\}\s*$/);
  if (!match) return null;
  let inner = match[3];
  if (match[1] === 'array') inner = inner.replace(/^\{[^{}\n]*\}/, '');
  // Remove only the line breaks introduced by this tool. Indentation and all
  // other whitespace belong to the user's source and must survive a switch.
  inner = inner.replace(/^\r?\n/, '').replace(/\r?\n$/, '');
  return inner;
}

function repairLegacyNestedFormula(value) {
  let inner = String(value || '');
  const withoutTrailingArtifacts = inner.replace(/(?:[ \t]*(?:&|\\\\)[ \t]*(?:\r?\n)?)+$/, '');
  const nested = unwrapOneFormulaEnvironment(withoutTrailingArtifacts);
  if (nested === null) return inner;

  // Old builds wrapped MathLive's serialized output repeatedly and left empty
  // alignment cells (`&` / `\\`) between wrappers. That signature is distinct
  // from a legitimate nested cases/split environment, so it can be repaired
  // without flattening intentional inner environments.
  inner = nested;
  while (true) {
    const cleaned = inner.replace(/(?:[ \t]*(?:&|\\\\)[ \t]*(?:\r?\n)?)+$/, '');
    const next = unwrapOneFormulaEnvironment(cleaned);
    if (next === null) return cleaned;
    inner = next;
  }
}

function normalizeArrayColumnFormat(value) {
  const format = String(value || '');
  return /^[lcr]+$/.test(format) ? format : 'c';
}

export function getOuterArrayColumnFormat(value) {
  const source = String(value || '').trim();
  const match = source.match(/^\\begin\{array\}\{([lcr]+)\}/);
  return match ? match[1] : null;
}

export function switchFormulaEnvironment(value, environmentId, arrayColumnFormat = 'c') {
  const environment = String(environmentId || 'none');
  if (environment !== 'none' && !formulaEnvironmentNames.has(environment)) return null;

  const source = String(value || '').trim();
  const unwrapped = unwrapOneFormulaEnvironment(source);
  const inner = unwrapped === null ? source : repairLegacyNestedFormula(unwrapped);
  if (environment === 'none') return inner;

  const begin = environment === 'array'
    ? `\\begin{array}{${normalizeArrayColumnFormat(arrayColumnFormat)}}`
    : `\\begin{${environment}}`;
  return `${begin}\n${inner}\n\\end{${environment}}`;
}

export function createFormulaEnvironmentSwitcher() {
  let arrayColumnFormat = 'c';
  return (value, environmentId) => {
    arrayColumnFormat = getOuterArrayColumnFormat(value) || arrayColumnFormat;
    return switchFormulaEnvironment(value, environmentId, arrayColumnFormat);
  };
}
