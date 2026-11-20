// 鬼夜哭 · 界面
'use strict';
const $ = (s, r) => (r || document).querySelector(s);
const QS = new URLSearchParams(location.search);
let SPEED = QS.has('speed') ? +QS.get('speed') : 1;
const sleep = ms => new Promise(r => setTimeout(r, ms * SPEED));
const app = $('#app'), floatEl = $('#float'), modalEl = $('#modal'), tipEl = $('#tip');
let G = null, B = null, scr = 'title', sel = [], tgi = 0, busy = false, cur = {};
const ui = { pick: null, dch: null, dictBack: null, pickCb: null, sorted: -1, meHp: 0 };
const esc = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
const tip = s => ` data-tip="${esc(s)}"`;
const ORDER = Object.keys(COMPS);
const byComp = (a, b) => ORDER.indexOf(a.c) - ORDER.indexOf(b.c);
const elOf = c => (CH[c] ? CH[c].el : '');
window.addEventListener('error', e => { window.__err = (window.__err || '') + e.message + ' @' + e.lineno + '\n'; });

const GL_KEYS = Object.keys(GLOSS).filter(k => !['墨', '讹', '朱批', '畏', '抗'].includes(k));
const glossOf = t => GL_KEYS.filter(k => new RegExp('(^|[ ；，、：「（])' + k + '($|[ ；，、。0-9+」「）])').test(t));
const glHtml = t => glossOf(t).map(k => `<b>${k}</b> ${GLOSS[k]}`).join('<br>');
const withGl = t => { const g = glHtml(t); return t + (g ? '<hr>' + g : ''); };

// ───────── 声音
const AU = { ctx: null };
function au() { if (META.mute || SPEED === 0) return null; if (!AU.ctx) { try { AU.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; } } if (AU.ctx.state === 'suspended') AU.ctx.resume(); return AU.ctx; }
function tone(f, d, o) { const c = au(); if (!c) return; o = o || {}; const t = c.currentTime + (o.at || 0), os = c.createOscillator(), g = c.createGain(); os.type = o.type || 'triangle'; os.frequency.setValueAtTime(f, t); if (o.to) os.frequency.exponentialRampToValueAtTime(o.to, t + d); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(o.v || 0.09, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + d); os.connect(g).connect(c.destination); os.start(t); os.stop(t + d + 0.03); }
function noise(d, o) { const c = au(); if (!c) return; o = o || {}; const n = (c.sampleRate * d) | 0, b = c.createBuffer(1, n, c.sampleRate), ch = b.getChannelData(0); for (let i = 0; i < n; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / n); const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(); s.buffer = b; f.type = o.type || 'bandpass'; f.frequency.value = o.f || 1800; f.Q.value = 0.7; g.gain.value = o.v || 0.12; s.connect(f).connect(g).connect(c.destination); s.start(c.currentTime + (o.at || 0)); }
const PENTA = [196, 220, 261.6, 293.7, 329.6, 392, 440, 523.3, 587.3, 659.3, 784];
const sfx = {
  tap: i => tone(PENTA[i % 10] * 2, 0.25, { v: 0.05 }),
  cast: n => { noise(0.28, { f: 2400, v: 0.1 }); tone(PENTA[1 + n], 0.7, { v: 0.08 }); if (n > 1) tone(PENTA[3 + n], 0.7, { v: 0.06, at: 0.05 }); if (n > 2) tone(PENTA[6 + n], 0.8, { v: 0.05, at: 0.1 }); },
  hit: () => { tone(150, 0.14, { type: 'sine', to: 55, v: 0.22 }); noise(0.07, { f: 900, v: 0.1 }); },
  phit: () => { tone(110, 0.22, { type: 'sine', to: 40, v: 0.3 }); noise(0.12, { f: 400, v: 0.16, type: 'lowpass' }); },
  blk: () => tone(520, 0.08, { type: 'square', v: 0.03 }),
  heal: () => { tone(523, 0.3, { v: 0.05 }); tone(784, 0.4, { v: 0.04, at: 0.08 }); },
  gold: () => { tone(1568, 0.12, { v: 0.04 }); tone(2093, 0.18, { v: 0.035, at: 0.06 }); },
  bad: () => tone(196, 0.3, { type: 'sawtooth', to: 110, v: 0.05 }),
  newc: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.7, { v: 0.06, at: i * 0.09 })),
  die: () => { noise(0.5, { f: 600, v: 0.14, type: 'lowpass' }); tone(330, 0.5, { to: 80, v: 0.07, type: 'sine' }); },
  nope: () => tone(140, 0.12, { type: 'square', v: 0.04 }),
  turn: () => tone(98, 0.5, { type: 'sine', v: 0.12 }),
  win: () => [392, 523, 659, 784].forEach((f, i) => tone(f, 0.9, { v: 0.07, at: i * 0.12 })),
  lose: () => [330, 262, 196, 147].forEach((f, i) => tone(f, 1.1, { v: 0.07, at: i * 0.2, type: 'sine' })),
};

// ───────── 粒子
const fxc = $('#fx'), fxx = fxc.getContext('2d'); let parts = [], fxOn = false, DPR = 1;
function fxSize() { DPR = Math.min(2, window.devicePixelRatio || 1); fxc.width = innerWidth * DPR; fxc.height = innerHeight * DPR; }
addEventListener('resize', fxSize); fxSize();
function fxLoop() {
  fxx.clearRect(0, 0, fxc.width, fxc.height); parts = parts.filter(p => p.life > 0);
  for (const p of parts) { p.life -= 1 / 60; p.vy += p.g; p.x += p.vx; p.y += p.vy; fxx.globalAlpha = Math.max(0, Math.min(1, p.life * 2.5)); fxx.fillStyle = p.c; fxx.beginPath(); if (p.grain) fxx.ellipse(p.x * DPR, p.y * DPR, p.r * DPR, p.r * 1.8 * DPR, p.rot, 0, 7); else fxx.arc(p.x * DPR, p.y * DPR, p.r * DPR, 0, 7); fxx.fill(); }
  fxx.globalAlpha = 1; if (parts.length) requestAnimationFrame(fxLoop); else fxOn = false;
}
function fxAdd(a) { if (SPEED === 0) return; parts.push(...a); if (parts.length > 700) parts.splice(0, parts.length - 700); if (!fxOn) { fxOn = true; requestAnimationFrame(fxLoop); } }
function splash(el, c, n) { if (!el) return; const r = el.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height * 0.42, a = []; for (let i = 0; i < n; i++) { const an = Math.random() * 6.28, sp = 1 + Math.random() * 6; a.push({ x, y, vx: Math.cos(an) * sp, vy: Math.sin(an) * sp - 1.5, g: 0.25, r: 1 + Math.random() * 3.2, c, life: 0.35 + Math.random() * 0.5 }); } fxAdd(a); }
function grainRain(n) { const a = []; for (let i = 0; i < n; i++) a.push({ x: Math.random() * innerWidth, y: -10 - Math.random() * 300, vx: -0.4 + Math.random() * 0.3, vy: 5 + Math.random() * 4, g: 0.05, r: 1.5 + Math.random() * 1.2, c: '#dcb65e', life: 1.3 + Math.random() * 0.7, grain: 1, rot: Math.random() * 3 }); fxAdd(a); }
function floatAt(el, s, cls, dy) { if (!el || SPEED === 0) return; const r = el.getBoundingClientRect(), d = document.createElement('div'); d.className = 'flt ' + cls; d.textContent = s; d.style.left = r.left + r.width / 2 + (Math.random() * 36 - 18) + 'px'; d.style.top = r.top + r.height * 0.4 + (dy || 0) + 'px'; floatEl.appendChild(d); setTimeout(() => d.remove(), 900); }
function banner(html, cls) { if (SPEED === 0) return; const d = document.createElement('div'); d.className = 'banner ' + (cls || ''); d.innerHTML = html; floatEl.appendChild(d); setTimeout(() => d.remove(), 2000); }

