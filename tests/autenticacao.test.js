'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { iniciar } = require('./auxiliar');
const { criarHash, verificarHash } = require('../src/backend/autenticacao');

const PALAVRA_PASSE = 'Caderneta-Segura-2026!';
let app;

beforeEach(async () => {
  app = await iniciar();
  const hash = await criarHash(PALAVRA_PASSE);
  app.db.prepare('UPDATE utilizador SET palavra_passe_hash = ? WHERE id = ?').run(hash, app.utilizadorId);
});
afterEach(async () => { await app.fechar(); });

describe('Autenticação e sessões', () => {
  it('rejeita pedidos internos sem sessão e redireciona páginas privadas', async () => {
    const api = await app.pedirAnonimo('GET', '/api/alunos');
    assert.equal(api.status, 401);
    assert.equal(api.corpo.erro.codigo, 'NAO_AUTENTICADO');

    const pagina = await fetch(`${app.base}/alunos.html`, { redirect: 'manual' });
    assert.equal(pagina.status, 302);
    assert.equal(pagina.headers.get('location'), '/login.html');
    assert.equal((await fetch(`${app.base}/login.html`)).status, 200);
  });

  it('inicia sessão com credenciais válidas e emite cookie seguro e CSRF', async () => {
    const resposta = await app.pedirAnonimo('POST', '/api/auth/entrar', {
      email: 'ANA@ESCOLA.AO',
      palavra_passe: PALAVRA_PASSE,
    });
    assert.equal(resposta.status, 200);
    assert.equal(resposta.corpo.utilizador.id, app.utilizadorId);
    assert.ok(resposta.corpo.csrf_token);

    const cookie = resposta.cabecalhos.get('set-cookie');
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /SameSite=Strict/i);
    assert.match(cookie, /Max-Age=28800/i);
    assert.doesNotMatch(cookie, /Secure/i);
    const token = cookie.match(/caderneta\.sid=([^;]+)/)[1];
    assert.equal(app.db.prepare('SELECT 1 FROM sessao WHERE token_hash = ?').get(
      require('node:crypto').createHash('sha256').update(token).digest('hex')
    ) !== undefined, true);

    const sessao = {
      cookie: `caderneta.sid=${token}`,
      csrfToken: resposta.corpo.csrf_token,
    };
    const atual = await app.pedirComo('GET', '/api/auth/sessao', undefined, sessao);
    assert.equal(atual.status, 200);
    assert.equal(atual.corpo.utilizador.email, 'ana@escola.ao');
    assert.equal(atual.corpo.csrf_token, sessao.csrfToken);

    assert.equal((await app.pedirComo('POST', '/api/auth/sair', {}, {
      cookie: sessao.cookie,
      csrfToken: '',
    })).status, 403);
    assert.equal((await app.pedirComo('POST', '/api/auth/sair', {}, sessao)).status, 204);
    assert.equal((await app.pedirComo('GET', '/api/auth/sessao', undefined, sessao)).status, 401);
  });

  it('devolve a mesma mensagem para credenciais incorrectas ou utilizador inexistente', async () => {
    const errada = await app.pedirAnonimo('POST', '/api/auth/entrar', {
      email: 'ana@escola.ao',
      palavra_passe: 'incorreta',
    });
    const inexistente = await app.pedirAnonimo('POST', '/api/auth/entrar', {
      email: 'nao-existe@escola.ao',
      palavra_passe: 'incorreta',
    });
    assert.equal(errada.status, 401);
    assert.equal(inexistente.status, 401);
    assert.equal(errada.corpo.erro.mensagem, inexistente.corpo.erro.mensagem);
    assert.equal(errada.cabecalhos.get('set-cookie'), null);
  });

  it('expira sessões antigas e invalida contas desativadas', async () => {
    app.db.prepare("UPDATE sessao SET expira_em = '2000-01-01 00:00:00'").run();
    const expirou = await app.pedir('GET', '/api/auth/sessao');
    assert.equal(expirou.status, 401);

    const novaSessao = app.criarSessao();
    app.db.prepare("UPDATE utilizador SET estado = 'inativo' WHERE id = ?").run(app.utilizadorId);
    assert.equal((await app.pedirComo('GET', '/api/alunos', undefined, novaSessao)).status, 401);
  });

  it('valida e altera palavra-passe sem guardar texto simples', async () => {
    assert.equal(await verificarHash(PALAVRA_PASSE, app.db.prepare(
      'SELECT palavra_passe_hash FROM utilizador WHERE id = ?'
    ).get(app.utilizadorId).palavra_passe_hash), true);

    const fraca = await app.pedir('POST', '/api/auth/palavra-passe', {
      palavra_passe_atual: PALAVRA_PASSE,
      palavra_passe_nova: 'curta',
    });
    assert.equal(fraca.status, 400);
    const alterada = await app.pedir('POST', '/api/auth/palavra-passe', {
      palavra_passe_atual: PALAVRA_PASSE,
      palavra_passe_nova: 'Outra-Palavra-Segura-2026!',
    });
    assert.equal(alterada.status, 204);
    assert.equal((await app.pedir('GET', '/api/auth/sessao')).status, 200);
    assert.equal((await app.pedirAnonimo('POST', '/api/auth/entrar', {
      email: 'ana@escola.ao',
      palavra_passe: 'Outra-Palavra-Segura-2026!',
    })).status, 200);
  });
});

