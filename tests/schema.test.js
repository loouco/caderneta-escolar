'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { abrirBase } = require('../database/db');

let db;

beforeEach(() => { db = abrirBase(':memory:'); });
afterEach(() => { db.close(); });

// ---------- Funções auxiliares (inserem dados válidos) ----------

function criarAnoLetivo(o = {}) {
  const d = { designacao: '2025/2026', data_inicio: '2025-09-01', data_fim: '2026-07-15', estado: 'ativo', ...o };
  return db.prepare(
    'INSERT INTO ano_letivo (designacao, data_inicio, data_fim, estado) VALUES (@designacao, @data_inicio, @data_fim, @estado)'
  ).run(d).lastInsertRowid;
}

function criarTurma(anoId, o = {}) {
  const d = { nome: '9.ª A', classe: '9.ª classe', ano_letivo_id: anoId, ...o };
  return db.prepare(
    'INSERT INTO turma (nome, classe, ano_letivo_id) VALUES (@nome, @classe, @ano_letivo_id)'
  ).run(d).lastInsertRowid;
}

function criarAluno(turmaId, o = {}) {
  const d = {
    numero_matricula: '2025001', nome_completo: 'Maria da Silva', data_nascimento: '2010-03-15',
    sexo: 'F', encarregado_educacao: 'João da Silva', contacto: '923000000', turma_id: turmaId, ...o,
  };
  return db.prepare(
    `INSERT INTO aluno (numero_matricula, nome_completo, data_nascimento, sexo, encarregado_educacao, contacto, turma_id)
     VALUES (@numero_matricula, @nome_completo, @data_nascimento, @sexo, @encarregado_educacao, @contacto, @turma_id)`
  ).run(d).lastInsertRowid;
}

function criarUtilizador(o = {}) {
  const d = { nome: 'Ana Coordenadora', email: 'ana@escola.ao', palavra_passe_hash: 'hash-de-teste', perfil: 'coordenador', ...o };
  return db.prepare(
    'INSERT INTO utilizador (nome, email, palavra_passe_hash, perfil) VALUES (@nome, @email, @palavra_passe_hash, @perfil)'
  ).run(d).lastInsertRowid;
}

function criarOcorrencia(alunoId, utilizadorId, o = {}) {
  const d = {
    aluno_id: alunoId, utilizador_id: utilizadorId, tipo: 'Indisciplina', descricao: 'Perturbou a aula.',
    data: '2025-10-10', gravidade: 'leve', medida_aplicada: null, observacoes: null, ...o,
  };
  return db.prepare(
    `INSERT INTO ocorrencia (aluno_id, utilizador_id, tipo, descricao, data, gravidade, medida_aplicada, observacoes)
     VALUES (@aluno_id, @utilizador_id, @tipo, @descricao, @data, @gravidade, @medida_aplicada, @observacoes)`
  ).run(d).lastInsertRowid;
}

/** Cria a cadeia completa ano → turma → aluno + utilizador. */
function cenarioBase() {
  const anoId = criarAnoLetivo();
  const turmaId = criarTurma(anoId);
  const alunoId = criarAluno(turmaId);
  const utilizadorId = criarUtilizador();
  return { anoId, turmaId, alunoId, utilizadorId };
}

const CONSTRAINT = /constraint failed/i;

// ---------- Estrutura ----------

describe('Estrutura da base de dados', () => {
  it('cria as cinco tabelas', () => {
    const tabelas = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
      .all().map((t) => t.name);
    assert.deepEqual(tabelas, ['aluno', 'ano_letivo', 'ocorrencia', 'turma', 'utilizador']);
  });

  it('tem as chaves estrangeiras activas', () => {
    assert.equal(db.pragma('foreign_keys', { simple: true }), 1);
  });

  it('aplicar o esquema duas vezes não dá erro (idempotente)', () => {
    const fs = require('node:fs');
    const { CAMINHO_ESQUEMA } = require('../database/db');
    assert.doesNotThrow(() => db.exec(fs.readFileSync(CAMINHO_ESQUEMA, 'utf8')));
  });
});

// ---------- AnoLetivo ----------

describe('AnoLetivo', () => {
  it('aceita um registo válido', () => {
    assert.ok(criarAnoLetivo());
  });

  it('RN12: rejeita data_fim igual ou anterior a data_inicio', () => {
    assert.throws(() => criarAnoLetivo({ data_fim: '2025-09-01' }), CONSTRAINT);
    assert.throws(() => criarAnoLetivo({ data_fim: '2025-01-01' }), CONSTRAINT);
  });

  it('rejeita designação duplicada', () => {
    criarAnoLetivo();
    assert.throws(() => criarAnoLetivo(), CONSTRAINT);
  });

  it('rejeita estado inválido', () => {
    assert.throws(() => criarAnoLetivo({ estado: 'qualquer' }), CONSTRAINT);
  });

  it('rejeita datas que não estão em formato ISO', () => {
    assert.throws(() => criarAnoLetivo({ data_inicio: '01/09/2025' }), CONSTRAINT);
    assert.throws(() => criarAnoLetivo({ data_inicio: '2025-02-30' }), CONSTRAINT);
  });
});