// ───────── 提示
function showTip(el) { tipEl.innerHTML = el.dataset.tip; tipEl.style.display = 'block'; const r = el.getBoundingClientRect(), w = tipEl.offsetWidth, h = tipEl.offsetHeight; let x = r.left + r.width / 2 - w / 2, y = r.top - h - 8; x = Math.max(8, Math.min(innerWidth - w - 8, x)); if (y < 8) y = r.bottom + 8; tipEl.style.left = x + 'px'; tipEl.style.top = y + 'px'; }
function hideTip() { tipEl.style.display = 'none'; }
let tipT;
document.addEventListener('mouseover', e => { const el = e.target.closest && e.target.closest('[data-tip]'); if (el) showTip(el); else hideTip(); });
document.addEventListener('touchstart', e => { const el = e.target.closest && e.target.closest('[data-tip]'); clearTimeout(tipT); if (el) { showTip(el); tipT = setTimeout(hideTip, 2800); } else hideTip(); }, { passive: true });

// ───────── 弹层
function modal(html) { modalEl.innerHTML = `<div class="dlg">${html}</div>`; modalEl.classList.add('on'); hideTip(); }
function closeModal() { modalEl.classList.remove('on'); modalEl.innerHTML = ''; ui.pickCb = null; }
modalEl.addEventListener('click', e => { if (e.target === modalEl) closeModal(); });
const cardHtml = (c, cls, attr) => `<span class="card ${cls || ''} el-${elOf(c.c)} ${c.up ? 'up' : ''} ${c.c === '讹' ? 'bad' : ''}" ${attr || ''}>${c.c}</span>`;
function help() {
  modal(`<h2>怎么玩</h2><ul>
    <li>手里是<b>字根</b>。点选 1～3 张，拼成一个字，花 <b>1 点墨</b>写出来。</li>
    <li>字是什么意思，就有什么用。<b>日＋月＝明</b>，<b>人＋木＝休</b>，<b>火＋火＝炎</b>。你认得多少字，就有多少招。</li>
    <li>一个字不管用了几张字根，都只耗 1 墨。所以尽量拼大字。</li>
    <li>拼得出但没写过的字，游戏不会告诉你是什么，只会说「这一手里还藏着几个」。自己找。</li>
    <li>第一次写出一个字，<b>天雨粟</b>。粟可以在墨庄买东西。</li>
    <li>敌人头顶写着它这回合要做什么。打败它，从它身上<b>拆字根</b>。</li>
    <li>键盘：数字键选字根，回车落笔，空格结束回合，←→ 换目标。</li></ul>
    <div class="acts"><button class="btn red" data-act="close">知道了</button></div>`);
}
function deckModal() {
  const grp = (t, a) => (a.length ? `<h3>${t} · ${a.length}</h3><div class="cards">${a.slice().sort(byComp).map(c => cardHtml(c, 'sm', tip(cardTip(c)))).join('')}</div>` : '');
  modal(`<h2>字根</h2>${B ? grp('牌堆', B.draw) + grp('弃牌堆', B.disc) + grp('手牌', B.hand) + grp('本场已失', B.gone) : grp('全部', G.deck)}
    ${G.relics.length ? `<h3>文房</h3>${G.relics.map(id => `<p><b style="color:#ef8d7d">${RELICS[id][0]}</b>　${RELICS[id][1]}</p>`).join('')}` : ''}
    ${G.boon ? `<h3>砚铭</h3><p><b style="color:var(--paper2)">${BOONS[G.boon][0]}</b>　${BOONS[G.boon][1]}</p>` : ''}
    <div class="acts"><button class="btn" data-act="close">合上</button></div>`);
}
function menuModal() {
  modal(`<h2>${KITS[G.kit].n}${G.asc ? ' · 墨阶 ' + G.asc : ''}</h2><div class="menu">
    <button class="btn" data-act="close">接着写</button><button class="btn" data-act="dict">字典　${dictCount()} / ${TOTAL}</button>
    <button class="btn" data-act="help">怎么玩</button><button class="btn" data-act="mute">${META.mute ? '音效：关' : '音效：开'}</button>
    <button class="btn" data-act="quit">搁笔（放弃这一局）</button></div>`);
}
function pickCard(title, pf, cb) {
  const idx = G.deck.map((c, i) => i).sort((a, b) => byComp(G.deck[a], G.deck[b]));
  modal(`<h2>${title}</h2><p class="lead">选一张字根。</p><div class="cards">${idx.map(i => { const c = G.deck[i], ok = !pf || pf(c); return `<button class="card sm el-${elOf(c.c)} ${c.up ? 'up' : ''} ${c.c === '讹' ? 'bad' : ''}" data-act="pk" data-i="${i}" ${ok ? '' : 'disabled style="opacity:.25"'}>${c.c}</button>`; }).join('')}</div><div class="acts"><button class="btn" data-act="close">算了</button></div>`);
  ui.pickCb = cb;
}

// ───────── 画面
const SCR = {};
function go(s) { scr = s; render(); }
function render() {
  hideTip();
  const inRun = G && ['map', 'battle', 'reward', 'shop', 'rest', 'event'].includes(scr);
  if (scr === 'battle' && B && ui.sorted !== B.turn) { ui.sorted = B.turn; B.hand.sort(byComp); }
  document.body.classList.toggle('run', !!inRun);
  app.innerHTML = (inRun ? hud() : '') + SCR[scr]();
  if (scr === 'map') { const w = $('.mapwrap'), n = $('.nd.can'); if (w && n) { const r = n.getBoundingClientRect(), wr = w.getBoundingClientRect(); w.scrollTop += r.top - wr.top - wr.height * 0.6; } }
  if (scr === 'battle' && B) ui.meHp = G.hp;
}
function hud() {
  return `<header class="hud">
    <span class="hp"${tip('生命')}><i>命</i>${G.hp}<small> / ${G.max}</small></span>
    <span class="gold"${tip('粟。写出这一局没写过的字，天上就掉粟。')}><i>粟</i>${G.gold}</span>
    <span class="where">${ACTS[G.act][0]} · ${ACTS[G.act][1]}</span>
    <span class="boon"${tip(`<b>砚铭 · ${BOONS[G.boon][0]}</b><br>${BOONS[G.boon][1]}`)}>${BOONS[G.boon][0]}</span>
    <span class="relics">${G.relics.map(id => `<b class="relic"${tip(`<b>${RELICS[id][0]}</b><br>${RELICS[id][1]}`)}>${RELICS[id][0][0]}</b>`).join('')}</span>
    <button class="btn" data-act="deck">字根 ${G.deck.length}</button><button class="btn" data-act="menu">☰</button></header>`;
}

