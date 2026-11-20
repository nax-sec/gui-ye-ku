// 核对毛笔字体（Ma Shan Zheng）是否覆盖游戏里所有大字。用法：node dev/fontcheck.mjs /tmp/msz.css
import fs from 'node:fs';
const css = fs.readFileSync(process.argv[2], 'utf8');
const ranges = [];
for (const m of css.matchAll(/unicode-range:\s*([^;]+);/g)) for (const r of m[1].split(',')) { const x = r.trim().replace('U+', '').split('-'); const a = parseInt(x[0], 16), b = parseInt(x[1] || x[0], 16); ranges.push([a, b]); }
const has = ch => { const c = ch.codePointAt(0); return ranges.some(([a, b]) => c >= a && c <= b); };
const data = fs.readFileSync(new URL('../src/data.js', import.meta.url), 'utf8');
const glyphs = new Set([...data].filter(ch => ch >= '⺀'));
const miss = [...glyphs].filter(ch => /[一-鿿㐀-䶿]/.test(ch) && !has(ch));
console.log('汉字', [...glyphs].filter(ch => /[一-鿿]/.test(ch)).length, '缺', miss.length, miss.join(''));
