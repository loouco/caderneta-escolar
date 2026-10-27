'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { iniciar, dadosAluno, dadosOcorrencia, criarTurmaBase, criarUtilizador } = require('./auxiliar');

let app;
let turmaId;
let utilizadorId;
let alunoId;
beforeEach(async () => {
  app = await iniciar();
  ({ turmaId } = await criarTurmaBase(app.pedir));
  utilizadorId = app.utilizadorId;
  alunoId = (await app.pedir('POST', '/api/alunos', dadosAluno(turmaId))).corpo.id;
});
afterEach(async () => { await app.fechar(); });

const registar = (o, id = alunoId) => app.pedir('POST', `/api/alunos/${id}/ocorrencias`, dadosOcorrencia(utilizadorId, o));

describe('API de ocorrências: registo e validação', () => {
  it('regista uma ocorrência com aluno e responsável identificados (RN02)', async () => {
    const r = await registar();
    assert.equal(r.status, 201);
    assert.equal(r.corpo.aluno_id, alunoId);
    assert.equal(r.corpo.aluno_nome, 'Maria da Silva');
    assert.equal(r.corpo.utilizador_id, utilizadorId);
    assert.equal(r.corpo.utilizador_nome, 'Ana Coordenadora');
    assert.equal(r.corpo.gravidade, 'leve');
  });

  it('RN04: tipo, descrição e data são obrigatórios', async () => {
    const r = await registar({ tipo: '  ', descricao: undefined, data: undefined });
    assert.equal(r.status, 400);
    for (const campo of ['tipo', 'descricao', 'data']) assert.ok(r.corpo.erro.detalhes[campo], campo);
  });

  it('RN05: a gravidade só aceita valores predefinidos', async () => {
    for (const g of ['leve', 'moderada', 'grave', 'muito_grave']) {
      assert.equal((await registar({ gravidade: g })).status, 201, g);
    }
    assert.equal((await registar({ gravidade: 'critica' })).status, 400);
    assert.equal((await registar({ gravidade: undefined })).status, 400);
  });

  it('rejeita datas futuras, impossíveis e mal formatadas', async () => {
    assert.equal((await registar({ data: '2999-01-01' })).status, 400);
    assert.equal((await registar({ data: '2025-02-30' })).status, 400);
    assert.equal((await registar({ data: '10/10/2025' })).status, 400);
  });

  it('medida aplicada e observações são opcionais e vazio fica a null', async () => {
    const r = await registar({ medida_aplicada: undefined, observacoes: '   ' });
    assert.equal(r.status, 201);
    assert.equal(r.corpo.medida_aplicada, null);
    assert.equal(r.corpo.observacoes, null);
  });

  it('RN02: o responsável é a sessão e não pode ser forjado pelo pedido', async () => {
    const forjado = criarUtilizador(app.db, { email: 'forjado@escola.ao' });
    const r = await registar({ utilizador_id: forjado });
    assert.equal(r.status, 201);
    assert.equal(r.corpo.utilizador_id, app.utilizadorId);
  });

  it('devolve 404 para aluno inexistente e 400 para id inválido', async () => {
    assert.equal((await registar({}, 999)).status, 404);
    assert.equal((await registar({}, 'abc')).status, 400);
  });

  it('impõe limites de tamanho e tipos corretos', async () => {
    assert.equal((await registar({ tipo: 'x'.repeat(61) })).status, 400);
    assert.equal((await registar({ descricao: 'x'.repeat(2001) })).status, 400);
    assert.equal((await registar({ descricao: 123 })).status, 400);
  });
});

