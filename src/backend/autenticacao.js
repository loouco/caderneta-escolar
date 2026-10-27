'use strict';

const { promisify } = require('node:util');
const { randomBytes, scrypt: scryptCallback, createHash, timingSafeEqual } = require('node:crypto');
const { Router } = require('express');
const { Validador } = require('./validacao');
const { erroValidacao } = require('./erros');

const scrypt = promisify(scryptCallback);
const DURACAO_SESSAO_MS = 8 * 60 * 60 * 1000;
const COOKIE_SESSAO = 'caderneta.sid';
const PARAMETROS_SCRYPT = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

async function criarHash(palavraPasse) {
  const salt = randomBytes(16);
  const chave = await scrypt(palavraPasse, salt, 64, PARAMETROS_SCRYPT);
  return `scrypt$${PARAMETROS_SCRYPT.N}$${PARAMETROS_SCRYPT.r}$${PARAMETROS_SCRYPT.p}$${salt.toString('base64url')}$${chave.toString('base64url')}`;
}

function lerHash(hash) {
  const partes = typeof hash === 'string' ? hash.split('$') : [];
  if (partes.length !== 6 || partes[0] !== 'scrypt' ||
      Number(partes[1]) !== PARAMETROS_SCRYPT.N ||
      Number(partes[2]) !== PARAMETROS_SCRYPT.r ||
      Number(partes[3]) !== PARAMETROS_SCRYPT.p) return null;
  const salt = Buffer.from(partes[4], 'base64url');
  const esperado = Buffer.from(partes[5], 'base64url');
  if (salt.length !== 16 || esperado.length !== 64) return null;
  return { salt, esperado };
}

async function verificarHash(palavraPasse, hash) {
  const dados = lerHash(hash);
  if (!dados) return false;
  const atual = await scrypt(palavraPasse, dados.salt, dados.esperado.length, PARAMETROS_SCRYPT);
  return timingSafeEqual(dados.esperado, atual);
}

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

function lerCookies(req) {
  const cookies = {};
  for (const parte of (req.headers.cookie ?? '').split(';')) {
    const separador = parte.indexOf('=');
    if (separador < 0) continue;
    cookies[parte.slice(0, separador).trim()] = parte.slice(separador + 1).trim();
  }
  return cookies;
}

function configurarCookie(res, token) {
  res.cookie(COOKIE_SESSAO, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production' || process.env.COOKIE_SECURE === 'true',
    sameSite: 'strict',
    path: '/',
    maxAge: DURACAO_SESSAO_MS,
  });
}

function limparCookie(res) {
  res.clearCookie(COOKIE_SESSAO, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production' || process.env.COOKIE_SECURE === 'true',
    sameSite: 'strict',
    path: '/',
  });
}

function exigirAutenticacao(db) {
  const procurarSessao = db.prepare(`
    SELECT s.csrf_token, u.id, u.nome, u.email, u.perfil, u.aluno_id
      FROM sessao s JOIN utilizador u ON u.id = s.utilizador_id
     WHERE s.token_hash = ? AND s.expira_em > datetime('now') AND u.estado = 'ativo'`);
  const eliminarSessao = db.prepare('DELETE FROM sessao WHERE token_hash = ?');

  return (req, res, next) => {
    const token = lerCookies(req)[COOKIE_SESSAO];
    if (!token || !/^[\w-]{40,50}$/.test(token)) {
      return res.status(401).json({ erro: { codigo: 'NAO_AUTENTICADO', mensagem: 'Inicie sessão para continuar.' } });
    }

    const tokenHash = hashToken(token);
    const sessao = procurarSessao.get(tokenHash);
    if (!sessao) {
      eliminarSessao.run(tokenHash);
      return res.status(401).json({ erro: { codigo: 'NAO_AUTENTICADO', mensagem: 'A sessão expirou. Inicie sessão novamente.' } });
    }

    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.get('X-CSRF-Token') !== sessao.csrf_token) {
      return res.status(403).json({ erro: { codigo: 'CSRF_INVALIDO', mensagem: 'Pedido rejeitado; atualize a página e tente novamente.' } });
    }

    req.utilizador = {
      id: sessao.id,
      nome: sessao.nome,
      email: sessao.email,
      perfil: sessao.perfil,
      ...(sessao.aluno_id ? { aluno_id: sessao.aluno_id } : {}),
    };
    req.sessao = { tokenHash, csrfToken: sessao.csrf_token };
    return next();
  };
}

function exigirPerfil(...perfis) {
  return (req, res, next) => {
    if (!req.utilizador || !perfis.includes(req.utilizador.perfil)) {
      return res.status(403).json({ erro: { codigo: 'SEM_PERMISSAO', mensagem: 'Não tem permissão para esta operação.' } });
    }
    return next();
  };
}

