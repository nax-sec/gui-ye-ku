// 鬼夜哭 · 引擎（不碰 DOM，可在 node 里直接跑）
'use strict';

function RNG(seed) {
  let s = seed | 0;
  const f = () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  f.int = n => Math.floor(f() * n);
  f.pick = a => a[f.int(a.length)];
  f.chance = p => f() < p;
  f.shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = f.int(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  f.get = () => s; f.set = v => { s = v | 0; };
  return f;
}

// ───────── 索引
const CH = {}, RECIPE = {};
const keyOf = a => [...a].sort().join('');
const parseFx = s => s.split(';').map(x => x.trim().split(/\s+/).map((v, i) => (i && /^-?\d+$/.test(v) ? +v : v)));
for (const c in COMPS) { const [el, , fx] = COMPS[c]; CH[c] = { ch: c, comps: [c], key: c, el: el === 'N' ? '' : el, fx: parseFx(fx), n: 1, note: '' }; RECIPE[c] = [c]; }
for (const [ch, cs, el, fx, note] of CHARS) { const comps = [...cs], key = keyOf(comps); CH[ch] = { ch, comps, key, el: el === 'N' ? '' : el, fx: parseFx(fx), n: comps.length, note }; (RECIPE[key] = RECIPE[key] || []).push(ch); }
CH['讹'] = { ch: '讹', comps: ['讹'], key: '讹', el: '', fx: [['erase']], n: 1, note: '以讹传讹' }; RECIPE['讹'] = ['讹'];
for (const id in EN) { const d = EN[id]; d.id = id; d.ch = d.ch || id; d.moves = d.mv.map(m => { const [name, st] = m.split('|'); return { name, steps: parseFx(st) }; }); }
const TOTAL = CHARS.length;

// ───────── 存档
const STORE = (() => {
  try { const t = '__gyk'; localStorage.setItem(t, '1'); localStorage.removeItem(t);
    return { get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} }, del: k => { try { localStorage.removeItem(k); } catch (e) {} } };
  } catch (e) { const m = {}; return { get: k => (k in m ? m[k] : null), set: (k, v) => { m[k] = v; }, del: k => { delete m[k]; } }; }
})();
let META = { dict: {}, hint: {}, runs: 0, wins: 0, asc: 0, mute: false, tut: 0, hist: [], kitWins: {} };
try { const s = STORE.get('gyk-meta'); if (s) META = Object.assign(META, JSON.parse(s)); } catch (e) {}
const saveMeta = () => STORE.set('gyk-meta', JSON.stringify(META));
const dictCount = () => CHARS.reduce((n, c) => n + (META.dict[c[0]] ? 1 : 0), 0);
const known = ch => CH[ch].n === 1 || !!META.dict[ch] || !!META.hint[ch];

