const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'out', 'src');
const bundlePath = path.join(root, 'l10n', 'bundle.l10n.en.json');

function unescape(value) {
  return value
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\'/g, "'")
    .replace(/\\\\/g, '\\');
}

function extractKeys() {
  const keys = new Set();
  const scan = (code) => {
    const re = /vscode\.l10n\.t\(\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)')/g;
    let match;
    while ((match = re.exec(code)) !== null) {
      keys.add(unescape(match[1] !== undefined ? match[1] : match[2]));
    }
  };
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (full.endsWith('.js')) scan(fs.readFileSync(full, 'utf8'));
    }
  };
  if (!fs.existsSync(outDir)) {
    console.error(`Compiled output not found: ${outDir}. Run "npm run compile" first.`);
    process.exit(1);
  }
  walk(outDir);
  return [...keys].sort();
}

const keys = extractKeys();

if (process.argv.includes('--list')) {
  console.log(JSON.stringify(keys, null, 2));
  console.log(`count: ${keys.length}`);
  process.exit(0);
}

if (!fs.existsSync(bundlePath)) {
  console.error(`Missing bundle: ${bundlePath}`);
  process.exit(1);
}
const bundle = JSON.parse(fs.readFileSync(bundlePath, 'utf8'));
const bundleKeys = new Set(Object.keys(bundle));
const missing = keys.filter(key => !bundleKeys.has(key));
const empty = keys.filter(key => bundleKeys.has(key) && !String(bundle[key]).trim());
const extra = [...bundleKeys].filter(key => !keys.includes(key)).sort();

if (missing.length) {
  console.error(`Missing translations (${missing.length}):`);
  for (const key of missing) console.error(`  - ${JSON.stringify(key)}`);
}
if (empty.length) {
  console.error(`Empty translations (${empty.length}):`);
  for (const key of empty) console.error(`  - ${JSON.stringify(key)}`);
}
if (extra.length) {
  console.warn(`Unused bundle keys (${extra.length}):`);
  for (const key of extra) console.warn(`  - ${JSON.stringify(key)}`);
}

if (missing.length || empty.length) process.exit(1);
console.log(`l10n bundle OK: ${keys.length} keys covered.`);
