/* ボットでルール部分を回す。 node bot/run.js [回数=300]
 * 取り方・出し方ごとに、レア 1〜3 枚目それぞれの勝率を表で出す。
 */
'use strict';
const R = require('../src/rules.js');
const AI = require('../src/ai.js');
const S = require('./strategies.js');
R.setOppPicker(AI.pick);

const N = parseInt(process.argv[2] || '300', 10);
// 3 つ目の引数で数値を上書きできる（調整用）。例: node bot/run.js 300 '{"rares":[[30,2],[40,2],[55,3]]}'
const OV = process.argv[3] ? JSON.parse(process.argv[3]) : null;
if (OV) {
  if (OV.rares) OV.rares.forEach((r, i) => { R.RARES[i].hp = r[0]; R.RARES[i].atk = r[1]; });
  if (OV.conf) Object.assign(R.CONF, OV.conf);
  console.log('上書き: ' + JSON.stringify(OV));
}

function playOne(strategy, keep, seed) {
  const s = R.createGame({ seed });
  let guard = 0;
  let plan = null;
  const reached = [true, false, false];
  const beaten = [false, false, false];
  const turnsPerRare = [0, 0, 0];
  const hpAt = [R.CONF.playerHp, 0, 0]; // レア k に着いたときの体力
  let lastTurnMark = 0;
  const picks = {}, oppPicks = {}, playedCards = {}; // 取った札・相手に取られた札・出した札の内訳
  const tally = (ev) => ev.forEach(e => {
    if (e.t === 'pick') { const o = e.who === 'p' ? picks : oppPicks; o[e.card] = (o[e.card] || 0) + 1; }
    if (e.t === 'play') playedCards[e.card] = (playedCards[e.card] || 0) + 1;
  });
  while (s.phase !== 'win' && s.phase !== 'lose' && guard++ < 5000) {
    if (s.phase === 'draft') {
      const L = R.legal(s);
      if (L.mustDiscard) { if (!R.act(s, { type: 'discard', index: strategy.discard(s) })) throw new Error('discard failed'); continue; }
      const ev = R.act(s, { type: 'pick', index: strategy.pick(s) });
      if (!ev) throw new Error('pick failed ' + strategy.name);
      tally(ev);
      plan = null;
    } else if (s.phase === 'play') {
      if (!plan) plan = strategy.plan(s).slice();
      let played = false;
      while (plan.length && s.played.length < R.CONF.playMax && s.phase === 'play') {
        const c = plan.shift();
        const idx = s.player.hand.indexOf(c);
        if (idx < 0) continue; // ゴブリンで捨てられた等
        tally(R.act(s, { type: 'play', index: idx }) || []);
        played = true;
      }
      if (s.phase === 'play') { tally(R.act(s, { type: 'end' }) || []); plan = null; }
    } else if (s.phase === 'choose') {
      beaten[s.rareIndex] = true;
      turnsPerRare[s.rareIndex] = s.turn - lastTurnMark; lastTurnMark = s.turn;
      hpAt[s.rareIndex + 1] = s.player.hp;
      // keep: true=全部取る false=取らない 'first'=1 枚目だけ 'second'=2 枚目だけ
      const k = keep === true || (keep === 'first' && s.rareIndex === 0) || (keep === 'second' && s.rareIndex === 1);
      tally(R.act(s, { type: 'choose', keep: k }) || []);
      reached[s.rareIndex] = true;
      plan = null;
    }
  }
  if (s.phase === 'win') { beaten[2] = true; turnsPerRare[2] = s.turn - lastTurnMark; }
  return { win: s.phase === 'win', reached, beaten, turns: s.turn, hp: s.player.hp, turnsPerRare, owned: s.player.owned.length, dmg: s.totalDmg, hpAt, picks, oppPicks, playedCards };
}

function runConfig(strategy, keep, n, seedBase) {
  const agg = { reached: [0, 0, 0], beaten: [0, 0, 0], wins: 0, turns: 0, hpWin: 0, turnsPerRare: [0, 0, 0], beatCount: [0, 0, 0], dmg: 0, hpAt: [0, 0, 0], picks: {}, oppPicks: {}, playedCards: {} };
  const addTo = (dst, src) => Object.keys(src).forEach(k => { dst[k] = (dst[k] || 0) + src[k]; });
  for (let i = 0; i < n; i++) {
    const r = playOne(strategy, keep, seedBase + i);
    addTo(agg.picks, r.picks); addTo(agg.oppPicks, r.oppPicks); addTo(agg.playedCards, r.playedCards);
    for (let k = 0; k < 3; k++) {
      if (r.reached[k]) { agg.reached[k]++; agg.hpAt[k] += r.hpAt[k]; }
      if (r.beaten[k]) { agg.beaten[k]++; agg.turnsPerRare[k] += r.turnsPerRare[k]; agg.beatCount[k]++; }
    }
    if (r.win) { agg.wins++; agg.hpWin += r.hp; }
    agg.turns += r.turns; agg.dmg += r.dmg;
  }
  return agg;
}

