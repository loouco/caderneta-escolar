'use strict';

const { Router } = require('express');
const { Validador, lerId } = require('../validacao');
const { erroConflito, erroNaoEncontrado } = require('../erros');
const { criarHash, exigirPerfil } = require('../autenticacao');

/** Gestão de contas reservada a administradores; palavras-passe e hashes nunca são devolvidos. */
function rotasUtilizadores(db) {
  const router = Router();
  const apenasAdministrador = exigirPerfil('administrador');
  const listar = db.prepare(`
    SELECT u.id, u.nome, u.email, u.perfil, u.estado, a.numero_matricula
      FROM utilizador u LEFT JOIN aluno a ON a.id = u.aluno_id
     ORDER BY u.nome COLLATE NOCASE`);

  router.use(apenasAdministrador);
  router.get('/', (req, res) => res.json(listar.all()));

  router.get('/alunos-disponiveis', (req, res) => {
    const alunos = db.prepare(`
      SELECT a.id, a.nome_completo, a.numero_matricula
        FROM aluno a LEFT JOIN utilizador u ON u.aluno_id = a.id
       WHERE u.id IS NULL
       ORDER BY a.nome_completo COLLATE NOCASE`).all();
    res.json(alunos);
  });

  async function criarUtilizador(req, res, next, perfil, alunoId = null) {
    try {
      const v = new Validador(req.body);
      v.texto('nome', { max: 150 });
      v.texto('email', {
        max: 254,
        padrao: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        mensagemPadrao: 'Indique um email válido.',
      });
      v.segredo('palavra_passe', { min: 12, max: 128 });
      if (perfil) v.dados.perfil = perfil;
      else v.opcao('perfil', ['coordenador', 'professor', 'administrador']);
      const dados = v.concluir();

      const hash = await criarHash(dados.palavra_passe);
      const resultado = db.prepare(`
        INSERT INTO utilizador (nome, email, palavra_passe_hash, perfil, aluno_id)
        VALUES (@nome, @email, @palavra_passe_hash, @perfil, @aluno_id)`)
        .run({
          ...dados,
          email: dados.email.toLowerCase(),
          palavra_passe_hash: hash,
          perfil: perfil ?? dados.perfil,
          aluno_id: alunoId,
        });
      res.status(201).json(db.prepare(
        `SELECT u.id, u.nome, u.email, u.perfil, u.estado, a.numero_matricula
           FROM utilizador u LEFT JOIN aluno a ON a.id = u.aluno_id WHERE u.id = ?`
      ).get(resultado.lastInsertRowid));
    } catch (erro) {
      next(erro);
    }
  }

  router.post('/', (req, res, next) => criarUtilizador(req, res, next));

  router.post('/alunos/:id/conta', (req, res, next) => {
    const id = lerId(req.params.id, 'aluno_id');
    const existe = db.prepare('SELECT 1 FROM aluno WHERE id = ?').get(id);
    if (!existe) throw erroNaoEncontrado('Aluno não encontrado.');
    const jaTemConta = db.prepare('SELECT 1 FROM utilizador WHERE aluno_id = ?').get(id);
    if (jaTemConta) throw erroConflito('Este aluno já tem uma conta de acesso.');
    criarUtilizador(req, res, next, 'aluno', id);
  });

  router.patch('/:id/estado', (req, res) => {
    const id = lerId(req.params.id);
    const v = new Validador(req.body);
    v.opcao('estado', ['ativo', 'inativo']);
    const { estado } = v.concluir();
    const atualizarEstado = db.transaction(() => {
      const utilizador = db.prepare('SELECT id, perfil, estado FROM utilizador WHERE id = ?').get(id);
      if (!utilizador) throw erroNaoEncontrado('Utilizador não encontrado.');
      if (utilizador.perfil === 'administrador' && utilizador.estado === 'ativo' && estado === 'inativo') {
        const adminsAtivos = db.prepare(
          "SELECT COUNT(*) AS total FROM utilizador WHERE perfil = 'administrador' AND estado = 'ativo'"
        ).get().total;
        if (adminsAtivos <= 1) throw erroConflito('Não é possível desativar o último administrador ativo.');
      }
      db.prepare('UPDATE utilizador SET estado = ? WHERE id = ?').run(estado, id);
      if (estado === 'inativo') db.prepare('DELETE FROM sessao WHERE utilizador_id = ?').run(id);
    });
    try { atualizarEstado(); } catch (erro) {
      if (String(erro.message).includes('professor_atribuido')) throw erroConflito('Retire a atribuição à turma antes de desativar este professor.');
      throw erro;
    }
    res.json(db.prepare('SELECT id, nome, email, perfil, estado FROM utilizador WHERE id = ?').get(id));
  });

  return router;
}

module.exports = { rotasUtilizadores };
