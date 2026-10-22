/* ごみやま ルール部分。
 * ブラウザ（window.GomiRules）と Node（require）の両方で動く。画面のことは一切書かない。
 * 使い方：
 *   const s = GomiRules.createGame({ seed: 1 });
 *   const events = GomiRules.act(s, { type: 'pick', index: 0 });  // 状態 s は直接書き換わる
 * 相手（レア）がドラフトで取る札は、GomiRules.setOppPicker(fn) で差し込む（ai.js）。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GomiRules = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // ---------- 数値（仮。ボットの結果で調整する） ----------
  const CONF = {
    playerHp: 30,   // 自分の体力
    handMax: 7,     // 手札の上限
    playMax: 3,     // 1 ターンに出せる枚数
    pileBase: 5,    // ごみ山に見える枚数
    pileMirror: 6,  // 2 枚目のレア（同じ枚数取る）のときの山
    basePicks: 3,   // 自分が取れる枚数（レアを 1 枚持つごとに -1）
    oppPicks: 2,    // 相手が取る枚数（2 枚目のレアは自分と同じ）
    ownRare0Dmg: 3, // 1 枚目のレアを自分のものにしたとき、毎ターン始めの相手へのダメージ
    ownRare1Pile: 1 // 2 枚目のレアを自分のものにしたとき、山に増える枚数
  };

  // 雑魚カード 8 種類
  const CARDS = {
    rat:    { id: 'rat',    jp: 'ネズミ',   base: 1 },             // 同じターンに出したネズミが増えるごとに +1
    bat:    { id: 'bat',    jp: 'コウモリ', base: 2 },             // 手札に残っているコウモリ 1 枚ごとに +1
    slime:  { id: 'slime',  jp: 'スライム', base: 1, heal: 2 },    // 自分の体力 +2
    frog:   { id: 'frog',   jp: 'カエル',   base: 0, mult: 2 },    // 次に出す札のダメージ 2 倍（そのターン内）
    mush:   { id: 'mush',   jp: 'キノコ',   base: 1, shield: 2 },  // 相手の次の攻撃を 2 減らす
    goblin: { id: 'goblin', jp: 'ゴブリン', base: 3, selfDiscard: 1 }, // 出すと手札から 1 枚ランダムに捨てる
    cat:    { id: 'cat',    jp: 'ネコ',     base: 0 },             // このターンに出した枚数（自分を含む）と同じダメージ
    stone:  { id: 'stone',  jp: '石ころ',   base: 0, passive: 1 }  // 手札に持っていると毎ターン終わりに相手に 1 ダメージ
  };
  const CARD_IDS = Object.keys(CARDS);

  // レアカード 3 枚（順番に出る）
  // 指示の仮の数は 40/4, 50/3, 70/5 だったが、体力 30 が 3 戦持ち越しなので誰も勝てなかった（REPORT.md「数値の調整」）。
  const RARES = [
    { index: 0, jp: 'レア1', hp: 30, atk: 2, trait: 'none',   own: 'dmg3'  },
    { index: 1, jp: 'レア2', hp: 35, atk: 2, trait: 'mirror', own: 'pile1' }, // mirror: 相手も自分と同じ枚数取る
    { index: 2, jp: 'レア3', hp: 40, atk: 3, trait: 'hand5',  own: 'none'  }  // hand5: 自分の手札が 5 枚以上だと攻撃 +2
  ];

  // ---------- 乱数（状態の中に持つので、同じ seed なら同じ展開になる） ----------
  function rnd(s) {
    s.rngState = (s.rngState + 0x6D2B79F5) >>> 0;
    let t = s.rngState;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function rndInt(s, n) { return Math.floor(rnd(s) * n); }

  // ---------- 相手の取り方（差し込み） ----------
  let oppPicker = function randomPicker(s) {
    const open = [];
    s.pile.forEach((c, i) => { if (c) open.push(i); });
    return { index: open[rndInt(s, open.length)], looked: [] };
  };
  function setOppPicker(fn) { oppPicker = fn; }

  // ---------- ゲームの作成 ----------
  function createGame(opts) {
    opts = opts || {};
    const seed = (opts.seed == null) ? (Math.random() * 0xffffffff) >>> 0 : opts.seed >>> 0;
    const s = {
      seed: seed,
      rngState: seed,
      turn: 0,
      phase: 'draft',          // draft | play | choose | win | lose
      player: { hp: CONF.playerHp, hand: [], shield: 0, owned: [] },
      rareIndex: 0,
      rare: null,
      pile: [],
      draft: { order: [], step: 0 },
      played: [],              // このターンに出した札
      nextMult: 1,             // カエルの倍率（次に出す札に乗る）
      turnDmg: 0,
      totalDmg: 0
    };
    setRare(s, 0);
    const ev = [];
    newTurn(s, ev);
    s.lastEvents = ev;
    return s;
  }

  function setRare(s, index) {
    const r = RARES[index];
    s.rareIndex = index;
    s.rare = { index: index, hp: r.hp, maxHp: r.hp, atk: r.atk, trait: r.trait };
  }

  function draw(s, n) {
    const out = [];
    for (let i = 0; i < n; i++) out.push(CARD_IDS[rndInt(s, CARD_IDS.length)]);
    return out;
  }

  // ドラフトの計画：山の枚数と、取る順番
  function draftPlan(s) {
    const rare = s.rare;
    const pPicks = Math.max(0, CONF.basePicks - s.player.owned.length);
    const oPicks = rare.trait === 'mirror' ? pPicks : CONF.oppPicks;
    let size = (rare.trait === 'mirror' ? CONF.pileMirror : CONF.pileBase);
    if (s.player.owned.indexOf(1) >= 0) size += CONF.ownRare1Pile;
    size = Math.max(size, pPicks + oPicks);
    const order = [];
    let p = pPicks, o = oPicks;
    while (p > 0 || o > 0) {
      if (p > 0) { order.push('p'); p--; }
      if (o > 0) { order.push('o'); o--; }
    }
    return { size: size, order: order, pPicks: pPicks, oPicks: oPicks };
  }

  function newTurn(s, ev) {
    s.turn++;
    s.played = [];
    s.nextMult = 1;
    s.turnDmg = 0;
    s.player.shield = 0;
    ev.push({ t: 'turn', turn: s.turn });
    // 自分のものにしたレアの効果（ターン始め）
    if (s.player.owned.indexOf(0) >= 0) {
      s.rare.hp -= CONF.ownRare0Dmg;
      s.totalDmg += CONF.ownRare0Dmg;
      ev.push({ t: 'own', rare: 0, dmg: CONF.ownRare0Dmg });
      if (s.rare.hp <= 0) { s.rare.hp = 0; rareDefeated(s, ev); return; }
    }
    const plan = draftPlan(s);
    s.pile = draw(s, plan.size);
    s.draft = { order: plan.order, step: 0, pPicks: plan.pPicks, oPicks: plan.oPicks };
    s.phase = 'draft';
    ev.push({ t: 'pile', cards: s.pile.slice(), order: plan.order.slice() });
    runOpp(s, ev);
  }

  // 相手の番が続く間、相手が取る
  function runOpp(s, ev) {
    const d = s.draft;
    while (d.step < d.order.length && d.order[d.step] === 'o') {
      const res = oppPicker(s) || {};
      let idx = res.index;
      if (idx == null || !s.pile[idx]) { // 念のため
        const open = []; s.pile.forEach((c, i) => { if (c) open.push(i); });
        idx = open[rndInt(s, open.length)];
      }
      const card = s.pile[idx];
      s.pile[idx] = null;
      ev.push({ t: 'pick', who: 'o', index: idx, card: card, looked: res.looked || [], best: res.best !== false });
      d.step++;
    }
    if (d.step >= d.order.length) endDraft(s, ev);
  }

  function endDraft(s, ev) {
    const left = s.pile.filter(Boolean);
    s.pile = s.pile.map(function () { return null; });
    s.phase = 'play';
    ev.push({ t: 'draftEnd', left: left });
  }

  // 札 1 枚のダメージ（倍率をかける前）。hand は出した後の手札、played はこのターンに出した札。
  function baseDamage(card, hand, played) {
    switch (card) {
      case 'rat':    return 1 + count(played, 'rat');
      case 'bat':    return 2 + count(hand, 'bat');
      case 'slime':  return 1;
      case 'frog':   return 0;
      case 'mush':   return 1;
      case 'goblin': return 3;
      case 'cat':    return played.length + 1;
      case 'stone':  return 0;
    }
    return 0;
  }
  function count(arr, id) { let n = 0; for (let i = 0; i < arr.length; i++) if (arr[i] === id) n++; return n; }

  // 手札 hand から seq の順に出したときの見込み（ゴブリンの捨て札は無視）。ボットと相手の頭が使う。
  function simulateSequence(hand, seq) {
    const h = hand.slice();
    const played = [];
    let mult = 1, dmg = 0, heal = 0, shield = 0;
    for (let i = 0; i < seq.length; i++) {
      const c = seq[i];
      const k = h.indexOf(c);
      if (k < 0) continue;
      h.splice(k, 1);
      const d = baseDamage(c, h, played) * mult;
      mult = 1;
      if (c === 'frog') mult = CARDS.frog.mult;
      if (c === 'slime') heal += CARDS.slime.heal;
      if (c === 'mush') shield += CARDS.mush.shield;
      dmg += d;
      played.push(c);
    }
    return { dmg: dmg, heal: heal, shield: shield };
  }

  // ---------- 行動 ----------
  // 返り値：起きたことの配列（画面が演出に使う）。できない行動なら null。
  function act(s, a) {
    const ev = [];
    switch (a.type) {
      case 'discard': if (!discard(s, a.index, ev)) return null; break;
      case 'pick':    if (!pick(s, a.index, ev)) return null; break;
      case 'play':    if (!play(s, a.index, ev)) return null; break;
      case 'end':     if (!endTurn(s, ev)) return null; break;
      case 'choose':  if (!choose(s, !!a.keep, ev)) return null; break;
      default: return null;
    }
    s.lastEvents = ev;
    return ev;
  }

  function playersPick(s) {
    return s.phase === 'draft' && s.draft.order[s.draft.step] === 'p';
  }

  // 手札が上限のとき、取る前に 1 枚捨てる
  function discard(s, handIndex, ev) {
    if (!playersPick(s)) return false;
    if (s.player.hand.length < CONF.handMax) return false;
    if (handIndex < 0 || handIndex >= s.player.hand.length) return false;
    const card = s.player.hand.splice(handIndex, 1)[0];
    ev.push({ t: 'discard', card: card, handIndex: handIndex, why: 'full' });
    return true;
  }

  function pick(s, pileIndex, ev) {
    if (!playersPick(s)) return false;
    if (s.player.hand.length >= CONF.handMax) return false;
    const card = s.pile[pileIndex];
    if (!card) return false;
    s.pile[pileIndex] = null;
    s.player.hand.push(card);
    ev.push({ t: 'pick', who: 'p', index: pileIndex, card: card });
    s.draft.step++;
    runOpp(s, ev);
    return true;
  }

  function play(s, handIndex, ev) {
    if (s.phase !== 'play') return false;
    if (s.played.length >= CONF.playMax) return false;
    if (handIndex < 0 || handIndex >= s.player.hand.length) return false;
    const card = s.player.hand.splice(handIndex, 1)[0];
    const mult = s.nextMult;
    s.nextMult = 1;
    const dmg = baseDamage(card, s.player.hand, s.played) * mult;
    s.played.push(card);
    const e = { t: 'play', card: card, dmg: dmg, chain: s.played.length, mult: mult, handIndex: handIndex, heal: 0, shield: 0 };
    if (card === 'slime') { s.player.hp = Math.min(CONF.playerHp, s.player.hp + CARDS.slime.heal); e.heal = CARDS.slime.heal; }
    if (card === 'frog')  { s.nextMult = CARDS.frog.mult; }
    if (card === 'mush')  { s.player.shield += CARDS.mush.shield; e.shield = CARDS.mush.shield; }
    if (card === 'goblin' && s.player.hand.length > 0) {
      const k = rndInt(s, s.player.hand.length);
      e.discarded = s.player.hand.splice(k, 1)[0];
      e.discardedIndex = k;
    }
    s.rare.hp -= dmg;
    s.turnDmg += dmg;
    s.totalDmg += dmg;
    ev.push(e);
    if (s.rare.hp <= 0) { s.rare.hp = 0; rareDefeated(s, ev); }
    return true;
  }

  function endTurn(s, ev) {
    if (s.phase !== 'play') return false;
    // 石ころ：手札にある分だけ 1 ダメージ
    const stones = count(s.player.hand, 'stone');
    if (stones > 0) {
      s.rare.hp -= stones * CARDS.stone.passive;
      s.totalDmg += stones * CARDS.stone.passive;
      ev.push({ t: 'stone', count: stones, dmg: stones * CARDS.stone.passive });
      if (s.rare.hp <= 0) { s.rare.hp = 0; rareDefeated(s, ev); return true; }
    }
    // 相手の攻撃
    let atk = s.rare.atk;
    if (s.rare.trait === 'hand5' && s.player.hand.length >= 5) atk += 2;
    const blocked = Math.min(atk, s.player.shield);
    const dmg = atk - blocked;
    s.player.hp -= dmg;
    s.player.shield = 0;
    ev.push({ t: 'attack', atk: atk, blocked: blocked, dmg: dmg });
    if (s.player.hp <= 0) { s.player.hp = 0; s.phase = 'lose'; ev.push({ t: 'lose' }); return true; }
    newTurn(s, ev);
    return true;
  }

  function rareDefeated(s, ev) {
    ev.push({ t: 'rareDead', rareIndex: s.rareIndex });
    s.pile = s.pile.map(function () { return null; });
    if (s.rareIndex >= RARES.length - 1) { s.phase = 'win'; ev.push({ t: 'win' }); return; }
    s.phase = 'choose';
    ev.push({ t: 'choose', rareIndex: s.rareIndex });
  }

  function choose(s, keep, ev) {
    if (s.phase !== 'choose') return false;
    if (keep) { s.player.owned.push(s.rareIndex); ev.push({ t: 'kept', rareIndex: s.rareIndex }); }
    else ev.push({ t: 'left', rareIndex: s.rareIndex });
    setRare(s, s.rareIndex + 1);
    ev.push({ t: 'nextRare', rareIndex: s.rareIndex });
    newTurn(s, ev);
    return true;
  }

  // 今できること（画面とボットが使う）
  function legal(s) {
    const L = { phase: s.phase, picks: [], mustDiscard: false, canPlay: false, canEnd: false, canChoose: false };
    if (s.phase === 'draft' && playersPick(s)) {
      if (s.player.hand.length >= CONF.handMax) L.mustDiscard = true;
      else s.pile.forEach(function (c, i) { if (c) L.picks.push(i); });
    }
    if (s.phase === 'play') { L.canEnd = true; L.canPlay = s.played.length < CONF.playMax && s.player.hand.length > 0; }
    if (s.phase === 'choose') L.canChoose = true;
    return L;
  }

  return {
    CONF: CONF, CARDS: CARDS, CARD_IDS: CARD_IDS, RARES: RARES,
    createGame: createGame, act: act, legal: legal,
    baseDamage: baseDamage, simulateSequence: simulateSequence, draftPlan: draftPlan,
    rnd: rnd, rndInt: rndInt, count: count, setOppPicker: setOppPicker
  };
});
