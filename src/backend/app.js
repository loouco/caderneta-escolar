'use strict';

const path = require('node:path');
const express = require('express');
const { erroNaoEncontrado, tratarErros } = require('./erros');
const { rotasAnosLetivos } = require('./rotas/anos-letivos');
const { rotasTurmas } = require('./rotas/turmas');
const { rotasAlunos } = require('./rotas/alunos');
const { rotasOcorrencias } = require('./rotas/ocorrencias');
const { rotasUtilizadores } = require('./rotas/utilizadores');
const { rotasPortalAluno } = require('./rotas/portal-aluno');
const {
  criarRotasAutenticacao,
  exigirAutenticacao,
  exigirPerfil,
  exigirSessaoPagina,
} = require('./autenticacao');

const PASTA_FRONTEND = path.join(__dirname, '..', 'frontend');
const apenasAdministrador = exigirPerfil('administrador');
const leituraEscolar = exigirPerfil('administrador', 'professor', 'coordenador');

function escritasApenasAdministrador(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  return apenasAdministrador(req, res, next);
}

function impedirAcessoAluno(req, res, next) {
  if (req.utilizador.perfil !== 'aluno' ||
      req.path === '/auth/sessao' ||
      req.path === '/auth/sair' ||
      req.path === '/auth/palavra-passe' ||
      req.path.startsWith('/portal-aluno')) return next();
  return res.status(403).json({
    erro: { codigo: 'SEM_PERMISSAO', mensagem: 'A sua conta só pode consultar o portal do aluno.' },
  });
}

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
  app.use('/api/auth', criarRotasAutenticacao(db));
  app.use('/api', exigirAutenticacao(db), impedirAcessoAluno);
  app.use('/api/portal-aluno', rotasPortalAluno(db));
  app.use('/api/anos-letivos', escritasApenasAdministrador, rotasAnosLetivos(db));
  app.use('/api/turmas', leituraEscolar, escritasApenasAdministrador, rotasTurmas(db));
  app.use('/api/alunos', leituraEscolar, rotasAlunos(db));
  app.use('/api/ocorrencias', exigirPerfil('administrador', 'coordenador', 'professor'), rotasOcorrencias(db));
  app.use('/api/utilizadores', rotasUtilizadores(db));
  app.use('/api', (req, res, next) => next(erroNaoEncontrado('Recurso não encontrado.')));

  app.use(exigirSessaoPagina(db));
  app.use(express.static(PASTA_FRONTEND, { index: 'login.html' }));

  app.use(tratarErros);
  return app;
}

module.exports = { criarApp };
