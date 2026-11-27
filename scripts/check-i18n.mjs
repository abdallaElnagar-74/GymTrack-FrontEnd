// Checks the app's Arabic dictionary against the code: `node scripts/check-i18n.mjs` (exit 1 when something is wrong).
// - every literal text passed to t() / plural() has an Arabic entry
// - every Arabic entry is still used, has Arabic letters and the same {placeholders} as its English key
// Texts built at run time (t(variable)) can't be seen here; keep those keys listed in DYNAMIC below.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const files = (dir) => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n);
  return statSync(p).isDirectory() ? files(p) : /\.(tsx?|jsx?)$/.test(n) ? [p] : [];
});
const code = [...files(join(ROOT, 'src')), ...files(join(ROOT, 'app'))].filter((f) => !/[\\/]i18n[\\/]ar\.ts$/.test(f));

// Parse ar.ts without TypeScript: the object literal is plain 'key': 'value' pairs.
const arSrc = readFileSync(join(ROOT, 'src', 'i18n', 'ar.ts'), 'utf8');
const str = String.raw`'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"`;
const unescape = (s) => s.replace(/\\(['"\\])/g, '$1').replace(/\\n/g, '\n');
const pair = new RegExp(String.raw`^\s*(?:(\w+)|${str})\s*:\s*\n?\s*(?:${str})\s*,`, 'gm');
const ar = new Map();
for (const m of arSrc.matchAll(pair)) ar.set(unescape(m[1] ?? m[2] ?? m[3]), unescape(m[4] ?? m[5]));

const used = new Map(); // key → first place
const call = new RegExp(String.raw`\b(?:t|plural)\(\s*(?:[^,()'"]+,\s*)?(?:${str})(?:\s*,\s*(?:${str}))?`, 'g');
for (const f of code) {
  const src = readFileSync(f, 'utf8');
  for (const m of src.matchAll(call)) {
    for (const k of [m[1] ?? m[2], m[3] ?? m[4]].filter((x) => x != null).map(unescape)) {
      if (!used.has(k)) used.set(k, `${f.slice(ROOT.length + 1)}:${src.slice(0, m.index).split('\n').length}`);
    }
  }
}

// plural(<any expression>, 'one', 'other'): the two texts right before the closing parenthesis.
for (const f of code) {
  for (const m of readFileSync(f, 'utf8').matchAll(new RegExp(String.raw`plural\([\s\S]*?(?:${str})\s*,\s*(?:${str})\s*,?\s*\)`, 'g')))
    for (const k of [m[1] ?? m[2], m[3] ?? m[4]].map(unescape)) if (!used.has(k)) used.set(k, f.slice(ROOT.length + 1));
}

// Built-in plan templates: t(tpl.description) (names are proper names and become the user's plan names).
const tplSrc = readFileSync(join(ROOT, 'src', 'db', 'templates.ts'), 'utf8');
for (const m of tplSrc.matchAll(new RegExp(String.raw`\bdescription:\s*(?:${str})`, 'g'))) {
  const k = unescape(m[1] ?? m[2]);
  if (!used.has(k)) used.set(k, 'src/db/templates.ts');
}

// Messages chosen by the HTTP client (error codes → English text, shown with t(message)).
const httpSrc = readFileSync(join(ROOT, 'src', 'api', 'http.ts'), 'utf8');
const httpTexts = [
  ...httpSrc.matchAll(new RegExp(String.raw`^\s*'[a-z_.]+'\s*:\s*(?:${str})`, 'gm')), // CODE_MESSAGES values
  ...httpSrc.matchAll(new RegExp(String.raw`ApiError\(\s*\d+\s*,\s*(?:${str})`, 'g')),
  ...httpSrc.matchAll(new RegExp(String.raw`429 \? (?:${str})`, 'g')),
];
for (const m of httpTexts) {
  const k = unescape(m[1] ?? m[2]);
  if (!used.has(k)) used.set(k, 'src/api/http.ts');
}

/** Keys reached through variables (e.g. t(group) for muscle groups). */
const DYNAMIC = /^(Chest|Back|Legs|Shoulders|Arms|Core|Other|All)$/;

const problems = [];
for (const [k, where] of used) if (!ar.has(k)) problems.push(`missing Arabic: "${k}"  (${where})`);
for (const [k, v] of ar) {
  if (!used.has(k) && !DYNAMIC.test(k)) problems.push(`unused entry: "${k}"`);
  if (!/[\u0600-\u06FF]/.test(v) && !/^GymTrack$/.test(v)) problems.push(`not Arabic: "${k}" → "${v}"`);
  const ph = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((x) => x[1]).sort().join();
  if (ph(k) !== ph(v)) problems.push(`placeholders differ: "${k}" → "${v}"`);
  if (/\.\.\./.test(v)) problems.push(`use … not ... : "${k}"`);
  if (/(?<=[\u0600-\u06FF])\s*[?;]/.test(v)) problems.push(`use ؟ ؛ in Arabic: "${k}" → "${v}"`);
  if (/(?<=[\u0600-\u06FF]),/.test(v)) problems.push(`use the Arabic comma ، : "${k}" → "${v}"`);
}

console.log(`${used.size} texts in code, ${ar.size} Arabic entries.`);
if (problems.length) {
  console.log(problems.join('\n'));
  process.exit(1);
}
console.log('All good.');
