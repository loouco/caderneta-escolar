'use strict';

const { abrirBase } = require('../../database/db');
const { criarApp } = require('./app');

const PORTA = Number(process.env.PORT) || 3000;
// Só aceita ligações da própria máquina até existir autenticação (V6).
const HOST = process.env.HOST || '127.0.0.1';

const db = abrirBase();
const servidor = criarApp(db).listen(PORTA, HOST, () => {
  console.log(`Caderneta Escolar a correr em http://${HOST}:${PORTA}`);
});

function encerrar() {
  servidor.close(() => {
    db.close();
    process.exit(0);
  });
}
process.on('SIGINT', encerrar);
process.on('SIGTERM', encerrar);