SCR.title = () => {
  const save = loadRun(), n = dictCount();
  return `<div class="title">
    <div class="quote">昔者仓颉作书，而天雨粟，鬼夜哭。<small>——《淮南子·本经训》</small></div>
    <h1><span>鬼</span><span>夜</span><span>哭</span></h1>
    <p class="sub">把字根拼成字，把鬼写哭</p>
    <div class="menu">
      ${save ? `<button class="btn red" data-act="resume">续写</button><button class="btn" data-act="new"><span>另起一篇</span><small>${KITS[save.kit].n} · ${ACTS[save.act][0]}作废</small></button>` : `<button class="btn red" data-act="new">提笔</button>`}
      <button class="btn" data-act="dict"><span>字典</span><small>${n} / ${TOTAL}</small></button>
      <button class="btn" data-act="help"><span>怎么玩</span><small></small></button>
      <button class="btn" data-act="mute"><span>音效</span><small>${META.mute ? '关' : '开'}</small></button>
    </div>
    <div class="foot">${META.runs ? `写过 ${META.runs} 局，成 ${META.wins} 局${META.asc ? '　·　墨阶 ' + META.asc + ' 已开' : ''}` : ''}</div></div>`;
};

function openPick() {
  const n = dictCount(), R = RNG((Math.random() * 1e9) | 0);
  const un = KITS.map((k, i) => i).filter(i => KITS[i].need <= n);
  const kits = un.length <= 3 ? un : R.shuffle(un.slice()).slice(0, 3).sort((a, b) => a - b);
  ui.pick = { kits, boons: R.shuffle(Object.keys(BOONS)).slice(0, 3), kit: null, boon: null, asc: Math.min(META.asc, META.lastAsc || 0), next: KITS.find(k => k.need > n) };
  go('pick');
}
SCR.pick = () => {
  const p = ui.pick;
  return `<div class="body"><h2>提笔</h2><p class="lead">每一局的笔和砚铭都是随机摆出来的。</p>
    <h3>选一支笔 · 起手字根</h3><div class="grid3">${p.kits.map(i => { const k = KITS[i]; return `<button class="opt ${p.kit === i ? 'on' : ''}" data-act="pkit" data-i="${i}"><b>${k.n}</b>${META.kitWins[i] ? `<small>成 ${META.kitWins[i]}</small>` : ''}<p>${k.d}</p><span class="mini">${[...k.deck].map(c => `<span>${c}</span>`).join('')}</span></button>`; }).join('')}</div>
    ${p.next ? `<p class="muted" style="margin-top:8px">字典识满 ${p.next.need} 字，解锁新笔「${p.next.n}」（现在 ${dictCount()}）。</p>` : ''}
    <h3>选一方砚铭 · 这一局的规矩</h3><div class="grid3">${p.boons.map(id => `<button class="opt ${p.boon === id ? 'on' : ''}" data-act="pboon" data-id="${id}"><b>${BOONS[id][0]}</b><p>${BOONS[id][1]}</p></button>`).join('')}</div>
    <div class="foot-bar"><button class="btn" data-act="home">返回</button>
      ${META.asc ? `<span class="stepper"${tip(ASC.slice(1, p.asc + 1).map((s, i) => `${i + 1}　${s}`).join('<br>') || '没有额外难度')}>墨阶 <button class="btn sm" data-act="asc" data-d="-1">−</button><b>${p.asc}</b><button class="btn sm" data-act="asc" data-d="1">＋</button></span>` : ''}
      <button class="btn red" data-act="start" ${p.kit == null || !p.boon ? 'disabled' : ''}>落笔</button></div></div>`;
};

SCR.map = () => {
  const m = G.map, W = 520, RH = 74, H = m.rows * RH + 150, path = G.path || [], can = choices(G);
  const jit = id => { let h = 7; for (const ch of id + G.seed + G.act) h = (Math.imul(h, 31) + ch.charCodeAt(0)) | 0; return [((h & 255) / 255 - 0.5) * 34, (((h >> 8) & 255) / 255 - 0.5) * 20]; };
  const pos = id => { if (id === 'boss') return [W / 2, 62]; const d = m.nodes[id], j = jit(id); return [70 + d.c * 95 + j[0], H - 46 - d.r * RH + j[1]]; };
  const G_ = { B: '战', X: '凶', E: '奇', S: '市', R: '茶' };
  let ed = '', nd = '';
  for (const n of Object.values(m.nodes)) for (const x of n.next.length ? n.next : ['boss']) { const a = pos(n.id), b = pos(x), on = path.includes(n.id) && path.includes(x), cn = G.at === n.id && can.includes(x); ed += `<path class="ed ${on ? 'on' : cn ? 'can' : ''}" d="M${a[0]} ${a[1]} Q${a[0]} ${(a[1] + b[1]) / 2} ${b[0]} ${b[1]}"/>`; }
  for (const n of Object.values(m.nodes)) { const p = pos(n.id), c = can.includes(n.id); nd += `<g class="nd t-${n.t} ${path.includes(n.id) ? 'done' : ''} ${G.at === n.id ? 'now' : ''} ${c ? 'can' : ''}" ${c ? `data-act="go" data-id="${n.id}"` : ''} transform="translate(${p[0]} ${p[1]})"><circle r="21"/><text>${G_[n.t]}</text></g>`; }
  const bc = can.includes('boss'), bd = EN[m.boss];
  nd += `<g class="nd boss ${bc ? 'can' : ''}" ${bc ? 'data-act="go" data-id="boss"' : ''} transform="translate(${W / 2} 62)"><circle r="40"/><text>${bd.ch}</text></g><text class="lbl" x="${W / 2}" y="122">${ACTS[G.act][0]}之主 · ${bd.n}</text>`;
  return `<div class="legend"><span><b>战</b>小鬼</span><span><b style="color:#ef8d7d">凶</b>大鬼，掉文房</span><span><b style="color:var(--W)">奇</b>典故</span><span><b style="color:var(--gold)">市</b>墨庄</span><span><b style="color:var(--M)">茶</b>茶寮</span></div>
    <div class="mapwrap"><svg class="map" viewBox="0 0 ${W} ${H}">${ed}${nd}</svg></div>`;
};

// ── 战斗
const P_ST = [['str', '力', 'good', '力'], ['tstr', '力·本回合', 'good', '力'], ['dodge', '闪', 'good', '闪'], ['thorn', '荆', 'good', '荆'], ['tthorn', '荆·本回合', 'good', '荆'], ['regen', '愈', 'good', '愈'], ['ward', '御', 'good', '御'], ['reflect', '代', 'good', '代'],
  ['fort', '垒', 'good', 0, '每回合开始获得等量护盾'], ['growth', '苗', 'good', 0, '每回合开始回复等量生命'], ['handup', '拓', 'good', 0, '每回合多抽等量字根'], ['mastery', '历', 'good', 0, '所有字数值提升这么多（%）'],
  ['weak', '弱', 'bad', '弱'], ['vul', '伤', 'bad', '伤'], ['burn', '灼', 'bad', '灼']];
