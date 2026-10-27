'use strict';

const { Router } = require('express');
const { exigirPerfil } = require('../autenticacao');
const { erroNaoEncontrado } = require('../erros');

function rotasPortalAluno(db) {
  const router = Router();
  router.use(exigirPerfil('aluno'));

  const obterEstado = db.prepare(`
    SELECT a.id, a.numero_matricula, a.nome_completo, a.estado,
           COALESCE((SELECT o.situacao_disciplinar FROM ocorrencia o WHERE o.aluno_id=a.id ORDER BY o.data DESC, o.id DESC LIMIT 1), 'regular') AS situacao_disciplinar,
           (SELECT COUNT(*) FROM ocorrencia o WHERE o.aluno_id=a.id) AS total_ocorrencias,
           t.nome AS turma_nome, t.classe AS turma_classe,
           al.designacao AS ano_letivo
      FROM aluno a
      JOIN turma t ON t.id = a.turma_id
      JOIN ano_letivo al ON al.id = t.ano_letivo_id
     WHERE a.id = ?`);

  const ocorrencias = db.prepare(`SELECT id, tipo, descricao, data, gravidade, situacao_disciplinar, medida_aplicada, observacoes FROM ocorrencia WHERE aluno_id=? ORDER BY data DESC, id DESC`);
  const reunioes = db.prepare(`SELECT r.id, r.data, r.hora, r.motivo, r.estado, r.criada_em, o.tipo AS ocorrencia_tipo, o.data AS ocorrencia_data, u.nome AS marcado_por FROM reuniao r JOIN ocorrencia o ON o.id=r.ocorrencia_id JOIN utilizador u ON u.id=r.utilizador_id WHERE o.aluno_id=? ORDER BY r.data DESC, r.hora DESC, r.id DESC`);

  router.get('/', (req, res) => {
    const aluno = obterEstado.get(req.utilizador.aluno_id);
    if (!aluno) throw erroNaoEncontrado('O registo de aluno associado à conta não existe.');
    res.set('Cache-Control', 'no-store');
    res.json({ ...aluno, ocorrencias: ocorrencias.all(aluno.id), reunioes: reunioes.all(aluno.id) });
  });

  return router;
}

module.exports = { rotasPortalAluno };