// ---------- Turma ----------

describe('Turma', () => {
  it('RN06: exige um ano letivo existente', () => {
    assert.throws(() => criarTurma(999), CONSTRAINT);
  });

  it('rejeita nome repetido no mesmo ano letivo', () => {
    const anoId = criarAnoLetivo();
    criarTurma(anoId);
    assert.throws(() => criarTurma(anoId), CONSTRAINT);
  });

  it('permite o mesmo nome em anos letivos diferentes', () => {
    const ano1 = criarAnoLetivo();
    const ano2 = criarAnoLetivo({ designacao: '2026/2027', data_inicio: '2026-09-01', data_fim: '2027-07-15' });
    criarTurma(ano1);
    assert.ok(criarTurma(ano2));
  });

  it('rejeita nome vazio ou só com espaços', () => {
    const anoId = criarAnoLetivo();
    assert.throws(() => criarTurma(anoId, { nome: '   ' }), CONSTRAINT);
  });

  it('não permite eliminar um ano letivo com turmas', () => {
    const anoId = criarAnoLetivo();
    criarTurma(anoId);
    assert.throws(() => db.prepare('DELETE FROM ano_letivo WHERE id = ?').run(anoId), CONSTRAINT);
  });
});

// ---------- Aluno ----------

describe('Aluno', () => {
  let turmaId;
  beforeEach(() => { turmaId = criarTurma(criarAnoLetivo()); });

  it('aceita um registo válido, com estado "ativo" e data de criação automáticos', () => {
    const id = criarAluno(turmaId);
    const aluno = db.prepare('SELECT * FROM aluno WHERE id = ?').get(id);
    assert.equal(aluno.estado, 'ativo');
    assert.ok(aluno.criado_em);
  });

  it('RN01: rejeita número de matrícula duplicado', () => {
    criarAluno(turmaId);
    assert.throws(() => criarAluno(turmaId, { nome_completo: 'Outro Aluno' }), CONSTRAINT);
  });

  it('exige uma turma existente', () => {
    assert.throws(() => criarAluno(999), CONSTRAINT);
  });

  it('rejeita sexo inválido', () => {
    assert.throws(() => criarAluno(turmaId, { sexo: 'X' }), CONSTRAINT);
  });

  it('rejeita estado inválido', () => {
    const id = criarAluno(turmaId);
    assert.throws(() => db.prepare("UPDATE aluno SET estado = 'expulso' WHERE id = ?").run(id), CONSTRAINT);
  });

  it('aceita todos os estados previstos', () => {
    const id = criarAluno(turmaId);
    for (const estado of ['ativo', 'inativo', 'transferido', 'concluido']) {
      assert.doesNotThrow(() => db.prepare('UPDATE aluno SET estado = ? WHERE id = ?').run(estado, id));
    }
  });

  it('rejeita campos obrigatórios vazios', () => {
    assert.throws(() => criarAluno(turmaId, { nome_completo: '' }), CONSTRAINT);
    assert.throws(() => criarAluno(turmaId, { encarregado_educacao: '  ' }), CONSTRAINT);
    assert.throws(() => criarAluno(turmaId, { contacto: '' }), CONSTRAINT);
  });

  it('rejeita data de nascimento inválida', () => {
    assert.throws(() => criarAluno(turmaId, { data_nascimento: 'ontem' }), CONSTRAINT);
  });

  it('não permite eliminar uma turma com alunos', () => {
    criarAluno(turmaId);
    assert.throws(() => db.prepare('DELETE FROM turma WHERE id = ?').run(turmaId), CONSTRAINT);
  });
});

// ---------- Utilizador ----------

