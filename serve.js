// 動作確認用の小さなサーバー。 node serve.js [port]
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const root = __dirname;
const port = parseInt(process.argv[2] || '8790', 10);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.md': 'text/plain; charset=utf-8' };
http.createServer((req, res) => {
  // 確認用：POST /shot?name=x に canvas の dataURL を送ると shots/x.png に保存する（ブラウザが隠れていても絵を確かめられる）
  if (req.method === 'POST' && req.url.startsWith('/shot')) {
    const name = (new URL(req.url, 'http://x').searchParams.get('name') || 'shot').replace(/[^a-z0-9_-]/gi, '');
    let body = '';
    req.on('data', d => { body += d; });
    req.on('end', () => {
      const m = body.match(/^data:image\/png;base64,(.+)$/);
      if (!m) { res.writeHead(400); res.end('bad'); return; }
      fs.mkdirSync(path.join(root, 'shots'), { recursive: true });
      fs.writeFileSync(path.join(root, 'shots', name + '.png'), Buffer.from(m[1], 'base64'));
      res.writeHead(200); res.end('ok');
    });
    return;
  }
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const file = path.normalize(path.join(root, p));
  if (!file.startsWith(root)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
}).listen(port, () => console.log('http://localhost:' + port + '/'));