// ───────── 字的效果：[描述, 执行, 是否攻击]
const tgt = c => (c.t && c.t.alive ? c.t : (c.t = c.B.alive()[0] || null));
const fm = m => (Math.round(m * 100) / 100).toString();
const each = (B, f) => { for (const e of B.alive()) f(e); };
const OPS = {
  hit: [(a, V) => `造成 ${V(a[0])} 伤害`, (B, a, c) => B.hurt(tgt(c), c.V(a[0]), { el: c.def.el }), 1],
  hits: [(a, V) => `攻击 ${a[1]} 次，每次 ${V(a[0])}`, (B, a, c) => { for (let i = 0; i < a[1] && !B.over; i++) B.hurt(tgt(c), c.V(a[0]), { el: c.def.el }); }, 1],
  all: [(a, V) => `全体 ${V(a[0])} 伤害`, (B, a, c) => each(B, e => B.hurt(e, c.V(a[0]), { el: c.def.el })), 1],
  rnd: [(a, V) => `随机攻击 ${a[1]} 次，每次 ${V(a[0])}`, (B, a, c) => { for (let i = 0; i < a[1] && !B.over; i++) B.hurt(B.rnd(), c.V(a[0]), { el: c.def.el }); }, 1],
  pierce: [(a, V) => `造成 ${V(a[0])} 伤害（无视护盾）`, (B, a, c) => B.hurt(tgt(c), c.V(a[0]), { el: c.def.el, pierce: 1 }), 1],
  blk: [(a, V) => `护盾 ${V(a[0])}`, (B, a, c) => B.block(c.V(a[0]))],
  heal: [(a, V) => `回复 ${V(a[0])}`, (B, a, c) => B.heal(c.V(a[0]))],
  regen: [a => `愈 ${a[0]}`, (B, a) => { B.pl.regen += a[0]; }],
  thorn: [a => `荆 ${a[0]}`, (B, a) => { B.pl.thorn += a[0]; }],
  tthorn: [a => `本回合 荆 ${a[0]}`, (B, a) => { B.pl.tthorn += a[0]; }],
  str: [a => `力 +${a[0]}`, (B, a) => { B.pl.str += a[0]; }],
  tstr: [a => `本回合 力 +${a[0]}`, (B, a) => { B.pl.tstr += a[0]; }],
  nstr: [a => `下回合 力 +${a[0]}`, (B, a) => { B.nx.str += a[0]; }],
  dodge: [a => `闪 ${a[0]}`, (B, a) => { B.pl.dodge += a[0]; }],
  ward: [a => `御 ${a[0]}`, (B, a) => { B.pl.ward += a[0]; }],
  reflect: [a => `代 ${a[0]}`, (B, a) => { B.pl.reflect += a[0]; }],
  burn: [(a, V) => `灼 ${V(a[0])}`, (B, a, c) => B.fst(tgt(c), 'burn', c.V(a[0]))],
  burnAll: [(a, V) => `全体 灼 ${V(a[0])}`, (B, a, c) => each(B, e => B.fst(e, 'burn', c.V(a[0])))],
  poison: [a => `毒 ${a[0]}`, (B, a, c) => B.fst(tgt(c), 'poison', a[0])],
  wet: [() => `湿`, (B, a, c) => B.fst(tgt(c), 'wet', 1)],
  wetAll: [() => `全体 湿`, B => each(B, e => B.fst(e, 'wet', 1))],
  weak: [a => `泣 ${a[0]}`, (B, a, c) => B.fst(tgt(c), 'weak', a[0])],
  weakAll: [a => `全体 泣 ${a[0]}`, (B, a) => each(B, e => B.fst(e, 'weak', a[0]))],
  vul: [a => `破 ${a[0]}`, (B, a, c) => B.fst(tgt(c), 'vul', a[0])],
  vulAll: [a => `全体 破 ${a[0]}`, (B, a) => each(B, e => B.fst(e, 'vul', a[0]))],
  stun: [() => `困`, (B, a, c) => B.fst(tgt(c), 'stun', 1)],
  stun2: [() => `困 2 回合`, (B, a, c) => B.fst(tgt(c), 'stun', 2)],
  stunAll: [() => `全体 困`, B => each(B, e => B.fst(e, 'stun', 1))],
  conf: [() => `乱`, (B, a, c) => B.fst(tgt(c), 'conf', 1)],
  confAll: [() => `全体 乱`, B => each(B, e => B.fst(e, 'conf', 1))],
  blind: [a => `盲 ${a[0]}`, (B, a, c) => B.fst(tgt(c), 'blind', a[0])],
  sap: [a => `目标 力 -${a[0]}`, (B, a, c) => { const e = tgt(c); if (e) { e.str = Math.max(-4, e.str - a[0]); B.E('txt', { e: e.uid, s: '力-' + a[0] }); } }],
  strip: [() => `清除目标的护盾与力`, (B, a, c) => { const e = tgt(c); if (e) { e.blk = 0; if (e.str > 0) e.str = 0; } }],
  stripAll: [() => `清除敌方全体的护盾与力`, B => each(B, e => { e.blk = 0; if (e.str > 0) e.str = 0; })],
  draw: [a => `抽 ${a[0]}`, (B, a) => B.drawN(a[0])],
  recall: [a => `从弃牌堆随机收回 ${a[0]} 张`, (B, a) => { const p = B.G.rng.shuffle(B.disc.filter(c => c.c !== '讹')).slice(0, a[0]); for (const c of p) if (B.hand.length < 10) { B.disc.splice(B.disc.indexOf(c), 1); B.hand.push(c); } }],
  ink: [a => `墨 +${a[0]}`, (B, a) => { B.ink += a[0]; }],
  nink: [a => `下回合 墨 +${a[0]}`, (B, a) => { B.nx.ink += a[0]; }],
  ndraw: [a => `下回合多抽 ${a[0]}`, (B, a) => { B.nx.draw += a[0]; }],
  nblk: [(a, V) => `下回合 护盾 ${V(a[0])}`, (B, a, c) => { B.nx.blk += c.V(a[0]); }],
  nall: [(a, V) => `下回合开始时，全体 ${V(a[0])} 伤害`, (B, a, c) => { B.nx.all += c.V(a[0]); }],
  natk: [a => `下一个攻击字伤害 ×${a[0] / 100}`, (B, a) => { B.mods.natk *= a[0] / 100; }],
  nmul: [a => `下一个字数值 ×${a[0] / 100}`, (B, a) => { B.mods.nmul *= a[0] / 100; }],
  free: [() => `下一个字不耗墨`, B => { B.mods.free++; }],
  twice: [() => `下一个字施放两次`, B => { B.mods.twice++; }],
  again: [() => `把上一个字再写一遍`, (B, a, c) => { if (B.last) B.run(B.last.def, B.last.m, c.t); else B.drawN(1); }],
  gold: [a => `粟 +${a[0]}`, (B, a) => B.E('gold', { n: gainGold(B.G, a[0]) })],
  selfdmg: [a => `自己失去 ${a[0]} 生命`, (B, a) => B.lose(Math.min(a[0], B.G.hp - 1))],
  selfweak: [a => `自己 弱 ${a[0]}`, (B, a) => { B.pl.weak += a[0]; }],
  selfvul: [a => `自己 伤 ${a[0]}`, (B, a) => { B.pl.vul += a[0]; }],
  selfburn: [a => `自己 灼 ${a[0]}`, (B, a) => { B.pl.burn += a[0]; }],
  cleanse: [() => `清除自身负面`, B => B.cleanse()],
  ally: [a => `随从「${a[0]}」：${ALLY[a[0]]}`, (B, a) => { if (B.allies.length >= 4) B.allies.shift(); B.allies.push(a[0]); B.E('txt', { p: 1, s: '随从·' + a[0] }); }],
  act: [a => `随从行动 ${a[0]} 次`, (B, a) => B.allyAct(a[0])],
  keep: [() => `护盾保留到下回合`, B => { B.pl.keep = true; }],
  barricade: [() => `本场战斗护盾不再清零`, B => { B.pl.barricade = true; }],
  fort: [a => `本场每回合开始 护盾 +${a[0]}`, (B, a) => { B.pl.fort += a[0]; }],
  growth: [a => `本场每回合开始 回复 ${a[0]}（可叠加）`, (B, a) => { B.pl.growth += a[0]; }],
  handup: [a => `本场每回合多抽 ${a[0]}`, (B, a) => { B.pl.handup += a[0]; }],
  mastery: [a => `本场所有字数值 +${a[0]}%（可叠加）`, (B, a) => { B.pl.mastery += a[0]; }],
  retain: [() => `本回合手牌不弃`, B => { B.pl.retain = true; }],
  exec: [(a, V) => `目标生命不足 ${a[0]}% 则直接抹杀（首领改为 ${V(30)} 伤害），否则造成 ${V(a[1])} 伤害`, (B, a, c) => { const e = tgt(c); if (!e) return; if (e.hp <= e.max * a[0] / 100) { if (e.d.boss) B.hurt(e, c.V(30), { el: c.def.el }); else { B.E('txt', { e: e.uid, s: '灭' }); B.kill(e); } } else B.hurt(e, c.V(a[1]), { el: c.def.el }); }, 1],
  // ── 专属
  fry: [() => `目标的灼翻倍`, (B, a, c) => { const e = tgt(c); if (e && e.st.burn) e.st.burn *= 2; }],
  scorch: [(a, V) => `造成 ${V(6)} 伤害，目标每有 1 层灼再 +2`, (B, a, c) => { const e = tgt(c); if (e) B.hurt(e, c.V(6) + 2 * (e.st.burn || 0), { el: 'F' }); }, 1],
  village: [(a, V) => `回复 ${V(4)}；生命不足一半时改为 ${V(10)}`, (B, a, c) => B.heal(c.V(B.G.hp < B.G.max / 2 ? 10 : 4))],
  root: [(a, V) => `生命上限 +2（每场一次）；护盾 ${V(5)}`, (B, a, c) => { if (!B.once.root) { B.once.root = 1; B.G.max += 2; B.G.hp += 2; B.E('txt', { p: 1, s: '上限+2' }); } B.block(c.V(5)); }],
  last: [(a, V) => `造成 ${V(a[0])} 伤害；若墨已用尽则翻倍`, (B, a, c) => B.hurt(tgt(c), c.V(a[0]) * (B.ink === 0 ? 2 : 1)), 1],
  owl: [(a, V) => `造成 ${V(a[0])} 伤害；击杀则 墨 +1`, (B, a, c) => { const e = tgt(c); if (!e) return; B.hurt(e, c.V(a[0])); if (!e.alive) B.ink++; }, 1],
  melt: [(a, V) => `花掉至多 10 粟，每 1 粟造成 ${V(3)} 伤害`, (B, a, c) => { const s = Math.min(10, B.G.gold); B.G.gold -= s; B.hurt(tgt(c), s * c.V(3), { el: 'J' }); }, 1],
  heap: [(a, V) => `护盾 ${V(5)}，弃牌堆每有 1 张再 +1（至多 +15）`, (B, a, c) => B.block(c.V(5) + Math.min(15, B.disc.length))],
  early: [() => `抽 2；若是本回合第一个字，墨 +1`, B => { B.drawN(2); if (B.castN === 0) B.ink++; }],
  essay: [(a, V) => `造成 ${V(5)} 伤害，本场每写过一个不同的字再 +1.5`, (B, a, c) => B.hurt(tgt(c), c.V(5 + 1.5 * B.seen.size)), 1],
  thick: [(a, V) => `护盾 ${V(6)}，然后护盾翻倍`, (B, a, c) => { B.block(c.V(6)); B.pl.blk *= 2; }],
  mimic: [() => `复制手中随机一张字根（用后即散）`, B => B.dup(1)],
  pare: [(a, V) => `造成 ${V(8)} 伤害，外加目标当前生命的 20%（首领 10%）`, (B, a, c) => { const e = tgt(c); if (e) B.hurt(e, c.V(8) + Math.floor(e.hp * (e.d.boss ? 0.1 : 0.2)), { el: 'J' }); }, 1],
  win: [(a, V) => `造成 ${V(a[0])} 伤害；击杀则回复 6、粟 +5`, (B, a, c) => { const e = tgt(c); if (!e) return; B.hurt(e, c.V(a[0])); if (!e.alive) { B.heal(6); B.E('gold', { n: gainGold(B.G, 5) }); } }, 1],
  slam: [(a, V, m) => `造成等同于自身护盾${m !== 1 ? ' ×' + fm(m) : ''}的伤害`, (B, a, c) => B.hurt(tgt(c), Math.round(B.pl.blk * c.m), { el: 'T' }), 1],
  isle: [(a, V) => `护盾 ${V(8)}；只剩一个敌人时再 +${V(6)}`, (B, a, c) => B.block(c.V(8) + (B.alive().length === 1 ? c.V(6) : 0))],
  thunder: [(a, V) => `造成 ${V(a[0])} 伤害；目标若湿，伤害翻倍并困住它`, (B, a, c) => { const e = tgt(c); if (!e) return; const w = e.st.wet; B.hurt(e, c.V(a[0]) * (w ? 2 : 1)); if (w && e.alive) { delete e.st.wet; B.fst(e, 'stun', 1); } }, 1],
  trace: [() => `复制手中随机两张字根（用后即散）`, B => B.dup(2)],
  tidy: [() => `把手牌补到 6 张；墨 +1`, B => { B.drawN(Math.max(0, 6 - B.hand.length)); B.ink++; }],
  child: [() => `下一个单写的字根数值 ×3`, B => { B.mods.child = 1; }],
  us: [(a, V) => `随从行动 1 次；没有随从则攻击 2 次，每次 ${V(3)}`, (B, a, c) => { if (B.allies.length) B.allyAct(1); else for (let i = 0; i < 2 && !B.over; i++) B.hurt(tgt(c), c.V(3)); }, 1],
  unite: [(a, V) => `弃掉其余手牌，每弃 1 张对目标造成 ${V(7)} 伤害`, (B, a, c) => { const n = B.dumpHand(); for (let i = 0; i < n && !B.over; i++) B.hurt(tgt(c), c.V(7)); }, 1],
  pay: [(a, V) => `花 5 粟，造成 ${V(16)} 伤害；没钱则只有 ${V(5)}`, (B, a, c) => { if (B.G.gold >= 5) { B.G.gold -= 5; B.hurt(tgt(c), c.V(16)); } else B.hurt(tgt(c), c.V(5)); }, 1],
  meet: [() => `抽 2，每有一个随从多抽 1`, B => B.drawN(2 + B.allies.length)],
  only: [(a, V) => `造成 ${V(a[0])} 伤害；弃掉所有手牌`, (B, a, c) => { B.hurt(tgt(c), c.V(a[0])); B.dumpHand(); }, 1],
  olden: [(a, V) => `造成 ${V(4)} 伤害，战斗每过一回合再 +2`, (B, a, c) => B.hurt(tgt(c), c.V(4) + 2 * B.turn), 1],
  anew: [() => `弃掉所有手牌，重抽等量再多 1 张`, B => { const n = B.dumpHand(); B.drawN(n + 1); }],
  ask: [(a, V) => `造成 ${V(5)} 伤害，目标每有一种负面状态再 +${V(5)}`, (B, a, c) => { const e = tgt(c); if (!e) return; const k = ['burn', 'poison', 'wet', 'weak', 'vul', 'stun', 'conf', 'blind'].filter(s => e.st[s]).length; B.hurt(e, c.V(5) * (1 + k)); }, 1],
  first: [(a, V) => `造成 ${V(a[1])} 伤害；若是本回合第一个字则为 ${V(a[0])}`, (B, a, c) => B.hurt(tgt(c), c.V(B.castN === 0 ? a[0] : a[1])), 1],
  devour: [(a, V) => `造成 ${V(a[0])} 伤害，回复所造成伤害的一半`, (B, a, c) => { const d = B.hurt(tgt(c), c.V(a[0])); if (d > 0) B.heal(Math.ceil(d / 2)); }, 1],
  cry: [() => `全体 泣 3、破 2，并各失去当前生命的 10%`, B => each(B, e => { B.fst(e, 'weak', 3); B.fst(e, 'vul', 2); B.dot(e, Math.floor(e.hp * 0.1), '哭'); })],
  sell: [() => `选一张手牌永久卖掉，粟 +12`, B => B.ask('sell')],
  solo: [(a, V) => `造成 ${V(8)} 伤害；只剩一个敌人时为 ${V(20)}`, (B, a, c) => B.hurt(tgt(c), c.V(B.alive().length === 1 ? 20 : 8)), 1],
  forget: [(a, V) => `清除自身负面；目标 困`, (B, a, c) => { B.cleanse(); const e = tgt(c); if (!e) return; if (e.id === '忘') { B.E('txt', { e: e.uid, s: '以忘攻忘' }); B.hurt(e, c.V(30)); } else B.fst(e, 'stun', 1); }],
  see: [() => `目标若要攻击，获得等同其伤害的护盾；否则抽 2`, (B, a, c) => { const e = tgt(c); if (!e) return; const it = B.intent(e); if (it.atk) B.block(it.atk * it.k); else B.drawN(2); }],
  copy: [() => `选一张手牌，复制两张（用后即散）`, B => B.ask('copy')],
  season: [(a, V) => `随回合轮转：春 回复 ${V(8)}／夏 全体 ${V(8)}／秋 粟 +6／冬 护盾 ${V(12)}`, (B, a, c) => { const s = (B.turn - 1) % 4; if (s === 0) B.heal(c.V(8)); else if (s === 1) each(B, e => B.hurt(e, c.V(8), { el: 'F' })); else if (s === 2) B.E('gold', { n: gainGold(B.G, 6) }); else B.block(c.V(12)); }],
  extra: [() => `本回合结束后，再来一个回合（每场一次）`, B => { if (!B.once.extra) { B.once.extra = 1; B.extra = true; } else B.drawN(1); }],
  sec: [(a, V) => `目标生命不高于 ${V(15)} 则直接秒杀（首领除外），否则造成 ${V(7)} 伤害`, (B, a, c) => { const e = tgt(c); if (!e) return; if (!e.d.boss && e.hp <= c.V(15)) { B.E('txt', { e: e.uid, s: '秒' }); B.kill(e); } else B.hurt(e, c.V(7)); }, 1],
  rainbow: [(a, V) => `连击 5 次，每次 ${V(3)}，金木水火土各一`, (B, a, c) => { for (const el of 'JMWFT') if (!B.over) B.hurt(tgt(c), c.V(3), { el }); }, 1],
  lone: [(a, V) => `造成 ${V(9)} 伤害；没有随从时翻倍`, (B, a, c) => B.hurt(tgt(c), c.V(9) * (B.allies.length ? 1 : 2)), 1],
  frenzy: [() => `本回合写字不耗墨，但每写一个字失去 3 生命`, B => { B.mods.frenzy = true; }],
  cycle: [() => `把弃牌堆洗回牌堆；抽 2`, B => { B.draw = B.G.rng.shuffle(B.draw.concat(B.disc)); B.disc = []; B.drawN(2); }],
  origin: [() => `回复已损失生命的 30%；清除自身负面`, B => { B.heal(Math.ceil((B.G.max - B.G.hp) * 0.3)); B.cleanse(); }],
  seize: [(a, V) => `夺走目标的护盾，再造成 ${V(6)} 伤害`, (B, a, c) => { const e = tgt(c); if (!e) return; if (e.blk) { B.block(e.blk); e.blk = 0; } B.hurt(e, c.V(6)); }, 1],
  luck: [() => `粟 +1~10；抽 1`, B => { B.E('gold', { n: gainGold(B.G, 1 + B.G.rng.int(10)) }); B.drawN(1); }],
  create: [() => `凭空写出一个你识得的三部字；抽 1`, (B, a, c) => { B.conjure(3, 1); B.drawN(1); }],
  babble: [() => `胡乱写出三个你识得的二部字`, B => B.conjure(2, 3)],
  revenge: [(a, V) => `造成上回合所受伤害两倍的伤害（至少 ${V(6)}）`, (B, a, c) => B.hurt(tgt(c), Math.max(c.V(6), Math.round(2 * B.tookLast * c.m))), 1],
  soul: [() => `本场战斗中，下一次生命归零时改为保留 10 点`, B => { B.pl.soul = true; }],
  mirror: [(a, V) => `造成等同目标本回合攻击力的伤害（至少 ${V(6)}）`, (B, a, c) => { const e = tgt(c); if (!e) return; const it = B.intent(e); B.hurt(e, Math.max(c.V(6), Math.round(it.atk * it.k * c.m))); }, 1],
  dive: [(a, V) => `造成 ${V(13)} 伤害；目标没有护盾时再 +${V(5)}`, (B, a, c) => { const e = tgt(c); if (e) B.hurt(e, c.V(13) + (e.blk ? 0 : c.V(5))); }, 1],
  crusade: [(a, V) => `造成 ${V(10)} 伤害；对精英和首领再 +${V(6)}`, (B, a, c) => { const e = tgt(c); if (e) B.hurt(e, c.V(10) + (e.d.boss || e.d.elite ? c.V(6) : 0)); }, 1],
  hunt: [(a, V) => `造成 ${V(a[0])} 伤害；击杀则粟 +8、抽 2`, (B, a, c) => { const e = tgt(c); if (!e) return; B.hurt(e, c.V(a[0])); if (!e.alive) { B.E('gold', { n: gainGold(B.G, 8) }); B.drawN(2); } }, 1],
  mend: [(a, V) => `回复上回合所受伤害的一半；护盾 ${V(6)}`, (B, a, c) => { B.heal(Math.ceil(B.tookLast / 2)); B.block(c.V(6)); }],
  frost: [(a, V) => `全体 ${V(a[0])} 伤害；湿的敌人被冻住（困）`, (B, a, c) => each(B, e => { const w = e.st.wet; B.hurt(e, c.V(a[0]), { el: 'W' }); if (w && e.alive) { delete e.st.wet; B.fst(e, 'stun', 1); } }), 1],
  erase: [() => `抹掉这个错字`, () => {}],
};
const NO_RANDOM = new Set(['create', 'babble', 'again', 'sell', 'copy', 'extra', 'frenzy', 'unite', 'only', 'anew']);
const descChar = (ch, m) => { m = m || 1; const V = n => Math.max(1, Math.round(n * m)); return CH[ch].fx.map(a => OPS[a[0]][0](a.slice(1), V, m)).join('；'); };
const isAtk = def => def.fx.some(a => OPS[a[0]][2]);
const FOE_TAG = { burn: '灼', weak: '弱', vul: '伤', str: '强', blk: '守', blkAll: '守', heal: '愈', healAll: '愈', curse: '讹', drain: '墨', seal: '封', steal: '偷', summon: '召', eat: '吞', wipe: '抹' };
const FOE_DESC = { atk: a => `攻击 ${a[0]}${a[1] > 1 ? '×' + a[1] : ''}`, leech: a => `攻击 ${a[0]} 并吸血`, burn: a => `令你 灼 ${a[0]}`, weak: a => `令你 弱 ${a[0]}`, vul: a => `令你 伤 ${a[0]}`, str: a => `力 +${a[0]}`, blk: a => `护盾 ${a[0]}`, blkAll: a => `全体护盾 ${a[0]}`, heal: a => `回复 ${a[0]}`, healAll: a => `全体回复 ${a[0]}`, curse: a => `往你的弃牌堆塞 ${a[0]} 张「讹」`, drain: a => `你下回合 墨 -${a[0]}`, seal: a => `下回合封住你 ${a[0]} 张手牌`, steal: a => `偷走至多 ${a[0]} 粟（击杀可夺回）`, summon: a => `召来 ${a[1]} 只${EN[a[0]].n}`, eat: a => `吞掉你牌堆里 ${a[0]} 张字根（本场）`, wipe: () => `抹去你的全部增益与随从` };

