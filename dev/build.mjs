// 把 src/ 拼成单文件 index.html。用法：node dev/build.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const rd = f => fs.readFileSync(path.join(root, 'src', f), 'utf8');
const js = ['data.js', 'core.js', 'ui.js'].map(rd).join('\n').replace(/^'use strict';\n/gm, '');
const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>鬼夜哭</title>
<meta name="description" content="造字肉鸽：把字根拼成字，把鬼写哭。">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Ma+Shan+Zheng&family=Noto+Serif+SC:wght@400;600&display=swap" rel="stylesheet" media="print" onload="this.media='all'">
<style>
${rd('style.css')}</style>
</head>
<body>
<div id="bg"></div>
<div id="app"></div>
<canvas id="fx"></canvas>
<div id="float"></div>
<div id="modal"></div>
<div id="tip"></div>
<script>
'use strict';
${js}</script>
</body>
</html>
`;
fs.writeFileSync(path.join(root, 'index.html'), html);
console.log('index.html', (html.length / 1024).toFixed(0) + ' KB');
