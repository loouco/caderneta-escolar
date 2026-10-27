'use strict';

const { abrirBase, CAMINHO_PADRAO } = require('./db');

const db = abrirBase();
const tabelas = db
  .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
  .all()
  .map((t) => t.name);
db.close();

console.log(`Base de dados pronta: ${CAMINHO_PADRAO}`);
console.log(`Tabelas: ${tabelas.join(', ')}`);