const inkMaxOf = G => 3 + (G.relics.includes('huimo') ? 1 : 0) + (G.boon === 'pomo' ? 1 : 0) - (G.boon === 'ximo' ? 1 : 0);
const handOf = G => 6 + (G.relics.includes('xuanzhi') ? 1 : 0) - (G.boon === 'pomo' || G.boon === 'yibi' ? 1 : 0) + (G.boon === 'kuangcao' ? 2 : 0);
function gainGold(G, n) { n = Math.round(n * (G.boon === 'jinshi' ? 1.5 : 1)); G.gold += n; return n; }

// 写出一个字：天雨粟、字典
function noteChar(G, ch, B) {
  if (CH[ch].n === 1) return;
  G.st.chars++;
  if (!G.seenRun[ch]) {
    G.seenRun[ch] = 1; const isNew = !META.dict[ch]; const g = gainGold(G, isNew ? 8 : 2);
    if (isNew) { G.st.newc++; (G.newList = G.newList || []).push(ch); }
    if (G.boon === 'bowen' && B) B.heal(2);
    if (B) B.E('rain', { ch, isNew, g });
    META.dict[ch] = (META.dict[ch] || 0) + 1; delete META.hint[ch];
    if (isNew) saveMeta();
  } else META.dict[ch] = (META.dict[ch] || 0) + 1;
}

