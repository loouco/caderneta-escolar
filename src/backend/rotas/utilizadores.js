'use strict';

const { Router } = require('express');

/**
 * PROVISÓRIO (V5): lista mínima dos utilizadores ativos para escolher o responsável de uma ocorrência.
 * Só expõe id, nome e perfil (nunca email nem hash). Na V6 o responsável passa a ser o utilizador autenticado
 * e esta rota fica restrita ao administrador.
 */
function rotasUtilizadores(db) {
  const router = Router();
  const listar = db.prepare("SELECT id, nome, perfil FROM utilizador WHERE estado = 'ativo' ORDER BY nome COLLATE NOCASE");
  router.get('/', (req, res) => res.json(listar.all()));
  return router;
}

module.exports = { rotasUtilizadores };
