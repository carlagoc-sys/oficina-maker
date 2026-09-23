// Servidor: serve o editor (index.html) e compila sketches com o arduino-cli.
// Uso: PIN=1234 node server.js
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const { execFile } = require('child_process');
const PORT = process.env.PORT || 8080, PIN = process.env.PIN || '';
const FQBN = /^[A-Za-z0-9_]+:[A-Za-z0-9_]+:[A-Za-z0-9_]+$/;
const send = (s, o, c = 200) => { s.statusCode = c; s.setHeader('Content-Type', 'application/json'); s.end(JSON.stringify(o)); };

http.createServer((q, s) => {
  if (q.method === 'GET') {
    s.setHeader('Content-Type', 'text/html;charset=utf-8');
    return fs.createReadStream(path.join(__dirname, 'index.html')).pipe(s);
  }
  if (q.method !== 'POST' || q.url !== '/api/compile') { s.statusCode = 404; return s.end(); }
  if (PIN && q.headers['x-pin'] !== PIN) return send(s, { ok: false, log: 'PIN incorreto.' }, 401);
  let b = '';
  q.on('data', c => { b += c; if (b.length > 2e5) q.destroy(); });
  q.on('end', () => {
    let j; try { j = JSON.parse(b); } catch { return send(s, { ok: false, log: 'Pedido inválido.' }, 400); }
    if (!FQBN.test(j.fqbn)) return send(s, { ok: false, log: 'Placa inválida.' }, 400);
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-')), sk = path.join(d, 'sketch');
    fs.mkdirSync(sk); fs.writeFileSync(path.join(sk, 'sketch.ino'), String(j.code));
    execFile('arduino-cli', ['compile', '--fqbn', j.fqbn, '--output-dir', path.join(d, 'out'), sk],
      { timeout: 120000 }, (e, so, se) => {
        let hex = ''; try { hex = fs.readFileSync(path.join(d, 'out', 'sketch.ino.hex'), 'utf8'); } catch {}
        send(s, { ok: !e && !!hex, log: (so + se).replaceAll(d, ''), hex });
        fs.rm(d, { recursive: true, force: true }, () => {});
      });
  });
}).listen(PORT, () => console.log('Editor em http://localhost:' + PORT));
