/* ごみやま 画面（試作2）。ルールは GomiRules、相手の頭は GomiAI、絵は GomiSprites、音は GomiAudio。
 * 画面は 360×640（縦持ち）を基本にして、窓に合わせて拡大し、横長の PC では中央に縦長で出す。
 *   ?bg=1   ウィンドウが隠れていても進む（タイマーで進め、演出を速くする）確認用
 *   ?auto=1 自動で遊ぶ（確認用）
 *   ?seed=N 同じ展開にする
 * 操作：タップ＝取る／出す／捨てる。長押し＝札を大きくして文字を読む（相手の札やレアはタップでも読める）。
 */
(function () {
  'use strict';
  const R = window.GomiRules, AI = window.GomiAI, SP = window.GomiSprites, AU = window.GomiAudio;
  AI.install();

  const W = 360, H = 640;
  const Q = new URLSearchParams(location.search);
  const BG = Q.get('bg') === '1';
  const AUTO = Q.get('auto') === '1';
  const SEED = Q.get('seed') != null ? (parseInt(Q.get('seed'), 10) >>> 0) : null;
  const SPEED = BG ? 0.3 : 1;          // 演出の長さの倍率
  const HP_MAX = R.CONF.playerHp;
  const JP = '"Hiragino Maru Gothic ProN", "Yu Gothic UI", "Meiryo", "Noto Sans JP", sans-serif';
  const MONO = 'Consolas, "Courier New", monospace';

  // ---------- 画面の大きさ ----------
  const canvas = document.getElementById('c');
  const ctx = canvas.getContext('2d');
  let scale = 1;
  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const vw = window.innerWidth, vh = window.innerHeight;
    scale = Math.min(vw / W, vh / H);
    const cw = Math.floor(W * scale), ch = Math.floor(H * scale);
    canvas.style.width = cw + 'px'; canvas.style.height = ch + 'px';
    canvas.style.left = Math.floor((vw - cw) / 2) + 'px'; canvas.style.top = Math.floor((vh - ch) / 2) + 'px';
    canvas.width = Math.max(1, Math.floor(cw * dpr)); canvas.height = Math.max(1, Math.floor(ch * dpr));
    ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
    ctx.imageSmoothingEnabled = false;
  }
  window.addEventListener('resize', resize);
  resize();

  // ---------- 置き場所 ----------
  const LY = {
    rare: { x: 128, y: 8, w: 104, h: 122 },
    hpBar: { x: 70, y: 138, w: 220, h: 10 },
    oppHand: { y: 154, w: 36, h: 46, gap: 42 },
    owned: { x: 8, y: 10, w: 40, h: 50, gap: 8 },
    pile: { y: 212, w: 54, h: 74 },
    dotsY: 298,
    lane: { y: 318, w: 48, h: 66, gap: 64 },
    hand: { y: 446, w: 66, h: 92 },
    heart: { x: 14, y: 586 },
    endBtn: { x: 312, y: 600, r: 26 },
    startBtn: { x: 180, y: 520, r: 44 },
    againBtn: { x: 180, y: 540, r: 36 },
    keepBtn: { x: 16, y: 300, w: 156, h: 196 },
    leaveBtn: { x: 188, y: 300, w: 156, h: 196 },
    zoom: { x: 56, y: 120, w: 248, h: 340 }
  };
  function rowPos(i, n, w, gapMax, margin) {
    const gap = n > 1 ? Math.min(gapMax, (W - margin * 2 - w) / (n - 1)) : 0;
    const span = w + gap * (n - 1);
    return (W - span) / 2 + i * gap;
  }
  function pilePos(i, n) { return { x: rowPos(i, n, LY.pile.w, LY.pile.w + 6, 12), y: LY.pile.y }; }
  function handPos(i, n) { return { x: rowPos(i, n, LY.hand.w, LY.hand.w + 4, 8), y: LY.hand.y }; }
  function lanePos(i) { return { x: W / 2 - LY.lane.w / 2 + (i - 1) * LY.lane.gap, y: LY.lane.y }; }
  function ownedPos(k) { return { x: LY.owned.x, y: LY.owned.y + k * (LY.owned.h + LY.owned.gap) }; }
  function oppHandPos(i) { const n = R.CONF.oppHandMax; return { x: W / 2 - (n * LY.oppHand.gap - (LY.oppHand.gap - LY.oppHand.w)) / 2 + i * LY.oppHand.gap, y: LY.oppHand.y }; }
  const ease = function (t) { return 1 - Math.pow(1 - t, 3); };
  const lerp = function (a, b, t) { return a + (b - a) * t; };

  // ---------- 状態（ルール）と 見た目（画面） ----------
  let S = null;
  const view = { phase: 'title', flyers: [], floaters: [], particles: [], flash: 0, hand: [], pile: [], lane: [], owned: [], oppHand: [], hiHand: [], hiPile: [], hiOpp: [], draftOrder: [], guide: {} };
  function resetView() {
    Object.assign(view, {
      phase: 'game', hand: [], pile: [], lane: [], oppHand: [], draftOrder: [], draftStep: 0, draftActive: false,
      rare: null, owned: [], hp: HP_MAX, shield: 0, played: 0, nextMult: 1, turn: 0,
      oppTurn: false, oppPlayed: 0, oppMult: 1,
      eye: null, hiHand: [], hiPile: [], hiOpp: [], hiPileColor: '#ffd84a', flyers: [], floaters: [], particles: [], flash: 0,
      hpHit: 0, pileDrop: 1, pileFade: 1, laneFade: 1, ownGlow: 0, hiStones: 0, hiOppStones: 0, chooseT: 0, chooseRare: -1, won: false,
      zoom: null, guide: { took: false, played: false, ended: false, longpressed: false }
    });
  }
  function setViewRare(index) {
    const r = R.RARES[index];
    view.rare = { index: index, hp: r.hp, maxHp: r.hp, atk: r.atk, trait: r.trait, shield: 0, shown: r.hp, hit: 0, lunge: 0, dead: false, deadT: 0, enter: 1 };
  }
  function startGame() {
    S = R.createGame(SEED != null ? { seed: SEED } : {});
    queue.length = 0; cur = null;
    resetView();
    setViewRare(0);
    view.rare.enter = 0;
    push(400, { update: function (t) { view.rare.enter = t; } });
    enqueue(S.lastEvents);
  }
  window.GOMI = { get S() { return S; }, view: view, idle: function () { return idle(); } };

  // ---------- 演出の列（順番に流す） ----------
  const queue = []; let cur = null;
  const noop = function () {};
  function push(dur, f) { f = f || {}; queue.push({ dur: Math.max(1, dur * SPEED), start: f.start || noop, update: f.update || noop, end: f.end || noop }); }
  function idle() { return !cur && queue.length === 0; }

  function addFlyer(o) { o.t = 0; o.dur = (o.dur || 260) * SPEED; view.flyers.push(o); }
  function addFloater(o) { o.age = 0; o.life = o.life || 900; view.floaters.push(o); }
  // 相手へのダメージ（レアの上に出る）
  function dmgFloater(dmg, chain, mult) {
    const size = 22 + 8 * Math.max(1, chain) + Math.min(dmg, 12) * 1.2;
    const colors = ['#c9c9d4', '#ffffff', '#ffe066', '#ff9a3c'];
    addFloater({ text: String(dmg), x: W / 2 + (Math.random() * 40 - 20), y: LY.rare.y + LY.rare.h * 0.55, size: size, color: colors[Math.min(3, chain)], life: 900 + 150 * chain, mult: mult, vy: -0.045 });
  }
  // 自分へのダメージ（自分の体力の上に出る）
  function hurtFloater(dmg, chain, mult) {
    const size = 22 + 8 * Math.max(1, chain) + Math.min(dmg, 12) * 1.2;
    const colors = ['#c9c9d4', '#ff7a7a', '#ff5c5c', '#ff3030'];
    addFloater({ text: '-' + dmg, x: LY.heart.x + 70 + (Math.random() * 30 - 15), y: LY.heart.y - 16, size: size, color: colors[Math.min(3, chain)], life: 900 + 150 * chain, mult: mult, vy: -0.04 });
  }
  function spawnParticles(x, y, n, colors) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = 1.5 + Math.random() * 4;
      view.particles.push({ x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 2, age: 0, life: 700 + Math.random() * 700, size: 3 + Math.random() * 4, color: colors[Math.floor(Math.random() * colors.length)] });
    }
  }
  const RARE_COLORS = ['#d64040', '#4d72dc', '#e5b53b'];
  const OPP_COLOR = '#ff5c5c';

  function handFlyFrom(index) {
    const p = handPos(index, view.hand.length);
    const h = view.hand[index];
    return { x: h && h.x != null ? h.x : p.x, y: p.y };
  }

  // ルールが返した「起きたこと」を、演出の列に変える
  function enqueue(evs) {
    evs.forEach(function (e) {
      switch (e.t) {
        case 'turn':
          push(120, { start: function () { view.lane = []; view.played = 0; view.nextMult = 1; view.shield = 0; view.turn = e.turn; view.oppTurn = false; view.laneFade = 1; } });
          break;
        case 'own':
          push(500, {
            start: function () { view.ownGlow = 1; AU.own(); },
            end: function () { view.rare.hp -= e.dmg; view.rare.shield = Math.max(0, view.rare.shield - e.blocked); view.rare.hit = 1; dmgFloater(e.dmg, 1, 1); if (e.blocked) blockFloaterRare(e.blocked); }
          });
          break;
        case 'pile':
          push(340, {
            start: function () { view.pile = e.cards.slice(); view.draftOrder = e.order.slice(); view.draftStep = 0; view.draftActive = true; view.pileDrop = 0; view.pileFade = 1; AU.tap(); },
            update: function (t) { view.pileDrop = t; }
          });
          break;
        case 'pick':
          if (e.who === 'p') {
            push(260, {
              start: function () {
                const from = pilePos(e.index, view.pile.length), to = handPos(view.hand.length, view.hand.length + 1);
                view.pile[e.index] = null; view.draftStep++; view.guide.took = true;
                addFlyer({ card: e.card, x0: from.x, y0: from.y, w0: LY.pile.w, h0: LY.pile.h, x1: to.x, y1: to.y, w1: LY.hand.w, h1: LY.hand.h, dur: 260 });
                AU.pick();
              },
              end: function () { view.hand.push({ card: e.card, pop: 1 }); }
            });
          } else {
            // 相手：自分の手札を見る（→自分の手札も見る）→ 山から取って、相手の手札に置く
            const looked = e.looked.filter(function (i) { return i < view.hand.length; });
            const lookedOpp = (e.lookedOpp || []).filter(function (i) { return i < view.oppHand.length; });
            const nLook = looked.length + lookedOpp.length;
            push(nLook ? 160 + 150 * nLook : 300, {
              start: function () { view.eye = { x: W / 2, y: LY.hand.y - 34, a: 0 }; view.lookIdx = -1; },
              update: function (t) {
                view.eye.a = Math.min(1, t * 4);
                if (nLook) {
                  const k = Math.min(nLook - 1, Math.floor(t * nLook));
                  if (k !== view.lookIdx) {
                    view.lookIdx = k; AU.oppLook();
                    if (k < looked.length) { view.hiHand = [looked[k]]; view.hiOpp = []; } else { view.hiHand = []; view.hiOpp = [lookedOpp[k - looked.length]]; }
                  }
                  let p;
                  if (k < looked.length) { p = handPos(looked[k], view.hand.length); p = { x: p.x + LY.hand.w / 2, y: p.y - 30 }; }
                  else { p = oppHandPos(lookedOpp[k - looked.length]); p = { x: p.x + LY.oppHand.w / 2, y: p.y + LY.oppHand.h + 16 }; }
                  view.eye.x += (p.x - view.eye.x) * 0.25; view.eye.y += (p.y - view.eye.y) * 0.25;
                } else if (view.lookIdx < 0) { view.lookIdx = 0; AU.oppLook(); }
              },
              end: function () { view.hiHand = []; view.hiOpp = []; }
            });
            push(280, {
              start: function () { view.hiPile = [e.index]; view.hiPileColor = OPP_COLOR; view.eyeFrom = { x: view.eye.x, y: view.eye.y }; },
              update: function (t) { const p = pilePos(e.index, view.pile.length); view.eye.x = lerp(view.eyeFrom.x, p.x + LY.pile.w / 2, ease(t)); view.eye.y = lerp(view.eyeFrom.y, p.y - 24, ease(t)); }
            });
            push(300, {
              start: function () {
                const p = pilePos(e.index, view.pile.length), to = oppHandPos(view.oppHand.length);
                view.pile[e.index] = null; view.hiPile = []; view.draftStep++;
                addFlyer({ card: e.card, x0: p.x, y0: p.y, w0: LY.pile.w, h0: LY.pile.h, x1: to.x, y1: to.y, w1: LY.oppHand.w, h1: LY.oppHand.h, dur: 300, border: OPP_COLOR });
                AU.oppPick();
              },
              update: function (t) { if (view.eye) view.eye.a = 1 - t; },
              end: function () { view.eye = null; view.oppHand.push({ card: e.card, pop: 1 }); }
            });
          }
          break;
        case 'oppDiscard':
          push(260, {
            start: function () {
              const p = oppHandPos(e.handIndex);
              view.oppHand.splice(e.handIndex, 1);
              addFlyer({ card: e.card, x0: p.x, y0: p.y, w0: LY.oppHand.w, h0: LY.oppHand.h, x1: p.x + 60, y1: p.y - 40, w1: LY.oppHand.w, h1: LY.oppHand.h, dur: 260, fade: true, border: OPP_COLOR });
              AU.discard();
            }
          });
          break;
        case 'draftEnd':
          push(220, {
            start: function () { view.draftActive = false; },
            update: function (t) { view.pileFade = 1 - t; },
            end: function () { view.pile = view.pile.map(function () { return null; }); view.pileFade = 1; }
          });
          break;
        case 'discard':
          push(240, {
            start: function () {
              const from = handFlyFrom(e.handIndex);
              view.hand.splice(e.handIndex, 1);
              addFlyer({ card: e.card, x0: from.x, y0: from.y, w0: LY.hand.w, h0: LY.hand.h, x1: from.x, y1: H + 40, w1: LY.hand.w, h1: LY.hand.h, dur: 240, fade: true });
              AU.discard();
            }
          });
          break;
        case 'play':
          push(230, {
            start: function () {
              const from = handFlyFrom(e.handIndex);
              view.hand.splice(e.handIndex, 1);
              view.guide.played = true;
              const to = lanePos(view.lane.length);
              addFlyer({ card: e.card, x0: from.x, y0: from.y, w0: LY.hand.w, h0: LY.hand.h, x1: to.x, y1: to.y, w1: LY.lane.w, h1: LY.lane.h, dur: 230 });
            },
            end: function () {
              view.lane.push({ card: e.card, dmg: e.dmg, chain: e.chain, pop: 1 });
              view.played++;
              view.nextMult = (e.card === 'frog') ? R.CARDS.frog.mult : 1;
              AU.card(e.card, e.chain, e.raw);
              if (e.dmg > 0) { view.rare.hp -= e.dmg; view.rare.hit = 1; dmgFloater(e.dmg, e.chain, e.mult); spawnParticles(W / 2, LY.rare.y + LY.rare.h * 0.6, Math.min(30, 4 + e.dmg * 2 + e.chain * 3), ['#ffffff', '#ffe066', '#ff9a3c']); }
              if (e.blocked) { view.rare.shield = Math.max(0, view.rare.shield - e.blocked); blockFloaterRare(e.blocked); }
              if (e.card === 'frog') { addFloater({ text: '×2', x: W / 2, y: LY.lane.y - 10, size: 26, color: '#ff9a3c', life: 800, vy: -0.03 }); AU.mult(); }
              if (e.heal) { view.hp = Math.min(HP_MAX, view.hp + e.heal); addFloater({ text: '+' + e.heal, x: LY.heart.x + 60, y: LY.heart.y - 6, size: 24, color: '#5fcf3c', life: 900, vy: -0.035 }); AU.heal(); }
              if (e.shield) { view.shield += e.shield; addFloater({ text: '+' + e.shield, x: LY.heart.x + 150, y: LY.heart.y - 6, size: 22, color: '#4f8fe0', life: 900, vy: -0.035 }); AU.shield(); }
              if (e.discarded) {
                const from = handFlyFrom(e.discardedIndex);
                view.hand.splice(e.discardedIndex, 1);
                addFlyer({ card: e.discarded, x0: from.x, y0: from.y, w0: LY.hand.w, h0: LY.hand.h, x1: from.x, y1: H + 40, w1: LY.hand.w, h1: LY.hand.h, dur: 300, fade: true });
                AU.discard();
              }
            }
          });
          push(e.raw >= 6 ? 420 : 300);
          break;
        case 'stone':
          push(520, {
            start: function () { view.hiStones = 1; AU.stoneTick(e.count); },
            end: function () { view.hiStones = 0; view.rare.hp -= e.dmg; view.rare.hit = 1; dmgFloater(e.dmg, 0, 1); if (e.blocked) { view.rare.shield = Math.max(0, view.rare.shield - e.blocked); blockFloaterRare(e.blocked); } }
          });
          push(200);
          break;
        case 'oppTurn':
          push(360, {
            start: function () { view.oppTurn = true; view.oppPlayed = 0; view.oppMult = 1; view.rare.shield = 0; AU.oppLook(); },
            update: function (t) { view.laneFade = 1 - t; },
            end: function () { view.lane = []; view.laneFade = 1; }
          });
          break;
        case 'oppPlay':
          push(260, {
            start: function () {
              const p = oppHandPos(e.handIndex);
              view.oppHand.splice(e.handIndex, 1);
              const to = lanePos(view.lane.length);
              addFlyer({ card: e.card, x0: p.x, y0: p.y, w0: LY.oppHand.w, h0: LY.oppHand.h, x1: to.x, y1: to.y, w1: LY.lane.w, h1: LY.lane.h, dur: 260, border: OPP_COLOR });
            },
            end: function () {
              view.lane.push({ card: e.card, dmg: e.dmg, chain: e.chain, pop: 1, opp: true });
              view.oppPlayed++;
              view.oppMult = (e.card === 'frog') ? R.CARDS.frog.mult : 1;
              AU.card(e.card, e.chain, e.raw);
              if (e.dmg > 0) { view.hp -= e.dmg; view.hpHit = 1; hurtFloater(e.dmg, e.chain, e.mult); spawnParticles(LY.heart.x + 40, LY.heart.y + 10, Math.min(24, 4 + e.dmg * 2), ['#ff5c5c', '#ff9a9a', '#ffffff']); }
              if (e.blocked) { view.shield = Math.max(0, view.shield - e.blocked); blockFloaterPlayer(e.blocked); AU.blocked(); }
              if (e.card === 'frog') { addFloater({ text: '×2', x: W / 2, y: LY.lane.y - 10, size: 26, color: OPP_COLOR, life: 800, vy: -0.03 }); AU.mult(); }
              if (e.heal) { view.rare.hp = Math.min(view.rare.maxHp, view.rare.hp + e.heal); addFloater({ text: '+' + e.heal, x: W / 2, y: LY.rare.y + LY.rare.h * 0.5, size: 24, color: '#5fcf3c', life: 900, vy: -0.035 }); AU.heal(); }
              if (e.shield) { view.rare.shield += e.shield; addFloater({ text: '+' + e.shield, x: LY.hpBar.x + LY.hpBar.w + 30, y: LY.hpBar.y + 36, size: 22, color: '#4f8fe0', life: 900, vy: -0.035 }); AU.shield(); }
              if (e.discarded) {
                const p = oppHandPos(e.discardedIndex);
                view.oppHand.splice(e.discardedIndex, 1);
                addFlyer({ card: e.discarded, x0: p.x, y0: p.y, w0: LY.oppHand.w, h0: LY.oppHand.h, x1: p.x + 60, y1: p.y - 40, w1: LY.oppHand.w, h1: LY.oppHand.h, dur: 300, fade: true, border: OPP_COLOR });
                AU.discard();
              }
            }
          });
          push(e.raw >= 6 ? 420 : 300);
          break;
        case 'attack':
          if (e.atk > 0) {
            push(420, {
              start: function () { AU.attack(e.dmg); if (e.blocked) AU.blocked(); },
              update: function (t) { view.rare.lunge = Math.sin(t * Math.PI); },
              end: function () {
                view.rare.lunge = 0; view.hp -= e.dmg; view.hpHit = e.dmg > 0 ? 1 : 0;
                hurtFloater(e.dmg, 1, 1);
                if (e.blocked) { view.shield = Math.max(0, view.shield - e.blocked); blockFloaterPlayer(e.blocked); }
              }
            });
            push(300);
          }
          break;
        case 'oppStone':
          push(520, {
            start: function () { view.hiOppStones = 1; AU.stoneTick(e.count); },
            end: function () { view.hiOppStones = 0; view.hp -= e.dmg; view.hpHit = e.dmg > 0 ? 1 : 0; hurtFloater(e.dmg, 0, 1); if (e.blocked) { view.shield = Math.max(0, view.shield - e.blocked); blockFloaterPlayer(e.blocked); } }
          });
          push(200);
          break;
        case 'rareDead':
          push(1400, {
            start: function () {
              view.rare.hp = 0; view.rare.dead = true; view.flash = 1; AU.rareDead();
              spawnParticles(LY.rare.x + LY.rare.w / 2, LY.rare.y + LY.rare.h / 2, 90, ['#ffffff', '#ffe066', RARE_COLORS[e.rareIndex]]);
            },
            update: function (t) { view.rare.deadT = t; }
          });
          break;
        case 'choose':
          push(80, { end: function () { view.phase = 'choose'; view.chooseT = 0; view.chooseRare = e.rareIndex; AU.choose(); } });
          break;
        case 'kept':
          push(520, {
            start: function () {
              view.phase = 'game';
              const to = ownedPos(view.owned.length);
              addFlyer({ rare: e.rareIndex, x0: W / 2 - 50, y0: 70, w0: 100, h0: 126, x1: to.x, y1: to.y, w1: LY.owned.w, h1: LY.owned.h, dur: 520 });
              AU.pick();
            },
            end: function () { view.owned.push(e.rareIndex); }
          });
          break;
        case 'left':
          push(420, {
            start: function () { view.phase = 'game'; addFlyer({ rare: e.rareIndex, x0: W / 2 - 50, y0: 70, w0: 100, h0: 126, x1: W / 2 - 50, y1: 240, w1: 100, h1: 126, dur: 420, fade: true }); AU.discard(); }
          });
          break;
        case 'nextRare':
          push(500, {
            start: function () { setViewRare(e.rareIndex); view.rare.enter = 0; },
            update: function (t) { view.rare.enter = t; }
          });
          break;
        case 'win':
          push(700, { end: function () { view.phase = 'win'; view.won = true; AU.win(); } });
          break;
        case 'lose':
          push(700, { end: function () { view.phase = 'lose'; AU.lose(); } });
          break;
      }
    });
  }
  function blockFloaterRare(n) { addFloater({ icon: 'shield', text: String(n), x: LY.hpBar.x + LY.hpBar.w + 30, y: LY.hpBar.y + 36, size: 20, color: '#7fb3ff', life: 800, vy: -0.03 }); }
  function blockFloaterPlayer(n) { addFloater({ icon: 'shield', text: String(n), x: LY.heart.x + 150, y: LY.heart.y - 10, size: 20, color: '#7fb3ff', life: 800, vy: -0.03 }); }

  // ---------- 入力（タップ＝行動、長押し＝読む） ----------
  function act(a) { const ev = R.act(S, a); if (ev) enqueue(ev); return !!ev; }
  function inCircle(x, y, c) { return (x - c.x) * (x - c.x) + (y - c.y) * (y - c.y) <= c.r * c.r; }
  function inRect(x, y, r) { return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h; }
  function hitHand(x, y) {
    const n = view.hand.length;
    for (let i = n - 1; i >= 0; i--) { // 重なっているので手前（右）から
      const p = handPos(i, n); const hx = view.hand[i].x != null ? view.hand[i].x : p.x;
      if (inRect(x, y, { x: hx, y: p.y - 24, w: LY.hand.w, h: LY.hand.h + 30 })) return i;
    }
    return -1;
  }
  function hitPile(x, y) {
    const n = view.pile.length;
    for (let i = n - 1; i >= 0; i--) { const p = pilePos(i, n); if (view.pile[i] && inRect(x, y, { x: p.x, y: p.y - 10, w: LY.pile.w, h: LY.pile.h + 20 })) return i; }
    return -1;
  }
  function hitOppHand(x, y) {
    for (let i = view.oppHand.length - 1; i >= 0; i--) { const p = oppHandPos(i); if (inRect(x, y, { x: p.x - 4, y: p.y - 4, w: LY.oppHand.w + 8, h: LY.oppHand.h + 8 })) return i; }
    return -1;
  }
  function hitOwned(x, y) {
    for (let i = 0; i < view.owned.length; i++) { const p = ownedPos(i); if (inRect(x, y, { x: p.x, y: p.y, w: LY.owned.w, h: LY.owned.h })) return i; }
    return -1;
  }
  // 押した場所に何があるか。{ kind, index, action } action = タップでできる行動（無ければ null）
  function target(x, y) {
    if (view.phase !== 'game' || !S) return null;
    const Lg = idle() ? R.legal(S) : null;
    let i;
    if ((i = hitHand(x, y)) >= 0) {
      let a = null;
      if (Lg && Lg.phase === 'draft' && Lg.mustDiscard) a = { type: 'discard', index: i };
      else if (Lg && Lg.phase === 'play' && Lg.canPlay) a = { type: 'play', index: i };
      return { kind: 'hand', index: i, card: view.hand[i].card, action: a };
    }
    if ((i = hitPile(x, y)) >= 0) {
      const a = (Lg && Lg.picks.indexOf(i) >= 0) ? { type: 'pick', index: i } : null;
      return { kind: 'pile', index: i, card: view.pile[i], action: a };
    }
    if ((i = hitOppHand(x, y)) >= 0) return { kind: 'opp', index: i, card: view.oppHand[i].card, action: null };
    if ((i = hitOwned(x, y)) >= 0) return { kind: 'owned', index: i, rare: view.owned[i], action: null };
    if (view.rare && inRect(x, y, LY.rare)) return { kind: 'rare', rare: view.rare.index, action: null };
    for (i = 0; i < view.lane.length; i++) { const p = lanePos(i); if (inRect(x, y, { x: p.x, y: p.y, w: LY.lane.w, h: LY.lane.h })) return { kind: 'lane', index: i, card: view.lane[i].card, opp: !!view.lane[i].opp, action: null }; }
    return null;
  }
  function doAction(a) {
    if (!idle()) return;
    if (a.type === 'end') AU.tap();
    act(a);
  }
  function onTap(x, y) {
    AU.init();
    if (view.phase === 'title') { if (inCircle(x, y, LY.startBtn)) { AU.tap(); startGame(); } return; }
    if (view.phase === 'win' || view.phase === 'lose') { if (inCircle(x, y, LY.againBtn)) { AU.tap(); startGame(); } return; }
    if (view.zoom && view.zoom.sticky) { view.zoom = null; return; }
    if (!idle()) return; // 演出中は待つ
    if (view.phase === 'choose') {
      if (inRect(x, y, LY.keepBtn)) act({ type: 'choose', keep: true });
      else if (inRect(x, y, LY.leaveBtn)) act({ type: 'choose', keep: false });
      return;
    }
    const Lg = R.legal(S);
    if (Lg.phase === 'play' && inCircle(x, y, LY.endBtn)) { view.guide.ended = true; doAction({ type: 'end' }); return; }
    const tg = target(x, y);
    if (tg && tg.action) { doAction(tg.action); return; }
    if (tg && (tg.card || tg.rare != null)) { view.zoom = { tg: tg, sticky: true, t: 0 }; AU.tap(); }
  }
  // 長押し
  let press = null;
  const LONG_MS = 380;
  function pointerPos(e) { const r = canvas.getBoundingClientRect(); return { x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale }; }
  canvas.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    const p = pointerPos(e);
    AU.init();
    if (view.zoom && view.zoom.sticky) { view.zoom = null; press = null; return; }
    const tg = (view.phase === 'game' && S) ? target(p.x, p.y) : null;
    press = { x: p.x, y: p.y, t0: performance.now(), tg: tg, fired: false };
    if (tg && tg.action) {
      press.timer = setTimeout(function () {
        if (!press || press.fired) return;
        press.fired = true;
        view.zoom = { tg: tg, sticky: false, t: 0 }; view.guide.longpressed = true; AU.tap();
      }, LONG_MS);
    }
  });
  function pointerEnd(e) {
    if (!press) return;
    const pr = press; press = null;
    if (pr.timer) clearTimeout(pr.timer);
    if (pr.fired) { view.zoom = null; return; }     // 長押しで読んでいた → 閉じるだけ
    const p = pointerPos(e);
    if (Math.abs(p.x - pr.x) > 24 || Math.abs(p.y - pr.y) > 24) return; // 動いたら何もしない
    onTap(pr.x, pr.y);
  }
  canvas.addEventListener('pointerup', pointerEnd);
  canvas.addEventListener('pointercancel', function () { if (press && press.timer) clearTimeout(press.timer); if (press && press.fired) view.zoom = null; press = null; });
  canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  window.gomiTap = onTap;

  // ---------- 自動で遊ぶ（確認用） ----------
  let autoWait = 0;
  function autoStep(dt) {
    if (!idle()) { autoWait = 0; return; }
    autoWait += dt;
    if (autoWait < 400 * SPEED) return;
    autoWait = 0;
    if (view.phase === 'title' || view.phase === 'win' || view.phase === 'lose') { startGame(); return; }
    if (view.phase === 'choose') { act({ type: 'choose', keep: S.rareIndex === 0 }); return; }
    const Lg = R.legal(S);
    if (Lg.phase === 'draft') {
      if (Lg.mustDiscard) {
        let worst = 0, wv = Infinity;
        S.player.hand.forEach(function (c, i) { const ctx = AI.playerCtx(S); const rest = S.player.hand.slice(); rest.splice(i, 1); ctx.hand = rest; const v = AI.valueFor(c, ctx).value; if (v < wv) { wv = v; worst = i; } });
        act({ type: 'discard', index: worst }); return;
      }
      let bi = Lg.picks[0], bv = -Infinity;
      Lg.picks.forEach(function (i) { const v = AI.valueForPlayer(S.pile[i], S).value; if (v > bv) { bv = v; bi = i; } });
      act({ type: 'pick', index: bi }); return;
    }
    if (Lg.phase === 'play') {
      let i = -1;
      if (Lg.canPlay) {
        const best = AI.bestSequence(S.player.hand, S.played, S.nextMult, HP_MAX - S.player.hp, 4, R.CONF.playMax - S.played.length);
        if (best.seq.length && !(best.score < 5 && S.player.hand.length < 6 && S.played.length === 0)) i = S.player.hand.indexOf(best.seq[0]);
      }
      if (i >= 0) act({ type: 'play', index: i }); else act({ type: 'end' });
    }
  }

  // ---------- 毎フレーム ----------
  let last = performance.now(), lastDt = 16;
  function tick() {
    const now = performance.now();
    const dt = Math.min(1000, now - last); last = now; lastDt = dt;
    if (!cur && queue.length) { cur = queue.shift(); cur.t0 = now; cur.start(); }
    if (cur) { const t = Math.min(1, (now - cur.t0) / cur.dur); cur.update(t); if (t >= 1) { const c = cur; cur = null; c.end(); } }
    view.flyers = view.flyers.filter(function (f) { f.t += dt / f.dur; return f.t < 1; });
    view.floaters = view.floaters.filter(function (f) { f.age += dt; f.y += (f.vy || -0.04) * dt; return f.age < f.life; });
    view.particles = view.particles.filter(function (p) { p.age += dt; p.x += p.vx * dt / 16; p.y += p.vy * dt / 16; p.vy += 0.12 * dt / 16; return p.age < p.life; });
    view.flash = Math.max(0, view.flash - dt / 600);
    view.hpHit = Math.max(0, view.hpHit - dt / 500);
    view.ownGlow = Math.max(0, view.ownGlow - dt / 700);
    if (view.rare) { view.rare.shown += (view.rare.hp - view.rare.shown) * Math.min(1, dt / 140); view.rare.hit = Math.max(0, view.rare.hit - dt / 260); }
    view.hand.forEach(function (h) { h.pop = Math.max(0, (h.pop || 0) - dt / 260); });
    view.oppHand.forEach(function (h) { h.pop = Math.max(0, (h.pop || 0) - dt / 260); });
    view.lane.forEach(function (h) { h.pop = Math.max(0, (h.pop || 0) - dt / 260); });
    if (view.zoom) view.zoom.t = Math.min(1, view.zoom.t + dt / 140);
    if (view.phase === 'choose') view.chooseT = Math.min(1, view.chooseT + dt / 320);
    if (view.phase === 'win' && Math.random() < 0.3) spawnParticles(Math.random() * W, -10, 1, ['#ffe066', '#ff9a3c', '#5fcf3c', '#4f8fe0', '#ffffff']);
    if (AUTO) autoStep(dt);
    render(now);
  }
  if (BG) setInterval(tick, 33);
  else { const loop = function () { tick(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); }

  // ---------- 描く ----------
  function roundRect(x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath(); ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function text(str, x, y, size, color, align, weight) {
    ctx.font = (weight || 'bold') + ' ' + size + 'px ' + MONO;
    ctx.textAlign = align || 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = color || '#f6f3ea'; ctx.fillText(String(str), x, y);
  }
  function jtext(str, x, y, size, color, align) {
    ctx.font = 'bold ' + size + 'px ' + JP;
    ctx.textAlign = align || 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = color || '#f6f3ea'; ctx.fillText(String(str), x, y);
  }
  function outlinedText(str, x, y, size, color) {
    ctx.font = 'bold ' + size + 'px ' + MONO;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = Math.max(2, size / 8); ctx.strokeStyle = '#17141f'; ctx.lineJoin = 'round'; ctx.strokeText(String(str), x, y);
    ctx.fillStyle = color; ctx.fillText(String(str), x, y);
  }
  // 文を、だいたい n 文字ごとに折り返す（できるだけ空白のところで切る）
  function wrap(str, n) {
    const out = []; let cur = '';
    str.split(' ').forEach(function (word) {
      if (cur && (cur + ' ' + word).length > n) { out.push(cur); cur = ''; }
      while (word.length > n) { if (cur) { out.push(cur); cur = ''; } out.push(word.slice(0, n)); word = word.slice(n); }
      cur = cur ? cur + ' ' + word : word;
    });
    if (cur) out.push(cur);
    return out;
  }

  // 札の下に出す「効果のしるし」（アイコンと数字）
  const HINT = {
    rat:    [['icon', 'sword'], ['text', '1'], ['icon', 'bars']],
    bat:    [['icon', 'sword'], ['text', '2'], ['mon', 'bat'], ['text', '+']],
    slime:  [['icon', 'sword'], ['text', '1'], ['icon', 'heart'], ['text', '+2']],
    frog:   [['text', '×2'], ['icon', 'arrow']],
    mush:   [['icon', 'sword'], ['text', '1'], ['icon', 'shield'], ['text', '2']],
    goblin: [['icon', 'sword'], ['text', '3'], ['icon', 'cards'], ['icon', 'cross']],
    cat:    [['icon', 'sword'], ['text', '='], ['icon', 'cards']],
    stone:  [['icon', 'cycle'], ['icon', 'sword'], ['text', '1']]
  };
  function drawTokens(tokens, cx, cy, fontSize, iconPx) {
    ctx.font = 'bold ' + fontSize + 'px ' + MONO;
    const widths = tokens.map(function (tk) { return tk[0] === 'text' ? ctx.measureText(tk[1]).width + 2 : (tk[0] === 'mon' ? 12 : 8 * iconPx) + 2; });
    const total = widths.reduce(function (a, b) { return a + b; }, 0);
    let x = cx - total / 2;
    tokens.forEach(function (tk, i) {
      if (tk[0] === 'text') { ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#2a2230'; ctx.fillText(tk[1], x + 1, cy); }
      else if (tk[0] === 'mon') SP.drawMon(ctx, tk[1], Math.round(x + 1), Math.round(cy - 6), 1);
      else SP.drawIcon(ctx, tk[1], Math.round(x + 1), Math.round(cy - 4 * iconPx), iconPx);
      x += widths[i];
    });
  }
  // 札。o: alpha, scale, glow, border, tint, preview(今出すとのダメージ), previewMult, name(名前を出すか), mini(絵だけ)
  function drawCard(card, x, y, w, h, o) {
    o = o || {};
    ctx.save();
    if (o.alpha != null) ctx.globalAlpha *= Math.max(0, o.alpha);
    if (o.scale && o.scale !== 1) { ctx.translate(x + w / 2, y + h / 2); ctx.scale(o.scale, o.scale); ctx.translate(-(x + w / 2), -(y + h / 2)); }
    if (o.glow) { ctx.shadowColor = o.glow; ctx.shadowBlur = 16; }
    roundRect(x, y, w, h, 6); ctx.fillStyle = o.face || '#f3e9d2'; ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = 2; ctx.strokeStyle = o.border || '#3a2f2a'; ctx.stroke();
    const mini = w < 44;
    const px = mini ? Math.max(1, Math.floor((w * 0.7) / 12)) : Math.max(1, Math.floor(Math.min(w * 0.7, h * 0.42) / 12));
    const sw = px * 12;
    const nameH = mini ? 0 : 14;
    SP.drawMon(ctx, card, Math.round(x + (w - sw) / 2), Math.round(y + (mini ? (h - sw) / 2 : nameH + 4)), px, o.tint);
    if (!mini) jtext(R.CARDS[card].jp, x + w / 2, y + 9, w >= 60 ? 13 : 12, '#2a2230');
    if (o.preview != null) {
      // 今出したときのダメージ（出す段で表示）
      const big = o.preview >= 4;
      roundRect(x + 4, y + h - 26, w - 8, 22, 5); ctx.fillStyle = big ? '#ffe9a8' : '#e6dcc4'; ctx.fill();
      SP.drawIcon(ctx, 'sword', Math.round(x + w / 2 - 20), Math.round(y + h - 23), 2);
      text(o.preview, x + w / 2 + 6, y + h - 14, big ? 18 : 15, o.previewMult > 1 ? '#d7541e' : '#2a2230');
      if (o.previewMult > 1) text('×2', x + w - 12, y + h - 30, 10, '#d7541e');
    } else if (!mini) {
      drawTokens(HINT[card], x + w / 2, y + h - 12, w >= 60 ? 12 : 10, w >= 60 ? 2 : 1.5);
    }
    ctx.restore();
  }
  function drawRareMini(index, x, y, w, h, o) {
    o = o || {};
    ctx.save();
    if (o.alpha != null) ctx.globalAlpha *= Math.max(0, o.alpha);
    if (o.glow) { ctx.shadowColor = o.glow; ctx.shadowBlur = 18; }
    roundRect(x, y, w, h, 6); ctx.fillStyle = '#272233'; ctx.fill(); ctx.shadowBlur = 0;
    ctx.lineWidth = 2; ctx.strokeStyle = RARE_COLORS[index]; ctx.stroke();
    const px = Math.max(1, Math.floor(Math.min(w * 0.8, h * 0.62) / 16));
    SP.drawRare(ctx, index, Math.round(x + (w - 16 * px) / 2), Math.round(y + h * 0.08), px, o.tint);
    // 自分のものにしたときの効果
    if (o.effect !== false) {
      const cy = y + h - 10;
      if (index === 0) { SP.drawIcon(ctx, 'sword', Math.round(x + w / 2 - 14), Math.round(cy - 8), 2); text(R.CONF.ownRare0Dmg, x + w / 2 + 8, cy, 13, '#f6f3ea'); }
      else if (index === 1) { SP.drawIcon(ctx, 'dot', Math.round(x + w / 2 - 16), Math.round(cy - 6), 1.5, OPP_COLOR); text('-' + R.CONF.ownRare1OppPicks, x + w / 2 + 6, cy, 13, '#f6f3ea'); }
    }
    ctx.restore();
  }

  function effectiveAtk() { return view.rare.atk + (view.rare.trait === 'hand5' && view.hand.length >= 5 ? 2 : 0); }

  function drawRare(now) {
    const r = view.rare; if (!r) return;
    const b = LY.rare;
    ctx.save();
    const enter = ease(r.enter == null ? 1 : r.enter);
    ctx.translate(0, (1 - enter) * -220 + (r.lunge || 0) * 30);
    if (r.dead) { ctx.globalAlpha = Math.max(0, 1 - r.deadT * 1.3); ctx.translate(b.x + b.w / 2, b.y + b.h / 2); const sc = 1 + r.deadT * 0.5; ctx.scale(sc, sc); ctx.translate(-(b.x + b.w / 2), -(b.y + b.h / 2)); }
    ctx.shadowColor = RARE_COLORS[r.index]; ctx.shadowBlur = r.hit > 0 ? 30 : (view.oppTurn ? 22 : 12);
    roundRect(b.x, b.y, b.w, b.h, 8); ctx.fillStyle = '#272233'; ctx.fill(); ctx.shadowBlur = 0;
    ctx.lineWidth = 3; ctx.strokeStyle = RARE_COLORS[r.index]; ctx.stroke();
    jtext(R.RARES[r.index].jp, b.x + b.w / 2, b.y + 12, 13, '#f6f3ea');
    SP.drawRare(ctx, r.index, b.x + (b.w - 80) / 2, b.y + 24, 5, r.hit > 0.4 ? '#ffffff' : null);
    if (r.trait === 'mirror') SP.drawIcon(ctx, 'eye', b.x + b.w - 22, b.y + 4, 2);
    // 攻撃力（右）
    const atk = effectiveAtk();
    SP.drawIcon(ctx, 'sword', b.x + b.w + 14, b.y + 30, 3);
    text(atk, b.x + b.w + 58, b.y + 44, 30, atk > r.atk ? '#ff6a6a' : '#f6f3ea');
    if (r.trait === 'hand5') { SP.drawIcon(ctx, 'cards', b.x + b.w + 16, b.y + 70, 2, '#f6f3ea'); text('5', b.x + b.w + 44, b.y + 78, 14, atk > r.atk ? '#ff6a6a' : '#8a8a9a', 'left'); text('+2', b.x + b.w + 60, b.y + 78, 12, atk > r.atk ? '#ff6a6a' : '#8a8a9a', 'left'); }
    ctx.restore();
    if (r.dead && r.deadT > 0.95) return;
    // 体力バー
    const hb = LY.hpBar;
    roundRect(hb.x, hb.y, hb.w, hb.h, 5); ctx.fillStyle = '#17141f'; ctx.fill();
    const frac = Math.max(0, Math.min(1, r.shown / r.maxHp));
    if (frac > 0) { roundRect(hb.x, hb.y, Math.max(hb.h, hb.w * frac), hb.h, 5); ctx.fillStyle = frac > 0.5 ? '#d64040' : frac > 0.25 ? '#e58a3b' : '#ffd84a'; ctx.fill(); }
    SP.drawIcon(ctx, 'heart', hb.x - 30, hb.y - 7, 3);
    text(Math.max(0, Math.round(r.shown)), hb.x + hb.w + 30, hb.y + 5, 22, '#f6f3ea');
    // 相手の守り
    if (r.shield > 0) { SP.drawIcon(ctx, 'shield', hb.x + hb.w + 16, hb.y + 16, 2); text(r.shield, hb.x + hb.w + 42, hb.y + 24, 16, '#7fb3ff'); }
  }
  function drawOppHand(now) {
    const n = R.CONF.oppHandMax;
    for (let i = 0; i < n; i++) {
      const p = oppHandPos(i);
      roundRect(p.x, p.y, LY.oppHand.w, LY.oppHand.h, 5); ctx.strokeStyle = 'rgba(255,92,92,0.25)'; ctx.lineWidth = 2; ctx.stroke();
    }
    view.oppHand.forEach(function (c, i) {
      const p = oppHandPos(i);
      const o = { border: OPP_COLOR, face: '#f6e0d8' };
      if (view.hiOpp.indexOf(i) >= 0) { o.glow = '#ffffff'; o.border = '#ffffff'; o.scale = 1.1; }
      if (view.hiOppStones && c.card === 'stone') { o.glow = '#ffd84a'; o.border = '#e0b63a'; }
      if (c.pop) o.scale = (o.scale || 1) + 0.15 * c.pop;
      drawCard(c.card, p.x, p.y - (c.pop || 0) * 6, LY.oppHand.w, LY.oppHand.h, o);
    });
  }
  function drawOwned() {
    view.owned.forEach(function (idx, k) {
      const p = ownedPos(k);
      drawRareMini(idx, p.x, p.y, LY.owned.w, LY.owned.h, { glow: (idx === 0 && view.ownGlow > 0) ? '#ffe066' : null });
    });
  }
  function drawPile(now, Lg) {
    const n = view.pile.length; const drop = ease(view.pileDrop);
    const pulse = 0.5 + 0.5 * Math.sin(now / 180);
    for (let i = 0; i < n; i++) {
      const p = pilePos(i, n);
      roundRect(p.x, p.y, LY.pile.w, LY.pile.h, 6); ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.lineWidth = 2; ctx.stroke();
      const c = view.pile[i]; if (!c) continue;
      const di = Math.max(0, Math.min(1, (drop - i * 0.08) / 0.6)); // 左から順に出てくる
      const o = { alpha: view.pileFade * di, scale: 0.6 + 0.4 * di };
      if (Lg && Lg.picks.indexOf(i) >= 0) { o.glow = 'rgba(255,216,74,' + (0.5 + 0.5 * pulse) + ')'; o.border = '#e0b63a'; }
      if (view.hiPile.indexOf(i) >= 0) { o.glow = view.hiPileColor; o.border = view.hiPileColor; }
      drawCard(c, p.x, p.y - (1 - di) * 16, LY.pile.w, LY.pile.h, o);
    }
  }
  function drawDots(now) {
    const ord = view.draftOrder; if (!ord.length || !view.draftActive) return;
    const gap = 18, x0 = W / 2 - (ord.length - 1) * gap / 2;
    ord.forEach(function (w, i) {
      const x = x0 + i * gap, done = i < view.draftStep, isCur = i === view.draftStep;
      ctx.globalAlpha = done ? 0.22 : 1;
      ctx.fillStyle = w === 'p' ? '#f3e9d2' : '#d64040';
      ctx.beginPath(); ctx.arc(x, LY.dotsY, isCur ? 6 : 4, 0, Math.PI * 2); ctx.fill();
      if (isCur) { ctx.strokeStyle = w === 'p' ? '#ffe066' : '#ff8a8a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, LY.dotsY, 9 + Math.sin(now / 150) * 1.5, 0, Math.PI * 2); ctx.stroke(); }
      ctx.globalAlpha = 1;
    });
  }
  function drawLane(now) {
    for (let i = 0; i < R.CONF.playMax; i++) {
      const p = lanePos(i);
      roundRect(p.x, p.y, LY.lane.w, LY.lane.h, 6); ctx.strokeStyle = view.oppTurn ? 'rgba(255,92,92,0.18)' : 'rgba(255,255,255,0.06)'; ctx.lineWidth = 2; ctx.stroke();
    }
    ctx.save(); ctx.globalAlpha = view.laneFade;
    view.lane.forEach(function (c, i) {
      const p = lanePos(i);
      drawCard(c.card, p.x, p.y - (c.pop || 0) * 8, LY.lane.w, LY.lane.h, { scale: 1 + (c.pop || 0) * 0.2, border: c.opp ? OPP_COLOR : null, face: c.opp ? '#f6e0d8' : null });
      if (c.dmg > 0) { SP.drawIcon(ctx, 'sword', p.x + LY.lane.w / 2 - 16, p.y + LY.lane.h + 4, 2); text(c.dmg, p.x + LY.lane.w / 2 + 8, p.y + LY.lane.h + 12, 14, c.opp ? OPP_COLOR : '#f6f3ea'); }
    });
    ctx.restore();
    const mult = view.oppTurn ? view.oppMult : view.nextMult;
    if (mult > 1 && view.lane.length < R.CONF.playMax) {
      const p = lanePos(view.lane.length);
      text('×2', p.x + LY.lane.w / 2, p.y + LY.lane.h / 2, 24 + Math.sin(now / 120) * 2, view.oppTurn ? OPP_COLOR : '#ff9a3c');
    }
  }
  function drawHand(now, Lg) {
    const n = view.hand.length;
    const mustDiscard = !!(Lg && Lg.mustDiscard);
    const canPlay = !!(Lg && Lg.phase === 'play' && Lg.canPlay);
    const pulse = 0.5 + 0.5 * Math.sin(now / 200);
    for (let i = 0; i < n; i++) {
      const h = view.hand[i], p = handPos(i, n);
      if (h.x == null) h.x = p.x; else h.x += (p.x - h.x) * Math.min(1, lastDt / 70);
      const o = {};
      if (canPlay) { o.preview = previewDmg(i); o.previewMult = S.nextMult; o.glow = 'rgba(255,255,255,' + (0.15 + 0.2 * pulse) + ')'; }
      if (mustDiscard) { o.glow = 'rgba(214,64,64,' + (0.4 + 0.5 * pulse) + ')'; o.border = '#d64040'; }
      if (view.hiHand.indexOf(i) >= 0) { o.glow = '#ffffff'; o.border = '#ffffff'; o.scale = 1.06; }
      if (view.hiStones && h.card === 'stone') { o.glow = '#ffd84a'; o.border = '#e0b63a'; }
      if (h.pop) o.scale = (o.scale || 1) + 0.15 * h.pop;
      drawCard(h.card, h.x, p.y - (h.pop || 0) * 8, LY.hand.w, LY.hand.h, o);
      if (mustDiscard) SP.drawIcon(ctx, 'cross', Math.round(h.x + LY.hand.w / 2 - 8), p.y - 22, 2);
    }
  }
  function previewDmg(i) {
    if (!S || i >= S.player.hand.length) return 0;
    const hand = S.player.hand.slice(); const card = hand.splice(i, 1)[0];
    return R.baseDamage(card, hand, S.played) * S.nextMult;
  }
  function drawHud(now, Lg) {
    // 自分の体力
    SP.drawIcon(ctx, 'heart', LY.heart.x, LY.heart.y, 4, view.hpHit > 0 ? '#ffffff' : null);
    text(view.hp, LY.heart.x + 66, LY.heart.y + 16, 34, view.hpHit > 0 ? '#ff5c5c' : (view.hp <= 8 ? '#ff9a3c' : '#f6f3ea'));
    if (view.shield > 0) { SP.drawIcon(ctx, 'shield', LY.heart.x + 112, LY.heart.y + 2, 3); text(view.shield, LY.heart.x + 150, LY.heart.y + 16, 24, '#7fb3ff'); }
    // 出した枚数（3 つの枡）と、終わるボタン
    if (S && (S.phase === 'play' || (view.lane.length && view.phase === 'game' && !view.oppTurn))) {
      const b = LY.endBtn;
      for (let i = 0; i < R.CONF.playMax; i++) { ctx.fillStyle = i < view.played ? '#ffe066' : 'rgba(255,255,255,0.18)'; roundRect(b.x - 26 + i * 18, b.y - 50, 14, 8, 2); ctx.fill(); }
      const on = Lg && Lg.phase === 'play';
      ctx.save();
      if (on) { ctx.shadowColor = 'rgba(95,207,60,' + (0.4 + 0.4 * Math.sin(now / 200)) + ')'; ctx.shadowBlur = 16; }
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fillStyle = on ? '#3f8f3f' : '#2c3a2c'; ctx.fill(); ctx.shadowBlur = 0;
      ctx.lineWidth = 3; ctx.strokeStyle = on ? '#8fe08f' : '#4a5a4a'; ctx.stroke();
      SP.drawIcon(ctx, 'arrow', b.x - 12, b.y - 12, 3, on ? '#f6f3ea' : '#7a8a7a');
      ctx.restore();
    }
  }
  function drawEye() {
    const e = view.eye; if (!e) return;
    ctx.save(); ctx.globalAlpha = Math.max(0, e.a);
    ctx.shadowColor = OPP_COLOR; ctx.shadowBlur = 14;
    SP.drawIcon(ctx, 'eye', Math.round(e.x - 12), Math.round(e.y - 12), 3);
    ctx.restore();
  }
  function drawFlyers() {
    view.flyers.forEach(function (f) {
      const t = ease(Math.min(1, f.t));
      const x = lerp(f.x0, f.x1, t), y = lerp(f.y0, f.y1, t) - (f.arc ? Math.sin(t * Math.PI) * 40 : 0);
      const w = lerp(f.w0, f.w1, t), h = lerp(f.h0, f.h1, t);
      const o = { alpha: f.fade ? 1 - t : 1, tint: f.tint && t > 0.3 ? f.tint : null, border: f.border || null, face: f.border ? '#f6e0d8' : null };
      if (f.rare != null) drawRareMini(f.rare, x, y, w, h, o); else drawCard(f.card, x, y, w, h, o);
    });
  }
  function drawFloaters() {
    view.floaters.forEach(function (f) {
      const a = f.age / f.life;
      const pop = 1 + 0.7 * Math.max(0, 1 - f.age / 160);
      ctx.save();
      ctx.globalAlpha = a > 0.7 ? (1 - a) / 0.3 : 1;
      ctx.translate(f.x, f.y); ctx.scale(pop, pop);
      let dx = 0;
      if (f.icon) { SP.drawIcon(ctx, f.icon, -f.size, -f.size / 2, Math.max(2, Math.round(f.size / 8))); dx = f.size * 0.6; }
      outlinedText(f.text, dx, 0, f.size, f.color);
      if (f.mult > 1) outlinedText('×2', f.size * 0.9, -f.size * 0.45, Math.max(12, f.size * 0.45), '#ff9a3c');
      ctx.restore();
    });
  }
  function drawParticles() {
    view.particles.forEach(function (p) { ctx.globalAlpha = Math.max(0, 1 - p.age / p.life); ctx.fillStyle = p.color; ctx.fillRect(p.x, p.y, p.size, p.size); });
    ctx.globalAlpha = 1;
  }

  // 最初の 1 ターンだけの案内：指さす手と 1〜2 語
  function guideLabel(x, y, word, pointAt) {
    const bob = Math.sin(performance.now() / 180) * 4;
    ctx.save();
    ctx.font = 'bold 14px ' + JP;
    const w = ctx.measureText(word).width + 18;
    roundRect(x - w / 2, y - 12, w, 24, 8); ctx.fillStyle = '#17141f'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#ffe066'; ctx.stroke();
    jtext(word, x, y + 1, 14, '#ffe066');
    if (pointAt === 'down') SP.drawIcon(ctx, 'point', Math.round(x - 12), Math.round(y + 14 + bob), 3, '#ffe066');
    else if (pointAt === 'up') { ctx.save(); ctx.translate(x, y - 14 - bob); ctx.rotate(Math.PI); SP.drawIcon(ctx, 'point', -12, -12, 3, '#ffe066'); ctx.restore(); }
    ctx.restore();
  }
  function drawGuide(now, Lg) {
    if (!S || view.turn !== 1 || view.phase !== 'game') return;
    const g = view.guide;
    if (view.oppTurn) { guideLabel(W / 2, LY.lane.y - 22, 'あいて', null); return; }
    if (view.eye) { guideLabel(Math.min(W - 40, view.eye.x + 44), view.eye.y - 6, 'あいて', null); return; }
    if (Lg && Lg.phase === 'draft' && !Lg.mustDiscard && Lg.picks.length && !g.took) {
      const p = pilePos(Lg.picks[0], view.pile.length);
      guideLabel(p.x + LY.pile.w / 2, p.y - 34, 'とる', 'down');
    }
    if (Lg && Lg.phase === 'play' && Lg.canPlay && !g.played) {
      const p = handPos(Math.floor((view.hand.length - 1) / 2), view.hand.length);
      guideLabel(p.x + LY.hand.w / 2, p.y - 34, 'だす', 'down');
    }
    if (Lg && Lg.phase === 'play' && Lg.canPlay && g.played && !g.longpressed) {
      const p = handPos(0, view.hand.length);
      guideLabel(p.x + LY.hand.w / 2 + 6, p.y - 34, 'ながおし', 'down');
    }
    if (Lg && Lg.phase === 'play' && (g.played || !Lg.canPlay) && !g.ended) {
      guideLabel(LY.endBtn.x - 4, LY.endBtn.y - 66, 'おわり', 'down');
    }
  }

  // 札を大きくして読む
  function drawZoom(now) {
    const z = view.zoom; if (!z) return;
    const t = ease(z.t);
    ctx.fillStyle = 'rgba(8,6,14,' + (0.6 * t) + ')'; ctx.fillRect(0, 0, W, H);
    const b = LY.zoom;
    ctx.save(); ctx.globalAlpha = t;
    ctx.translate(b.x + b.w / 2, b.y + b.h / 2); const sc = 0.85 + 0.15 * t; ctx.scale(sc, sc); ctx.translate(-(b.x + b.w / 2), -(b.y + b.h / 2));
    const tg = z.tg;
    const isRare = tg.kind === 'rare' || tg.kind === 'owned';
    const opp = tg.kind === 'opp' || (tg.kind === 'lane' && tg.opp);
    ctx.shadowColor = isRare ? RARE_COLORS[tg.rare] : (opp ? OPP_COLOR : '#ffe066'); ctx.shadowBlur = 24;
    roundRect(b.x, b.y, b.w, b.h, 10); ctx.fillStyle = isRare ? '#272233' : (opp ? '#f6e0d8' : '#f3e9d2'); ctx.fill(); ctx.shadowBlur = 0;
    ctx.lineWidth = 3; ctx.strokeStyle = isRare ? RARE_COLORS[tg.rare] : (opp ? OPP_COLOR : '#3a2f2a'); ctx.stroke();
    const ink = isRare ? '#f6f3ea' : '#2a2230';
    if (isRare) {
      const r = R.RARES[tg.rare];
      jtext(r.jp, b.x + b.w / 2, b.y + 26, 22, ink);
      SP.drawRare(ctx, tg.rare, Math.round(b.x + (b.w - 112) / 2), b.y + 46, 7);
      let y = b.y + 176;
      SP.drawIcon(ctx, 'heart', b.x + 40, y - 8, 2); text(r.hp, b.x + 70, y, 15, ink, 'left');
      SP.drawIcon(ctx, 'sword', b.x + 120, y - 8, 2); text(r.atk, b.x + 150, y, 15, ink, 'left');
      y += 26;
      wrap(r.text, 15).forEach(function (line) { jtext(line, b.x + b.w / 2, y, 14, ink); y += 20; });
      if (r.ownText) { y += 6; wrap(r.ownText, 15).forEach(function (line) { jtext(line, b.x + b.w / 2, y, 14, '#ffe066'); y += 20; }); }
      if (opp) jtext('あいて', b.x + b.w - 30, b.y + 16, 12, OPP_COLOR);
    } else {
      const c = R.CARDS[tg.card];
      jtext(c.jp, b.x + b.w / 2, b.y + 26, 22, ink);
      if (opp) jtext('あいての札', b.x + b.w / 2, b.y + 50, 13, OPP_COLOR);
      SP.drawMon(ctx, tg.card, Math.round(b.x + (b.w - 96) / 2), b.y + 60, 8);
      let y = b.y + 182;
      drawTokens(HINT[tg.card], b.x + b.w / 2, y, 16, 2.5);
      y += 32;
      wrap(c.text, 15).forEach(function (line) { jtext(line, b.x + b.w / 2, y, 15, ink); y += 22; });
      if (tg.kind === 'hand' && S && S.phase === 'play' && idle()) {
        const d = previewDmg(tg.index);
        y = b.y + b.h - 30;
        jtext('いま出すと', b.x + 70, y, 14, '#7a6a5a');
        SP.drawIcon(ctx, 'sword', b.x + 130, y - 9, 2.2); text(d, b.x + 170, y, 22, d >= 4 ? '#d7541e' : ink, 'left');
        if (S.nextMult > 1) text('×2', b.x + 205, y - 10, 12, '#d7541e');
      }
      if (tg.kind === 'hand' && S && S.phase === 'draft' && idle() && R.legal(S).mustDiscard) jtext('タップで すてる', b.x + b.w / 2, b.y + b.h - 24, 13, '#d64040');
    }
    ctx.restore();
  }

  function drawChoose(now) {
    const t = ease(view.chooseT);
    ctx.fillStyle = 'rgba(8,6,14,' + (0.78 * t) + ')'; ctx.fillRect(0, 0, W, H);
    ctx.save(); ctx.globalAlpha = t;
    const idx = view.chooseRare;
    // 倒したレア（中央上）
    drawRareMini(idx, W / 2 - 50, 70, 100, 126, { glow: '#ffe066', effect: false });
    jtext(R.RARES[idx].jp, W / 2, 56, 15, '#f6f3ea');
    const picksNow = Math.max(0, R.CONF.basePicks - view.owned.length);
    // 左：自分のものにする（枠に入る絵 ＋ もらえる効果 ＋ 取れる枚数が減る）
    panel(LY.keepBtn, '#5fcf3c', now);
    (function () {
      const b = LY.keepBtn, cx = b.x + b.w / 2;
      jtext('もちものにする', cx, b.y + 14, 13, '#8fe08f');
      ctx.setLineDash([4, 4]); ctx.strokeStyle = '#8fe08f'; ctx.lineWidth = 2; roundRect(cx - 21, b.y + 28, 42, 54, 6); ctx.stroke(); ctx.setLineDash([]);
      drawRareMini(idx, cx - 21 + Math.sin(now / 300) * 2, b.y + 28 - 6 + Math.sin(now / 300) * 2, 42, 54, { effect: false });
      // もらえる効果（毎ターン）
      if (idx === 0) { SP.drawIcon(ctx, 'sword', cx - 34, b.y + 96, 3); text('+' + R.CONF.ownRare0Dmg, cx + 10, b.y + 108, 24, '#ffe066'); SP.drawIcon(ctx, 'cycle', cx + 38, b.y + 100, 2, '#f6f3ea'); }
      else { SP.drawIcon(ctx, 'dot', cx - 36, b.y + 98, 2.5, OPP_COLOR); SP.drawIcon(ctx, 'cards', cx - 14, b.y + 96, 3, '#f6f3ea'); text('-' + R.CONF.ownRare1OppPicks, cx + 30, b.y + 108, 24, '#ffe066'); }
      // 代償：取れる枚数
      drawPickDots(cx, b.y + 160, picksNow, picksNow - 1);
    })();
    // 右：自分のものにしない（レアは去る。取れる枚数はそのまま）
    panel(LY.leaveBtn, '#8c8a80', now);
    (function () {
      const b = LY.leaveBtn, cx = b.x + b.w / 2;
      jtext('しない', cx, b.y + 14, 13, '#bdbbb0');
      drawRareMini(idx, cx - 21, b.y + 28 + Math.sin(now / 300) * 3, 42, 54, { alpha: 0.4, effect: false });
      ctx.save(); ctx.translate(cx + 40, b.y + 54); ctx.rotate(Math.PI / 2); SP.drawIcon(ctx, 'arrow', -8, -8, 2, '#8c8a80'); ctx.restore();
      drawPickDots(cx, b.y + 160, picksNow, picksNow);
    })();
    ctx.restore();
  }
  function panel(b, color, now) {
    ctx.save(); ctx.shadowColor = color; ctx.shadowBlur = 10 + Math.sin(now / 250) * 4;
    roundRect(b.x, b.y, b.w, b.h, 10); ctx.fillStyle = '#1d1826'; ctx.fill(); ctx.shadowBlur = 0;
    ctx.lineWidth = 3; ctx.strokeStyle = color; ctx.stroke(); ctx.restore();
  }
  // 取れる枚数の絵：札のアイコン ＋ ●の数（before → after）。減る分は赤い×。
  function drawPickDots(cx, y, before, after) {
    SP.drawIcon(ctx, 'cards', cx - 62, y - 8, 2, '#f6f3ea');
    const gap = 14, n = before, x0 = cx - 30;
    for (let i = 0; i < n; i++) {
      const x = x0 + i * gap;
      if (i < after) { ctx.fillStyle = '#f3e9d2'; ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill(); }
      else { SP.drawIcon(ctx, 'cross', x - 6, y - 6, 1.5); }
    }
    if (after < before) text('-1', cx + 42, y, 16, '#ff5c5c');
  }

  function drawTitle(now) {
    jtext('ごみやま', W / 2, 120, 46, '#f3e9d2');
    // ごみ山：雑魚が積まれている
    const heap = [['stone', 110, 300], ['rat', 150, 280], ['slime', 200, 290], ['bat', 240, 270], ['frog', 120, 340], ['goblin', 180, 330], ['cat', 230, 335], ['mush', 160, 380]];
    heap.forEach(function (h, i) { SP.drawMon(ctx, h[0], h[1], h[2] + Math.sin(now / 400 + i) * 3, 5); });
    const b = LY.startBtn;
    ctx.save(); ctx.shadowColor = '#5fcf3c'; ctx.shadowBlur = 16 + Math.sin(now / 200) * 8;
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fillStyle = '#3f8f3f'; ctx.fill(); ctx.shadowBlur = 0;
    ctx.lineWidth = 4; ctx.strokeStyle = '#8fe08f'; ctx.stroke(); ctx.restore();
    SP.drawIcon(ctx, 'play', b.x - 14, b.y - 20, 5, '#f6f3ea');
  }
  function drawEnd(now) {
    ctx.fillStyle = 'rgba(8,6,14,0.7)'; ctx.fillRect(0, 0, W, H);
    if (view.phase === 'win') {
      for (let i = 0; i < 3; i++) drawRareMini(i, 40 + i * 100, 150, 80, 100, { glow: '#ffe066', effect: false, tint: null });
      SP.drawIcon(ctx, 'heart', W / 2 - 24, 290, 6);
      text(view.hp, W / 2 + 40, 316, 40, '#f6f3ea');
    } else {
      drawRareMini(view.rare ? view.rare.index : 0, W / 2 - 60, 120, 120, 150, { glow: '#ff5c5c', effect: false });
      SP.drawIcon(ctx, 'heart', W / 2 - 24, 300, 6, '#555560');
      text('0', W / 2 + 40, 326, 40, '#8a8a9a');
    }
    const b = LY.againBtn;
    ctx.save(); ctx.shadowColor = '#ffe066'; ctx.shadowBlur = 12 + Math.sin(now / 200) * 6;
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fillStyle = '#3f3f8f'; ctx.fill(); ctx.shadowBlur = 0;
    ctx.lineWidth = 4; ctx.strokeStyle = '#9fa0e0'; ctx.stroke(); ctx.restore();
    SP.drawIcon(ctx, 'again', b.x - 16, b.y - 16, 4, '#f6f3ea');
  }

  function render(now) {
    ctx.fillStyle = '#17141f'; ctx.fillRect(0, 0, W, H);
    // 背景のうすい帯（上：相手、中：ごみ山、下：自分）
    ctx.fillStyle = view.oppTurn ? '#2a1a22' : '#1d1a28'; ctx.fillRect(0, 0, W, LY.oppHand.y + LY.oppHand.h + 4);
    ctx.fillStyle = '#1d1a28'; ctx.fillRect(0, LY.pile.y - 14, W, LY.pile.h + 28);
    ctx.fillStyle = '#141220'; ctx.fillRect(0, LY.hand.y - 30, W, H - LY.hand.y + 30);
    if (view.phase === 'title') { drawTitle(now); return; }
    const Lg = (S && idle() && view.phase === 'game') ? R.legal(S) : null;
    drawRare(now);
    drawOppHand(now);
    drawOwned();
    drawPile(now, Lg);
    drawDots(now);
    drawLane(now);
    drawHand(now, Lg);
    drawHud(now, Lg);
    drawFlyers();
    drawParticles();
    drawEye();
    drawFloaters();
    drawGuide(now, Lg);
    if (view.zoom) drawZoom(now);
    if (view.phase === 'choose') drawChoose(now);
    if (view.phase === 'win' || view.phase === 'lose') { drawEnd(now); drawParticles(); }
    if (view.flash > 0) { ctx.fillStyle = 'rgba(255,255,255,' + Math.min(1, view.flash) + ')'; ctx.fillRect(0, 0, W, H); }
  }
})();
