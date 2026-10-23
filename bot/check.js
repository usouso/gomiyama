/* ルールの確かめ。 node bot/check.js
 * 1) 決まった手順で、各札のダメージが仕様どおりか
 * 2) ランダムな行動を何千回も入れて、壊れない（手札が 8 枚になる、体力がマイナスのまま進む、など）か
 */
'use strict';
const R = require('../src/rules.js');
const AI = require('../src/ai.js');
AI.install();

let fails = 0;
function eq(name, a, b) { if (JSON.stringify(a) !== JSON.stringify(b)) { fails++; console.log('NG', name, JSON.stringify(a), '!=', JSON.stringify(b)); } else console.log('ok', name); }

// 1) 札の計算
eq('ネズミ 3 枚 = 1+2+3', R.simulateSequence(['rat', 'rat', 'rat'], ['rat', 'rat', 'rat']).dmg, 6);
eq('コウモリ 1 枚 = 2', R.simulateSequence(['bat'], ['bat']).dmg, 2);
eq('コウモリ 3 枚持ちで 1 枚 = 4', R.simulateSequence(['bat', 'bat', 'bat'], ['bat']).dmg, 4);
eq('コウモリ 3 枚全部 = 4+3+2', R.simulateSequence(['bat', 'bat', 'bat'], ['bat', 'bat', 'bat']).dmg, 9);
eq('カエル→ゴブリン = 6', R.simulateSequence(['frog', 'goblin'], ['frog', 'goblin']).dmg, 6);
eq('カエル→カエル→ゴブリン = 6（2 枚目のカエルが無駄）', R.simulateSequence(['frog', 'frog', 'goblin'], ['frog', 'frog', 'goblin']).dmg, 6);
eq('ネズミ→ネズミ→ネコ = 1+2+3', R.simulateSequence(['rat', 'rat', 'cat'], ['rat', 'rat', 'cat']).dmg, 6);
eq('ゴブリン→カエル→ネコ = 3+0+6', R.simulateSequence(['goblin', 'frog', 'cat'], ['goblin', 'frog', 'cat']).dmg, 9);
eq('スライム：回復 2', R.simulateSequence(['slime'], ['slime']).heal, 2);
eq('キノコ：守り 2', R.simulateSequence(['mush'], ['mush']).shield, 2);
eq('石ころを出すと 0', R.simulateSequence(['stone'], ['stone']).dmg, 0);
eq('途中から（ねずみ 1 枚出した後に ねずみ→ねこ）= 2+3', R.simulateSequence(['rat', 'cat'], ['rat', 'cat'], ['rat'], 1).dmg, 5);
eq('カエルの倍率が残った状態でゴブリン = 6', R.simulateSequence(['goblin'], ['goblin'], ['frog'], 2).dmg, 6);

