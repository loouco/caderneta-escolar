'use strict';

const path = require('node:path');
const express = require('express');
const { erroNaoEncontrado, tratarErros } = require('./erros');
const { rotasAnosLetivos } = require('./rotas/anos-letivos');
const { rotasTurmas } = require('./rotas/turmas');
const { rotasAlunos } = require('./rotas/alunos');

const PASTA_FRONTEND = path.join(__dirname, '..', 'frontend');

/** Cria a aplicação Express. Recebe a base de dados para poder usar uma base em memória nos testes. */
function criarApp(db) {
  const app = express();
  app.disable('x-powered-by');

  app.use((req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('X-Frame-Options', 'DENY');
    next();
  });

  // API: JSON limitado em tamanho e nunca guardado em cache (contém dados pessoais).
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  app.use('/api', express.json({ limit: '10kb' }));

  app.get('/api/saude', (req, res) => res.json({ estado: 'ok' }));
  app.use('/api/anos-letivos', rotasAnosLetivos(db));
  app.use('/api/turmas', rotasTurmas(db));
  app.use('/api/alunos', rotasAlunos(db));
  app.use('/api', (req, res, next) => next(erroNaoEncontrado('Recurso não encontrado.')));

  app.use(express.static(PASTA_FRONTEND, { index: 'login.html' }));

  app.use(tratarErros);
  return app;
}

module.exports = { criarApp };