const E_ST = [['burn', '灼'], ['poison', '毒'], ['wet', '湿'], ['weak', '泣'], ['vul', '破'], ['stun', '困'], ['conf', '乱'], ['blind', '盲']];
const chip = (label, cls, t) => `<span class="st ${cls}"${tip(t)}>${label}</span>`;
function meSts() {
  const P = B.pl, M = B.mods, N = B.nx; let s = '';
  if (P.blk) s += chip('护盾 ' + P.blk, 'blk', '<b>护盾</b> ' + GLOSS.护盾);
  for (const [k, n, cls, g, t] of P_ST) if (P[k]) s += chip(n + ' ' + P[k], cls, `<b>${n}</b> ${g ? GLOSS[g] : t}`);
  if (P.barricade) s += chip('定', 'good', '护盾不再清零'); else if (P.keep) s += chip('留', 'good', '护盾保留到下回合');
  if (P.retain) s += chip('持', 'good', '本回合手牌不弃'); if (P.soul) s += chip('魂', 'good', '下一次生命归零时保留 10 点');
  if (M.free) s += chip('免墨 ' + M.free, 'good', '下一个字不耗墨'); if (M.twice) s += chip('再写 ' + M.twice, 'good', '下一个字施放两次');
  if (M.nmul !== 1) s += chip('下一字 ×' + fm(M.nmul), 'good', '下一个字数值倍率'); if (M.natk !== 1) s += chip('下一击 ×' + fm(M.natk), 'good', '下一个攻击字伤害倍率');
  if (M.child) s += chip('童', 'good', '下一个单写的字根数值 ×3'); if (M.frenzy) s += chip('狂', 'bad', '本回合写字不耗墨，每写一个字失去 3 生命');
  const nx = []; if (N.ink) nx.push('墨' + (N.ink > 0 ? '+' : '') + N.ink); if (N.draw) nx.push('抽+' + N.draw); if (N.blk) nx.push('护盾+' + N.blk); if (N.str) nx.push('力+' + N.str); if (N.all) nx.push('全体 ' + N.all); if (N.seal) nx.push('封 ' + N.seal);
  if (nx.length) s += chip('下回合 ' + nx.join(' '), 'nx', '下回合开始时生效' + (N.seal ? '<hr><b>封</b> ' + GLOSS.封 : ''));
  return s + B.allies.map(a => `<span class="ally"${tip(`<b>随从 · ${a}</b><br>${ALLY[a]}`)}>${a}</span>`).join('');
}
function foeHtml(e, i) {
  if (!e.alive) return e.d.minion ? '' : `<div class="foe dead"></div>`;
  const it = B.intent(e), d = e.d;
  const intent = it.stun ? `<span class="intent stun"${tip('<b>困</b> ' + GLOSS.困)}>动弹不得</span>` : `<span class="intent"${tip(`<b>${it.name}</b><br>${it.desc}`)}>${it.k ? `<b>攻 ${it.atk}${it.k > 1 ? '×' + it.k : ''}</b>` : ''}${it.tags.map(t => `<em>${t}</em>`).join('')}</span>`;
  let st = ''; if (e.blk) st += chip('护盾 ' + e.blk, 'blk', '抵挡伤害，它行动前清零'); if (e.str) st += chip('力 ' + (e.str > 0 ? '+' : '') + e.str, e.str > 0 ? 'bad' : 'good', '每段攻击伤害 ' + (e.str > 0 ? '+' : '') + e.str);
  for (const [k, n] of E_ST) if (e.st[k]) st += chip(k === 'wet' ? n : n + ' ' + e.st[k], 'good', `<b>${n}</b> ${GLOSS[n]}`);
  if (e.st.imm) st += chip('警', 'bad', '刚挣脱，暂时困不住');
  return `<div class="foe ${d.boss ? 'boss' : d.elite ? 'elite' : d.minion ? 'small' : ''} ${i === tgi ? 'tg' : ''}" data-act="foe" data-i="${i}" data-uid="${e.uid}" data-hp="${e.hp}" data-max="${e.max}">
    ${intent}<div class="glyph">${e.ch}</div>
    <div class="fname">${e.n}${d.fear ? `<em class="el-${d.fear}"${tip(`<b>畏${ELN[d.fear]}</b> ` + GLOSS.畏)}>畏${ELN[d.fear]}</em>` : ''}${d.resist ? `<em class="el-${d.resist}"${tip(`<b>抗${ELN[d.resist]}</b> ` + GLOSS.抗)}>抗${ELN[d.resist]}</em>` : ''}${d.revive && !e.revived ? `<em style="color:var(--dim)"${tip('第一次被打散后会重聚')}>重聚</em>` : ''}</div>
    <div class="hpbar"><i style="width:${(100 * e.hp) / e.max}%"></i><span>${e.hp} / ${e.max}</span></div><div class="sts">${st}</div></div>`;
}
const cardTip = c => (c.c === '讹' ? '<b>讹</b> ' + GLOSS.讹 : withGl(`<b>${c.c}</b>${elOf(c.c) ? '（' + ELN[elOf(c.c)] + '）' : ''}　单写：${descChar(c.c)}`) + (c.up ? '<hr><b>朱批</b> ' + GLOSS.朱批 : '') + (c.tmp ? '<hr>临时的，用后即散' : '') + (c.sealed ? '<hr><b>封</b> ' + GLOSS.封 : ''));
function resTile(ch, cards, multi) {
  const d = CH[ch], m = B.mulOf(d, cards), desc = descChar(ch, m), isNew = d.n > 1 && !META.dict[ch];
  const cost = B.costOf(), can = !busy && B.canCast() && B.ink >= cost, why = !B.canCast() ? '写不了了' : B.ink < cost ? '墨尽' : '';
  const gl = multi ? '' : glHtml(desc);
  return `<button class="res el-${d.el}" data-act="cast" data-ch="${ch}" ${can ? '' : 'disabled'}><span class="big ${isNew ? 'new' : ''}">${ch}</span>
    <span class="txt"><b>${d.n > 1 ? d.comps.join(' ＋ ') : ch === '讹' ? '错字' : '单写'}${d.el ? `<small style="color:var(--${d.el})">${ELN[d.el]}</small>` : ''}${Math.abs(m - 1) > 0.001 ? `<small>×${fm(m)}</small>` : ''}${d.note ? `<small>${d.note}</small>` : ''}</b><p>${desc}</p>${gl ? `<div class="gl">${gl}</div>` : ''}</span>
    <span class="go">${why || (cost ? '落笔' : '免墨')}</span></button>`;
}
function deskHtml() {
  if (B.pending) return `<div class="ask">${B.pending.kind === 'sell' ? '点一张手牌，把它永久卖掉（粟 +12）' : '点一张手牌，复制两张'}</div>`;
  if (sel.length) {
    const cards = sel.map(i => B.hand[i]), r = RECIPE[keyOf(cards.map(c => c.c))];
    if (!r) return `<div class="res nope">${cards.map(c => c.c).join(' ＋ ')}　不成字</div>`;
    return `<div class="resl ${r.length > 1 ? 'multi' : ''}">${r.map(ch => resTile(ch, cards, r.length > 1)).join('')}</div>`;
  }
  if (!B.hand.length) return `<div class="hintbox"><span class="muted">手里没有字根了。</span></div>`;
  const opts = B.options().filter(o => CH[o.ch].n > 1), kn = opts.filter(o => known(o.ch)).sort((a, b) => CH[b.ch].n - CH[a.ch].n), un = opts.length - kn.length;
  return `<div class="hintbox"><div class="chips">${kn.length ? '<span class="muted">可写</span>' + kn.slice(0, 18).map(o => { const d = CH[o.ch]; return `<button class="chip n${d.n} el-${d.el} ${META.dict[o.ch] ? '' : 'hintd'}" data-act="chip" data-i="${o.idxs.join(',')}"${tip(`<b>${o.ch}</b>＝${d.comps.join('＋')}<br>${descChar(o.ch, B.mulOf(d, o.idxs.map(i => B.hand[i])))}`)}>${o.ch}</button>`; }).join('') : '<span class="muted">点选 1～3 张字根，拼成一个字。单独一张也能写。</span>'}</div>
    ${un ? `<div class="unk">这一手里还藏着 ${un} 个你没写过的字。</div>` : kn.length ? '<div class="muted">点上面的字直接选好字根，或者自己拼。</div>' : ''}</div>`;
}
SCR.battle = () => {
  if (!B.en[tgi] || !B.en[tgi].alive) tgi = Math.max(0, B.en.findIndex(e => e.alive));
  const im = inkMaxOf(G), n = Math.max(im, B.ink);
  return `<div class="battle"><div class="foes">${B.en.map(foeHtml).join('')}</div>
    <div class="me"><div class="hpbar"><i style="width:${(100 * G.hp) / G.max}%"></i><span>${G.hp} / ${G.max}</span></div><div class="sts">${meSts()}</div></div>
    <div class="desk">${deskHtml()}</div>
    <div class="handbar"><div class="hand">${B.hand.map((c, i) => `<button class="card el-${elOf(c.c)} ${c.up ? 'up' : ''} ${c.tmp ? 'tmp' : ''} ${c.sealed ? 'sealed' : ''} ${c.c === '讹' ? 'bad' : ''} ${sel.includes(i) ? 'sel' : ''}" data-act="card" data-i="${i}"${tip(cardTip(c))}>${c.c}</button>`).join('')}</div>
      <div class="side"><div class="inks"${tip('<b>墨</b> ' + GLOSS.墨)}><b>墨</b>${n <= 6 ? Array.from({ length: n }, (_, i) => `<i class="${i < B.ink ? 'f' : ''}"></i>`).join('') : `<i class="f"></i><b>×${B.ink}</b>`}</div>
        <button class="btn" data-act="end" ${busy || B.pending ? 'disabled' : ''}>结束回合</button><div class="piles">牌堆 ${B.draw.length}　弃 ${B.disc.length}</div></div></div></div>`;
};