// ───────── 战斗
let UID = 0;
function newBattle(G, ids, kind) {
  const R = G.rng, has = id => G.relics.includes(id);
  const B = { G, kind, turn: 0, ink: 0, hand: [], draw: [], disc: [], gone: [], en: [], allies: [], ev: [], over: null, pending: null, extra: false,
    pl: { blk: 0, str: 0, tstr: 0, dodge: 0, thorn: 0, tthorn: 0, regen: 0, ward: 0, reflect: 0, weak: 0, vul: 0, burn: 0, fort: 0, growth: 0, handup: 0, mastery: 0, barricade: false, keep: false, retain: false, soul: false },
    nx: { ink: 0, draw: 0, blk: 0, all: 0, str: 0, seal: 0 },
    mods: { free: 0, twice: 0, nmul: 1, natk: 1, child: 0, frenzy: false }, curAtk: 1,
    castN: 0, total: 0, seen: new Set(), last: null, tookLast: 0, tookNow: 0, wasHit: false, used: {}, once: {}, kills: 0 };
  const P = B.pl;
  const E = B.E = (k, o) => { B.ev.push(Object.assign({ k }, o)); };
  B.hpMul = (G.asc >= 1 ? 1.1 : 1) * (G.boon === 'zhupi' ? 1.2 : 1);
  B.dmgMul = 1 + (G.asc >= 2 ? 0.1 : 0) + (G.asc >= 9 ? 0.1 : 0);
  B.alive = () => B.en.filter(e => e.alive);
  B.rnd = () => { const a = B.alive(); return a.length ? R.pick(a) : null; };

  const mkFoe = id => {
    const d = EN[id]; let hp = d.hp * B.hpMul;
    if (d.elite && G.asc >= 3) hp *= 1.2; if (d.boss && G.asc >= 7) hp *= 1.15;
    if (!d.boss) hp *= 0.94 + R() * 0.12;
    hp = Math.round(hp);
    return { id, ch: d.ch, n: d.n, hp, max: hp, blk: 0, str: 0, st: {}, d, pi: 0, mv: null, alive: true, uid: ++UID };
  };
  const nextMove = (e, first) => {
    const d = e.d; let pat = d.pat;
    if (d.pat2 && e.hp <= e.max / 2) { if (!e.p2) { e.p2 = 1; e.pi = -1; e.str += 2; E('txt', { e: e.uid, s: '……' }); } pat = d.pat2; }
    if (first) e.pi = d.boss || d.elite ? 0 : R.int(pat.length); else e.pi++;
    e.mv = d.moves[pat[e.pi % pat.length]];
  };
  B.intent = e => {
    const o = { name: e.mv.name, atk: 0, k: 0, tags: [], desc: e.mv.steps.map(a => FOE_DESC[a[0]](a.slice(1))).join('；') };
    if (e.st.stun) { o.stun = 1; return o; }
    for (const [op, n, k] of e.mv.steps) {
      if (op === 'atk' || op === 'leech') { o.atk = Math.floor(Math.max(0, Math.floor((n * B.dmgMul + e.str) * (e.st.weak ? 0.7 : 1))) * (P.vul ? 1.5 : 1)); o.k = k || 1; if (op === 'leech') o.tags.push('吸'); }
      else if (!o.tags.includes(FOE_TAG[op])) o.tags.push(FOE_TAG[op]);
    }
    return o;
  };

  const deathCheck = () => {
    if (G.hp > 0) return;
    if (P.soul) { P.soul = false; G.hp = 10; E('txt', { p: 1, s: '还魂' }); }
    else if (has('moyu')) { G.relics.splice(G.relics.indexOf('moyu'), 1); G.hp = 15; E('txt', { p: 1, s: '墨玉碎了' }); }
    else { G.hp = 0; B.over = 'lose'; }
  };
  B.kill = e => {
    if (!e.alive) return;
    if (e.d.revive && !e.revived) { e.revived = 1; e.hp = Math.round(e.d.revive * B.hpMul); e.st = {}; e.blk = 0; E('txt', { e: e.uid, s: '重聚' }); return; }
    e.alive = false; e.hp = 0; B.kills++; G.st.kills++; E('die', { e: e.uid });
    if (e.stolen) { G.gold += e.stolen; E('gold', { n: e.stolen }); }
    if (e.d.death && !B.over) foeSteps(e, parseFx(e.d.death));
    if (!B.alive().length && B.over !== 'lose') B.over = 'win';
  };
  B.hurt = (e, n, o) => {
    o = o || {};
    if (!e || !e.alive || B.over === 'lose') return 0;
    let d = n;
    if (!o.raw) { d += P.str + P.tstr + (B.castN === 0 && has('langhao') ? 4 : 0); if (P.weak) d *= 0.7; d *= B.curAtk; }
    if (e.st.vul) d *= 1.5;
    let fear = 0, res = 0;
    if (o.el) { if (e.d.fear === o.el) { d *= has('taiji') ? 2 : 1.5; fear = 1; } else if (e.d.resist === o.el) { d *= 0.5; res = 1; } }
    if (e.st.wet) { if (has('suoyi')) d *= 1.25; if (o.el === 'F') { delete e.st.wet; E('txt', { e: e.uid, s: '蒸干' }); } }
    d = Math.max(0, Math.floor(d));
    let hp = d, ab = 0;
    if (!o.pierce && e.blk) { ab = Math.min(e.blk, d); e.blk -= ab; hp -= ab; }
    e.hp -= hp;
    E('hit', { e: e.uid, n: hp, ab, fear, res });
    if (e.hp <= 0) B.kill(e);
    return hp;
  };
  B.dot = (e, d, s) => { if (!e.alive || d <= 0) return; e.hp -= d; E('dot', { e: e.uid, n: d, s }); if (e.hp <= 0) B.kill(e); };
  B.block = n => { if (n > 0) { P.blk += n; E('blk', { n }); } };
  B.heal = n => { const b = G.hp; G.hp = Math.min(G.max, G.hp + n); if (G.hp > b) E('heal', { n: G.hp - b }); };
  B.lose = n => { if (n <= 0) return; G.hp -= n; B.tookNow += n; E('phit', { n, ab: 0, self: 1 }); deathCheck(); };
  B.cleanse = () => { P.weak = P.vul = P.burn = 0; B.hand.forEach(c => { c.sealed = false; }); if (B.nx.ink < 0) B.nx.ink = 0; B.nx.seal = 0; };
  const debuff = (k, n) => { if (P.ward > 0) { P.ward--; E('txt', { p: 1, s: '御' }); return; } P[k] += n; E('txt', { p: 1, s: { burn: '灼', weak: '弱', vul: '伤' }[k] + '+' + n, bad: 1 }); };
  B.fst = (e, k, n) => {
    if (!e || !e.alive) return;
    if ((k === 'stun' || k === 'conf' || k === 'blind') && e.d.boss) { e.st.weak = (e.st.weak || 0) + 2; E('txt', { e: e.uid, s: '定力' }); return; }
    if (k === 'stun') {
      if (e.st.imm) { e.st.weak = (e.st.weak || 0) + 1; E('txt', { e: e.uid, s: '挣脱' }); return; }
      e.st.stun = Math.max(e.st.stun || 0, n); E('txt', { e: e.uid, s: '困' });
      if (has('jingtang')) B.hurt(e, 10, { raw: 1 });
      return;
    }
    if (k === 'wet') { e.st.wet = 1; return; }
    e.st[k] = (e.st[k] || 0) + n;
  };
  const toDisc = c => { c.sealed = false; if (!c.tmp) B.disc.push(c); };
  B.drawN = n => {
    for (let i = 0; i < n; i++) {
      if (B.hand.length >= 10) break;
      if (!B.draw.length) { if (!B.disc.length) break; B.draw = R.shuffle(B.disc); B.disc = []; }
      B.hand.push(B.draw.pop());
    }
  };
  B.dumpHand = () => { const n = B.hand.length; B.hand.forEach(toDisc); B.hand = []; return n; };
  B.dup = n => { const pool = R.shuffle(B.hand.filter(c => c.c !== '讹')).slice(0, n); for (const c of pool) if (B.hand.length < 10) B.hand.push({ c: c.c, up: c.up, tmp: true }); };
  B.allyAct = times => {
    const k = has('hufu') ? 1.5 : 1, v = n => Math.round(n * k);
    for (let t = 0; t < times; t++) for (const a of B.allies.slice()) {
      if (B.over) return;
      E('ally', { a });
      if (a === '卒') B.hurt(B.rnd(), v(4), { raw: 1 });
      else if (a === '猫') { B.hurt(B.rnd(), v(3), { raw: 1, pierce: 1 }); B.hurt(B.rnd(), v(3), { raw: 1, pierce: 1 }); }
      else if (a === '蛙') { B.fst(B.rnd(), 'poison', 1); B.block(v(2)); }
      else if (a === '傀') B.hurt(B.rnd(), v(7), { raw: 1 });
      else if (a === '伙') B.block(v(4));
    }
  };
  B.conjure = (n, times) => {
    let pool = CHARS.filter(c => CH[c[0]].n === n && META.dict[c[0]] && !CH[c[0]].fx.some(a => NO_RANDOM.has(a[0]))).map(c => c[0]);
    if (!pool.length) pool = n === 3 ? ['焚', '淋', '众'] : ['炎', '林', '明', '从'];
    for (let i = 0; i < times && !B.over; i++) { const ch = R.pick(pool); E('cast', { ch, n, times: 1, sub: 1 }); B.run(CH[ch], 1, B.rnd()); }
  };
  B.ask = kind => { if (B.hand.some(c => c.c !== '讹')) B.pending = { kind }; };
  B.choose = i => {
    const p = B.pending, c = B.hand[i];
    if (!p || !c || c.c === '讹') return false;
    B.pending = null;
    if (p.kind === 'sell') {
      B.hand.splice(i, 1);
      const j = G.deck.findIndex(d => d.c === c.c && !!d.up === !!c.up);
      if (!c.tmp && j >= 0 && G.deck.length > 5) G.deck.splice(j, 1);
      E('gold', { n: gainGold(G, 12) });
    } else if (p.kind === 'copy') { for (let k = 0; k < 2 && B.hand.length < 10; k++) B.hand.push({ c: c.c, up: c.up, tmp: true }); }
    return true;
  };

  B.run = (def, m, t) => { const c = { t, m, def, B, V: n => Math.max(1, Math.round(n * m)) }; for (const a of def.fx) { if (B.over) break; OPS[a[0]][1](B, a.slice(1), c); } };
  B.mulOf = (def, cards) => {
    let m = 1 + 0.25 * cards.filter(c => c.up).length;
    if (G.boon === 'ximo') m *= 1.6;
    if (def.n === 3) { if (G.boon === 'gongbi') m *= 1.5; if (has('bijia')) m *= 1.3; }
    if (def.n === 1) { if (G.boon === 'gongbi') m *= 0.5; if (has('zhusha')) m *= 2; if (B.mods.child) m *= 3; }
    return m * (1 + P.mastery / 100) * B.mods.nmul;
  };
  B.costOf = () => (B.mods.frenzy || B.mods.free || (G.boon === 'cangfeng' && B.castN === 0) ? 0 : 1);
  B.canCast = () => !B.over && !B.pending && (G.boon !== 'yibi' || B.castN < 2);
  B.options = () => {
    const h = B.hand, out = {}, n = h.length, ok = i => !h[i].sealed;
    const add = idxs => { const r = RECIPE[keyOf(idxs.map(i => h[i].c))]; if (!r) return; const up = idxs.filter(i => h[i].up).length; for (const ch of r) if (!out[ch] || out[ch].up < up) out[ch] = { ch, idxs, up }; };
    for (let i = 0; i < n; i++) if (ok(i)) { add([i]); for (let j = i + 1; j < n; j++) if (ok(j)) { add([i, j]); for (let k = j + 1; k < n; k++) if (ok(k)) add([i, j, k]); } }
    return Object.values(out);
  };
  B.cast = (idxs, ch, ti) => {
    if (!B.canCast()) return false;
    const def = CH[ch], cards = idxs.map(i => B.hand[i]);
    if (!def || cards.some(c => !c || c.sealed) || keyOf(cards.map(c => c.c)) !== def.key) return false;
    const fz = B.mods.frenzy;
    if (!(fz || (G.boon === 'cangfeng' && B.castN === 0))) { if (B.mods.free) B.mods.free--; else if (B.ink < 1) return false; else B.ink--; }
    const m = B.mulOf(def, cards); B.mods.nmul = 1; if (def.n === 1) B.mods.child = 0;
    B.hand = B.hand.filter(c => !cards.includes(c));
    for (const c of cards) { if (c.c === '讹') B.gone.push(c); else toDisc(c); }
    if (isAtk(def)) { B.curAtk = B.mods.natk; B.mods.natk = 1; }
    let times = 1;
    if (B.mods.twice) { B.mods.twice--; times++; }
    if (G.boon === 'yibi') times++;
    if (has('xianzhang') && B.total === 0) times++;
    const fresh = !B.seen.has(ch);
    E('cast', { ch, n: def.n, times, el: def.el });
    const t = B.en[ti] && B.en[ti].alive ? B.en[ti] : B.alive()[0];
    for (let i = 0; i < times && !B.over; i++) B.run(def, m, t);
    B.curAtk = 1;
    if (!def.fx.some(a => a[0] === 'again')) B.last = { def, m };
    if (fresh) { B.seen.add(ch); if (has('zitie')) B.block(2); }
    noteChar(G, ch, B);
    B.castN++; B.total++;
    if (B.castN === 3 && has('zhujian')) B.drawN(2);
    if (def.n === 3 && !B.used.shanzi && has('shanzi')) { B.used.shanzi = 1; B.ink++; }
    if (fz && !B.over) B.lose(Math.min(3, G.hp - 1));
    return true;
  };

  const foeAtk = (e, n, k) => {
    const per = () => Math.max(0, Math.floor((n * B.dmgMul + e.str) * (e.st.weak ? 0.7 : 1)));
    if (e.st.blind) { e.st.blind--; if (!e.st.blind) delete e.st.blind; E('txt', { e: e.uid, s: '落空' }); return 0; }
    if (e.st.conf) { e.st.conf--; if (!e.st.conf) delete e.st.conf; const x = B.rnd(); E('txt', { e: e.uid, s: '乱' }); for (let i = 0; i < k && x.alive; i++) B.hurt(x, per(), { raw: 1 }); return 0; }
    if (P.dodge) { P.dodge--; E('txt', { p: 1, s: '闪' }); return 0; }
    if (P.reflect) { P.reflect--; E('txt', { p: 1, s: '代' }); for (let i = 0; i < k && e.alive; i++) B.hurt(e, per(), { raw: 1 }); return 0; }
    let tot = 0;
    for (let i = 0; i < k && !B.over && e.alive; i++) {
      let d = per(); if (P.vul) d = Math.floor(d * 1.5);
      if (!B.wasHit) { B.wasHit = true; if (has('jiechi')) d = Math.max(0, d - 5); }
      const ab = Math.min(P.blk, d); P.blk -= ab; const hp = d - ab;
      if (hp > 0) { G.hp -= hp; B.tookNow += hp; tot += hp; }
      E('phit', { n: hp, ab, e: e.uid });
      deathCheck();
      const th = P.thorn + P.tthorn; if (th && e.alive && !B.over) B.hurt(e, th, { raw: 1 });
    }
    return tot;
  };
  const healFoe = (e, n) => { const b = e.hp; e.hp = Math.min(e.max, e.hp + n); if (e.hp > b) E('txt', { e: e.uid, s: '+' + (e.hp - b), good: 1 }); };
  const foeSteps = (e, steps) => {
    for (const a of steps) {
      if (B.over) return;
      const [op, n, k] = a;
      switch (op) {
        case 'atk': foeAtk(e, n, k || 1); break;
        case 'leech': { const d = foeAtk(e, n, 1); if (d > 0 && e.alive) healFoe(e, d); break; }
        case 'burn': case 'weak': case 'vul': debuff(op, n); break;
        case 'str': e.str += n; E('txt', { e: e.uid, s: '力+' + n }); break;
        case 'blk': e.blk += n; break;
        case 'blkAll': each(B, x => { x.blk += n; }); break;
        case 'heal': healFoe(e, n); break;
        case 'healAll': each(B, x => healFoe(x, n)); break;
        case 'curse': for (let i = 0; i < n; i++) B.disc.push({ c: '讹' }); E('txt', { p: 1, s: '讹+' + n, bad: 1 }); break;
        case 'drain': if (P.ward > 0) { P.ward--; E('txt', { p: 1, s: '御' }); } else { B.nx.ink -= n; E('txt', { p: 1, s: '墨-' + n, bad: 1 }); } break;
        case 'seal': if (P.ward > 0) { P.ward--; E('txt', { p: 1, s: '御' }); } else { B.nx.seal += n; E('txt', { p: 1, s: '封+' + n, bad: 1 }); } break;
        case 'steal': { const s = Math.min(G.gold, n); G.gold -= s; e.stolen = (e.stolen || 0) + s; if (s) E('txt', { p: 1, s: '粟-' + s, bad: 1 }); break; }
        case 'summon': for (let i = 0; i < k; i++) if (B.alive().length < 4) { const x = mkFoe(n); B.en.push(x); nextMove(x, true); E('spawn', { e: x.uid }); } break;
        case 'eat': for (let i = 0; i < n; i++) { const pile = B.draw.length ? B.draw : B.disc; if (!pile.length) break; const c = pile.splice(R.int(pile.length), 1)[0]; B.gone.push(c); E('txt', { p: 1, s: '吞「' + c.c + '」', bad: 1 }); } break;
        case 'wipe': Object.assign(P, { str: 0, tstr: 0, blk: 0, thorn: 0, regen: 0, dodge: 0, fort: 0, growth: 0, mastery: 0, barricade: false, ward: 0, reflect: 0 }); B.allies = []; E('txt', { p: 1, s: '抹去', bad: 1 }); break;
      }
    }
  };
  const foeTurn = e => {
    if (e.st.burn) { const d = Math.round(e.st.burn * (has('denglong') ? 1.5 : 1)); e.st.burn = Math.floor(e.st.burn / 2); if (!e.st.burn) delete e.st.burn; B.dot(e, d, '灼'); if (!e.alive) return; }
    if (e.st.poison) { B.dot(e, e.st.poison, '毒'); if (!e.alive) return; }
    e.blk = 0;
    if (e.st.stun) { e.st.stun--; if (!e.st.stun) { delete e.st.stun; e.st.imm = 2; } E('txt', { e: e.uid, s: '动弹不得' }); }
    else { E('foe', { e: e.uid, name: e.mv.name }); foeSteps(e, e.mv.steps); if (e.st.imm) { e.st.imm--; if (!e.st.imm) delete e.st.imm; } if (e.alive) nextMove(e); }
    for (const k of ['weak', 'vul']) if (e.st[k]) { e.st[k]--; if (!e.st[k]) delete e.st[k]; }
    if (e.st.wet) { e.st.wet++; if (e.st.wet > 2) delete e.st.wet; }
  };

  const startTurn = () => {
    B.turn++; G.st.turns++;
    if (B.turn > 9) { each(B, e => { e.str++; }); if (B.turn === 10) E('txt', { p: 1, s: '夜深了', bad: 1 }); }
    if (!P.barricade) { if (P.keep) P.keep = false; else P.blk = has('zhenzhi') ? Math.floor(P.blk / 2) : 0; }
    P.tstr = 0; P.tthorn = 0; P.retain = false; B.castN = 0; B.used = {}; B.mods.frenzy = false; B.wasHit = false; B.tookLast = B.tookNow; B.tookNow = 0;
    B.ink = Math.max(0, inkMaxOf(G) + B.nx.ink + (B.turn === 1 && G.boon === 'feibai' ? 2 : 0));
    if (B.nx.blk) B.block(B.nx.blk); if (B.nx.str) P.str += B.nx.str;
    if (P.fort) B.block(P.fort); if (P.growth) B.heal(P.growth);
    if (P.regen) { B.heal(P.regen); P.regen--; }
    if (P.burn) { B.lose(P.burn); P.burn = Math.floor(P.burn / 2); if (B.over) return; }
    if (B.nx.all) each(B, e => B.hurt(e, B.nx.all, { raw: 1 }));
    if (B.over) return;
    B.drawN(Math.max(1, handOf(G) + B.nx.draw + P.handup + (B.turn === 1 && has('shuicheng') ? 2 : 0)));
    if (B.nx.seal) { const c = R.shuffle(B.hand.filter(c => !c.sealed && c.c !== '讹')).slice(0, B.nx.seal); c.forEach(x => { x.sealed = true; }); }
    B.nx = { ink: 0, draw: 0, blk: 0, all: 0, str: 0, seal: 0 };
    E('turn', { n: B.turn });
  };
  // 结束回合：返回一串步骤，界面一步一步放，模拟器一口气跑完
  B.endSteps = () => {
    if (B.over || B.pending) return [];
    const steps = [() => {
      if (B.allies.length) B.allyAct(1);
      if (B.over) return;
      if (has('duanyan') && B.ink > 0) B.block(4 * B.ink);
      if (has('bixi')) { const k = ['burn', 'weak', 'vul'].find(s => P[s]); if (k) P[k] = 0; }
      if (!P.retain) B.dumpHand(); else B.hand.forEach(c => { c.sealed = false; });
      if (P.weak) P.weak--; if (P.vul) P.vul--;
    }];
    for (const e of B.en.slice()) steps.push(() => { if (!e.alive || B.over || B.extra) return false; foeTurn(e); });
    steps.push(() => { if (B.over) return; if (B.extra) { B.extra = false; E('txt', { p: 1, s: '闰' }); } startTurn(); });
    return steps;
  };
  B.endTurn = () => { for (const s of B.endSteps()) s(); };

  B.draw = R.shuffle(G.deck.map(c => ({ c: c.c, up: !!c.up })));
  for (const id of ids) { const e = mkFoe(id); B.en.push(e); nextMove(e, true); }
  startTurn();
  if (has('mochuang')) B.block(8);
  if (has('xionghuang')) B.en.forEach(e => { if (e.d.tag === '鬼') { B.fst(e, 'weak', 2); B.fst(e, 'vul', 1); } });
  if (has('suanpan')) P.str += Math.min(3, Math.floor(G.gold / 25));
  B.ev = [];
  return B;
}

