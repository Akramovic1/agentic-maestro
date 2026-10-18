// Generates docs/CODEMAP.md: one section per workspace package (purpose, source files with their
// first doc-comment sentence, main exports), so builders navigate without exploring.
// Usage: node scripts/codemap.mjs <repo-root> [group ...]   (writes <repo-root>/docs/CODEMAP.md)
// Groups default to apps, packages, packages/adapters; any project can pass its own (e.g. src services libs).
import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.argv[2];
const groups = process.argv.length > 3 ? process.argv.slice(3) : ['apps', 'packages', 'packages/adapters'];
const pkgs = [];
for (const g of groups) {
  const dir = join(root, g);
  if (!existsSync(dir)) continue;
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (name === 'adapters' && g === 'packages') continue;
    if (statSync(p).isDirectory() && existsSync(join(p, 'package.json'))) pkgs.push(p);
  }
}

const firstSentence = (text) => {
  const s = text.replace(/\s+/g, ' ').trim();
  const m = s.match(/^(.{1,220}?[.!?])(\s|$)/);
  return (m ? m[1] : s.slice(0, 220)).trim();
};

const docOf = (src) => {
  // Only a HEADER comment counts: one that starts before the first import/export/statement.
  const cut = src.search(/^(import|export|const|function|class|type|interface|let|var)\b/m);
  const head = cut === -1 ? src : src.slice(0, cut);
  const m = head.match(/\/\*\*?([\s\S]*?)\*\//);
  if (m) return firstSentence(m[1].replace(/^\s*\*\s?/gm, ' '));
  const line = head.split('\n').find((l) => /^\s*\/\//.test(l));
  return line ? firstSentence(line.replace(/^\s*\/\/\s?/, '')) : '';
};

const exportsOf = (src) => {
  const names = new Set();
  for (const m of src.matchAll(/export\s+(?:async\s+)?(?:function|const|class|type|interface|enum)\s+([A-Za-z0-9_]+)/g)) names.add(m[1]);
  for (const m of src.matchAll(/export\s+(?:type\s+)?\{([^}]+)\}/g)) {
    for (const part of m[1].split(',')) {
      const n = part.trim().split(/\s+as\s+/).pop()?.replace(/^type\s+/, '').trim();
      if (n) names.add(n);
    }
  }
  return [...names];
};

const walk = (dir, out) => {
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (['node_modules', 'dist', '.next', 'generated', 'vendor'].includes(name)) continue;
      walk(p, out);
    } else if (/\.(ts|tsx|mjs|js)$/.test(name) && !/\.d\.ts$/.test(name)) out.push(p);
  }
  return out;
};

let md = `# Code map\n\nGenerated from the source by agentic-maestro scripts/codemap.mjs (do not edit by hand; regenerated after each merge).\nOne section per package: what it is, every source file with its first doc-comment sentence, and the main exports of its entry point. Read the sections of the packages your task touches instead of exploring.\n`;
for (const p of pkgs) {
  const pj = JSON.parse(readFileSync(join(p, 'package.json'), 'utf8'));
  const rel = relative(root, p);
  md += `\n## ${pj.name} (\`${rel}\`)\n`;
  if (pj.description) md += `${pj.description}\n`;
  const srcDir = existsSync(join(p, 'src')) ? join(p, 'src') : existsSync(join(p, 'app')) ? p : null;
  if (!srcDir) continue;
  const files = walk(srcDir, []).filter((f) => !/\/test\//.test(f)).slice(0, 80);
  const index = ['src/index.ts', 'src/index.tsx'].map((f) => join(p, f)).find(existsSync);
  if (index) {
    const ex = exportsOf(readFileSync(index, 'utf8'));
    if (ex.length) md += `Exports: ${ex.slice(0, 60).join(', ')}${ex.length > 60 ? `, … (${ex.length} total)` : ''}\n`;
  }
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    const lines = src.split('\n').length;
    const doc = docOf(src);
    md += `- \`${relative(root, f)}\` (${lines} lines)${doc ? ` — ${doc}` : ''}\n`;
  }
}
writeFileSync(join(root, 'docs/CODEMAP.md'), md);
console.log(`docs/CODEMAP.md: ${pkgs.length} packages, ${md.length} bytes`);
