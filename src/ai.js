/* ごみやま 相手の頭（ドラフトで相手が取る札を決める）。
 * 「自分（プレイヤー）にとっていちばん価値がある札」を見積もって、それを取る。
 * ただし WOBBLE の割合で、わざと別の札を取る（毎回完全に読まれると、ためる意味が消える）。
 * ブラウザ（window.GomiAI）と Node（require）の両方で動く。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./rules.js'));
  else root.GomiAI = factory(root.GomiRules);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (R) {
  'use strict';

  const WOBBLE = 0.15; // この割合で、いちばん良い札以外をランダムに取る

  function indexesOf(hand, id) {
    const out = [];
    for (let i = 0; i < hand.length; i++) if (hand[i] === id) out.push(i);
    return out;
  }

  // 札 card が、今のプレイヤー（手札・体力・相手の残り）にとってどれだけ価値があるか。
  // 返り値：{ value, looked }  looked = 見積もりに使った手札の位置（画面で「見る」演出に使う）
  function valueForPlayer(card, s) {
    const hand = s.player.hand;
    const n = function (id) { return R.count(hand, id); };
    const hpRatio = s.player.hp / R.CONF.playerHp;
    const turnsLeft = Math.max(1, Math.min(6, Math.ceil(s.rare.hp / 8))); // 相手があと何ターンもつかの目安
    let v = 0, looked = [];
    switch (card) {
      case 'rat': {
        // 手札のネズミと一緒に出すと 1,2,3… と伸びる。3 枚までしか出せないので伸びは 2 まで。
        const k = n('rat');
        v = 1 + Math.min(k, 2) + 0.5 * k;
        looked = indexesOf(hand, 'rat');
        break;
      }
      case 'bat': {
        // 新しいコウモリは 2+k、手札の k 枚もそれぞれ +1 になる。
        const k = n('bat');
        v = 2 + 2 * k;
        looked = indexesOf(hand, 'bat');
        break;
      }
      case 'slime':
        // 1 ダメージ + 体力 2。体力が減っているほど価値が上がる。
        v = 1 + 1.5 + 2 * (1 - hpRatio);
        break;
      case 'frog': {
        // 手札でいちばん強い札を 2 倍にできる。カエルが既にあるなら半分。
        let best = 0, bestIdx = -1;
        for (let i = 0; i < hand.length; i++) {
          if (hand[i] === 'frog' || hand[i] === 'stone') continue;
          const rest = hand.slice(); rest.splice(i, 1);
          const d = R.baseDamage(hand[i], rest, []);
          if (d > best) { best = d; bestIdx = i; }
        }
        v = Math.max(1, best) * (n('frog') > 0 ? 0.5 : 1);
        if (bestIdx >= 0) looked = [bestIdx];
        break;
      }
      case 'mush':
        // 1 ダメージ + 次の攻撃を 2 減らす（相手の攻撃が 2 以上なら丸ごと価値）。体力が半分以下なら更に。
        v = 1 + Math.min(2, s.rare.atk) + (hpRatio < 0.5 ? 1 : 0);
        break;
      case 'goblin':
        // 3 ダメージ。手札があれば 1 枚失う分を引く。カエルがあれば 6 になるので足す。
        v = 3 - (hand.length > 0 ? 0.7 : 0) + (n('frog') > 0 ? 2 : 0);
        looked = indexesOf(hand, 'frog');
        break;
      case 'cat':
        // 最後に出すと出した枚数と同じ。手札が多いほど 3 に近づく。カエルがあれば 6。
        v = Math.min(3, hand.length + 1) * 0.9 + (n('frog') > 0 ? 1.5 : 0);
        looked = hand.map(function (_, i) { return i; }).slice(0, 3);
        break;
      case 'stone':
        // 持っている間、毎ターン 1。相手が長くもつほど価値。石ばかり持つと手札が詰まるので少し引く。
        v = Math.min(turnsLeft, 5) * 0.8 - 0.3 * n('stone');
        looked = indexesOf(hand, 'stone');
        break;
    }
    return { value: v, looked: looked };
  }

  // 相手の取り方。山の中で「プレイヤーにとっていちばん価値がある札」を取る。
  function pick(s) {
    const open = [];
    s.pile.forEach(function (c, i) { if (c) open.push(i); });
    if (open.length === 0) return null;
    const vals = open.map(function (i) { return { index: i, card: s.pile[i], est: valueForPlayer(s.pile[i], s) }; });
    vals.sort(function (a, b) { return b.est.value - a.est.value || a.index - b.index; });
    let chosen = vals[0], best = true;
    if (vals.length > 1 && R.rnd(s) < WOBBLE) {
      chosen = vals[1 + R.rndInt(s, vals.length - 1)];
      best = false;
    }
    return { index: chosen.index, looked: chosen.est.looked, best: best, values: vals };
  }

  return { WOBBLE: WOBBLE, valueForPlayer: valueForPlayer, pick: pick };
});