// ───────── 一局
function synergy(G, c) { // 把 c 加进牌库后，c 参与且凑得齐的字
  const have = {}; for (const d of G.deck) have[d.c] = (have[d.c] || 0) + 1; have[c] = (have[c] || 0) + 1;
  const out = [];
  for (const [ch, cs] of CHARS) { if (!cs.includes(c)) continue; const need = {}; for (const x of cs) need[x] = (need[x] || 0) + 1; if (Object.keys(need).every(x => (have[x] || 0) >= need[x])) out.push(ch); }
  return out;
}
function rollComp(G, excl, minRar) {
  const R = G.rng, pool = [];
  for (const c in COMPS) { const r = COMPS[c][1]; if (r === 4 || excl.includes(c) || r < (minRar || 1)) continue; const w = [0, 10, 6, 2.5][r] * (1 + 0.15 * Math.min(6, synergy(G, c).length)); pool.push([c, w]); }
  let t = pool.reduce((s, p) => s + p[1], 0) * R();
  for (const p of pool) { t -= p[1]; if (t <= 0) return p[0]; }
  return pool[pool.length - 1][0];
}
function rollRelic(G, tier, excl) { const pool = Object.keys(RELICS).filter(id => RELICS[id][2] === tier && !G.relics.includes(id) && !(excl || []).includes(id)); return pool.length ? G.rng.pick(pool) : null; }
function addRelic(G, id) { if (!id || G.relics.includes(id)) return; G.relics.push(id); if (id === 'bige') { G.max += 12; G.hp += 12; } }

