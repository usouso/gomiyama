/* ごみやま 相手の頭（試作2）。
 * 取り方：山の各札について「プレイヤーにとっての価値」と「相手自身にとっての価値」を半分ずつ足し、
 *         いちばん大きい札を取る。WOBBLE の割合で、わざと別の札を取る。
 * 出し方：相手の手札から 3 枚までの並べ方を全部試し、合計がいちばん大きい並びを出す（石ころは出さない）。
 * ブラウザ（window.GomiAI）と Node（require）の両方で動く。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./rules.js'));
  else root.GomiAI = factory(root.GomiRules);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (R) {
  'use strict';

  const WOBBLE = 0.15;       // この割合で、いちばん良い札以外をランダムに取る
  const W_PLAYER = 0.5;      // プレイヤーにとっての価値の重み
  const W_OPP = 0.5;         // 相手自身にとっての価値の重み

  function indexesOf(hand, id) {
    const out = [];
    for (let i = 0; i < hand.length; i++) if (hand[i] === id) out.push(i);
    return out;
  }

  // 「だれか」から見た今の状況
  //   hand: その人の手札, hpRatio: 残り体力の割合, incoming: 相手から毎ターン受けるダメージの目安, turnsLeft: 相手があと何ターンもつかの目安
  function playerCtx(s) {
    const oppCards = s.opp ? s.opp.hand.length : 0;
    return {
      hand: s.player.hand,
      hpRatio: s.player.hp / R.CONF.playerHp,
      incoming: s.rare.atk + Math.min(3, oppCards) * 2,
      turnsLeft: Math.max(1, Math.min(6, Math.ceil(s.rare.hp / 8)))
    };
  }
  function oppCtx(s) {
    return {
      hand: s.opp.hand,
      hpRatio: s.rare.hp / s.rare.maxHp,
      incoming: 6,
      turnsLeft: Math.max(1, Math.min(6, Math.ceil(s.player.hp / 6)))
    };
  }

  // 札 card が、ctx の人にとってどれだけ価値があるか。
  // 返り値：{ value, looked }  looked = 見積もりに使った、その人の手札の位置（画面で「見る」演出に使う）
  function valueFor(card, ctx) {
    const hand = ctx.hand;
    const n = function (id) { return R.count(hand, id); };
    let v = 0, looked = [];
    switch (card) {
      case 'rat': {
        // 手札のねずみと一緒に出すと 1,2,3… と伸びる。3 枚までしか出せないので伸びは 2 まで。
        const k = n('rat');
        v = 1 + Math.min(k, 2) + 0.5 * k;
        looked = indexesOf(hand, 'rat');
        break;
      }
      case 'bat': {
        // 新しいこうもりは 2+k、手札の k 枚もそれぞれ +1 になる。
        const k = n('bat');
        v = 2 + 2 * k;
        looked = indexesOf(hand, 'bat');
        break;
      }
      case 'slime':
        // 1 ダメージ + 体力 2。体力が減っているほど価値が上がる。
        v = 1 + 1.5 + 2 * (1 - ctx.hpRatio);
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
        // 1 ダメージ + 次の攻撃を 2 減らす。体力が半分以下なら更に。
        v = 1 + Math.min(2, ctx.incoming) + (ctx.hpRatio < 0.5 ? 1 : 0);
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
        v = Math.min(ctx.turnsLeft, 5) * 0.8 - 0.3 * n('stone');
        looked = indexesOf(hand, 'stone');
        break;
    }
    return { value: v, looked: looked };
  }
  // 試作1 からの互換（ボットが使う）：プレイヤーにとっての価値
  function valueForPlayer(card, s) { return valueFor(card, playerCtx(s)); }
  function valueForOpp(card, s) { return valueFor(card, oppCtx(s)); }

  // 相手の取り方。「プレイヤーにとっての価値」と「相手自身にとっての価値」を半分ずつ。
  function pick(s) {
    const open = [];
    s.pile.forEach(function (c, i) { if (c) open.push(i); });
    if (open.length === 0) return null;
    const pc = playerCtx(s), oc = oppCtx(s);
    const vals = open.map(function (i) {
      const vp = valueFor(s.pile[i], pc), vo = valueFor(s.pile[i], oc);
      return { index: i, card: s.pile[i], value: W_PLAYER * vp.value + W_OPP * vo.value, vp: vp, vo: vo };
    });
    vals.sort(function (a, b) { return b.value - a.value || a.index - b.index; });
    let chosen = vals[0], best = true;
    if (vals.length > 1 && R.rnd(s) < WOBBLE) {
      chosen = vals[1 + R.rndInt(s, vals.length - 1)];
      best = false;
    }
    return { index: chosen.index, looked: chosen.vp.looked, lookedOpp: chosen.vo.looked, best: best, values: vals };
  }

  // 手札 hand（played/mult の続きから）で、3 枚までの並べ方を全部試して、いちばん良い並びを返す。
  // score = ダメージ + 回復 × 0.8（足りない分まで） + 守り × 0.8（相手の攻撃の目安まで）
  function bestSequence(hand, played, mult, missingHp, incoming, maxN) {
    const ns = hand.filter(function (c) { return c !== 'stone'; });
    const uniq = []; ns.forEach(function (c) { if (uniq.indexOf(c) < 0) uniq.push(c); });
    const avail = {}; ns.forEach(function (c) { avail[c] = (avail[c] || 0) + 1; });
    let best = { score: -Infinity, seq: [] };
    const rec = function (seq) {
      if (seq.length) {
        const r = R.simulateSequence(hand, seq, played, mult);
        const sc = r.dmg + Math.min(r.heal, missingHp) * 0.8 + Math.min(r.shield, incoming) * 0.8;
        if (sc > best.score + 1e-9) best = { score: sc, seq: seq.slice() };
      }
      if (seq.length >= maxN) return;
      for (let i = 0; i < uniq.length; i++) {
        const c = uniq[i];
        if (!avail[c]) continue;
        avail[c]--; seq.push(c);
        rec(seq);
        seq.pop(); avail[c]++;
      }
    };
    rec([]);
    return best;
  }

  // 相手の出し方：いちばん合計が大きい並び（ためない）
  function plan(s) {
    const missing = s.rare.maxHp - s.rare.hp;
    return bestSequence(s.opp.hand, [], 1, missing, 6, R.CONF.playMax).seq;
  }

  // 相手の手札が上限のとき：相手自身にとって価値がいちばん低い札を捨てる
  function discard(s) {
    const h = s.opp.hand;
    let worst = 0, wv = Infinity;
    for (let i = 0; i < h.length; i++) {
      const rest = h.slice(); rest.splice(i, 1);
      const ctx = oppCtx(s); ctx.hand = rest;
      const v = valueFor(h[i], ctx).value;
      if (v < wv) { wv = v; worst = i; }
    }
    return worst;
  }

  // 全部まとめて差し込む
  function install() { R.setOppPicker(pick); R.setOppPlanner(plan); R.setOppDiscarder(discard); }

  return { WOBBLE: WOBBLE, W_PLAYER: W_PLAYER, W_OPP: W_OPP, valueFor: valueFor, valueForPlayer: valueForPlayer, valueForOpp: valueForOpp, playerCtx: playerCtx, oppCtx: oppCtx, pick: pick, plan: plan, discard: discard, bestSequence: bestSequence, install: install };
});
