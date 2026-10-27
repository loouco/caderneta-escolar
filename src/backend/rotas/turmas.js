'use strict';

const { Router } = require('express');
const { Validador, lerId } = require('../validacao');
const { erroNaoEncontrado, erroConflito, erroValidacao } = require('../erros');

const SELECT_TURMA = `
  SELECT t.id, t.nome, t.classe, t.ano_letivo_id,
         a.designacao AS ano_letivo_designacao,
         (SELECT COUNT(*) FROM aluno WHERE turma_id = t.id) AS total_alunos
    FROM turma t
    JOIN ano_letivo a ON a.id = t.ano_letivo_id`;

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
  const inserir = db.prepare('INSERT INTO turma (nome, classe, ano_letivo_id) VALUES (@nome, @classe, @ano_letivo_id)');
  const atualizar = db.prepare('UPDATE turma SET nome = @nome, classe = @classe WHERE id = @id');
  const eliminar = db.prepare('DELETE FROM turma WHERE id = ?');

  function obterOu404(id) {
    const turma = obter.get(id);
    if (!turma) throw erroNaoEncontrado('Turma não encontrada.');
    return turma;
  }

  router.get('/', (req, res) => {
    const { ano_letivo_id: ano } = req.query;
    res.json(listar.all({ ano_letivo_id: ano === undefined ? null : lerId(ano, 'ano_letivo_id') }));
  });

  router.get('/:id', (req, res) => res.json(obterOu404(lerId(req.params.id))));

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
    eliminar.run(id);
    res.status(204).end();
  });

  return router;
}

module.exports = { rotasTurmas };
