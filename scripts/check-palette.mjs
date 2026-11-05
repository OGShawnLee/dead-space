// Fails if a color literal appears outside src/graphics/Palette.ts.
// Usage: node scripts/check-palette.mjs
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const roots = ['src', 'game.ts', 'style.css', 'index.html'];
const exts = /\.(ts|css|html)$/;
const literal = /(0x[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b)/g;
const allowed = join('src', 'graphics', 'Palette.ts');

const files = [];
const walk = (p) => {
  if (statSync(p).isDirectory()) readdirSync(p).forEach((n) => walk(join(p, n)));
  else if (exts.test(p)) files.push(p);
};
roots.forEach(walk);

let bad = 0;
for (const f of files) {
  if (relative('.', f) === allowed) continue;
  readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
    const m = line.match(literal);
    if (m) { bad++; console.log(`${f}:${i + 1}  ${m.join(', ')}`); }
  });
}
console.log(bad ? `\n${bad} line(s) with color literals outside Palette.ts` : 'Palette OK: no stray color literals');
process.exit(bad ? 1 : 0);
