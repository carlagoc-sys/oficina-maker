// Servidor: serve o editor (index.html), busca bibliotecas e compila com o arduino-cli.
// Uso: PIN=1234 node server.js
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const { execFile } = require('child_process');
const PORT = process.env.PORT || 8080, PIN = process.env.PIN || '';
const FQBN = /^[A-Za-z0-9_]+:[A-Za-z0-9_]+:[A-Za-z0-9_]+$/, LIB = /^[A-Za-z0-9_ .+\-]{1,80}$/;
const send = (s, o, c = 200) => { s.statusCode = c; s.setHeader('Content-Type', 'application/json'); s.end(JSON.stringify(o)); };
const cli = (args, opt, cb) => execFile('arduino-cli', args, { maxBuffer: 1e7, ...opt }, cb);

// Instala, se ainda não estiverem, as bibliotecas pedidas pelo projeto (só do índice oficial da Arduino).
const have = new Set();
const ensure = (names, cb) => {
  const todo = names.filter(n => !have.has(n));
  (function next(i) {
    if (i >= todo.length) return cb('');
    cli(['lib', 'install', todo[i]], { timeout: 180000 }, (e, so, se) => {
      if (e) return cb('Não consegui instalar a biblioteca "' + todo[i] + '".\n' + se);
      have.add(todo[i]); next(i + 1);
    });
  })(0);
};

const listLibs = (args, cb) => cli(['lib', 'list', '--format', 'json', ...args], { timeout: 20000 }, (e, so) => {
  let a = [];
  try { const j = JSON.parse(so); a = (j.installed_libraries || j || []).map(x => x.library || x).map(l => ({ name: l.name, inc: l.provides_includes || [] })).filter(l => l.name && l.inc.length); } catch {}
  cb(a);
});

http.createServer((q, s) => {
  const u = new URL(q.url, 'http://x');
  if (q.method === 'GET' && u.pathname === '/api/libs')
    return listLibs(['--all', '--fqbn', 'arduino:avr:mega'], a => a.length ? send(s, { libs: a }) : listLibs([], b => send(s, { libs: b })));
  if (q.method === 'GET' && u.pathname === '/api/libs/search') {
    const t = (u.searchParams.get('q') || '').slice(0, 60);
    if (!/^[A-Za-z0-9_ .+\-]{2,}$/.test(t)) return send(s, { libs: [] });
    return cli(['lib', 'search', t, '--format', 'json'], { timeout: 30000 }, (e, so) => {
      let a = [];
      try { a = (JSON.parse(so).libraries || []).slice(0, 40).map(l => { const x = l.latest || {}; return { name: l.name, author: x.author || '', text: x.sentence || '', ver: x.version || '', inc: x.provides_includes || [] }; }); } catch {}
      send(s, { libs: a });
    });
  }
  if (q.method === 'GET') {
    s.setHeader('Content-Type', 'text/html;charset=utf-8');
    return fs.createReadStream(path.join(__dirname, 'index.html')).pipe(s);
  }
  if (q.method !== 'POST' || u.pathname !== '/api/compile') { s.statusCode = 404; return s.end(); }
  if (PIN && q.headers['x-pin'] !== PIN) return send(s, { ok: false, log: 'PIN incorreto.' }, 401);
  let b = '';
  q.on('data', c => { b += c; if (b.length > 2e5) q.destroy(); });
  q.on('end', () => {
    let j; try { j = JSON.parse(b); } catch { return send(s, { ok: false, log: 'Pedido inválido.' }, 400); }
    if (!FQBN.test(j.fqbn)) return send(s, { ok: false, log: 'Placa inválida.' }, 400);
    const libs = (Array.isArray(j.libs) ? j.libs : []).slice(0, 20).map(String).filter(n => LIB.test(n));
    ensure(libs, err => {
      if (err) return send(s, { ok: false, log: err });
      const d = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-')), sk = path.join(d, 'sketch');
      fs.mkdirSync(sk); fs.writeFileSync(path.join(sk, 'sketch.ino'), String(j.code));
      cli(['compile', '--fqbn', j.fqbn, '--output-dir', path.join(d, 'out'), sk], { timeout: 120000 }, (e, so, se) => {
        let hex = ''; try { hex = fs.readFileSync(path.join(d, 'out', 'sketch.ino.hex'), 'utf8'); } catch {}
        send(s, { ok: !e && !!hex, log: (so + se).replaceAll(d, ''), hex });
        fs.rm(d, { recursive: true, force: true }, () => {});
      });
    });
  });
}).listen(PORT, () => console.log('Editor em http://localhost:' + PORT));