function genMap(G) {
  const R = G.rng, ROWS = 8, W = 5, nodes = {}, id = (r, c) => r + '-' + c;
  const starts = R.shuffle([0, 1, 2, 3, 4]).slice(0, 3); starts.push(R.pick(starts));
  for (const s of starts) {
    let c = s;
    for (let r = 0; r < ROWS; r++) {
      const nd = nodes[id(r, c)] = nodes[id(r, c)] || { id: id(r, c), r, c, next: [], t: 'B' };
      if (r === ROWS - 1) break;
      let nc = Math.max(0, Math.min(W - 1, c + R.int(3) - 1));
      if (nc !== c) { const side = nodes[id(r, nc)]; if (side && side.next.includes(id(r + 1, c))) nc = c; } // 不交叉
      if (!nd.next.includes(id(r + 1, nc))) nd.next.push(id(r + 1, nc));
      c = nc;
    }
  }
  const list = Object.values(nodes), parents = {};
  for (const n of list) for (const x of n.next) (parents[x] = parents[x] || []).push(n);
  for (const n of list.sort((a, b) => a.r - b.r)) {
    if (n.r === 0) { n.t = 'B'; continue; }
    if (n.r === ROWS - 1) { n.t = 'R'; continue; }
    const pt = (parents[n.id] || []).map(p => p.t);
    const w = { B: 46, E: 22, S: n.r >= 2 ? 9 : 0, R: n.r >= 3 && n.r < ROWS - 2 ? 9 : 0, X: n.r >= 3 ? 14 : 0 };
    for (const k of ['S', 'R', 'X']) if (pt.includes(k)) w[k] = 0;
    let t = R() * (w.B + w.E + w.S + w.R + w.X);
    for (const k in w) { t -= w[k]; if (t <= 0) { n.t = k; break; } }
  }
  for (const k of ['S', 'X']) if (!list.some(n => n.t === k)) { const c = list.filter(n => n.t === 'B' && n.r >= 3 && n.r < ROWS - 1); if (c.length) R.pick(c).t = k; }
  return { nodes, rows: ROWS, boss: R.pick(ENC[G.act].boss) };
}
const choices = G => { const m = G.map; if (!G.at) return Object.values(m.nodes).filter(n => n.r === 0).map(n => n.id); if (G.at === 'boss') return []; const n = m.nodes[G.at]; return n.next.length ? n.next : ['boss']; };

