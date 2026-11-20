// 校验数据 + 贪心机器人跑整局。用法：node dev/sim.mjs [局数] [--asc N] [--v]
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = ['data.js', 'core.js'].map(f => fs.readFileSync(path.join(root, 'src', f), 'utf8')).join('\n');
const ctx = vm.createContext({ console, Math, __fuzz: process.argv.includes('--fuzz') });
vm.runInContext(src + '\n;if (globalThis.__fuzz) for (const c of CHARS) META.dict[c[0]] = 1;Object.assign(globalThis,{COMPS,CHARS,CH,RECIPE,EN,ENC,RELICS,BOONS,KITS,EVENTS,OPS,META,newRun,newBattle,visit,choices,mkReward,nextAct,endRun,synergy,descChar,isAtk,addRelic,restHeal,rollRelic,TOTAL});', ctx);
const { COMPS, CHARS, CH, RECIPE, EN, ENC, RELICS, BOONS, KITS, EVENTS, OPS, META } = ctx;
const args = process.argv.slice(2), N = +(args.find(a => /^\d+$/.test(a)) || 300), V = args.includes('--v');
const FUZZ = args.includes('--fuzz');
const asc = args.includes('--asc') ? +args[args.indexOf('--asc') + 1] : 0;

// ── 校验
let bad = 0; const err = s => { bad++; console.log('✗', s); };
const seenCh = {};
for (const [ch, cs, el, fx] of CHARS) {
  if (seenCh[ch]) err('重复的字 ' + ch); seenCh[ch] = 1;
  if (COMPS[ch]) err('合字与字根同名 ' + ch);
  for (const c of cs) if (!COMPS[c]) err(`${ch} 用了不存在的字根 ${c}`);
  if (!'NFWMJT'.includes(el)) err(ch + ' 五行不对');
  for (const a of CH[ch].fx) if (!OPS[a[0]]) err(`${ch} 未知效果 ${a[0]}`);
  try { ctx.descChar(ch); } catch (e) { err(ch + ' 描述出错 ' + e.message); }
}
for (const c in COMPS) for (const a of CH[c].fx) if (!OPS[a[0]]) err(`${c} 未知效果 ${a[0]}`);
for (const id in EN) { for (const c of EN[id].drop || '') if (!COMPS[c]) err(`${id} 掉落 ${c} 不存在`); for (const p of EN[id].pat.concat(EN[id].pat2 || [])) if (!EN[id].moves[p]) err(id + ' 出招越界'); }
for (const a in ENC) for (const k of ['easy', 'hard', 'elite']) for (const g of ENC[a][k]) for (const id of g) if (!EN[id]) err('遭遇里没有 ' + id);
for (const a in ENC) for (const id of ENC[a].boss) if (!EN[id]) err('首领没有 ' + id);
for (const k of KITS) for (const c of k.deck) if (!COMPS[c]) err(k.n + ' 起手没有 ' + c);
const deg = {}; for (const [, cs] of CHARS) for (const c of new Set(cs)) deg[c] = (deg[c] || 0) + 1;
for (const c in COMPS) if (!deg[c]) err('字根没有任何合字 ' + c);
console.log(`字根 ${Object.keys(COMPS).length}，合字 ${CHARS.length}（二部 ${CHARS.filter(c => [...c[1]].length === 2).length} / 三部 ${CHARS.filter(c => [...c[1]].length === 3).length}），敌人 ${Object.keys(EN).length}，文房 ${Object.keys(RELICS).length}`);
console.log('一方多字：' + Object.values(RECIPE).filter(r => r.length > 1).map(r => r.join('/')).join(' '));
console.log('合字最少的字根：' + Object.entries(deg).sort((a, b) => a[1] - b[1]).slice(0, 8).map(e => e.join('')).join(' '));
for (const k of KITS) { const G = { deck: [...k.deck].map(c => ({ c })) }; const s = new Set(); for (const c of new Set(k.deck)) { G.deck.splice(G.deck.findIndex(d => d.c === c), 1); ctx.synergy(G, c).forEach(x => s.add(x)); G.deck.push({ c }); } console.log(`  ${k.n}：起手可成 ${s.size} 字  ${[...s].join('')}`); }
if (bad) { console.log(`\n${bad} 处数据错误`); process.exit(1); }

