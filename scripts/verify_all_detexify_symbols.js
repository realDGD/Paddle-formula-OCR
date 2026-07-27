const fs = require('fs');
const https = require('https');
const path = require('path');

const DETEXIFY_SYMBOLS_URL = 'https://raw.githubusercontent.com/kirel/detexify-next/main/apps/web/public/data/symbols.json';

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function readJsonFromUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Paddle-Formula-OCR symbol auditor' } }, (response) => {
      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`下载 Detexify 符号库失败：HTTP ${response.statusCode}`));
        return;
      }
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        } catch (error) {
          reject(error);
        }
      });
    }).on('error', reject);
  });
}

function isMathJaxError(html) {
  return /mjx-merror|data-mjx-error|class="merror"|color:\s*red/i.test(html);
}

function hasVisibleMathOutput(html) {
  return /<mjx-(?:c|utext|mi|mo|mn|mtext|box)\b/i.test(html);
}

async function run() {
  const root = path.resolve(__dirname, '..');
  const sourcePath = argumentValue('--source');
  const mathjaxPath = path.join(root, 'node_modules/mathjax/node-main.cjs');
  const profile = require(path.join(root, 'static/vendor/mathjax/formula-ocr-profile.js'));
  const symbols = sourcePath
    ? JSON.parse(fs.readFileSync(path.resolve(sourcePath), 'utf8'))
    : await readJsonFromUrl(DETEXIFY_SYMBOLS_URL);

  const candidates = symbols.filter((item) => item.mathmode && String(item.command || '').trim());
  console.log(`Auditing ${candidates.length}/${symbols.length} Detexify symbols in direct math mode...`);
  console.log(`MathJax profile: ${profile.packages.join(', ')}`);

  // Do not use noerrors/noundefined here: their job is to conceal parse errors,
  // while this script must reject every command that produces one.
  const MathJax = await require(mathjaxPath).init({
    loader: {
      load: ['input/tex', 'output/chtml', ...profile.packages.map((name) => `[tex]/${name}`)],
    },
    tex: {
      packages: {
        '[+]': profile.packages,
        '[-]': profile.excludedPackages,
      },
    },
  });

  const accepted = [];
  const rejected = [];
  for (const item of candidates) {
    const command = item.command.trim();
    try {
      const node = await MathJax.tex2chtmlPromise(command, { display: false });
      const html = MathJax.startup.adaptor.outerHTML(node);
      if (isMathJaxError(html)) {
        rejected.push({ id: item.id, command, package: item.package || '', reason: 'MathJax error output' });
      } else if (!hasVisibleMathOutput(html)) {
        rejected.push({ id: item.id, command, package: item.package || '', reason: 'No visible MathJax glyph output' });
      } else {
        accepted.push({ id: item.id, command, package: item.package || '' });
      }
    } catch (error) {
      rejected.push({
        id: item.id,
        command,
        package: item.package || '',
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const audit = {
    source: DETEXIFY_SYMBOLS_URL,
    mathjaxVersion: require(path.join(root, 'node_modules/mathjax/package.json')).version,
    profile: { packages: profile.packages, fontExtensions: profile.fontExtensions },
    totalSourceSymbols: symbols.length,
    directMathCandidates: candidates.length,
    accepted,
    rejected,
  };
  fs.writeFileSync(
    path.join(__dirname, 'mathjax_valid_symbols.json'),
    `${JSON.stringify(accepted.map((item) => item.id), null, 2)}\n`,
  );
  fs.writeFileSync(
    path.join(__dirname, 'mathjax_symbol_audit.json'),
    `${JSON.stringify(audit, null, 2)}\n`,
  );

  console.log(`Accepted direct-math symbols: ${accepted.length}`);
  console.log(`Rejected: ${rejected.length}`);
  for (const failure of rejected.slice(0, 30)) {
    console.log(`  - ${failure.command} (${failure.package || 'base'}): ${failure.reason}`);
  }
  if (!accepted.length) process.exitCode = 1;
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
