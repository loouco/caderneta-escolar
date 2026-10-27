'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { iniciar } = require('./auxiliar');

const PASTA = path.join(__dirname, '..', 'src', 'frontend');
const PAGINAS = ['login', 'alunos', 'aluno', 'aluno-form', 'ocorrencias', 'turmas', 'utilizadores', 'portal-aluno', 'professor'];

let app;
beforeEach(async () => { app = await iniciar(); });
afterEach(async () => { await app.fechar(); });

describe('Frontend', () => {
  for (const pagina of PAGINAS) {
    it(`${pagina}.html é servida e os recursos que referencia existem`, async () => {
      let cookie = app.sessao.cookie;
      if (pagina === 'professor') {
        const professorId = Number(app.db.prepare("INSERT INTO utilizador (nome,email,palavra_passe_hash,perfil) VALUES ('Professor Teste','professor@teste.ao','hash','professor')").run().lastInsertRowid);
        cookie = app.criarSessao(professorId).cookie;
      }
      const cabecalhos = pagina === 'login' ? {} : { headers: { Cookie: cookie } };
      const r = await fetch(`${app.base}/${pagina}.html`, cabecalhos);
      assert.equal(r.status, 200);
      const html = await r.text();
      const recursos = [...html.matchAll(/(?:href|src)="((?:css|js)\/[^"]+)"/g)].map((m) => m[1]);
      for (const recurso of recursos) {
        assert.ok(fs.existsSync(path.join(PASTA, recurso)), `${pagina}.html referencia ${recurso}, que não existe`);
      }
    });
  }

  it('a raiz mostra o ecrã de login e os módulos JavaScript são servidos', async () => {
    assert.match(await (await fetch(`${app.base}/`)).text(), /Caderneta Escolar/);
    const js = await fetch(`${app.base}/js/api.js`);
    assert.equal(js.status, 200);
    assert.match(js.headers.get('content-type'), /javascript/);
  });

  it('as páginas não usam innerHTML (evita XSS com dados de alunos)', () => {
    for (const ficheiro of fs.readdirSync(path.join(PASTA, 'js'))) {
      const codigo = fs.readFileSync(path.join(PASTA, 'js', ficheiro), 'utf8');
      assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML/.test(codigo), `${ficheiro} usa HTML dinâmico`);
    }
  });
});
