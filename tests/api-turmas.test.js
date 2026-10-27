'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { iniciar, dadosAno, dadosTurma, dadosAluno, criarTurmaBase } = require('./auxiliar');

let app;
beforeEach(async () => { app = await iniciar(); });
afterEach(async () => { await app.fechar(); });

describe('API de turmas', () => {
  it('cria uma turma e devolve o ano letivo associado (RN06)', async () => {
    const ano = await app.pedir('POST', '/api/anos-letivos', dadosAno());
    const r = await app.pedir('POST', '/api/turmas', dadosTurma(ano.corpo.id));
    assert.equal(r.status, 201);
    assert.equal(r.corpo.ano_letivo_designacao, '2025/2026');
    assert.equal(r.corpo.total_alunos, 0);
  });

  it('rejeita ano letivo inexistente ou em falta', async () => {
    const r1 = await app.pedir('POST', '/api/turmas', dadosTurma(999));
    assert.equal(r1.status, 400);
    assert.ok(r1.corpo.erro.detalhes.ano_letivo_id);

    const r2 = await app.pedir('POST', '/api/turmas', { nome: '9.ª A', classe: '9.ª classe' });
    assert.equal(r2.status, 400);
  });

  it('rejeita campos obrigatórios vazios', async () => {
    const { anoId } = await criarTurmaBase(app.pedir);
    const r = await app.pedir('POST', '/api/turmas', dadosTurma(anoId, { nome: '   ', classe: '' }));
    assert.equal(r.status, 400);
    assert.ok(r.corpo.erro.detalhes.nome);
    assert.ok(r.corpo.erro.detalhes.classe);
  });

  it('rejeita nome repetido no mesmo ano, mas aceita noutro ano', async () => {
    const { anoId } = await criarTurmaBase(app.pedir);
    const repetida = await app.pedir('POST', '/api/turmas', dadosTurma(anoId));
    assert.equal(repetida.status, 409);

    const outroAno = await app.pedir('POST', '/api/anos-letivos',
      dadosAno({ designacao: '2026/2027', data_inicio: '2026-09-01', data_fim: '2027-07-15' }));
    const ok = await app.pedir('POST', '/api/turmas', dadosTurma(outroAno.corpo.id));
    assert.equal(ok.status, 201);
  });

  it('lista e filtra por ano letivo', async () => {
    const { anoId } = await criarTurmaBase(app.pedir);
    const outroAno = await app.pedir('POST', '/api/anos-letivos',
      dadosAno({ designacao: '2026/2027', data_inicio: '2026-09-01', data_fim: '2027-07-15' }));
    await app.pedir('POST', '/api/turmas', dadosTurma(outroAno.corpo.id, { nome: '10.ª B' }));

    assert.equal((await app.pedir('GET', '/api/turmas')).corpo.length, 2);
    const filtrada = await app.pedir('GET', `/api/turmas?ano_letivo_id=${anoId}`);
    assert.equal(filtrada.corpo.length, 1);
    assert.equal(filtrada.corpo[0].nome, '9.ª A');
    assert.equal((await app.pedir('GET', '/api/turmas?ano_letivo_id=abc')).status, 400);
  });

  it('obtém uma turma e devolve 404 se não existir', async () => {
    const { turmaId } = await criarTurmaBase(app.pedir);
    assert.equal((await app.pedir('GET', `/api/turmas/${turmaId}`)).status, 200);
    assert.equal((await app.pedir('GET', '/api/turmas/999')).status, 404);
  });

  it('atualiza nome e classe, mas não o ano letivo', async () => {
    const { anoId, turmaId } = await criarTurmaBase(app.pedir);
    const r = await app.pedir('PUT', `/api/turmas/${turmaId}`,
      { nome: '9.ª B', classe: '9.ª classe', ano_letivo_id: 999 });
    assert.equal(r.status, 200);
    assert.equal(r.corpo.nome, '9.ª B');
    assert.equal(r.corpo.ano_letivo_id, anoId);
  });

  it('elimina uma turma vazia', async () => {
    const { turmaId } = await criarTurmaBase(app.pedir);
    assert.equal((await app.pedir('DELETE', `/api/turmas/${turmaId}`)).status, 204);
    assert.equal((await app.pedir('GET', `/api/turmas/${turmaId}`)).status, 404);
  });

  it('não elimina uma turma com alunos (409) e o aluno mantém-se', async () => {
    const { turmaId } = await criarTurmaBase(app.pedir);
    const aluno = await app.pedir('POST', '/api/alunos', dadosAluno(turmaId));

    assert.equal((await app.pedir('DELETE', `/api/turmas/${turmaId}`)).status, 409);
    assert.equal((await app.pedir('GET', `/api/alunos/${aluno.corpo.id}`)).status, 200);
    assert.equal((await app.pedir('GET', `/api/turmas/${turmaId}`)).corpo.total_alunos, 1);
  });
});
