/* 数値の候補をまとめて回す。 node bot/sweep.js [回数=300]
 * 1 行 = 1 候補：旅の勝率（1 ランダム / 2 同名 / 3 高ダメ / 4 組合せ）と、2 枚目のレアを取ったときの差。
 */
'use strict';
const R = require('../src/rules.js');
const S = require('./strategies.js');
const { runConfig } = require('./run.js');
const N = parseInt(process.argv[2] || '300', 10);
const base = R.RARES.map(r => [r.hp, r.atk]);
const cands = [];
for (const hm of [2, 3]) for (const atk of [0, 1]) for (const hp of [[15, 20, 25], [18, 22, 26], [20, 25, 30], [22, 27, 32], [25, 30, 35]]) cands.push({ hm, atk, hp });
console.log('| 相手の手札上限 | 固定攻撃 | レア体力 | 1 | 2 | 3 | 4 | 2 枚目だけ取ると（2 / 3 / 4 の差） |');
console.log('|---|---|---|---|---|---|---|---|');
for (const c of cands) {
  R.CONF.oppHandMax = c.hm;
  c.hp.forEach((h, i) => { R.RARES[i].hp = h; R.RARES[i].atk = c.atk; });
  const w = st => runConfig(st, false, N, 1000).beaten[2] / N * 100;
  const w2 = st => runConfig(st, 'second', N, 1000).beaten[2] / N * 100;
  const r = [S.random, S.collector, S.greedy, S.combo].map(w);
  const d = [S.collector, S.greedy, S.combo].map((st, i) => (w2(st) - r[i + 1]).toFixed(0));
  console.log('| ' + c.hm + ' | ' + c.atk + ' | ' + c.hp.join('/') + ' | ' + r.map(x => x.toFixed(0) + '%').join(' | ') + ' | ' + d.join(' / ') + ' |');
}
