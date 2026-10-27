'use strict';

const { Router } = require('express');
const { Validador, lerId } = require('../validacao');
const { erroNaoEncontrado } = require('../erros');

const ESTADOS = ['planeado', 'ativo', 'encerrado'];

function validarAnoLetivo(corpo, { criar }) {
  const v = new Validador(corpo);
  v.texto('designacao', { max: 20 });
  v.data('data_inicio');
  v.data('data_fim');
  v.opcao('estado', ESTADOS, criar ? { padrao: 'planeado' } : {});
  const { data_inicio: inicio, data_fim: fim } = v.dados;
  if (inicio && fim && fim <= inicio) v.erro('data_fim', 'Deve ser posterior à data de início.'); // RN12
  return v.concluir();
}

function rotasAnosLetivos(db) {
  const router = Router();

  const listar = db.prepare('SELECT * FROM ano_letivo ORDER BY data_inicio DESC');
  const obter = db.prepare('SELECT * FROM ano_letivo WHERE id = ?');
  const inserir = db.prepare(
    `INSERT INTO ano_letivo (designacao, data_inicio, data_fim, estado)
     VALUES (@designacao, @data_inicio, @data_fim, @estado)`
  );
  const atualizar = db.prepare(
    `UPDATE ano_letivo
        SET designacao = @designacao, data_inicio = @data_inicio, data_fim = @data_fim, estado = @estado
      WHERE id = @id`
  );

  function obterOu404(id) {
    const ano = obter.get(id);
    if (!ano) throw erroNaoEncontrado('Ano letivo não encontrado.');
    return ano;
  }

  router.get('/', (req, res) => res.json(listar.all()));

  router.get('/:id', (req, res) => res.json(obterOu404(lerId(req.params.id))));

  router.post('/', (req, res) => {
    const dados = validarAnoLetivo(req.body, { criar: true });
    const { lastInsertRowid } = inserir.run(dados);
    res.status(201).json(obter.get(lastInsertRowid));
  });

  router.put('/:id', (req, res) => {
    const id = lerId(req.params.id);
    obterOu404(id);
    atualizar.run({ ...validarAnoLetivo(req.body, { criar: false }), id });
    res.json(obter.get(id));
  });

  return router;
}

module.exports = { rotasAnosLetivos };
