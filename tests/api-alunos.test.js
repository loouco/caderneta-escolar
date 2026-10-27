'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { iniciar, dadosAno, dadosTurma, dadosAluno, criarTurmaBase } = require('./auxiliar');

let app;
let turmaId;
beforeEach(async () => {
  app = await iniciar();
  ({ turmaId } = await criarTurmaBase(app.pedir));
});
afterEach(async () => { await app.fechar(); });

const criar = (o) => app.pedir('POST', '/api/alunos', dadosAluno(turmaId, o));

describe('API de alunos: criação e validação', () => {
  it('cria um aluno; o estado inicial é sempre "ativo"', async () => {
    const r = await criar({ estado: 'inativo' }); // tentativa de forçar o estado é ignorada
    assert.equal(r.status, 201);
    assert.equal(r.corpo.estado, 'ativo');
    assert.equal(r.corpo.turma_nome, '9.ª A');
    assert.ok(r.corpo.criado_em);
  });

  it('RN01: rejeita matrícula duplicada com 409', async () => {
    await criar();
    const r = await criar({ nome_completo: 'Outro Aluno' });
    assert.equal(r.status, 409);
  });

  it('rejeita turma inexistente', async () => {
    const r = await app.pedir('POST', '/api/alunos', dadosAluno(999));
    assert.equal(r.status, 400);
    assert.ok(r.corpo.erro.detalhes.turma_id);
  });

  it('rejeita dados inválidos e indica cada campo', async () => {
    const r = await criar({
      sexo: 'X',
      data_nascimento: '2999-01-01',
      contacto: 'abc',
      nome_completo: '   ',
      encarregado_educacao: '',
    });
    assert.equal(r.status, 400);
    const d = r.corpo.erro.detalhes;
    for (const campo of ['sexo', 'data_nascimento', 'contacto', 'nome_completo', 'encarregado_educacao']) {
      assert.ok(d[campo], `devia haver erro em ${campo}`);
    }
  });

  it('rejeita datas impossíveis e tipos errados', async () => {
    assert.equal((await criar({ data_nascimento: '2010-02-30' })).status, 400);
    assert.equal((await criar({ nome_completo: 12345 })).status, 400);
    assert.equal((await criar({ turma_id: '1' })).status, 400);
  });

  it('rejeita corpo vazio', async () => {
    const r = await app.pedir('POST', '/api/alunos', {});
    assert.equal(r.status, 400);
    assert.ok(Object.keys(r.corpo.erro.detalhes).length >= 7);
  });

  it('rejeita JSON inválido e corpo demasiado grande', async () => {
    const invalido = await app.pedir('POST', '/api/alunos', '{nome:');
    assert.equal(invalido.status, 400);
    assert.equal(invalido.corpo.erro.codigo, 'JSON_INVALIDO');

    const grande = await app.pedir('POST', '/api/alunos', { nome_completo: 'x'.repeat(20000) });
    assert.equal(grande.status, 413);
  });

  it('não é vulnerável a injeção de SQL nos campos', async () => {
    const r = await criar({ nome_completo: "Robert'); DROP TABLE aluno;--" });
    assert.equal(r.status, 201);
    assert.equal((await app.pedir('GET', '/api/alunos')).status, 200);
  });
});

describe('API de alunos: consulta e proteção de dados', () => {
  it('a listagem não expõe encarregado nem contacto; o detalhe expõe', async () => {
    const criado = await criar();
    const lista = await app.pedir('GET', '/api/alunos');
    assert.equal(lista.corpo.length, 1);
    assert.equal(lista.corpo[0].contacto, undefined);
    assert.equal(lista.corpo[0].encarregado_educacao, undefined);
    assert.equal(lista.corpo[0].data_nascimento, undefined);

    const detalhe = await app.pedir('GET', `/api/alunos/${criado.corpo.id}`);
    assert.equal(detalhe.corpo.contacto, '923 000 000');
    assert.equal(detalhe.corpo.encarregado_educacao, 'João da Silva');
  });

  it('pesquisa por nome ou matrícula', async () => {
    await criar();
    await criar({ numero_matricula: '2025002', nome_completo: 'Pedro Santos' });

    assert.equal((await app.pedir('GET', '/api/alunos?q=maria')).corpo.length, 1);
    assert.equal((await app.pedir('GET', '/api/alunos?q=2025002')).corpo[0].nome_completo, 'Pedro Santos');
    assert.equal((await app.pedir('GET', '/api/alunos?q=2025')).corpo.length, 2);
    assert.equal((await app.pedir('GET', '/api/alunos?q=inexistente')).corpo.length, 0);
  });

  it('trata % e _ como texto normal na pesquisa', async () => {
    await criar();
    assert.equal((await app.pedir('GET', '/api/alunos?q=%25')).corpo.length, 0);
    assert.equal((await app.pedir('GET', '/api/alunos?q=_')).corpo.length, 0);
  });

  it('filtra por turma e por estado', async () => {
    const outra = await app.pedir('POST', '/api/turmas', dadosTurma(1, { nome: '9.ª B' }));
    const a1 = await criar();
    await app.pedir('POST', '/api/alunos',
      dadosAluno(outra.corpo.id, { numero_matricula: '2025002', nome_completo: 'Pedro Santos' }));
    await app.pedir('PATCH', `/api/alunos/${a1.corpo.id}/estado`, { estado: 'transferido' });

    assert.equal((await app.pedir('GET', `/api/alunos?turma_id=${outra.corpo.id}`)).corpo.length, 1);
    assert.equal((await app.pedir('GET', '/api/alunos?estado=transferido')).corpo.length, 1);
    assert.equal((await app.pedir('GET', '/api/alunos?estado=ativo')).corpo.length, 1);
    assert.equal((await app.pedir('GET', '/api/alunos?estado=xpto')).status, 400);
    assert.equal((await app.pedir('GET', '/api/alunos?turma_id=abc')).status, 400);
    assert.equal((await app.pedir('GET', '/api/alunos?q=a&q=b')).status, 400);
  });

  it('devolve 404 para aluno inexistente e 400 para id inválido', async () => {
    assert.equal((await app.pedir('GET', '/api/alunos/999')).status, 404);
    assert.equal((await app.pedir('GET', '/api/alunos/abc')).status, 400);
  });
});