describe('API de ocorrências: histórico e consulta', () => {
  it('RN03: o histórico de um aluno lista várias ocorrências, da mais recente para a mais antiga', async () => {
    await registar({ data: '2025-09-20', tipo: 'Atraso' });
    await registar({ data: '2025-11-05', tipo: 'Agressão' });
    await registar({ data: '2025-10-10', tipo: 'Falta de material' });
    const r = await app.pedir('GET', `/api/alunos/${alunoId}/ocorrencias`);
    assert.equal(r.status, 200);
    assert.deepEqual(r.corpo.map((o) => o.tipo), ['Agressão', 'Falta de material', 'Atraso']);
  });

  it('o histórico só inclui as ocorrências desse aluno', async () => {
    const outro = (await app.pedir('POST', '/api/alunos', dadosAluno(turmaId, { numero_matricula: '2025002' }))).corpo.id;
    await registar();
    await registar({}, outro);
    await registar({}, outro);
    assert.equal((await app.pedir('GET', `/api/alunos/${alunoId}/ocorrencias`)).corpo.length, 1);
    assert.equal((await app.pedir('GET', `/api/alunos/${outro}/ocorrencias`)).corpo.length, 2);
  });

  it('filtra o histórico por gravidade e por período', async () => {
    await registar({ data: '2025-09-01', gravidade: 'leve' });
    await registar({ data: '2025-10-01', gravidade: 'grave' });
    await registar({ data: '2025-11-01', gravidade: 'grave' });
    const base = `/api/alunos/${alunoId}/ocorrencias`;
    assert.equal((await app.pedir('GET', `${base}?gravidade=grave`)).corpo.length, 2);
    assert.equal((await app.pedir('GET', `${base}?de=2025-10-15`)).corpo.length, 1);
    assert.equal((await app.pedir('GET', `${base}?de=2025-09-15&ate=2025-10-15`)).corpo.length, 1);
    assert.equal((await app.pedir('GET', `${base}?gravidade=x`)).status, 400);
    assert.equal((await app.pedir('GET', `${base}?de=2025-12-01&ate=2025-01-01`)).status, 400);
  });

  it('histórico de aluno inexistente dá 404', async () => {
    assert.equal((await app.pedir('GET', '/api/alunos/999/ocorrencias')).status, 404);
  });

  it('a consulta global lista e filtra por aluno', async () => {
    const outro = (await app.pedir('POST', '/api/alunos', dadosAluno(turmaId, { numero_matricula: '2025002' }))).corpo.id;
    await registar();
    await registar({}, outro);
    assert.equal((await app.pedir('GET', '/api/ocorrencias')).corpo.length, 2);
    assert.equal((await app.pedir('GET', `/api/ocorrencias?aluno_id=${outro}`)).corpo.length, 1);
    assert.equal((await app.pedir('GET', '/api/ocorrencias?aluno_id=abc')).status, 400);
  });

  it('obtém o detalhe de uma ocorrência e devolve 404 se não existir', async () => {
    const id = (await registar()).corpo.id;
    const r = await app.pedir('GET', `/api/ocorrencias/${id}`);
    assert.equal(r.status, 200);
    assert.equal(r.corpo.descricao, 'Perturbou a aula repetidamente.');
    assert.equal((await app.pedir('GET', '/api/ocorrencias/999')).status, 404);
  });

  it('a listagem de alunos indica o total de ocorrências', async () => {
    await registar();
    await registar();
    const r = await app.pedir('GET', '/api/alunos');
    assert.equal(r.corpo[0].total_ocorrencias, 2);
  });
});

describe('API de ocorrências: correção e preservação do histórico', () => {
  it('corrige o conteúdo mas nunca o aluno nem o responsável', async () => {
    const id = (await registar()).corpo.id;
    const outroUtil = criarUtilizador(app.db, { nome: 'Outro', email: 'outro@escola.ao' });
    const r = await app.pedir('PUT', `/api/ocorrencias/${id}`, {
      ...dadosOcorrencia(outroUtil, { gravidade: 'grave', observacoes: 'Encarregado informado.' }),
      aluno_id: 999,
    });
    assert.equal(r.status, 200);
    assert.equal(r.corpo.gravidade, 'grave');
    assert.equal(r.corpo.observacoes, 'Encarregado informado.');
    assert.equal(r.corpo.aluno_id, alunoId);
    assert.equal(r.corpo.utilizador_id, utilizadorId);
  });

  it('a correção valida os dados e dá 404 se a ocorrência não existir', async () => {
    const id = (await registar()).corpo.id;
    assert.equal((await app.pedir('PUT', `/api/ocorrencias/${id}`, dadosOcorrencia(utilizadorId, { gravidade: 'x' }))).status, 400);
    assert.equal((await app.pedir('PUT', '/api/ocorrencias/999', dadosOcorrencia(utilizadorId))).status, 404);
  });

  it('DELETE não é permitido (405) e a ocorrência continua a existir', async () => {
    const id = (await registar()).corpo.id;
    const r = await app.pedir('DELETE', `/api/ocorrencias/${id}`);
    assert.equal(r.status, 405);
    assert.equal((await app.pedir('GET', `/api/ocorrencias/${id}`)).status, 200);
  });

  it('RN07: um aluno com ocorrências passa a inativo e o histórico mantém-se', async () => {
    await registar();
    const e = await app.pedir('PATCH', `/api/alunos/${alunoId}/estado`, { estado: 'inativo' });
    assert.equal(e.status, 200);
    assert.equal((await app.pedir('GET', `/api/alunos/${alunoId}/ocorrencias`)).corpo.length, 1);
  });

  it('a base de dados impede apagar um aluno com ocorrências (ON DELETE RESTRICT)', async () => {
    await registar();
    assert.throws(() => app.db.prepare('DELETE FROM aluno WHERE id = ?').run(alunoId), /FOREIGN KEY/);
  });
});

describe('API de utilizadores', () => {
  it('reserva a gestão de utilizadores aos administradores', async () => {
    const coordenadorId = Number(app.db.prepare(`
      INSERT INTO utilizador (nome, email, palavra_passe_hash, perfil)
      VALUES ('Coordenador', 'coord@escola.ao', 'hash', 'coordenador')`).run().lastInsertRowid);
    const r = await app.pedirComo('GET', '/api/utilizadores', undefined, app.criarSessao(coordenadorId));
    assert.equal(r.status, 403);
  });
});