describe('Utilizador', () => {
  it('aceita perfis coordenador e administrador', () => {
    assert.ok(criarUtilizador({ email: 'a@escola.ao', perfil: 'coordenador' }));
    assert.ok(criarUtilizador({ email: 'b@escola.ao', perfil: 'administrador' }));
  });

  it('rejeita perfil inválido', () => {
    assert.throws(() => criarUtilizador({ perfil: 'professor' }), CONSTRAINT);
  });

  it('RN11: rejeita email duplicado, ignorando maiúsculas', () => {
    criarUtilizador({ email: 'ana@escola.ao' });
    assert.throws(() => criarUtilizador({ email: 'ANA@escola.ao' }), CONSTRAINT);
  });

  it('o estado por omissão é "ativo"', () => {
    const id = criarUtilizador();
    assert.equal(db.prepare('SELECT estado FROM utilizador WHERE id = ?').get(id).estado, 'ativo');
  });

  it('rejeita estado inválido', () => {
    const id = criarUtilizador();
    assert.throws(() => db.prepare("UPDATE utilizador SET estado = 'x' WHERE id = ?").run(id), CONSTRAINT);
  });

  it('rejeita hash vazio', () => {
    assert.throws(() => criarUtilizador({ palavra_passe_hash: '' }), CONSTRAINT);
  });
});

// ---------- Ocorrência ----------

describe('Ocorrência', () => {
  let c;
  beforeEach(() => { c = cenarioBase(); });

  it('aceita um registo válido; medida e observações são opcionais', () => {
    const id = criarOcorrencia(c.alunoId, c.utilizadorId);
    const o = db.prepare('SELECT * FROM ocorrencia WHERE id = ?').get(id);
    assert.equal(o.medida_aplicada, null);
    assert.equal(o.observacoes, null);
  });

  it('RN02: exige aluno existente', () => {
    assert.throws(() => criarOcorrencia(999, c.utilizadorId), CONSTRAINT);
  });

  it('RN02: exige utilizador responsável existente', () => {
    assert.throws(() => criarOcorrencia(c.alunoId, 999), CONSTRAINT);
  });

  it('RN03: um aluno pode ter várias ocorrências', () => {
    criarOcorrencia(c.alunoId, c.utilizadorId, { data: '2025-10-10' });
    criarOcorrencia(c.alunoId, c.utilizadorId, { data: '2025-11-05', gravidade: 'grave' });
    const { total } = db.prepare('SELECT COUNT(*) AS total FROM ocorrencia WHERE aluno_id = ?').get(c.alunoId);
    assert.equal(total, 2);
  });

  it('RN04: tipo, descrição e data são obrigatórios', () => {
    assert.throws(() => criarOcorrencia(c.alunoId, c.utilizadorId, { tipo: null }), CONSTRAINT);
    assert.throws(() => criarOcorrencia(c.alunoId, c.utilizadorId, { tipo: '  ' }), CONSTRAINT);
    assert.throws(() => criarOcorrencia(c.alunoId, c.utilizadorId, { descricao: null }), CONSTRAINT);
    assert.throws(() => criarOcorrencia(c.alunoId, c.utilizadorId, { descricao: '' }), CONSTRAINT);
    assert.throws(() => criarOcorrencia(c.alunoId, c.utilizadorId, { data: null }), CONSTRAINT);
    assert.throws(() => criarOcorrencia(c.alunoId, c.utilizadorId, { data: '10-10-2025' }), CONSTRAINT);
  });

  it('RN05: aceita as quatro gravidades e rejeita as restantes', () => {
    for (const gravidade of ['leve', 'moderada', 'grave', 'muito_grave']) {
      assert.ok(criarOcorrencia(c.alunoId, c.utilizadorId, { gravidade }));
    }
    assert.throws(() => criarOcorrencia(c.alunoId, c.utilizadorId, { gravidade: 'critica' }), CONSTRAINT);
    assert.throws(() => criarOcorrencia(c.alunoId, c.utilizadorId, { gravidade: null }), CONSTRAINT);
  });
});

// ---------- Preservação do histórico ----------

describe('Preservação do histórico (RN07)', () => {
  it('não permite eliminar um aluno com ocorrências e os registos ficam intactos', () => {
    const c = cenarioBase();
    criarOcorrencia(c.alunoId, c.utilizadorId);

    assert.throws(() => db.prepare('DELETE FROM aluno WHERE id = ?').run(c.alunoId), CONSTRAINT);

    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM aluno').get().n, 1);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM ocorrencia').get().n, 1);
  });

  it('não permite eliminar um utilizador que registou ocorrências', () => {
    const c = cenarioBase();
    criarOcorrencia(c.alunoId, c.utilizadorId);
    assert.throws(() => db.prepare('DELETE FROM utilizador WHERE id = ?').run(c.utilizadorId), CONSTRAINT);
  });

  it('inactivar o aluno preserva o histórico de ocorrências', () => {
    const c = cenarioBase();
    criarOcorrencia(c.alunoId, c.utilizadorId);
    db.prepare("UPDATE aluno SET estado = 'inativo' WHERE id = ?").run(c.alunoId);

    const historico = db.prepare('SELECT * FROM ocorrencia WHERE aluno_id = ?').all(c.alunoId);
    assert.equal(historico.length, 1);
  });
});
