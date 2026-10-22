/* ごみやま 音。WebAudio で合成（音ファイルなし）。
 * 札ごとに違う音。連鎖が続くほど高く・大きく。レアを倒した瞬間は大きな音。
 */
(function (root) {
  'use strict';
  let ac = null, master = null, muted = false;

  function init() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
    try {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      master = ac.createGain(); master.gain.value = 0.5; master.connect(ac.destination);
    } catch (e) { ac = null; }
  }
  function now() { return ac ? ac.currentTime : 0; }

  // 1 音。type: 波形, f0→f1: 高さ（スライド）, dur: 長さ, g: 大きさ
  function tone(opts) {
    if (!ac || muted) return;
    const t0 = now() + (opts.delay || 0);
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = opts.type || 'square';
    o.frequency.setValueAtTime(opts.f0, t0);
    if (opts.f1) o.frequency.exponentialRampToValueAtTime(opts.f1, t0 + opts.dur);
    const vol = (opts.g || 0.2);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.dur);
    o.connect(g); g.connect(master);
    o.start(t0); o.stop(t0 + opts.dur + 0.02);
  }
  // ノイズ（石・打撃・爆発用）
  function noise(dur, g, delay, hp) {
    if (!ac || muted) return;
    const t0 = now() + (delay || 0);
    const n = Math.floor(ac.sampleRate * dur);
    const buf = ac.createBuffer(1, n, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = ac.createBufferSource(); src.buffer = buf;
    const gn = ac.createGain(); gn.gain.value = g || 0.2;
    const f = ac.createBiquadFilter(); f.type = hp ? 'highpass' : 'lowpass'; f.frequency.value = hp ? 2000 : 600;
    src.connect(f); f.connect(gn); gn.connect(master);
    src.start(t0);
  }

  // 札ごとの基本の音（高さと波形）
  const CARD_TONE = {
    rat:    { type: 'square',   f: 523, slide: 1.25, dur: 0.12 },
    bat:    { type: 'triangle', f: 392, slide: 0.8,  dur: 0.16 },
    slime:  { type: 'sine',     f: 330, slide: 1.5,  dur: 0.22 },
    frog:   { type: 'sawtooth', f: 220, slide: 2.2,  dur: 0.25 },
    mush:   { type: 'sine',     f: 440, slide: 1.0,  dur: 0.18 },
    goblin: { type: 'square',   f: 196, slide: 0.7,  dur: 0.2 },
    cat:    { type: 'triangle', f: 659, slide: 1.2,  dur: 0.16 },
    stone:  { type: 'sine',     f: 110, slide: 0.6,  dur: 0.15 }
  };

  // 札を出した音。chain = そのターン何枚目か（1,2,3）。dmg が大きいほど少し重く。
  function card(id, chain, dmg) {
    if (!ac) return;
    const c = CARD_TONE[id] || CARD_TONE.rat;
    const up = Math.pow(1.26, (chain || 1) - 1);        // 連鎖ごとに長 3 度ずつ上がる
    const g = Math.min(0.45, 0.16 + 0.08 * ((chain || 1) - 1) + Math.min(dmg || 0, 12) * 0.012);
    tone({ type: c.type, f0: c.f * up, f1: c.f * up * c.slide, dur: c.dur, g: g });
    if (chain >= 2) tone({ type: 'sine', f0: c.f * up * 2, f1: c.f * up * 2 * c.slide, dur: c.dur * 0.8, g: g * 0.35, delay: 0.02 });
    if (chain >= 3) tone({ type: 'triangle', f0: c.f * up * 1.5, f1: c.f * up * 1.5 * c.slide, dur: c.dur, g: g * 0.3, delay: 0.04 });
    if (dmg >= 6) noise(0.08, 0.08, 0, true);
    if (id === 'stone') noise(0.1, 0.15);
  }

  function tap()      { tone({ type: 'square', f0: 880, f1: 1100, dur: 0.05, g: 0.08 }); }
  function pick()     { tone({ type: 'triangle', f0: 660, f1: 990, dur: 0.1, g: 0.15 }); }
  function discard()  { tone({ type: 'sawtooth', f0: 300, f1: 120, dur: 0.18, g: 0.12 }); }
  function oppLook()  { tone({ type: 'sine', f0: 240, f1: 260, dur: 0.09, g: 0.07 }); }
  function oppPick()  { tone({ type: 'sawtooth', f0: 180, f1: 90, dur: 0.22, g: 0.14 }); noise(0.06, 0.06); }
  function heal()     { tone({ type: 'sine', f0: 523, f1: 784, dur: 0.18, g: 0.12, delay: 0.06 }); tone({ type: 'sine', f0: 659, f1: 1046, dur: 0.18, g: 0.1, delay: 0.14 }); }
  function shield()   { tone({ type: 'triangle', f0: 1200, f1: 900, dur: 0.14, g: 0.12, delay: 0.06 }); }
  function mult()     { tone({ type: 'sawtooth', f0: 330, f1: 990, dur: 0.22, g: 0.1, delay: 0.1 }); }
  function stoneTick(n) { for (let i = 0; i < Math.min(n, 5); i++) { tone({ type: 'sine', f0: 140, f1: 90, dur: 0.1, g: 0.14, delay: i * 0.09 }); noise(0.05, 0.1, i * 0.09); } }
  function attack(dmg) { tone({ type: 'sawtooth', f0: 160, f1: 60, dur: 0.3, g: dmg > 0 ? 0.22 : 0.08 }); noise(0.18, dmg > 0 ? 0.25 : 0.05); }
  function blocked()  { tone({ type: 'triangle', f0: 900, f1: 700, dur: 0.12, g: 0.14 }); }
  function own()      { tone({ type: 'square', f0: 392, f1: 523, dur: 0.14, g: 0.12 }); }
  // レアを倒した：和音を上に駆け上がる + ノイズ
  function rareDead() {
    const seq = [523, 659, 784, 1046, 1318];
    seq.forEach(function (f, i) { tone({ type: 'square', f0: f, dur: 0.35, g: 0.18, delay: i * 0.07 }); tone({ type: 'triangle', f0: f * 2, dur: 0.3, g: 0.08, delay: i * 0.07 }); });
    noise(0.5, 0.3, 0.05);
    tone({ type: 'sine', f0: 1046, f1: 2092, dur: 0.8, g: 0.12, delay: 0.4 });
  }
  function win() { [523, 659, 784, 1046, 784, 1046, 1318].forEach(function (f, i) { tone({ type: 'square', f0: f, dur: 0.25, g: 0.16, delay: i * 0.12 }); }); }
  function lose() { [330, 311, 294, 220].forEach(function (f, i) { tone({ type: 'sawtooth', f0: f, f1: f * 0.9, dur: 0.4, g: 0.14, delay: i * 0.25 }); }); }
  function choose() { tone({ type: 'triangle', f0: 440, f1: 660, dur: 0.2, g: 0.12 }); }

  root.GomiAudio = { init: init, card: card, tap: tap, pick: pick, discard: discard, oppLook: oppLook, oppPick: oppPick, heal: heal, shield: shield, mult: mult, stoneTick: stoneTick, attack: attack, blocked: blocked, own: own, rareDead: rareDead, win: win, lose: lose, choose: choose, setMuted: function (m) { muted = m; } };
})(typeof globalThis !== 'undefined' ? globalThis : this);
