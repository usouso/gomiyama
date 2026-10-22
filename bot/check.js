/* ルールの確かめ。 node bot/check.js
 * 1) 決まった手順で、各札のダメージが仕様どおりか
 * 2) ランダムな行動を何千回も入れて、壊れない（手札が 8 枚になる、体力がマイナスのまま進む、など）か
 */
'use strict';
const R = require('../src/rules.js');
const AI = require('../src/ai.js');
R.setOppPicker(AI.pick);

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