describe('API de alunos: atualização e histórico', () => {
  it('atualiza os dados e permite mudar de turma', async () => {
    const outra = await app.pedir('POST', '/api/turmas', dadosTurma(1, { nome: '9.ª B' }));
    const criado = await criar();
    const r = await app.pedir('PUT', `/api/alunos/${criado.corpo.id}`,
      dadosAluno(outra.corpo.id, { nome_completo: 'Maria S. Silva' }));
    assert.equal(r.status, 200);
    assert.equal(r.corpo.nome_completo, 'Maria S. Silva');
    assert.equal(r.corpo.turma_nome, '9.ª B');
  });

  it('RN01: não permite alterar a matrícula para uma já existente', async () => {
    await criar();
    const b = await criar({ numero_matricula: '2025002', nome_completo: 'Pedro Santos' });
    const r = await app.pedir('PUT', `/api/alunos/${b.corpo.id}`,
      dadosAluno(turmaId, { numero_matricula: '2025001' }));
    assert.equal(r.status, 409);
  });

  it('PUT valida os dados e devolve 404 se o aluno não existir', async () => {
    const criado = await criar();
    assert.equal((await app.pedir('PUT', `/api/alunos/${criado.corpo.id}`, dadosAluno(turmaId, { sexo: 'Z' }))).status, 400);
    assert.equal((await app.pedir('PUT', '/api/alunos/999', dadosAluno(turmaId))).status, 404);
  });

  it('altera o estado com PATCH e rejeita estados inválidos', async () => {
    const criado = await criar();
    const url = `/api/alunos/${criado.corpo.id}/estado`;
    assert.equal((await app.pedir('PATCH', url, { estado: 'inativo' })).corpo.estado, 'inativo');
    assert.equal((await app.pedir('PATCH', url, { estado: 'expulso' })).status, 400);
    assert.equal((await app.pedir('PATCH', url, {})).status, 400);
    assert.equal((await app.pedir('PATCH', '/api/alunos/999/estado', { estado: 'ativo' })).status, 404);
  });

  it('RN07: DELETE não é permitido e o aluno mantém-se', async () => {
    const criado = await criar();
    const r = await app.pedir('DELETE', `/api/alunos/${criado.corpo.id}`);
    assert.equal(r.status, 405);
    assert.match(r.cabecalhos.get('allow'), /GET/);
    assert.equal((await app.pedir('GET', `/api/alunos/${criado.corpo.id}`)).status, 200);
  });

  it('um aluno inativo continua consultável', async () => {
    const criado = await criar();
    await app.pedir('PATCH', `/api/alunos/${criado.corpo.id}/estado`, { estado: 'inativo' });
    const r = await app.pedir('GET', `/api/alunos/${criado.corpo.id}`);
    assert.equal(r.status, 200);
    assert.equal(r.corpo.estado, 'inativo');
  });
});

describe('API: comportamento geral', () => {
  it('responde ao pedido de saúde', async () => {
    const r = await app.pedir('GET', '/api/saude');
    assert.deepEqual(r.corpo, { estado: 'ok' });
  });

  it('devolve 404 em JSON para rotas de API inexistentes', async () => {
    const r = await app.pedir('GET', '/api/nada');
    assert.equal(r.status, 404);
    assert.equal(r.corpo.erro.codigo, 'NAO_ENCONTRADO');
  });

  it('envia cabeçalhos de segurança e não identifica o Express', async () => {
    const r = await app.pedir('GET', '/api/alunos');
    assert.equal(r.cabecalhos.get('cache-control'), 'no-store');
    assert.equal(r.cabecalhos.get('x-content-type-options'), 'nosniff');
    assert.equal(r.cabecalhos.get('x-powered-by'), null);
  });

  it('serve a página de login na raiz', async () => {
    const r = await fetch(`${app.base}/`);
    assert.equal(r.status, 200);
    assert.match(await r.text(), /Caderneta Escolar/);
  });
});
