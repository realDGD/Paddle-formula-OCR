const fs = require('fs');
const path = require('path');
const https = require('https');

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Node.js' } }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

async function run() {
  console.log('Initializing MathJax 3 engine...');
  const mathjaxPath = path.resolve(__dirname, '../node_modules/mathjax/node-main.cjs');
  const packages = [
    'ams', 'amscd', 'physics', 'cancel', 'unicode', 'bbox', 'noerrors',
    'newcommand', 'configmacros', 'mathtools', 'cases', 'empheq', 'color',
    'enclose', 'extpfeil', 'centernot', 'upgreek', 'boldsymbol', 'units', 'gensymb'
  ];
  const MathJax = await require(mathjaxPath).init({
    loader: { load: ['input/tex', 'output/chtml', ...packages.map(p => `[tex]/${p}`)] },
    tex: { packages: { '[+]': packages } }
  });

  console.log('Fetching detexify-next symbols.json (1123 symbols)...');
  const urlSym = 'https://raw.githubusercontent.com/kirel/detexify-next/main/apps/web/public/data/symbols.json';
  const symData = await fetchJson(urlSym);

  console.log(`Auditing all ${symData.length} symbols with MathJax engine...`);

  const passedSymbols = [];
  const failedSymbols = [];

  for (const item of symData) {
    const cmd = item.command || '';
    if (!cmd) continue;

    try {
      const node = MathJax.tex2chtml(cmd, { display: false });
      const htmlStr = MathJax.startup.adaptor.outerHTML(node);

      if (htmlStr.includes('color: red') || htmlStr.includes('mjx-merror') || htmlStr.includes('merror')) {
        failedSymbols.push({ id: item.id, cmd, package: item.package, reason: 'MathJax red error' });
      } else {
        passedSymbols.push({ id: item.id, cmd, package: item.package, item });
      }
    } catch (e) {
      failedSymbols.push({ id: item.id, cmd, package: item.package, reason: e.message });
    }
  }

  console.log('\n================ MathJax Audit Results ================');
  console.log(`Total symbols checked: ${symData.length}`);
  console.log(`PASSED (100% MathJax renderable): ${passedSymbols.length}`);
  console.log(`FAILED (Cannot render in MathJax): ${failedSymbols.length}`);
  console.log('========================================================\n');

  console.log('Sample FAILED symbols (first 30):');
  failedSymbols.slice(0, 30).forEach(s => console.log(`  - ${s.cmd} (pkg: ${s.package || 'none'})`));

  console.log('\nSample PASSED symbols (first 20):');
  passedSymbols.slice(0, 20).forEach(s => console.log(`  + ${s.cmd} (pkg: ${s.package || 'none'})`));

  // Save the 100% verified valid symbol IDs
  const validIds = passedSymbols.map(s => s.id);
  fs.writeFileSync(path.resolve(__dirname, 'mathjax_valid_symbols.json'), JSON.stringify(validIds, null, 2));
  console.log(`\nSaved ${validIds.length} verified symbol IDs to scripts/mathjax_valid_symbols.json`);
}

run().catch(console.error);