function newRun(o) {
  const seed = o.seed != null ? o.seed : (Math.random() * 2 ** 31) | 0;
  const G = { seed, rng: RNG(seed), kit: o.kit, boon: o.boon, asc: o.asc || 0, hp: 0, max: 70, gold: 40, deck: [], relics: [], act: 1, map: null, at: null, floor: 0,
    seenRun: {}, st: { turns: 0, kills: 0, chars: 0, newc: 0 }, rmCost: 60, upCost: 45, over: null };
  G.deck = [...KITS[o.kit].deck].map(c => ({ c, up: false }));
  const b = o.boon;
  if (b === 'feibai') G.max -= 12; if (b === 'jinshi') G.max -= 8; if (b === 'cangfeng' || b === 'yibi') G.max -= 10;
  if (b === 'guicai') { G.deck.push({ c: '鬼' }, { c: '鬼' }); G.max -= 5; }
  if (b === 'kuangcao') G.max -= 14;
  if (b === 'zhupi') G.deck.forEach(c => { c.up = true; });
  if (b === 'sujian') { G.gold += 50; addRelic(G, rollRelic(G, 'c')); }
  if (G.asc >= 5) G.deck.push({ c: '讹' });
  if (G.asc >= 8) G.max -= 8;
  G.hp = G.max;
  G.map = genMap(G);
  return G;
}
const saveRun = G => { const o = Object.assign({}, G, { rng: undefined, rs: G.rng.get() }); STORE.set('gyk-run', JSON.stringify(o)); };
const loadRun = () => { try { const s = STORE.get('gyk-run'); if (!s) return null; const G = JSON.parse(s); G.rng = RNG(0); G.rng.set(G.rs); return G; } catch (e) { return null; } };
const clearRun = () => STORE.del('gyk-run');

function visit(G, id) { // 走到一个节点，返回这一格是什么
  const R = G.rng; G.at = id; G.floor++; (G.path = G.path || []).push(id);
  if (id === 'boss') return { t: 'battle', B: newBattle(G, [G.map.boss], 'boss') };
  const n = G.map.nodes[id], enc = ENC[G.act];
  if (n.t === 'B') return { t: 'battle', B: newBattle(G, R.pick(n.r < 2 ? enc.easy : R.chance(0.2) ? enc.easy : enc.hard), 'normal') };
  if (n.t === 'X') return { t: 'battle', B: newBattle(G, R.pick(enc.elite), 'elite') };
  if (n.t === 'S') return { t: 'shop', shop: mkShop(G) };
  if (n.t === 'R') return { t: 'rest' };
  const pool = EVENTS.filter(e => !(G.evSeen || []).includes(e.id) && (!e.ok || e.ok(G)));
  const ev = R.pick(pool.length ? pool : EVENTS); (G.evSeen = G.evSeen || []).push(ev.id);
  return { t: 'event', ev };
}
function mkReward(G, B) {
  const R = G.rng, kind = B.kind;
  let gold = kind === 'boss' ? 45 + R.int(15) : kind === 'elite' ? 26 + R.int(10) : 11 + R.int(8);
  if (G.relics.includes('tongqian')) gold += 8;
  gold = gainGold(G, gold);
  if (G.relics.includes('xianglu')) G.hp = Math.min(G.max, G.hp + 5);
  const drops = R.shuffle([...new Set(B.en.flatMap(e => [...(e.d.drop || '')]))].filter(c => COMPS[c]));
  const n = 3 + (G.relics.includes('canjuan') ? 1 : 0), comps = [], excl = [];
  for (const c of drops.slice(0, 2)) { comps.push(c); excl.push(c); }
  while (comps.length < n) { const c = rollComp(G, excl, kind === 'normal' ? 1 : 2); comps.push(c); excl.push(c); }
  const rw = { gold, comps: R.shuffle(comps).map(c => ({ c, up: R.chance(kind === 'normal' ? 0.12 : 0.35) })), relic: null, relics: null };
  if (kind === 'elite') rw.relic = rollRelic(G, 'c');
  if (kind === 'boss' && G.act < 3) { rw.relics = []; for (let i = 0; i < 3; i++) { const id = rollRelic(G, 'b', rw.relics); if (id) rw.relics.push(id); } G.hp = Math.min(G.max, G.hp + Math.round(G.max * 0.4)); }
  return rw;
}
function nextAct(G) { G.act++; G.at = null; G.path = []; G.map = genMap(G); }
function mkShop(G) {
  const R = G.rng, k = G.asc >= 6 ? 1.2 : 1, excl = [], comps = [], relics = [];
  for (let i = 0; i < 5; i++) { const c = rollComp(G, excl, i >= 3 ? 2 : 1); excl.push(c); const up = R.chance(0.2); comps.push({ c, up, price: Math.round(([0, 30, 45, 62][COMPS[c][1]] + R.int(8) + (up ? 18 : 0)) * k) }); }
  for (let i = 0; i < 2; i++) { const id = rollRelic(G, 'c', relics.map(r => r.id)); if (id) relics.push({ id, price: Math.round((105 + R.int(40)) * k) }); }
  return { comps, relics, tea: Math.round(28 * k) };
}
function hintNew(G, n) { // 得知 n 个未识之字的写法，优先眼下凑得齐的
  const have = {}; for (const d of G.deck) have[d.c] = (have[d.c] || 0) + 1;
  const unk = CHARS.filter(c => !known(c[0])).map(c => c[0]);
  const can = ch => { const need = {}; for (const x of CH[ch].comps) need[x] = (need[x] || 0) + 1; return Object.keys(need).every(x => (have[x] || 0) >= need[x]); };
  const a = G.rng.shuffle(unk.filter(can)), b = G.rng.shuffle(unk.filter(ch => !can(ch)));
  const out = a.concat(b).slice(0, n); out.forEach(ch => { META.hint[ch] = 1; }); saveMeta(); return out;
}
const restHeal = G => Math.round(G.max * (G.asc >= 4 ? 0.22 : 0.3));
function endRun(G, win) {
  G.over = win ? 'win' : 'lose';
  META.runs++; if (win) { META.wins++; META.kitWins[G.kit] = (META.kitWins[G.kit] || 0) + 1; if (G.asc >= META.asc && META.asc < 9) META.asc = G.asc + 1; }
  META.hist.unshift({ kit: G.kit, boon: G.boon, asc: G.asc, win: !!win, act: G.act, floor: G.floor, chars: G.st.chars, newc: G.st.newc, seed: G.seed });
  META.hist = META.hist.slice(0, 12);
  saveMeta(); clearRun();
}

