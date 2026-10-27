'use strict';

const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

const CAMINHO_ESQUEMA = path.join(__dirname, 'schema.sql');
const CAMINHO_PADRAO = path.join(__dirname, 'caderneta.db');

/**
 * Abre (ou cria) a base de dados e aplica o esquema.
 * Usa ':memory:' nos testes para obter uma base isolada e descartável.
 */
function abrirBase(caminho = CAMINHO_PADRAO) {
  const db = new Database(caminho);
  db.pragma('foreign_keys = ON'); // obrigatório: o SQLite desliga-as por omissão
  if (caminho !== ':memory:') {
    db.pragma('journal_mode = WAL');
  }
  db.exec(fs.readFileSync(CAMINHO_ESQUEMA, 'utf8'));
  return db;
}

module.exports = { abrirBase, CAMINHO_PADRAO, CAMINHO_ESQUEMA };
