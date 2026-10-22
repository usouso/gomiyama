/* ボットの取り方・出し方。
 * それぞれ { name, pick(s), discard(s), plan(s) } を持つ。
 *   pick(s)    → 山の位置（取る札）
 *   discard(s) → 手札の位置（手札が上限で、取る前に捨てる札）
 *   plan(s)    → このターンに出す札の id の並び（最大 3。空なら出さずに持ち越す）
 * 「レアを自分のものにするか」は run.js 側で keep フラグとして与える。
 */
'use strict';
const R = require('../src/rules.js');
const AI = require('../src/ai.js');

function openIdx(s) { const o = []; s.pile.forEach((c, i) => { if (c) o.push(i); }); return o; }
function rndOf(s, arr) { return arr[R.rndInt(s, arr.length)]; }
function nonStone(hand) { return hand.filter(c => c !== 'stone'); }
// 山の札を今すぐ出したときのダメージ（手札はそのまま）
function instantDmg(card, hand) { return R.baseDamage(card, hand, []); }
function argmaxRandomTie(s, items, score) {
  let best = -Infinity, cands = [];
  items.forEach(it => { const v = score(it); if (v > best + 1e-9) { best = v; cands = [it]; } else if (Math.abs(v - best) <= 1e-9) cands.push(it); });
  return rndOf(s, cands);
}

// 1. ランダムに取って、出せる札を全部すぐ出す
const random = {
  name: 'ランダム・全部すぐ出す',
  pick(s) { return rndOf(s, openIdx(s)); },
  discard(s) { return R.rndInt(s, s.player.hand.length); },
  plan(s) {
    const h = s.player.hand.slice();
    const out = [];
    while (out.length < R.CONF.playMax && h.length) out.push(h.splice(R.rndInt(s, h.length), 1)[0]);
    return out;
  }
};

// 2. 同じ名前を集めて、2 枚以上揃ってから出す
const collector = {
  name: '同名を集めて 2 枚以上で出す',
  pick(s) {
    const hand = s.player.hand;
    return argmaxRandomTie(s, openIdx(s), i => R.count(hand, s.pile[i]) + (s.pile[i] === 'stone' ? -0.5 : 0));
  },
  discard(s) {
    const hand = s.player.hand;
    // いちばん枚数の少ない名前（同数なら弱い方）を捨てる
    return argmaxRandomTie(s, hand.map((_, i) => i), i => -(R.count(hand, hand[i]) * 10 + R.CARDS[hand[i]].base));
  },
  plan(s) {
    const hand = s.player.hand;
    const groups = {};
    nonStone(hand).forEach(c => { groups[c] = (groups[c] || 0) + 1; });
    const names = Object.keys(groups).filter(c => groups[c] >= 2).sort((a, b) => groups[b] - groups[a]);
    const out = [];
    for (const c of names) for (let k = 0; k < groups[c] && out.length < R.CONF.playMax; k++) out.push(c);
    // カエルの組はカエルを先に（カエル→カエルは無駄なので 1 枚だけ）
    if (out.length === 0 && hand.length >= 6) {
      // 手札がいっぱいなら、いちばん強い 1 枚だけ出して場所を空ける
      const ns = nonStone(hand);
      if (ns.length) out.push(argmaxRandomTie(s, ns, c => instantDmg(c, hand)));
    }
    return out;
  }
};

// 3. 山でいちばんダメージが高い札を取って、すぐ出す
const greedy = {
  name: '高ダメージを取ってすぐ出す',
  pick(s) { return argmaxRandomTie(s, openIdx(s), i => instantDmg(s.pile[i], s.player.hand)); },
  discard(s) { const h = s.player.hand; return argmaxRandomTie(s, h.map((_, i) => i), i => -instantDmg(h[i], h)); },
  plan(s) {
    const hand = s.player.hand;
    const ns = nonStone(hand).slice().sort((a, b) => instantDmg(b, hand) - instantDmg(a, hand));
    return ns.slice(0, R.CONF.playMax);
  }
};

// 4. 組み合わせ狙い（カエル→ゴブリン、最後にネコ、など）
//    取る：相手の頭と同じ見積もり（手札との組み合わせ）で価値が高い札。
//    出す：手札から 3 枚までの並べ方を全部試し、合計がいちばん大きい並びを出す。
//          ただし弱い並び（合計 5 未満）は、手札が 6 枚以上になるまで出さずにためる。
const combo = {
  name: '組み合わせ狙い',
  pick(s) { return argmaxRandomTie(s, openIdx(s), i => AI.valueForPlayer(s.pile[i], s).value); },
  discard(s) {
    const h = s.player.hand;
    return argmaxRandomTie(s, h.map((_, i) => i), i => {
      const rest = h.slice(); rest.splice(i, 1);
      const t = { player: { hand: rest, hp: s.player.hp }, rare: s.rare };
      return -AI.valueForPlayer(h[i], t).value;
    });
  },
  plan(s) {
    const hand = s.player.hand;
    const ns = nonStone(hand);
    let best = { score: -Infinity, seq: [] };
    const uniq = Array.from(new Set(ns));
    const rec = (seq, avail) => {
      if (seq.length) {
        const r = R.simulateSequence(hand, seq);
        const score = r.dmg + r.heal * 0.8 + Math.min(r.shield, s.rare.atk) * 0.8;
        if (score > best.score + 1e-9) best = { score, seq: seq.slice() };
      }
      if (seq.length >= R.CONF.playMax) return;
      for (const c of uniq) {
        if (!avail[c]) continue;
        avail[c]--; seq.push(c);
        rec(seq, avail);
        seq.pop(); avail[c]++;
      }
    };
    const avail = {}; ns.forEach(c => { avail[c] = (avail[c] || 0) + 1; });
    rec([], avail);
    if (best.seq.length === 0) return [];
    if (best.score < 5 && hand.length < 6) return [];
    return best.seq;
  }
};

module.exports = { random, collector, greedy, combo };