const foeEl = uid => $(`.foe[data-uid="${uid}"]`);
function bump(el, cls) { if (!el) return; el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); setTimeout(() => el.classList.remove(cls), 380); }
function setBar(el, hp, max) { if (!el) return; const b = $('.hpbar', el); if (!b) return; hp = Math.max(0, hp); $('i', b).style.width = (100 * hp) / max + '%'; $('span', b).textContent = hp + ' / ' + max; }
async function play(evs) {
  if (SPEED === 0) return;
  const meRow = $('.me'), me = $('.me .hpbar');
  for (const ev of evs) {
    const fe = ev.e ? foeEl(ev.e) : null;
    switch (ev.k) {
      case 'cast': { const d = document.createElement('div'); d.className = 'castglyph el-' + (ev.el || '') + (ev.sub ? ' sub' : ''); d.innerHTML = ev.ch + (ev.times > 1 ? `<small>×${ev.times}</small>` : ''); floatEl.appendChild(d); setTimeout(() => d.remove(), 700); sfx.cast(ev.n); await sleep(ev.sub ? 240 : 330); break; }
      case 'hit': if (fe) { floatAt(fe, ev.n ? '-' + ev.n : ev.ab ? '挡' : '0', ev.fear ? 'crit' : ev.res ? 'res' : 'dmg'); if (ev.n) { bump(fe, 'shake'); splash(fe, ev.fear ? '#ffd76a' : '#d5e6ee', Math.min(26, 5 + ev.n)); fe.dataset.hp -= ev.n; setBar(fe, +fe.dataset.hp, +fe.dataset.max); sfx.hit(); } else sfx.blk(); } await sleep(105); break;
      case 'dot': if (fe) { floatAt(fe, ev.s + ' -' + ev.n, 'dot'); fe.dataset.hp -= ev.n; setBar(fe, +fe.dataset.hp, +fe.dataset.max); } await sleep(130); break;
      case 'phit': floatAt(me, ev.n ? '-' + ev.n : '挡', ev.n ? 'pdmg' : 'blk', -20); if (ev.n) { ui.meHp -= ev.n; setBar(meRow, ui.meHp, G.max); if (!ev.self) bump(app, 'quake'); sfx.phit(); } else sfx.blk(); await sleep(150); break;
      case 'blk': floatAt(me, '护盾 +' + ev.n, 'blk', -34); sfx.blk(); await sleep(40); break;
      case 'heal': floatAt(me, '+' + ev.n, 'heal', -20); ui.meHp += ev.n; setBar(meRow, ui.meHp, G.max); sfx.heal(); await sleep(60); break;
      case 'gold': if (ev.n) { floatAt($('.hud .gold'), '+' + ev.n, 'gold', 30); sfx.gold(); } break;
      case 'txt': floatAt(ev.p ? me : fe, ev.s, ev.bad ? 'bad' : ev.good ? 'heal' : 'note', ev.p ? -44 : -30); if (ev.bad) sfx.bad(); await sleep(90); break;
      case 'die': if (fe) { fe.classList.add('dying'); splash(fe, '#d5e6ee', 34); } sfx.die(); await sleep(330); break;
      case 'foe': if (fe) { bump(fe, 'lunge'); floatAt(fe, ev.name, 'name', -70); } await sleep(300); break;
      case 'ally': break;
      case 'spawn': render(); await sleep(200); break;
      case 'rain': grainRain(ev.isNew ? 90 : 26); if (ev.isNew) { sfx.newc(); banner(`新字<b>${ev.ch}</b>${CH[ev.ch].comps.join('＋')}<small>天雨粟　粟 +${ev.g}　已收进字典</small>`); await sleep(260); } else sfx.gold(); floatAt($('.hud .gold'), '+' + ev.g, 'gold', 30); break;
      case 'turn': if (ev.n > 1) { sfx.turn(); banner(`第 ${ev.n} 回合`, 'turn'); await sleep(200); } break;
    }
  }
}
async function flush() { busy = true; await play(B.ev.splice(0)); busy = false; render(); after(); }
async function doCast(ch) {
  if (busy || !B || B.over) return;
  const idxs = sel.slice(), els = idxs.map(i => $(`.hand .card[data-i="${i}"]`));
  if (!B.cast(idxs, ch, tgi)) { sfx.nope(); bump($('.res'), 'wig'); return; }
  busy = true; sel = []; els.forEach(e => e && e.classList.add('used'));
  await play(B.ev.splice(0)); busy = false; render(); await after();
}
async function endTurn() {
  if (busy || !B || B.over || B.pending) return;
  busy = true; sel = []; hideTip();
  for (const s of B.endSteps()) { if (s() === false) continue; await play(B.ev.splice(0)); render(); if (B.over) break; }
  busy = false; render(); await after();
}
async function after() {
  if (!B || !B.over) return;
  busy = true;
  if (B.over === 'win') { sfx.win(); await sleep(700); busy = false; const rw = mkReward(G, B); cur = { t: 'reward', rw, kind: B.kind, took: false, relicPick: null }; if (rw.relic) addRelic(G, rw.relic); B = null; go('reward'); }
  else { sfx.lose(); await sleep(1000); busy = false; endRun(G, false); B = null; go('over'); }
}