// 典故。opt: l 标签 / d 说明 / ok 可否 / pick 需要先从牌库选一张 / f 执行并返回一句结果
const rarComp = (G, min) => rollComp(G, [], min);
const EVENTS = [
  { id: 'luoshu', t: '洛书', x: '河面浮起一片龟甲，背上的纹路像字，又不是字。', o: [
    { l: '拓下来', d: '获得一张少见的字根', f: G => { const c = rarComp(G, 2); G.deck.push({ c }); return `你得到了「${c}」。`; } },
    { l: '捞起来卖掉', d: '粟 +25', f: G => { gainGold(G, 25); return '龟甲换了些粟。'; } }] },
  { id: 'fenshu', t: '焚书', x: '有人在烧书。火堆旁还有几卷，没来得及扔进去。', o: [
    { l: '抢一卷出来', d: '失去 6 生命，获得一张朱批字根', f: G => { G.hp = Math.max(1, G.hp - 6); const c = rarComp(G, 2); G.deck.push({ c, up: true }); return `手烫了一下。你得到了朱批的「${c}」。`; } },
    { l: '把自己的也扔进去', d: '删去一张字根', pick: 1, ok: G => G.deck.length > 5, f: (G, i) => { const c = G.deck.splice(i, 1)[0]; return `「${c.c}」卷起来，黑了。`; } },
    { l: '走开', d: '', f: () => '你没有回头。' }] },
  { id: 'xizi', t: '惜字亭', x: '敬惜字纸。亭中有炉，专焚废字。', o: [
    { l: '捐三十粟', d: '获得一件文房', ok: G => G.gold >= 30, f: G => { G.gold -= 30; const id = rollRelic(G, 'c'); addRelic(G, id); return id ? `守亭人递给你一件「${RELICS[id][0]}」。` : '守亭人点了点头。'; } },
    { l: '把错字投进炉里', d: '删去牌库里所有「讹」；回复 6', f: G => { G.deck = G.deck.filter(c => c.c !== '讹'); G.hp = Math.min(G.max, G.hp + 6); return '纸灰很轻。'; } },
    { l: '翻捡字纸', d: '粟 +20，牌库多一张「讹」', f: G => { gainGold(G, 20); G.deck.push({ c: '讹' }); return '纸堆里夹着些钱，也夹着别的。'; } }] },
  { id: 'cezi', t: '测字先生', x: '「客官，写个字？」他把一方砚推过来。', o: [
    { l: '测字', d: '花 15 粟，得知 3 个未识之字的写法', ok: G => G.gold >= 15 && dictCount() < TOTAL, f: G => { G.gold -= 15; const a = hintNew(G, 3); return a.length ? '他在纸上写下：' + a.map(ch => `${CH[ch].comps.join('＋')}＝${ch}`).join('，') + '。' : '「你认得的比我多。」'; } },
    { l: '请他批字', d: '花 35 粟，朱批一张字根', pick: 1, ok: G => G.gold >= 35 && G.deck.some(c => !c.up && c.c !== '讹'), pf: c => !c.up && c.c !== '讹', f: (G, i) => { G.gold -= 35; G.deck[i].up = true; return `「${G.deck[i].c}」上多了一道朱痕。`; } },
    { l: '走开', d: '', f: () => '「下次再来。」' }] },
  { id: 'beilin', t: '碑林', x: '荒草里立着许多碑。字被风磨得很浅，但还认得出。', o: [
    { l: '拓一块', d: '朱批一张字根', pick: 1, ok: G => G.deck.some(c => !c.up && c.c !== '讹'), pf: c => !c.up && c.c !== '讹', f: (G, i) => { G.deck[i].up = true; return `你把「${G.deck[i].c}」描了一遍。`; } },
    { l: '坐下来读', d: '回复 14', f: G => { G.hp = Math.min(G.max, G.hp + 14); return '读着读着，天亮了一点。'; } }] },
  { id: 'cuozi', t: '错字鬼', x: '一只小鬼蹲在你的纸上，正偷偷给一个字添笔画。', o: [
    { l: '由它去', d: '一张字根变成另一张随机字根', pick: 1, f: (G, i) => { const a = G.deck[i].c, c = rollComp(G, [a], 1); G.deck[i].c = c; return `「${a}」被改成了「${c}」。它很得意。`; } },
    { l: '抓住它', d: '失去 5 生命，获得一张「鬼」', f: G => { G.hp = Math.max(1, G.hp - 5); G.deck.push({ c: '鬼' }); return '它咬了你一口，然后被夹进了纸里。'; } }] },
  { id: 'qianjin', t: '一字千金', x: '城门上悬着千金：有能增损一字者，予之。', o: [
    { l: '损一字', d: '删去一张字根，粟 +45', pick: 1, ok: G => G.deck.length > 5, f: (G, i) => { const c = G.deck.splice(i, 1)[0]; gainGold(G, 45); return `你划掉了「${c.c}」。没人能再添回去。`; } },
    { l: '看看就走', d: '', f: () => '一个字也动不得。' }] },
  { id: 'guishi', t: '鬼市', x: '半夜的集市。摊主没有影子，只收一种钱。', o: [
    { l: '以寿换字', d: '生命上限 -6，获得「鬼」和一张罕见字根', f: G => { G.max -= 6; G.hp = Math.min(G.hp, G.max); const c = rarComp(G, 3); G.deck.push({ c: '鬼' }, { c }); return `你得到了「鬼」和「${c}」。`; } },
    { l: '以寿换物', d: '生命上限 -8，获得一件文房', f: G => { G.max -= 8; G.hp = Math.min(G.hp, G.max); const id = rollRelic(G, 'c'); addRelic(G, id); return id ? `你得到了「${RELICS[id][0]}」。` : '摊主摇了摇头。'; } },
    { l: '离开', d: '', f: () => '天快亮了。' }] },
  { id: 'miao', t: '仓颉庙', x: '庙很小。塑像有四只眼睛。', o: [
    { l: '上香', d: '回复 20', f: G => { G.hp = Math.min(G.max, G.hp + 20); return '香烧得很慢。'; } },
    { l: '求字', d: '获得两张少见的字根', f: G => { const a = rarComp(G, 2), b = rollComp(G, [a], 2); G.deck.push({ c: a }, { c: b }); return `你得到了「${a}」和「${b}」。`; } },
    { l: '求教', d: '得知 2 个未识之字的写法', ok: () => dictCount() < TOTAL, f: G => { const a = hintNew(G, 2); return a.length ? '你忽然想起：' + a.map(ch => `${CH[ch].comps.join('＋')}＝${ch}`).join('，') + '。' : '没有回应。'; } }] },
  { id: 'yeyu', t: '夜雨', x: '夜里下起雨来。落在瓦上的声音不像水，像米。', o: [
    { l: '出去接', d: '粟 +30', f: G => { gainGold(G, 30); return '天雨粟。'; } },
    { l: '就这么听着', d: '生命上限 +5', f: G => { G.max += 5; G.hp += 5; return '你睡得很好。'; } }] },
  { id: 'wenziyu', t: '盘查', x: '差役拦住路：「身上带了什么字？」', o: [
    { l: '交出一张', d: '随机失去一张字根', ok: G => G.deck.length > 5, f: G => { const c = G.deck.splice(G.rng.int(G.deck.length), 1)[0]; return `他抽走了「${c.c}」。`; } },
    { l: '塞钱', d: '粟 -25', ok: G => G.gold >= 25, f: G => { G.gold -= 25; return '他掂了掂，让开了。'; } },
    { l: '硬闯', d: '失去 9 生命', f: G => { G.hp = Math.max(1, G.hp - 9); return '你挨了几棍。'; } }] },
  { id: 'wuzibei', t: '无字碑', x: '一块碑，上面什么也没有。', o: [
    { l: '写上去', d: '复制一张字根', pick: 1, pf: c => c.c !== '讹', f: (G, i) => { const c = G.deck[i]; G.deck.push({ c: c.c, up: c.up }); return `碑上有了一个「${c.c}」。你的纸上也还有一个。`; } },
    { l: '靠着歇一会儿', d: '回复 10', f: G => { G.hp = Math.min(G.max, G.hp + 10); return '石头是凉的。'; } }] },
];
