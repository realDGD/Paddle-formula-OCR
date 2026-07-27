import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { convertLatexToMarkup } from 'mathlive/ssr';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const macros = require(path.join(root, 'static/vendor/mathlive/formula-ocr-macros.js'));
const datasetPath = path.join(root, 'static/vendor/detexify/detexify-dataset.json');
const outputPath = path.join(root, 'scripts/mathlive_symbol_audit.json');
const approximateMacroNames = new Set(['mathds']);

function mathLiveError(markup) {
  return /\bML__error\b/.test(markup) || /\bML__latex-error\b/.test(markup);
}

function commandMacroName(command) {
  return /^\\([A-Za-z]+)/.exec(command)?.[1] || '';
}

const symbols = JSON.parse(fs.readFileSync(datasetPath, 'utf8'));
const supported = [];
const exactlySupported = [];
const approximated = [];
const unsupported = [];

for (const item of symbols) {
  const command = String(item.cmd || '').trim();
  if (!command) continue;
  try {
    const markup = convertLatexToMarkup(command, { macros });
    if (mathLiveError(markup)) {
      unsupported.push({ id: item.id, command, package: item.pkg || '', reason: 'MathLive error output' });
    } else {
      const result = { id: item.id, command, package: item.pkg || '' };
      supported.push(result);
      if (approximateMacroNames.has(commandMacroName(command))) {
        approximated.push({
          ...result,
          editorFallback: String(macros[commandMacroName(command)].def || ''),
          finalRenderer: 'MathJax dsfont',
        });
      } else {
        exactlySupported.push(result);
      }
    }
  } catch (error) {
    unsupported.push({
      id: item.id,
      command,
      package: item.pkg || '',
      reason: error instanceof Error ? error.message : String(error),
    });
  }
}

const unsupportedByPackage = Object.entries(
  unsupported.reduce((groups, item) => {
    const key = item.package || 'base';
    groups[key] = (groups[key] || 0) + 1;
    return groups;
  }, {}),
).sort(([, left], [, right]) => right - left).map(([name, count]) => ({ package: name, count }));

const audit = {
  mathliveVersion: require(path.join(root, 'node_modules/mathlive/package.json')).version,
  input: 'static/vendor/detexify/detexify-dataset.json',
  totalMathJaxVerifiedSymbols: symbols.length,
  addedMathLiveMacros: Object.keys(macros).sort(),
  supported,
  exactlySupported,
  approximated,
  unsupported,
  unsupportedByPackage,
};

fs.writeFileSync(outputPath, `${JSON.stringify(audit, null, 2)}\n`);
console.log(`MathLive supports ${supported.length}/${symbols.length} MathJax-verified Detexify symbols.`);
console.log(`Exact: ${exactlySupported.length}; editor approximation: ${approximated.length}; unsupported: ${unsupported.length}.`);
console.log(`Audit: ${path.relative(root, outputPath)}`);
for (const group of unsupportedByPackage) console.log(`  - ${group.package}: ${group.count}`);