function pct(a, b) { return b ? (100 * a / b).toFixed(0) + '%' : '-'; }

const KEEP_JP = { false: '取らない', true: '2 枚とも取る', first: '1 枚目だけ取る', second: '2 枚目だけ取る' };
const configs = [
  { no: '1', st: S.random, keep: false },
  { no: '2', st: S.collector, keep: false },
  { no: '3', st: S.greedy, keep: false },
  { no: '4', st: S.combo, keep: false },
  { no: '5-2', st: S.collector, keep: true },
  { no: '5-2a', st: S.collector, keep: 'first' },
  { no: '5-2b', st: S.collector, keep: 'second' },
  { no: '5-4', st: S.combo, keep: true },
  { no: '5-4a', st: S.combo, keep: 'first' },
  { no: '5-4b', st: S.combo, keep: 'second' },
  { no: '(1 取る)', st: S.random, keep: true },
  { no: '(3 取る)', st: S.greedy, keep: true },
  { no: '(3 1枚目だけ)', st: S.greedy, keep: 'first' }
];

const COMPACT = !!(OV && OV.compact);
console.log('各 ' + N + ' 回。「倒した」= ' + N + ' 回のうちレア k を倒した割合（レア3 を倒した = 旅の勝ち）。「到達して倒した」= レア k に着いた回のうち倒した割合。');
console.log('');
if (COMPACT) {
  console.log('| 番号 | 取り方・出し方 | レア | 1 | 2 | 3 | 着いた時の体力 2/3 | ターン 1/2/3 | dmg/T |');
  console.log('|---|---|---|---|---|---|---|---|---|');
} else {
  console.log('| 番号 | 取り方・出し方 | レア | レア1 倒した | レア2 倒した | レア3 倒した（＝旅の勝率） | レア2 到達して倒した | レア3 到達して倒した | 着いたときの体力（レア2 / レア3） | 倒すのにかかったターン（1/2/3） | 平均ターン | 1 ターンの平均ダメージ |');
  console.log('|---|---|---|---|---|---|---|---|---|---|---|---|');
}
const breakdown = [];
function dist(o) {
  const total = Object.values(o).reduce((a, b) => a + b, 0) || 1;
  return R.CARD_IDS.map(id => R.CARDS[id].jp + ' ' + (100 * (o[id] || 0) / total).toFixed(0) + '%').join('、');
}
for (const c of configs) {
  const a = runConfig(c.st, c.keep, N, 1000);
  if (c.keep === false) breakdown.push({ c, a });
  const tpr = a.turnsPerRare.map((t, k) => a.beatCount[k] ? (t / a.beatCount[k]).toFixed(1) : '-').join(' / ');
  const hpAt = [1, 2].map(k => a.reached[k] ? (a.hpAt[k] / a.reached[k]).toFixed(0) : '-').join(' / ');
  if (COMPACT) {
    console.log('| ' + c.no + ' | ' + c.st.name + ' | ' + KEEP_JP[c.keep] + ' | ' + pct(a.beaten[0], N) + ' | ' + pct(a.beaten[1], N) + ' | ' + pct(a.beaten[2], N) + ' | ' + hpAt + ' | ' + tpr + ' | ' + (a.dmg / a.turns).toFixed(1) + ' |');
  } else {
    console.log('| ' + c.no + ' | ' + c.st.name + ' | ' + KEEP_JP[c.keep] + ' | ' +
      pct(a.beaten[0], N) + ' | ' + pct(a.beaten[1], N) + ' | ' + pct(a.beaten[2], N) + ' | ' +
      pct(a.beaten[1], a.reached[1]) + ' | ' + pct(a.beaten[2], a.reached[2]) + ' | ' + hpAt + ' | ' + tpr + ' | ' + (a.turns / N).toFixed(1) + ' | ' + (a.dmg / a.turns).toFixed(1) + ' |');
  }
}

if (!COMPACT) {
  console.log('');
  console.log('### 取った札・取られた札・出した札の内訳（「取らない」の行）');
  console.log('');
  for (const b of breakdown) {
    console.log('- ' + b.c.no + ' ' + b.c.st.name);
    console.log('  - 自分が取った札: ' + dist(b.a.picks));
    console.log('  - 相手に取られた札: ' + dist(b.a.oppPicks));
    console.log('  - 出した札: ' + dist(b.a.playedCards));
  }
}
