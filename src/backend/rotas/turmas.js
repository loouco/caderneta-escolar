'use strict';

const { Router } = require('express');
const { Validador, lerId } = require('../validacao');
const { erroNaoEncontrado, erroConflito, erroValidacao } = require('../erros');
const { exigirPerfil } = require('../autenticacao');

const SELECT_TURMA = `
  SELECT t.id, t.nome, t.classe, t.ano_letivo_id,
         a.designacao AS ano_letivo_designacao,
         u.id AS professor_id, u.nome AS professor_nome,
         (SELECT COUNT(*) FROM aluno WHERE turma_id = t.id) AS total_alunos,
         (SELECT COUNT(*) FROM transferencia_turma WHERE turma_origem_id = t.id OR turma_destino_id = t.id) AS total_transferencias
    FROM turma t
    JOIN ano_letivo a ON a.id = t.ano_letivo_id
    LEFT JOIN turma_professor tp ON tp.turma_id = t.id
    LEFT JOIN utilizador u ON u.id = tp.professor_id`;

/** O ano letivo só é indicado na criação: uma turma não muda de ano (a "9.ª A" do ano seguinte é outra turma). */
function validarTurma(corpo, { criar }) {
  const v = new Validador(corpo);
  v.texto('nome', { max: 50 });
  v.texto('classe', { max: 50 });
  if (criar) v.inteiroPositivo('ano_letivo_id');
  return v.concluir();
}

function rotasTurmas(db) {
  const router = Router();

  const listar = db.prepare(
    `${SELECT_TURMA}
      WHERE (@ano_letivo_id IS NULL OR t.ano_letivo_id = @ano_letivo_id)
      ORDER BY a.data_inicio DESC, t.classe, t.nome`
  );
  const obter = db.prepare(`${SELECT_TURMA} WHERE t.id = ?`);
  const anoExiste = db.prepare('SELECT 1 FROM ano_letivo WHERE id = ?');
  const contarAlunos = db.prepare('SELECT COUNT(*) AS total FROM aluno WHERE turma_id = ?');
  const contarTransferencias = db.prepare('SELECT COUNT(*) AS total FROM transferencia_turma WHERE turma_origem_id = ? OR turma_destino_id = ?');
  const inserir = db.prepare('INSERT INTO turma (nome, classe, ano_letivo_id) VALUES (@nome, @classe, @ano_letivo_id)');
  const atualizar = db.prepare('UPDATE turma SET nome = @nome, classe = @classe WHERE id = @id');
  const eliminar = db.prepare('DELETE FROM turma WHERE id = ?');
  const atribuir = db.prepare(`INSERT INTO turma_professor (turma_id, professor_id) VALUES (?, ?)
    ON CONFLICT(turma_id) DO UPDATE SET professor_id = excluded.professor_id, atribuido_em = CURRENT_TIMESTAMP`);
  const retirar = db.prepare('DELETE FROM turma_professor WHERE turma_id = ?');

  function obterOu404(id) {
    const turma = obter.get(id);
    if (!turma) throw erroNaoEncontrado('Turma não encontrada.');
    return turma;
  }

  router.get('/professores-disponiveis', exigirPerfil('administrador'), (req, res) => {
    const turmaId = req.query.turma_id === undefined ? -1 : lerId(req.query.turma_id, 'turma_id');
    res.json(db.prepare(`SELECT u.id, u.nome, u.email FROM utilizador u
      LEFT JOIN turma_professor tp ON tp.professor_id = u.id
      WHERE u.perfil = 'professor' AND u.estado = 'ativo' AND (tp.professor_id IS NULL OR tp.turma_id = @turma_id)
      ORDER BY u.nome COLLATE NOCASE`).all({ turma_id: turmaId }));
  });

  router.get('/', (req, res) => {
    const { ano_letivo_id: ano } = req.query;
    let turmas = listar.all({ ano_letivo_id: ano === undefined ? null : lerId(ano, 'ano_letivo_id') });
    if (req.utilizador.perfil === 'professor') turmas = turmas.filter((t) => t.professor_id === req.utilizador.id);
    res.json(turmas);
  });

  router.get('/:id', (req, res) => {
    const turma = obterOu404(lerId(req.params.id));
    if (req.utilizador.perfil === 'professor' && turma.professor_id !== req.utilizador.id) throw erroNaoEncontrado('Turma não encontrada.');
    res.json(turma);
  });

  router.put('/:id/professor', (req, res) => {
    const id = lerId(req.params.id); obterOu404(id);
    const professorId = req.body?.professor_id;
    if (professorId === null || professorId === '') retirar.run(id);
    else {
      if (!Number.isSafeInteger(professorId) || professorId <= 0) throw erroValidacao({ professor_id: 'Indique um professor ativo.' });
      const professor = db.prepare("SELECT id FROM utilizador WHERE id = ? AND perfil = 'professor' AND estado = 'ativo'").get(professorId);
      if (!professor) throw erroValidacao({ professor_id: 'Só pode atribuir professores ativos.' });
      const atribuicao = db.prepare('SELECT turma_id FROM turma_professor WHERE professor_id = ?').get(professorId);
      if (atribuicao && atribuicao.turma_id !== id) throw erroConflito('Este professor já está atribuído a outra turma.');
      try { atribuir.run(id, professorId); } catch (erro) { if (String(erro.message).includes('professor_invalido')) throw erroValidacao({ professor_id: 'Só pode atribuir professores ativos.' }); throw erro; }
    }
    res.json(obter.get(id));
  });

  router.post('/', (req, res) => {
    const dados = validarTurma(req.body, { criar: true });
    if (!anoExiste.get(dados.ano_letivo_id)) {
      throw erroValidacao({ ano_letivo_id: 'O ano letivo indicado não existe.' });
    }
    const { lastInsertRowid } = inserir.run(dados);
    res.status(201).json(obter.get(lastInsertRowid));
  });

  router.put('/:id', (req, res) => {
    const id = lerId(req.params.id);
    obterOu404(id);
    atualizar.run({ ...validarTurma(req.body, { criar: false }), id });
    res.json(obter.get(id));
  });

  router.delete('/:id', (req, res) => {
    const id = lerId(req.params.id);
    obterOu404(id);
    if (contarAlunos.get(id).total > 0) {
      throw erroConflito('Não é possível eliminar uma turma que tem alunos.');
    }
    if (contarTransferencias.get(id, id).total > 0) throw erroConflito('Não é possível eliminar uma turma que consta no histórico de transferências.');
    eliminar.run(id);
    res.status(204).end();
  });

  return router;
}

module.exports = { rotasTurmas };