function criarRotasAutenticacao(db) {
  const router = Router();
  const autenticar = exigirAutenticacao(db);
  const procurarUtilizador = db.prepare('SELECT id, nome, email, palavra_passe_hash, perfil, aluno_id FROM utilizador WHERE email = ? COLLATE NOCASE AND estado = ?');
  const inserirSessao = db.prepare(`
    INSERT INTO sessao (token_hash, csrf_token, utilizador_id, expira_em)
    VALUES (?, ?, ?, datetime('now', '+8 hours'))`);
  const procurarSessao = db.prepare('SELECT csrf_token FROM sessao WHERE token_hash = ? AND expira_em > datetime(\'now\')');
  const eliminarSessao = db.prepare('DELETE FROM sessao WHERE token_hash = ?');
  const eliminarSessoesUtilizador = db.prepare('DELETE FROM sessao WHERE utilizador_id = ? AND token_hash != ?');
  const atualizarHash = db.prepare('UPDATE utilizador SET palavra_passe_hash = ? WHERE id = ?');
  let hashFalso;

  router.post('/entrar', async (req, res, next) => {
    try {
      const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
      const palavraPasse = typeof req.body?.palavra_passe === 'string' ? req.body.palavra_passe : '';
      if (email.length > 254 || palavraPasse.length > 128) {
        return res.status(401).json({ erro: { codigo: 'CREDENCIAIS_INVALIDAS', mensagem: 'Email ou palavra-passe inválidos.' } });
      }

      const utilizador = procurarUtilizador.get(email, 'ativo');
      hashFalso ??= await criarHash('credenciais-de-login-invalidas');
      const hash = lerHash(utilizador?.palavra_passe_hash)
        ? utilizador.palavra_passe_hash
        : hashFalso;
      const hashValido = await verificarHash(palavraPasse, hash);
      if (!utilizador || !hashValido) {
        return res.status(401).json({ erro: { codigo: 'CREDENCIAIS_INVALIDAS', mensagem: 'Email ou palavra-passe inválidos.' } });
      }

      const token = randomBytes(32).toString('base64url');
      const csrfToken = randomBytes(32).toString('base64url');
      const tokenHash = hashToken(token);
      db.prepare('DELETE FROM sessao WHERE expira_em <= datetime(\'now\')').run();
      inserirSessao.run(tokenHash, csrfToken, utilizador.id);
      configurarCookie(res, token);
      res.json({
        utilizador: {
          id: utilizador.id,
          nome: utilizador.nome,
          email: utilizador.email,
          perfil: utilizador.perfil,
          ...(utilizador.aluno_id ? { aluno_id: utilizador.aluno_id } : {}),
        },
        csrf_token: csrfToken,
      });
    } catch (erro) {
      next(erro);
    }
  });

  router.get('/sessao', autenticar, (req, res) => {
    const sessao = procurarSessao.get(req.sessao.tokenHash);
    res.json({ utilizador: req.utilizador, csrf_token: sessao.csrf_token });
  });

  router.post('/sair', autenticar, (req, res) => {
    eliminarSessao.run(req.sessao.tokenHash);
    limparCookie(res);
    res.status(204).end();
  });

  router.post('/palavra-passe', autenticar, async (req, res, next) => {
    try {
      const atual = typeof req.body?.palavra_passe_atual === 'string' ? req.body.palavra_passe_atual : '';
      const nova = typeof req.body?.palavra_passe_nova === 'string' ? req.body.palavra_passe_nova : '';
      const erros = {};
      if (!atual) erros.palavra_passe_atual = 'Campo obrigatório.';
      if (nova.length < 12 || nova.length > 128) erros.palavra_passe_nova = 'A palavra-passe deve ter entre 12 e 128 caracteres.';
      if (Object.keys(erros).length) throw erroValidacao(erros);

      const utilizador = db.prepare('SELECT palavra_passe_hash FROM utilizador WHERE id = ?').get(req.utilizador.id);
      if (!await verificarHash(atual, utilizador.palavra_passe_hash)) {
        throw erroValidacao({ palavra_passe_atual: 'A palavra-passe atual está incorreta.' });
      }
      const novoHash = await criarHash(nova);
      const transacao = db.transaction(() => {
        atualizarHash.run(novoHash, req.utilizador.id);
        eliminarSessoesUtilizador.run(req.utilizador.id, req.sessao.tokenHash);
      });
      transacao();
      res.status(204).end();
    } catch (erro) {
      next(erro);
    }
  });

  return router;
}

function exigirSessaoPagina(db) {
  const procurarSessao = db.prepare(`
    SELECT u.perfil FROM sessao s JOIN utilizador u ON u.id = s.utilizador_id
     WHERE s.token_hash = ? AND s.expira_em > datetime('now') AND u.estado = 'ativo'`);
  return (req, res, next) => {
    if (!req.path.endsWith('.html') || req.path.toLowerCase() === '/login.html') return next();
    const token = lerCookies(req)[COOKIE_SESSAO];
    const sessao = token && /^[\w-]{40,50}$/.test(token)
      ? procurarSessao.get(hashToken(token))
      : null;
    if (!sessao) return res.redirect('/login.html');
    if (sessao.perfil === 'aluno' && req.path.toLowerCase() !== '/portal-aluno.html') {
      return res.redirect('/portal-aluno.html');
    }
    if (req.path.toLowerCase() === '/portal-aluno.html' && sessao.perfil !== 'aluno') {
      return res.redirect(sessao.perfil === 'professor' ? '/professor.html' : '/alunos.html');
    }
    if (req.path.toLowerCase() === '/professor.html' && sessao.perfil !== 'professor') {
      return res.redirect(sessao.perfil === 'aluno' ? '/portal-aluno.html' : '/alunos.html');
    }
    if (sessao.perfil === 'professor' && !['/professor.html', '/aluno.html'].includes(req.path.toLowerCase())) {
      return res.redirect('/professor.html');
    }
    if (['/utilizadores.html', '/turmas.html', '/aluno-form.html'].includes(req.path.toLowerCase()) && sessao.perfil !== 'administrador') {
      return res.redirect('/alunos.html');
    }
    return next();
  };
}

module.exports = {
  criarHash,
  verificarHash,
  criarRotasAutenticacao,
  exigirAutenticacao,
  exigirPerfil,
  exigirSessaoPagina,
};