// ── 战后、墨庄、茶寮、典故
function compCard(c, o) {
  const syn = synergy(G, c.c), kn = syn.filter(known), un = syn.length - kn.length;
  return `<button class="pc ${o.taken ? 'taken' : ''}" data-act="${o.act}" data-i="${o.i}" ${o.disabled ? 'disabled' : ''}>
    <span class="top">${cardHtml(c, 'sm')}<span><p>${descChar(c.c)}</p></span>${o.price != null ? `<span class="price ${G.gold < o.price ? 'no' : ''}">${o.price} 粟</span>` : ''}</span>
    <p>${syn.length ? `配上你手头的字根，可成 ${syn.length} 字：` : '眼下和你的字根拼不出字。'}</p>${syn.length ? `<span class="syn">${kn.slice(0, 16).join('')}${un ? `<u>${'？'.repeat(Math.min(un, 10))}</u>` : ''}</span>` : ''}</button>`;
}
SCR.reward = () => {
  const rw = cur.rw, need = rw.relics && rw.relics.length && !cur.relicPick;
  return `<div class="body"><h2>${cur.kind === 'boss' ? '首领散了' : '写毕'}</h2><p class="lead">粟 +${rw.gold}${cur.kind === 'boss' && G.act < 3 ? '　·　生命回复了四成' : ''}</p>
    ${rw.relic ? `<div class="got">得文房 <b>${RELICS[rw.relic][0]}</b>　${RELICS[rw.relic][1]}</div>` : ''}
    ${rw.relics && rw.relics.length ? `<h3>它留下的文房 · 取一件</h3><div class="pick">${rw.relics.map((id, i) => `<button class="pc ${cur.relicPick === id ? 'taken' : ''}" data-act="rpick" data-i="${i}" ${cur.relicPick ? 'disabled' : ''}><span class="rn">${RELICS[id][0]}</span><p>${RELICS[id][1]}</p></button>`).join('')}</div>` : ''}
    <h3>从它身上拆一张字根</h3><div class="pick">${rw.comps.map((c, i) => compCard(c, { act: 'take', i, taken: cur.took === i, disabled: cur.took !== false })).join('')}</div>
    <div class="foot-bar"><span class="muted">${cur.took === false ? '一张都不拿也行。牌库越薄，越容易凑齐想要的字。' : ''}</span><button class="btn red" data-act="rwdone" ${need ? 'disabled' : ''}>${cur.kind === 'boss' && G.act < 3 ? '翻到下一卷' : '继续'}</button></div></div>`;
};
SCR.shop = () => {
  const s = cur.shop, svc = (k, n, d, p, ok) => `<button class="pc" data-act="svc" data-k="${k}" ${ok && G.gold >= p ? '' : 'disabled'}><span class="top"><span class="rn" style="color:var(--paper)">${n}</span><span class="price ${G.gold < p ? 'no' : ''}">${p} 粟</span></span><p>${d}</p></button>`;
  return `<div class="body"><h2>墨庄</h2><p class="lead">「都是好字。慢慢看。」</p>
    <h3>字根</h3><div class="pick">${s.comps.map((c, i) => (c.sold ? '' : compCard(c, { act: 'buy', i, price: c.price, disabled: G.gold < c.price }))).join('') || '<span class="muted">卖完了。</span>'}</div>
    <h3>文房</h3><div class="pick">${s.relics.map((r, i) => (r.sold ? '' : `<button class="pc" data-act="buyr" data-i="${i}" ${G.gold < r.price ? 'disabled' : ''}><span class="top"><span class="rn">${RELICS[r.id][0]}</span><span class="price ${G.gold < r.price ? 'no' : ''}">${r.price} 粟</span></span><p>${RELICS[r.id][1]}</p></button>`)).join('') || '<span class="muted">卖完了。</span>'}</div>
    <h3>手艺</h3><div class="pick">${svc('rm', '涂去', '从牌库里删掉一张字根', G.rmCost, G.deck.length > 5)}${svc('up', '朱批', '给一张字根批红：所成之字数值 +25%', G.upCost, G.deck.some(c => !c.up && c.c !== '讹'))}${svc('tea', '吃茶', '回复 15 生命', s.tea, G.hp < G.max)}</div>
    <div class="foot-bar"><span></span><button class="btn red" data-act="leave">离开</button></div></div>`;
};
SCR.rest = () => `<div class="body"><div class="evt"><h2>茶寮</h2><p class="x">路边一间茶寮。灯还亮着，炉上的水刚开。</p><div class="opts">
  <button class="opt" data-act="rest" data-k="heal"><b>歇息</b>回复 ${restHeal(G)} 生命</button>
  <button class="opt" data-act="rest" data-k="up" ${G.deck.some(c => !c.up && c.c !== '讹') ? '' : 'disabled'}><b>描红</b>朱批一张字根：所成之字数值 +25%</button>
  <button class="opt" data-act="rest" data-k="rm" ${G.deck.length > 5 ? '' : 'disabled'}><b>涂改</b>从牌库里删掉一张字根</button></div></div></div>`;
SCR.event = () => {
  const ev = cur.ev;
  return `<div class="body"><div class="evt"><h2>${ev.t}</h2><p class="x">${ev.x}</p>${cur.out != null ? `<div class="out">${cur.out}</div><div class="center"><button class="btn red" data-act="leave">继续</button></div>`
    : `<div class="opts">${ev.o.map((o, i) => `<button class="opt" data-act="ev" data-i="${i}" ${o.ok && !o.ok(G) ? 'disabled' : ''}><b>${o.l}</b>${o.d}</button>`).join('')}</div>`}</div></div>`;
};