describe('Permissões e gestão de contas', () => {
  it('limita a gestão de contas, anos letivos e turmas ao administrador', async () => {
    const coordenadorId = Number(app.db.prepare(`
      INSERT INTO utilizador (nome, email, palavra_passe_hash, perfil)
      VALUES ('Coordenador', 'coord@escola.ao', 'hash', 'coordenador')`).run().lastInsertRowid);
    const coordenador = app.criarSessao(coordenadorId);
    assert.equal((await app.pedirComo('GET', '/api/utilizadores', undefined, coordenador)).status, 403);
    assert.equal((await app.pedirComo('POST', '/api/utilizadores', {}, coordenador)).status, 403);
    assert.equal((await app.pedirComo('POST', '/api/anos-letivos', {}, coordenador)).status, 403);
    assert.equal((await app.pedirComo('POST', '/api/turmas', {}, coordenador)).status, 403);
    assert.equal((await app.pedirComo('GET', '/api/anos-letivos', undefined, coordenador)).status, 200);
    assert.equal((await app.pedirComo('GET', '/api/turmas', undefined, coordenador)).status, 200);
    const pagina = await fetch(`${app.base}/utilizadores.html`, {
      headers: { Cookie: coordenador.cookie },
      redirect: 'manual',
    });
    assert.equal(pagina.status, 302);
    assert.equal(pagina.headers.get('location'), '/alunos.html');
  });

  it('permite a um administrador criar contas sem expor hashes', async () => {
    const adminId = Number(app.db.prepare(`
      INSERT INTO utilizador (nome, email, palavra_passe_hash, perfil)
      VALUES ('Administrador', 'admin@escola.ao', 'hash', 'administrador')`).run().lastInsertRowid);
    const admin = app.criarSessao(adminId);
    const criado = await app.pedirComo('POST', '/api/utilizadores', {
      nome: 'Novo Coordenador',
      email: 'novo@escola.ao',
      palavra_passe: 'Palavra-Segura-2026!',
      perfil: 'coordenador',
    }, admin);
    assert.equal(criado.status, 201);
    assert.deepEqual(Object.keys(criado.corpo).sort(), ['email', 'estado', 'id', 'nome', 'numero_matricula', 'perfil']);
    const hash = app.db.prepare('SELECT palavra_passe_hash FROM utilizador WHERE id = ?').get(criado.corpo.id).palavra_passe_hash;
    assert.match(hash, /^scrypt\$/);
    assert.equal(await verificarHash('Palavra-Segura-2026!', hash), true);
  });

  it('preserva espaços introduzidos na palavra-passe ao criar uma conta', async () => {
    const adminId = Number(app.db.prepare(`
      INSERT INTO utilizador (nome, email, palavra_passe_hash, perfil)
      VALUES ('Administrador', 'admin@escola.ao', 'hash', 'administrador')`).run().lastInsertRowid);
    const admin = app.criarSessao(adminId);
    const palavraPasse = '  Palavra-Segura-2026!  ';
    const criado = await app.pedirComo('POST', '/api/utilizadores', {
      nome: 'Novo Coordenador',
      email: 'novo@escola.ao',
      palavra_passe: palavraPasse,
      perfil: 'coordenador',
    }, admin);
    assert.equal(criado.status, 201);
    const hash = app.db.prepare('SELECT palavra_passe_hash FROM utilizador WHERE id = ?').get(criado.corpo.id).palavra_passe_hash;
    assert.equal(await verificarHash(palavraPasse, hash), true);
    assert.equal(await verificarHash(palavraPasse.trim(), hash), false);
  });

  it('rejeita palavra-passe fraca e impede desativar o último administrador', async () => {
    const adminId = Number(app.db.prepare(`
      INSERT INTO utilizador (nome, email, palavra_passe_hash, perfil)
      VALUES ('Administrador', 'admin@escola.ao', 'hash', 'administrador')`).run().lastInsertRowid);
    const admin = app.criarSessao(adminId);
    const fraca = await app.pedirComo('POST', '/api/utilizadores', {
      nome: 'Novo',
      email: 'novo@escola.ao',
      palavra_passe: 'curta',
      perfil: 'coordenador',
    }, admin);
    assert.equal(fraca.status, 400);
    const desativado = await app.pedirComo('PATCH', `/api/utilizadores/${app.utilizadorId}/estado`, {
      estado: 'inativo',
    }, admin);
    assert.equal(desativado.status, 200);
    const ultimo = await app.pedirComo('PATCH', `/api/utilizadores/${adminId}/estado`, { estado: 'inativo' }, admin);
    assert.equal(ultimo.status, 409);
  });

  it('associa a conta de aluno ao próprio registo e limita o portal', async () => {
    const ano = await app.pedir('POST', '/api/anos-letivos', {
      designacao: '2026/2027',
      data_inicio: '2026-09-01',
      data_fim: '2027-07-15',
      estado: 'ativo',
    });
    const turma = await app.pedir('POST', '/api/turmas', {
      nome: '7.ª A',
      classe: '7.ª classe',
      ano_letivo_id: ano.corpo.id,
    });
    const aluno = await app.pedir('POST', '/api/alunos', {
      numero_matricula: '2026999',
      nome_completo: 'Aluno de Teste',
      data_nascimento: '2012-01-10',
      sexo: 'M',
      encarregado_educacao: 'Encarregado de Teste',
      contacto: '923 000 111',
      turma_id: turma.corpo.id,
    });
    const criada = await app.pedir('POST', `/api/utilizadores/alunos/${aluno.corpo.id}/conta`, {
      nome: 'Aluno de Teste',
      email: 'aluno.teste@escola.ao',
      palavra_passe: 'Minha-Palavra-Segura-2026!',
    });
    assert.equal(criada.status, 201);
    assert.equal(criada.corpo.perfil, 'aluno');
    assert.equal(criada.corpo.numero_matricula, '2026999');

    const login = await app.pedirAnonimo('POST', '/api/auth/entrar', {
      email: 'aluno.teste@escola.ao',
      palavra_passe: 'Minha-Palavra-Segura-2026!',
    });
    assert.equal(login.status, 200);
    assert.equal(login.corpo.utilizador.aluno_id, aluno.corpo.id);
    const cookie = login.cabecalhos.get('set-cookie').match(/caderneta\.sid=([^;]+)/)[1];
    const sessao = {
      cookie: `caderneta.sid=${cookie}`,
      csrfToken: login.corpo.csrf_token,
    };

    const estado = await app.pedirComo('GET', '/api/portal-aluno', undefined, sessao);
    assert.equal(estado.status, 200);
    assert.equal(estado.corpo.estado, 'ativo');
    assert.equal(estado.corpo.numero_matricula, '2026999');
    assert.equal(estado.corpo.turma_nome, '7.ª A');
    assert.equal(estado.corpo.contacto, undefined);
    assert.equal((await app.pedirComo('GET', '/api/alunos', undefined, sessao)).status, 403);
    assert.equal((await app.pedirComo('GET', '/api/portal-aluno/999', undefined, sessao)).status, 404);

    const paginaInterna = await fetch(`${app.base}/alunos.html`, {
      headers: { Cookie: sessao.cookie },
      redirect: 'manual',
    });
    assert.equal(paginaInterna.status, 302);
    assert.equal(paginaInterna.headers.get('location'), '/portal-aluno.html');
    assert.equal((await fetch(`${app.base}/portal-aluno.html`, {
      headers: { Cookie: sessao.cookie },
    })).status, 200);
  });

  it('não permite associar várias contas ao mesmo aluno nem criar perfil de aluno sem vínculo', async () => {
    const ano = await app.pedir('POST', '/api/anos-letivos', {
      designacao: '2026/2027',
      data_inicio: '2026-09-01',
      data_fim: '2027-07-15',
      estado: 'ativo',
    });
    const turma = await app.pedir('POST', '/api/turmas', {
      nome: '7.ª A',
      classe: '7.ª classe',
      ano_letivo_id: ano.corpo.id,
    });
    const aluno = await app.pedir('POST', '/api/alunos', {
      numero_matricula: '2026988',
      nome_completo: 'Outro Aluno',
      data_nascimento: '2012-01-10',
      sexo: 'M',
      encarregado_educacao: 'Encarregado de Teste',
      contacto: '923 000 111',
      turma_id: turma.corpo.id,
    });
    const credenciais = { nome: 'Outro Aluno', email: 'outro.aluno@escola.ao', palavra_passe: 'Minha-Palavra-Segura-2026!' };
    assert.equal((await app.pedir('POST', `/api/utilizadores/alunos/${aluno.corpo.id}/conta`, credenciais)).status, 201);
    assert.equal((await app.pedir('POST', `/api/utilizadores/alunos/${aluno.corpo.id}/conta`, {
      ...credenciais,
      email: 'duplicado@escola.ao',
    })).status, 409);
    assert.equal((await app.pedir('POST', '/api/utilizadores', {
      ...credenciais,
      email: 'sem.vinculo@escola.ao',
      perfil: 'aluno',
    })).status, 400);
  });

  it('permite a um administrador criar um professor com perfil dedicado', async () => {
    const criado = await app.pedir('POST', '/api/utilizadores', {
      nome: 'Professor de Matemática',
      email: 'professor@escola.ao',
      palavra_passe: 'Professor-Seguro-2026!',
      perfil: 'professor',
    });
    assert.equal(criado.status, 201);
    assert.equal(criado.corpo.perfil, 'professor');
  });
});
