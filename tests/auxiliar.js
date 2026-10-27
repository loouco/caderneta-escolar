'use strict';

const { once } = require('node:events');
const { abrirBase } = require('../database/db');
const { criarApp } = require('../src/backend/app');

/** Arranca a aplicação numa porta livre, com uma base de dados em memória. */
async function iniciar() {
  const db = abrirBase(':memory:');
  const servidor = criarApp(db).listen(0, '127.0.0.1');
  await once(servidor, 'listening');
  const base = `http://127.0.0.1:${servidor.address().port}`;

  async function pedir(metodo, caminho, corpo) {
    const opcoes = { method: metodo, headers: {} };
    if (corpo !== undefined) {
      opcoes.headers['Content-Type'] = 'application/json';
      opcoes.body = typeof corpo === 'string' ? corpo : JSON.stringify(corpo);
    }
    const resposta = await fetch(base + caminho, opcoes);
    const texto = await resposta.text();
    let json = null;
    try { json = JSON.parse(texto); } catch { /* resposta sem JSON (ex.: 204) */ }
    return { status: resposta.status, corpo: json, cabecalhos: resposta.headers };
  }

  async function fechar() {
    servidor.close();
    servidor.closeAllConnections();
    await once(servidor, 'close');
    db.close();
  }

  return { db, pedir, fechar, base };
}

const dadosAno = (o = {}) => ({ designacao: '2025/2026', data_inicio: '2025-09-01', data_fim: '2026-07-15', estado: 'ativo', ...o });
const dadosTurma = (anoId, o = {}) => ({ nome: '9.ª A', classe: '9.ª classe', ano_letivo_id: anoId, ...o });
const dadosAluno = (turmaId, o = {}) => ({
  numero_matricula: '2025001',
  nome_completo: 'Maria da Silva',
  data_nascimento: '2010-03-15',
  sexo: 'F',
  encarregado_educacao: 'João da Silva',
  contacto: '923 000 000',
  turma_id: turmaId,
  ...o,
});

/** Cria ano letivo + turma pela API e devolve os ids. */
async function criarTurmaBase(pedir) {
  const ano = await pedir('POST', '/api/anos-letivos', dadosAno());
  const turma = await pedir('POST', '/api/turmas', dadosTurma(ano.corpo.id));
  return { anoId: ano.corpo.id, turmaId: turma.corpo.id };
}

const dadosOcorrencia = (utilizadorId, o = {}) => ({
  tipo: 'Indisciplina',
  descricao: 'Perturbou a aula repetidamente.',
  data: '2025-10-10',
  gravidade: 'leve',
  medida_aplicada: 'Advertência oral',
  utilizador_id: utilizadorId,
  ...o,
});

/** Insere um utilizador diretamente na base (ainda não há API de utilizadores). */
function criarUtilizador(db, { nome = 'Ana Coordenadora', email = 'ana@escola.ao', estado = 'ativo' } = {}) {
  const r = db.prepare(
    "INSERT INTO utilizador (nome, email, palavra_passe_hash, perfil, estado) VALUES (?, ?, 'hash-de-teste', 'coordenador', ?)"
  ).run(nome, email, estado);
  return Number(r.lastInsertRowid);
}

module.exports = { iniciar, dadosAno, dadosTurma, dadosAluno, dadosOcorrencia, criarTurmaBase, criarUtilizador };