// ── 机器人
const fxVal = (B, def, m, t) => {
  const P = B.pl, G = B.G, al = B.alive(); let v = 0;
  const inc = al.reduce((s, e) => { const it = B.intent(e); return s + it.atk * it.k; }, 0);
  const need = Math.max(0, inc - P.blk), miss = G.max - G.hp, hpAll = al.reduce((s, e) => s + e.hp + e.blk, 0);
  const d1 = n => { const x = (n + P.str + P.tstr) * (t && t.st.vul ? 1.5 : 1); return t ? Math.min(x, t.hp + t.blk) * (x >= t.hp + t.blk ? 1.5 : 1) : 0; };
  const inkLeft = B.ink - 1 > 0 && B.hand.length > def.n;
  for (const a of def.fx) { const n = Math.round((a[1] || 0) * m);
    switch (a[0]) {
      case 'hit': case 'pierce': case 'owl': case 'win': case 'hunt': case 'thunder': case 'devour': case 'last': v += d1(n); break;
      case 'hits': v += d1(n * a[2] + (P.str + P.tstr) * (a[2] - 1)); break;
      case 'rnd': v += Math.min(hpAll, (n + P.str + P.tstr) * a[2]); break;
      case 'all': case 'frost': v += Math.min(hpAll, al.length * (n + P.str)); break;
      case 'blk': v += Math.min(n, need) + 0.15 * n; break;
      case 'heal': v += Math.min(n, miss) * 0.9; break;
      case 'regen': v += Math.min(n * 2, miss) * 0.6 + 1; break;
      case 'burn': v += n * 1.5; break; case 'burnAll': v += n * 1.5 * al.length; break;
      case 'poison': v += n * (t && t.d.boss ? 5 : 2.5); break;
      case 'weak': v += Math.min(a[1], 2) * 2.5 + (t ? B.intent(t).atk * B.intent(t).k * 0.3 : 0); break;
      case 'weakAll': v += inc * 0.3 + 2 * al.length; break;
      case 'vul': v += 3 + a[1]; break; case 'vulAll': v += (3 + a[1]) * al.length * 0.7; break;
      case 'stun': case 'stun2': case 'forget': v += t ? (t.d.boss ? 4 : B.intent(t).atk * B.intent(t).k + 3) : 0; break;
      case 'stunAll': v += inc + 4; break;
      case 'conf': case 'blind': v += t ? B.intent(t).atk * B.intent(t).k * 0.8 : 0; break; case 'confAll': v += inc * 0.8; break;
      case 'str': v += a[1] * 5; break; case 'tstr': v += inkLeft ? a[1] * 2 : 0; break;
      case 'dodge': v += Math.min(need, 9) + 1; break;
      case 'draw': v += inkLeft ? a[1] * 2.2 : 0.3; break;
      case 'ink': v += B.hand.length > def.n ? a[1] * 5 : 0; break;
      case 'nink': v += a[1] * 4; break; case 'ndraw': v += a[1] * 1.5; break;
      case 'gold': v += a[1] * 0.35; break;
      case 'selfdmg': v -= a[1] * 2.2; break; case 'selfweak': case 'selfvul': v -= 3; break; case 'selfburn': v -= 6; break;
      case 'thorn': v += a[1] * 2; break; case 'ally': v += 9; break; case 'act': v += B.allies.length * 4 * a[1]; break;
      case 'slam': v += d1(P.blk); break;
      case 'exec': v += t && t.hp <= t.max * 0.25 ? t.hp : d1(8); break;
      case 'sec': v += t && !t.d.boss && t.hp <= 15 ? t.hp * 1.5 : d1(7); break;
      case 'cry': v += hpAll * 0.1 + inc * 0.3 + 6; break;
      case 'twice': case 'free': case 'nmul': case 'natk': v += inkLeft ? 7 : 0; break;
      case 'sell': case 'copy': v += 1; break;
      case 'unite': case 'only': case 'anew': v += B.ink <= 1 ? 12 : 2; break;
      case 'erase': v += 1.5; break;
      default: v += def.n === 3 ? 13 : def.n === 2 ? 7 : 3;
    } }
  return v;
};
function playBattle(B) {
  let guard = 0;
  while (!B.over && guard++ < 200) {
    let acted = true, g2 = 0;
    while (acted && !B.over && g2++ < 30) {
      acted = false;
      if (B.pending) { const i = B.hand.findIndex(c => c.c !== '讹'); if (i < 0 || !B.choose(i)) B.pending = null; continue; }
      if (!B.canCast()) break;
      const al = B.alive(); let best = null;
      if (FUZZ) { const os = B.options().filter(() => B.costOf() <= B.ink); if (!os.length || Math.random() < 0.12) break; const o = os[(Math.random() * os.length) | 0]; acted = B.cast(o.idxs, o.ch, B.en.indexOf(al[(Math.random() * al.length) | 0])); continue; }
      for (const o of B.options()) {
        if (B.costOf() > B.ink) continue;
        const def = CH[o.ch], cards = o.idxs.map(i => B.hand[i]), m = B.mulOf(def, cards);
        for (const t of ctx.isAtk(def) || def.fx.some(a => /^(burn|poison|weak|vul|stun|conf|blind|wet|sap|strip|forget|see)/.test(a[0])) ? al : [al[0]]) {
          const v = fxVal(B, def, m, t) + def.n * 0.4; if (!best || v > best.v) best = { v, o, ti: B.en.indexOf(t) };
        }
      }
      if (best && best.v > 0.5) acted = B.cast(best.o.idxs, best.o.ch, best.ti);
    }
    if (!B.over) B.endTurn();
  }
  if (!B.over) B.over = 'lose';
}
function playRun(seed, kit, boon) {
  const G = ctx.newRun({ seed, kit, boon, asc }), R = G.rng, log = { act: 1, floor: 0, hpAt: [] };
  for (;;) {
    const ch = ctx.choices(G); if (!ch.length) break;
    const pref = { R: G.hp < G.max * 0.5 ? 9 : 3, X: G.hp > G.max * 0.7 ? 5 : 0, S: G.gold > 110 ? 7 : 2, E: 4, B: 4 };
    const id = ch.map(c => [c, c === 'boss' ? 1 : pref[G.map.nodes[c].t] + R()]).sort((a, b) => b[1] - a[1])[0][0];
    const v = ctx.visit(G, id);
    if (v.t === 'battle') {
      playBattle(v.B);
      if (v.B.over !== 'win') { ctx.endRun(G, false); return { win: false, act: G.act, floor: G.floor, by: v.B.en.map(e => e.id).join(''), G }; }
      const rw = ctx.mkReward(G, v.B);
      const pick = rw.comps.map(c => [c, ctx.synergy(G, c.c).length + (c.up ? 1 : 0)]).sort((a, b) => b[1] - a[1])[0];
      if (pick[1] >= 2 && G.deck.length < 20) G.deck.push({ c: pick[0].c, up: pick[0].up });
      if (rw.relic) ctx.addRelic(G, rw.relic);
      if (rw.relics && rw.relics.length) ctx.addRelic(G, rw.relics[0]);
      if (v.B.kind === 'boss') { log.hpAt.push(G.hp); if (G.act === 3) { ctx.endRun(G, true); return { win: true, act: 3, floor: G.floor, G }; } ctx.nextAct(G); }
    } else if (v.t === 'rest') {
      if (G.hp < G.max * 0.65) G.hp = Math.min(G.max, G.hp + ctx.restHeal(G)); else { const c = G.deck.filter(c => !c.up && c.c !== '讹'); if (c.length) R.pick(c).up = true; }
    } else if (v.t === 'shop') {
      const s = v.shop;
      for (const r of s.relics) if (G.gold >= r.price) { G.gold -= r.price; ctx.addRelic(G, r.id); }
      const j = G.deck.findIndex(c => c.c === '讹'); if (j >= 0 && G.gold >= G.rmCost) { G.gold -= G.rmCost; G.deck.splice(j, 1); G.rmCost += 20; }
      for (const c of s.comps) if (G.gold >= c.price + 25 && ctx.synergy(G, c.c).length >= 3 && G.deck.length < 20) { G.gold -= c.price; G.deck.push({ c: c.c, up: c.up }); }
      if (G.hp < G.max * 0.5 && G.gold >= s.tea) { G.gold -= s.tea; G.hp = Math.min(G.max, G.hp + 15); }
    } else if (v.t === 'event') {
      const ok = v.ev.o.filter(o => !o.ok || o.ok(G)), o = R.pick(ok);
      let i; if (o.pick) { const c = G.deck.map((c, i) => i).filter(i => !o.pf || o.pf(G.deck[i])); i = R.pick(c); }
      o.f(G, i);
    }
  }
}
const stat = {}, dead = {}; let wins = 0, a1 = 0, a2 = 0; const t0 = Date.now();
const boons = Object.keys(BOONS);
for (let i = 0; i < N; i++) {
  const kit = i % KITS.length, boon = boons[(i * 7 + 3) % boons.length];
  let r; try { r = playRun(1000 + i, kit, boon); } catch (e) { console.log('✗ 崩了 seed', 1000 + i, 'kit', kit, boon, e.stack); process.exit(1); }
  const k = stat[KITS[kit].n] = stat[KITS[kit].n] || { n: 0, w: 0, a1: 0, a2: 0, fl: 0 }; k.n++; k.fl += r.floor;
  const b = stat['·' + BOONS[boon][0]] = stat['·' + BOONS[boon][0]] || { n: 0, w: 0, a1: 0, a2: 0, fl: 0 }; b.n++; b.fl += r.floor;
  if (r.win) { wins++; k.w++; b.w++; } if (r.act >= 2) { a1++; k.a1++; b.a1++; } if (r.act >= 3) { a2++; k.a2++; b.a2++; }
  if (!r.win) { const key = r.act + ':' + r.by; dead[key] = (dead[key] || 0) + 1; }
  if (V) console.log(1000 + i, KITS[kit].n, BOONS[boon][0], r.win ? '胜' : `亡于卷${r.act} ${r.by}`, '层', r.floor, '牌', r.G.deck.map(c => c.c).join(''));
}
const pc = (a, b) => (100 * a / b).toFixed(0).padStart(3) + '%';
console.log(`\n${N} 局（墨阶 ${asc}）用时 ${Date.now() - t0}ms\n过卷一 ${pc(a1, N)}  过卷二 ${pc(a2, N)}  通关 ${pc(wins, N)}`);
for (const k in stat) { const s = stat[k]; console.log(`  ${k.padEnd(6, '　')} 过一 ${pc(s.a1, s.n)} 过二 ${pc(s.a2, s.n)} 通关 ${pc(s.w, s.n)}  均层 ${(s.fl / s.n).toFixed(1)}`); }
console.log('死因：' + Object.entries(dead).sort((a, b) => b[1] - a[1]).slice(0, 14).map(e => e[0] + '×' + e[1]).join('  '));
