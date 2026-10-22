/* ごみやま ドット絵。雑魚 8 種・レア 3 枚・アイコン。
 * 文字（1 文字 = 1 ドット）で描いて、Canvas に拡大して出す。'.' は透明。
 */
(function (root) {
  'use strict';

  const PAL = {
    k: '#1c1a22', w: '#f6f3ea', y: '#f2d14a', n: '#f28ca8',
    g: '#a4a4b4', G: '#62627a', p: '#f0a6bd',             // ネズミ
    v: '#8d55dd', V: '#5a2f9c',                           // コウモリ
    c: '#4fd3e6', C: '#2a90a4',                           // スライム
    e: '#5fcf3c', E: '#2e8420',                           // カエル
    r: '#e34b4b', t: '#ecd8ae', T: '#b39170',             // キノコ
    o: '#8fa63c', O: '#596a1f', R: '#c43a3a', s: '#d9dde8', // ゴブリン
    a: '#8f8d84', A: '#5d5b54', l: '#bdbbb0',             // 石ころ
    d: '#d64040', D: '#8b1f1f', h: '#e9d9a8',             // レア1（赤いけもの）
    b: '#4d72dc', B: '#2b3f8c',                           // レア2（青い目）
    Y: '#e5b53b', q: '#a87e1c', P: '#6d41a3', f: '#f0c9a0', // レア3（金の王）
    S: '#8a92a8', H: '#8c5a2b',                           // 剣
    i: '#e8485c', I: '#b02a3c',                           // ハート
    u: '#4f8fe0', U: '#2a5ca8'                            // 盾
  };

  const MON = {
    rat: [
      '............',
      '.gg......gg.',
      '.gpg....gpg.',
      '..gggggggg..',
      '.gggggggggg.',
      '.ggkggggkgg.',
      '.ggggGGgggg.',
      '.gggggggggg.',
      '..ggggggggp.',
      '...gggggg..p',
      '....g..g...p',
      '..........p.'
    ],
    bat: [
      '............',
      '.v........v.',
      '.vv......vv.',
      '.vvv.vv.vvv.',
      '.vvvvvvvvvv.',
      '.vVvvyvyvvVv',
      '..vvvvvvvvv.',
      '...vvvvvvv..',
      '....vvVvv...',
      '.....vvv....',
      '......v.....',
      '............'
    ],
    slime: [
      '............',
      '............',
      '....cccc....',
      '..cccccccc..',
      '.cccccccccc.',
      '.ccwkccwkcc.',
      '.cccccccccc.',
      '.cccCccCccc.',
      '.ccccCCcccc.',
      '.cccccccccc.',
      '..cCCCCCCc..',
      '............'
    ],
    frog: [
      '............',
      '.yyy....yyy.',
      '.yky....yky.',
      '.eeeeeeeeee.',
      '.eeeeeeeeee.',
      '.eEkkkkkkEe.',
      '.eeeeeeeeee.',
      '.eeEeeeeEee.',
      '.ee.eeee.ee.',
      'eee.eeee.eee',
      'ee........ee',
      '............'
    ],
    mush: [
      '............',
      '....rrrr....',
      '..rrwrrrwr..',
      '.rrrrrrrrrr.',
      '.rwrrrrrrwr.',
      '.rrrrrwrrrr.',
      '.rrrrrrrrrr.',
      '..rrrrrrrr..',
      '....tttt....',
      '....tktk....',
      '....tttt....',
      '....TTTT....'
    ],
    goblin: [
      '..o......o..',
      '..oo....oo..',
      '..oooooooo..',
      '.oooooooooo.',
      '.ookooookoo.',
      '.oooooooooo.',
      '..ooRRRRoo..',
      '..oooooooo..',
      '...OOOOOO...',
      '..ssOOOO....',
      '..s.OO.OO...',
      '....O...O...'
    ],
    cat: [
      '............',
      '..k......k..',
      '..kk....kk..',
      '..kkkkkkkk..',
      '.kkkkkkkkkk.',
      '.kkykkkkykk.',
      '.kkkkknkkkk.',
      '..kkkkkkkk..',
      '...kkkkkkk..',
      '..kkkkkkkk.k',
      '..kk..kk..kk',
      '..........k.'
    ],
    stone: [
      '............',
      '............',
      '....aaaa....',
      '..aalaaaaa..',
      '.aalaaaaaaa.',
      '.aaaaaaaaAa.',
      '.aaaaaaaaaa.',
      '.aaaaaaAAaa.',
      '.aAaaaaaaaa.',
      '..aaAAAaaa..',
      '...AAAAAA...',
      '............'
    ]
  };

  const RARE = [
    [ // レア1：赤いけもの
      '...h........h...',
      '..hh........hh..',
      '..ddd......ddd..',
      '..dddd....dddd..',
      '.dddddddddddddd.',
      '.dddddddddddddd.',
      'dddyyddddddyyddd',
      'dddykddddddkyddd',
      'dddddddddddddddd',
      'dDDDDDDDDDDDDDDd',
      'dDwwDwwDwwDwwDDd',
      '.dDDDDDDDDDDDDd.',
      '..dddddddddddd..',
      '...dddddddddd...',
      '....dd....dd....',
      '....dd....dd....'
    ],
    [ // レア2：青い目（手札を読む）
      '......bbbb......',
      '....bbbbbbbb....',
      '...bbbbbbbbbb...',
      '..bbbbbbbbbbbb..',
      '..bbwwwwwwwwbb..',
      '..bwwwwkkwwwwb..',
      '..bwwwkkkkwwwb..',
      '..bbwwwkkwwwbb..',
      '..bbbwwwwwwbbb..',
      '..bbbbbbbbbbbb..',
      '..bBbbbbbbbbBb..',
      '..bBBbbbbbbBBb..',
      '...BBbbbbbbBB...',
      '...BB.bbbb.BB...',
      '......bbbb......',
      '......BBBB......'
    ],
    [ // レア3：金の王
      '....Y...YY...Y..',
      '....YY..YY..YY..',
      '....YYYYYYYYYY..',
      '....YYYYYYYYYY..',
      '....ffffffffff..',
      '....fkffffffkf..',
      '....ffffffffff..',
      '....ffffwwffff..',
      '.....ffffffff...',
      '....PPPPPPPPPP..',
      '...PPPYYYYYYPPP.',
      '...PPPPPPPPPPPP.',
      '...PPPPPPPPPPPP.',
      '...PPPPPPPPPPPP.',
      '...PPPPPPPPPPPP.',
      '...PPPP....PPPP.'
    ]
  ];

  const ICON = {
    sword: [
      '.......s',
      '......ss',
      '.....ss.',
      '....ss..',
      '.H.ss...',
      '..HH....',
      '.HHH....',
      'H..H....'
    ],
    heart: [
      '.ii..ii.',
      'iiiiiiii',
      'iiiiiiii',
      'iIiiiiIi',
      '.iIiiIi.',
      '..iiii..',
      '...ii...',
      '........'
    ],
    shield: [
      '.uuuuuu.',
      'uuwuuuuu',
      'uuuuuuuu',
      'uUuuuuUu',
      '.uUuuUu.',
      '.uuuuuu.',
      '..uuuu..',
      '...uu...'
    ],
    eye: [
      '........',
      '...ww...',
      '.wwwwww.',
      'wwwkkwww',
      'wwkkkkww',
      'wwwkkwww',
      '.wwwwww.',
      '...ww...'
    ],
    hand: [ // 手（取る）
      '...ww...',
      '..wwww..',
      '.wwwwww.',
      '.wwwwww.',
      'wwwwwwww',
      'wwwwwwww',
      '.wwwwww.',
      '..wwww..'
    ],
    cards: [ // 札の束
      '.wwwww..',
      '.w...w..',
      '.w.wwwww',
      '.w.w...w',
      '.w.w.www',
      '.www.w.w',
      '...w...w',
      '...wwwww'
    ],
    cross: [
      'R......R',
      'RR....RR',
      '.RR..RR.',
      '..RRRR..',
      '..RRRR..',
      '.RR..RR.',
      'RR....RR',
      'R......R'
    ],
    play: [ // ▶
      '.k......',
      '.kk.....',
      '.kkkk...',
      '.kkkkkk.',
      '.kkkkkk.',
      '.kkkk...',
      '.kk.....',
      '.k......'
    ],
    again: [ // ↻
      '..kkkk..',
      '.k....k.',
      'k......k',
      'k....kkk',
      'k.....k.',
      'k....k..',
      '.k..k...',
      '..kk....'
    ],
    bars: [ // 伸びる（連鎖）
      '.......k',
      '.......k',
      '....k..k',
      '....k..k',
      '.k..k..k',
      '.k..k..k',
      '.k..k..k',
      'kkkkkkkk'
    ],
    cycle: [ // 毎ターン
      '..kkkk..',
      '.k....k.',
      'k.....kk',
      'k....kkk',
      'k.......',
      'k......k',
      '.k....k.',
      '..kkkk..'
    ],
    arrow: [ // → 次の札
      '....k...',
      '....kk..',
      'kkkkkkk.',
      'kkkkkkkk',
      'kkkkkkk.',
      '....kk..',
      '....k...',
      '........'
    ]
  };

  const cache = {};
  // ドット絵を 1 ドット = px の大きさで描いた Canvas を返す（同じものは使い回す）
  function bitmap(rows, px, key, tint) {
    const ck = key + '@' + px + (tint || '');
    if (cache[ck]) return cache[ck];
    const h = rows.length, w = Math.max.apply(null, rows.map(function (r) { return r.length; }));
    const cv = document.createElement('canvas');
    cv.width = w * px; cv.height = h * px;
    const c = cv.getContext('2d');
    for (let y = 0; y < h; y++) for (let x = 0; x < rows[y].length; x++) {
      const ch = rows[y][x];
      if (ch === '.' || ch === ' ') continue;
      c.fillStyle = tint || PAL[ch] || '#ff00ff';
      c.fillRect(x * px, y * px, px, px);
    }
    cache[ck] = cv;
    return cv;
  }

  function drawMon(ctx, id, x, y, px, tint) { ctx.drawImage(bitmap(MON[id], px, 'm_' + id, tint), x, y); }
  function drawRare(ctx, index, x, y, px, tint) { ctx.drawImage(bitmap(RARE[index], px, 'r_' + index, tint), x, y); }
  function drawIcon(ctx, id, x, y, px, tint) { ctx.drawImage(bitmap(ICON[id], px, 'i_' + id, tint), x, y); }

  root.GomiSprites = { PAL: PAL, MON: MON, RARE: RARE, ICON: ICON, drawMon: drawMon, drawRare: drawRare, drawIcon: drawIcon, bitmap: bitmap };
})(typeof globalThis !== 'undefined' ? globalThis : this);