// ── 字典
SCR.dict = () => {
  const n = dictCount(), ch = ui.dch; let det = `<div class="big u">？</div><div><p>点一个字看它的写法。</p><p class="muted">灰的是还没写过的字。写出来一次，就永远收在这里。</p></div>`;
  if (ch) { const d = CH[ch], k = META.dict[ch], h = META.hint[ch];
    det = k || h ? `<div class="big el-${d.el}">${ch}</div><div><p><b style="color:var(--paper)">${d.comps.join(' ＋ ')}</b>${d.el ? `　<span style="color:var(--${d.el})">${ELN[d.el]}</span>` : ''}　<span class="muted">${d.note}</span></p><p>${descChar(ch)}</p><p class="muted">${k ? '写过 ' + k + ' 次' : '听说过，还没亲手写过'}</p></div>`
      : `<div class="big u">？</div><div><p>还不认得。</p><p class="muted">${d.n} 个字根，其中一个是「${d.comps[(ch.charCodeAt(0) + d.n) % d.n]}」。</p></div>`; }
  const tiles = k => CHARS.filter(c => CH[c[0]].n === k).map(c => { const kn = META.dict[c[0]], h = META.hint[c[0]]; return `<button class="dt ${kn ? 'k' : h ? 'h' : ''} el-${CH[c[0]].el} ${ch === c[0] ? 'on' : ''}" data-act="dsel" data-ch="${c[0]}">${kn || h ? c[0] : '？'}</button>`; }).join('');
  return `<div class="body"><div class="foot-bar" style="margin:0"><h2>字典</h2><button class="btn" data-act="dback">返回</button></div>
    <p class="lead">识字 ${n} / ${TOTAL}</p><div class="bar"><i style="width:${(100 * n) / TOTAL}%"></i></div>
    <div class="ddetail">${det}</div><h3>二部字</h3><div class="dgrid">${tiles(2)}</div><h3>三部字</h3><div class="dgrid">${tiles(3)}</div></div>`;
};

SCR.over = () => {
  const w = G.over === 'win', s = G.st, n = dictCount(), nl = G.newList || [];
  const unl = KITS.filter(k => k.need > 0 && k.need <= n && k.need > n - s.newc);
  return `<div class="over ${w ? 'win' : ''}"><h1>${w ? '字成' : '墨干了'}</h1>
    <p class="lead">${w ? '「忘」散去了。纸上的字，一个都没少。' : `止于${ACTS[G.act][0]}「${ACTS[G.act][1]}」，第 ${G.floor} 步。`}</p>
    <div class="stats"><div><b>${s.chars}</b>写下的字</div><div><b>${Object.keys(G.seenRun).length}</b>不同的字</div><div><b>${s.newc}</b>新识的字</div><div><b>${s.kills}</b>写哭的鬼</div><div><b>${n} / ${TOTAL}</b>字典</div></div>
    ${nl.length ? `<p class="muted">这一局新识的字</p><div class="newc">${nl.join('')}</div>` : ''}
    ${unl.map(k => `<div class="got">解锁新笔 <b>${k.n}</b>　${k.d}</div>`).join('')}
    ${w && G.asc < 9 && META.asc === G.asc + 1 ? `<div class="got">墨阶 <b>${META.asc}</b> 已开　${ASC[META.asc]}</div>` : ''}
    <p class="muted">${KITS[G.kit].n} · ${BOONS[G.boon][0]}${G.asc ? ' · 墨阶 ' + G.asc : ''}　种子 ${G.seed}</p>
    <div class="row" style="justify-content:center;margin-top:6px"><button class="btn red" data-act="new">再写一局</button><button class="btn" data-act="dict">字典</button><button class="btn" data-act="home">回封面</button></div></div>`;
};

// ───────── 动作
function toMap() { cur = {}; saveRun(G); go('map'); }
const ACT = {
  close: closeModal, help, deck: deckModal, menu: menuModal,
  mute() { META.mute = !META.mute; saveMeta(); if (modalEl.classList.contains('on')) menuModal(); else render(); },
  home() { closeModal(); go('title'); },
  new() { closeModal(); openPick(); },
  resume() { G = loadRun(); if (!G) return render(); B = null; cur = {}; go('map'); },
  quit() { closeModal(); endRun(G, false); B = null; go('over'); },
  pkit(d) { ui.pick.kit = +d.i; sfx.tap(+d.i); render(); },
  pboon(d) { ui.pick.boon = d.id; sfx.tap(3); render(); },
  asc(d) { ui.pick.asc = Math.max(0, Math.min(META.asc, ui.pick.asc + +d.d)); render(); },
  start() { const p = ui.pick; if (p.kit == null || !p.boon) return; META.lastAsc = p.asc; saveMeta(); clearRun(); G = newRun({ kit: p.kit, boon: p.boon, asc: p.asc, seed: QS.has('seed') ? +QS.get('seed') : undefined }); G.newList = []; B = null; toMap(); },
  go(d) {
    if (busy) return; const v = visit(G, d.id); cur = v; sel = []; tgi = 0;
    if (v.t === 'battle') { B = v.B; ui.sorted = -1; go('battle'); const e = B.en[0]; if (e.d.boss || e.d.elite) banner(`<b>${e.ch}</b><small>${e.n}</small>`); if (!META.tut) { META.tut = 1; saveMeta(); help(); } }
    else { cur.out = null; go(v.t); }
  },
  card(d) {
    if (busy || !B) return; const i = +d.i;
    if (B.pending) { if (B.choose(i)) flush(); else sfx.nope(); return; }
    const c = B.hand[i]; if (!c || c.sealed) { sfx.nope(); return; }
    const k = sel.indexOf(i); if (k >= 0) sel.splice(k, 1); else { if (sel.length >= 3) sel.shift(); sel.push(i); }
    sfx.tap(i); render();
  },
  chip(d) { if (busy) return; sel = d.i.split(',').map(Number); sfx.tap(sel[0]); render(); },
  foe(d) { if (busy) return; tgi = +d.i; render(); },
  cast(d) { doCast(d.ch); },
  end() { endTurn(); },
  take(d) { if (cur.took !== false) return; const c = cur.rw.comps[+d.i]; G.deck.push({ c: c.c, up: c.up }); cur.took = +d.i; sfx.tap(4); render(); },
  rpick(d) { if (cur.relicPick) return; const id = cur.rw.relics[+d.i]; addRelic(G, id); cur.relicPick = id; sfx.gold(); render(); },
  rwdone() { if (cur.kind === 'boss') { if (G.act === 3) { endRun(G, true); sfx.win(); grainRain(160); return go('over'); } nextAct(G); } toMap(); },
  buy(d) { const c = cur.shop.comps[+d.i]; if (c.sold || G.gold < c.price) return; G.gold -= c.price; G.deck.push({ c: c.c, up: c.up }); c.sold = true; sfx.gold(); render(); },
  buyr(d) { const r = cur.shop.relics[+d.i]; if (r.sold || G.gold < r.price) return; G.gold -= r.price; addRelic(G, r.id); r.sold = true; sfx.gold(); render(); },
  svc(d) {
    const k = d.k, s = cur.shop;
    if (k === 'tea') { if (G.gold < s.tea) return; G.gold -= s.tea; G.hp = Math.min(G.max, G.hp + 15); sfx.heal(); render(); }
    else if (k === 'rm') pickCard('涂去哪一张', null, i => { if (G.gold < G.rmCost) return; G.gold -= G.rmCost; G.rmCost += 20; G.deck.splice(i, 1); render(); });
    else pickCard('朱批哪一张', c => !c.up && c.c !== '讹', i => { if (G.gold < G.upCost) return; G.gold -= G.upCost; G.upCost += 15; G.deck[i].up = true; render(); });
  },
  rest(d) {
    if (d.k === 'heal') { G.hp = Math.min(G.max, G.hp + restHeal(G)); sfx.heal(); toMap(); }
    else if (d.k === 'up') pickCard('描哪一张', c => !c.up && c.c !== '讹', i => { G.deck[i].up = true; toMap(); });
    else pickCard('涂掉哪一张', null, i => { G.deck.splice(i, 1); toMap(); });
  },
  ev(d) { const o = cur.ev.o[+d.i]; if (o.ok && !o.ok(G)) return; if (o.pick) pickCard(o.l, o.pf, i => { cur.out = o.f(G, i); render(); }); else { cur.out = o.f(G); render(); } },
  leave() { toMap(); },
  pk(d) { const cb = ui.pickCb; closeModal(); if (cb) cb(+d.i); },
  dict() { closeModal(); ui.dictBack = scr === 'dict' ? ui.dictBack : scr; ui.dch = null; go('dict'); },
  dback() { go(ui.dictBack || 'title'); },
  dsel(d) { ui.dch = d.ch; const b = $('.body'), t = b ? b.scrollTop : 0; render(); if ($('.body')) $('.body').scrollTop = t; },
};
document.addEventListener('click', e => { const el = e.target.closest && e.target.closest('[data-act]'); if (!el || el.disabled) return; const f = ACT[el.dataset.act]; if (f) f(el.dataset, el); });
document.addEventListener('keydown', e => {
  if (modalEl.classList.contains('on')) { if (e.key === 'Escape' || e.key === 'Enter') closeModal(); return; }
  if (scr !== 'battle' || !B || busy) return;
  if (/^[0-9]$/.test(e.key)) { const i = e.key === '0' ? 9 : +e.key - 1; if (B.hand[i]) ACT.card({ i }); }
  else if (e.key === 'Enter') { const r = $('.res[data-act="cast"]:not([disabled])'); if (r) doCast(r.dataset.ch); }
  else if (e.key === ' ' || e.key === 'e') { e.preventDefault(); endTurn(); }
  else if (e.key === 'Escape') { sel = []; render(); }
  else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft' || e.key === 'Tab') { e.preventDefault(); const a = B.en.map((x, i) => i).filter(i => B.en[i].alive), k = a.indexOf(tgi), d = e.key === 'ArrowLeft' ? -1 : 1; tgi = a[(k + d + a.length) % a.length]; render(); }
});