// 相手の番：札を出す・守りで減る・石ころ
(function () {
  const s = R.createGame({ seed: 1 });
  // 山を全部取って出す段へ（相手の手札は AI が取ったもの）
  while (s.phase === 'draft') { const L = R.legal(s); R.act(s, { type: 'pick', index: L.picks[0] }); }
  s.player.hand = ['mush', 'mush']; s.opp.hand = ['goblin', 'rat', 'stone', 'stone'];
  R.act(s, { type: 'play', index: 0 }); R.act(s, { type: 'play', index: 0 }); // 守り 4
  const hpBefore = s.player.hp;
  const ev = R.act(s, { type: 'end' });
  const plays = ev.filter(e => e.t === 'oppPlay');
  eq('相手がゴブリンとねずみを出した', plays.map(e => e.card).sort(), ['goblin', 'rat']);
  const blocked = ev.filter(e => e.blocked).reduce((a, e) => a + e.blocked, 0);
  eq('守り 4 が相手のダメージを 4 吸った', blocked, 4);
  const os = ev.find(e => e.t === 'oppStone');
  eq('相手の石ころ 2 枚で 2（残っていれば）', os ? os.count : 0, R.count(s.opp.hand, 'stone'));
  const total = plays.reduce((a, e) => a + e.dmg, 0) + ev.find(e => e.t === 'attack').dmg + (os ? os.dmg : 0);
  eq('自分の体力の減りが合う', hpBefore - s.player.hp, total);
})();
// 相手のキノコ：次のターンの自分のダメージを吸う
(function () {
  const s = R.createGame({ seed: 2 });
  while (s.phase === 'draft') { const L = R.legal(s); R.act(s, { type: 'pick', index: L.picks[0] }); }
  s.player.hand = []; s.opp.hand = ['mush'];
  R.act(s, { type: 'end' });
  eq('相手の守りが 2', s.rare.shield, 2);
  while (s.phase === 'draft') { const L = R.legal(s); if (L.mustDiscard) R.act(s, { type: 'discard', index: 0 }); else R.act(s, { type: 'pick', index: L.picks[0] }); }
  s.player.hand = ['goblin'];
  const hp = s.rare.hp;
  const ev = R.act(s, { type: 'play', index: 0 });
  eq('ゴブリン 3 のうち 2 が吸われて 1', [ev[0].dmg, ev[0].blocked, hp - s.rare.hp], [1, 2, 1]);
})();
// 2 枚目のレアを自分のものにすると、相手の取る枚数が 1 減る
(function () {
  const s = R.createGame({ seed: 3 });
  s.player.owned = [1]; R.RARES[2].index = 2; s.rareIndex = 2; s.rare = { index: 2, hp: 40, maxHp: 40, atk: 1, trait: 'hand5', shield: 0 };
  const plan = R.draftPlan(s);
  eq('自分 2 枚・相手 1 枚', [plan.pPicks, plan.oPicks], [2, 1]);
})();

// 2) 乱打
let games = 0, wins = 0, loses = 0, maxTurn = 0;
for (let seed = 1; seed <= 2000; seed++) {
  const s = R.createGame({ seed });
  let guard = 0;
  while (s.phase !== 'win' && s.phase !== 'lose' && guard++ < 3000) {
    const L = R.legal(s);
    if (s.player.hand.length > R.CONF.handMax) { fails++; console.log('NG 手札が上限を超えた', seed); break; }
    if (s.player.hp < 0 || s.rare.hp < 0) { fails++; console.log('NG 体力がマイナス', seed); break; }
    if (s.player.hp > R.CONF.playerHp) { fails++; console.log('NG 体力が上限を超えた', seed); break; }
    if (s.rare.hp > s.rare.maxHp) { fails++; console.log('NG 相手の体力が上限を超えた', seed); break; }
    if (s.opp.hand.length > R.CONF.oppHandMax) { fails++; console.log('NG 相手の手札が上限を超えた', seed); break; }
    let ok;
    if (L.mustDiscard) ok = R.act(s, { type: 'discard', index: R.rndInt(s, s.player.hand.length) });
    else if (L.picks.length) ok = R.act(s, { type: 'pick', index: L.picks[R.rndInt(s, L.picks.length)] });
    else if (L.canChoose) ok = R.act(s, { type: 'choose', keep: R.rnd(s) < 0.5 });
    else if (L.canPlay && R.rnd(s) < 0.7) ok = R.act(s, { type: 'play', index: R.rndInt(s, s.player.hand.length) });
    else if (L.canEnd) ok = R.act(s, { type: 'end' });
    else { fails++; console.log('NG できる行動がない', seed, s.phase); break; }
    if (!ok) { fails++; console.log('NG 行動が通らなかった', seed, s.phase); break; }
    // できない行動は null で返ること
    if (s.phase === 'draft' && R.act(s, { type: 'end' }) !== null) { fails++; console.log('NG ドラフト中に end が通った'); break; }
  }
  games++; if (s.phase === 'win') wins++; if (s.phase === 'lose') loses++;
  maxTurn = Math.max(maxTurn, s.turn);
}
console.log('乱打 ' + games + ' 回: 勝ち ' + wins + ' 負け ' + loses + ' 最長 ' + maxTurn + ' ターン');
console.log(fails ? ('NG が ' + fails + ' 件') : '全部 ok');
process.exit(fails ? 1 : 0);