// ───────── 背景、启动
(function () { const bg = $('#bg'), cs = '鬼魂魄魅魔魇魃魍魉魑忘妖怨'; let h = ''; for (let i = 0; i < 12; i++) h += `<i style="left:${(i * 8.3 + Math.random() * 5).toFixed(1)}%;top:${(8 + Math.random() * 78).toFixed(1)}%;animation-delay:-${(Math.random() * 26).toFixed(1)}s;font-size:${60 + ((Math.random() * 70) | 0)}px">${cs[i]}</i>`; bg.innerHTML = h; })();

async function autoPlay() { // ?auto：机器人从界面上把一整局点完，冒烟测试用
  SPEED = 0;
  for (let n = 0; n < 6000; n++) {
    await new Promise(r => setTimeout(r, 0)); if (busy) continue;
    if (modalEl.classList.contains('on')) { const b = $('#modal [data-act="pk"]:not([disabled])') || $('#modal [data-act="close"]'); b.click(); continue; }
    if (scr === 'title') ACT.new();
    else if (scr === 'pick') { ui.pick.kit = ui.pick.kits[n % ui.pick.kits.length]; ui.pick.boon = ui.pick.boons[0]; ACT.start(); }
    else if (scr === 'map') { const c = choices(G); ACT.go({ id: c[(Math.random() * c.length) | 0] }); }
    else if (scr === 'battle') {
      if (B.pending) { ACT.card({ i: B.hand.findIndex(c => c.c !== '讹') }); continue; }
      const o = B.canCast() && B.options().filter(() => B.costOf() <= B.ink).sort((a, b) => CH[b.ch].n - CH[a.ch].n)[0];
      if (o) { sel = o.idxs.slice(); tgi = B.en.findIndex(e => e.alive); render(); await doCast(o.ch); } else await endTurn();
    } else if (scr === 'reward') { if (cur.rw.relics && cur.rw.relics.length && !cur.relicPick) ACT.rpick({ i: 0 }); if (cur.took === false) ACT.take({ i: 0 }); ACT.rwdone(); }
    else if (scr === 'shop') { const b = $('[data-act="buy"]:not([disabled])'); if (b && n % 2) b.click(); else ACT.leave(); }
    else if (scr === 'rest') ACT.rest({ k: ['heal', 'up', 'rm'][n % 3] });
    else if (scr === 'event') { if (cur.out != null) ACT.leave(); else { const ok = cur.ev.o.map((o, i) => i).filter(i => !cur.ev.o[i].ok || cur.ev.o[i].ok(G)); ACT.ev({ i: ok[n % ok.length] }); } }
    else if (scr === 'over') { window.__done = { win: G.over === 'win', act: G.act, floor: G.floor, chars: G.st.chars }; return; }
  }
  window.__done = { stuck: scr };
}
function demo(what) { // ?demo=battle|boss|map|reward|shop|rest|event|pick|over：直接摆出某个画面，截图用
  const seed = +(QS.get('seed') || 7), kit = +(QS.get('kit') || 0);
  if (what === 'pick') return openPick();
  G = newRun({ seed, kit, boon: QS.get('boon') || 'bowen' }); G.newList = [];
  if (what === 'map') { visit(G, choices(G)[0]); visit(G, choices(G)[0]); return go('map'); }
  if (what === 'battle' || what === 'boss' || what === 'reward' || what === 'over') {
    if (what === 'boss') { G.act = 2; G.map = genMap(G); G.relics.push('langhao', 'zitie', 'huimo'); G.deck.push({ c: '日' }, { c: '月', up: true }, { c: '心' }); }
    const v = visit(G, what === 'boss' ? 'boss' : choices(G)[1] || choices(G)[0]); B = v.B; cur = v; scr = 'battle';
    if (what === 'battle') { B.block(6); B.fst(B.en[0], 'burn', 4); B.fst(B.en[0], 'vul', 2); B.allies.push('猫'); B.ev = []; B.hand.sort(byComp); ui.sorted = B.turn; const o = B.options().filter(o => CH[o.ch].n === 2)[0]; if (o) sel = o.idxs.slice(); }
    if (what === 'reward') { B.en.forEach(e => B.kill(e)); B.ev = []; cur = { t: 'reward', rw: mkReward(G, B), kind: 'normal', took: false }; B = null; scr = 'reward'; }
    if (what === 'over') { B = null; G.st = { turns: 40, kills: 23, chars: 88, newc: 3 }; G.seenRun = { 明: 1, 炎: 1, 休: 1 }; G.newList = ['明', '炎', '休']; endRun(G, false); scr = 'over'; }
    return render();
  }
  if (what === 'shop') { cur = { t: 'shop', shop: mkShop(G) }; G.gold = 120; return go('shop'); }
  if (what === 'rest') return go('rest');
  if (what === 'event') { cur = { t: 'event', ev: EVENTS[+(QS.get('i') || 0)], out: null }; return go('event'); }
  if (what === 'dict') { ui.dictBack = 'title'; return go('dict'); }
}
if (QS.has('demo')) demo(QS.get('demo')); else render();
if (QS.has('auto')) autoPlay();
