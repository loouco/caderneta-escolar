'use strict';

const { Router } = require('express');
const { Validador, lerId, dataIsoValida, hojeIso } = require('../validacao');
const { ErroApi, erroNaoEncontrado, erroValidacao } = require('../erros');
const { exigirPerfil } = require('../autenticacao');

const GRAVIDADES = ['leve', 'moderada', 'grave', 'muito_grave'];

const SELECT_OCORRENCIA = `
  SELECT o.id, o.aluno_id, a.nome_completo AS aluno_nome, a.numero_matricula AS aluno_matricula,
         o.utilizador_id, u.nome AS utilizador_nome,
         o.tipo, o.descricao, o.data, o.gravidade, o.medida_aplicada, o.observacoes, o.situacao_disciplinar
    FROM ocorrencia o
    JOIN aluno a ON a.id = o.aluno_id
    JOIN utilizador u ON u.id = o.utilizador_id`;

const ORDEM = 'ORDER BY o.data DESC, o.id DESC';

/** Campos de conteúdo, comuns ao registo e à correção (RN04, RN05). */
function validarConteudo(v) {
  v.texto('tipo', { max: 60 });
  v.texto('descricao', { max: 2000 });
  v.data('data', { naoFutura: true });
  v.opcao('gravidade', GRAVIDADES);
  v.opcao('situacao_disciplinar', ['regular', 'castigado', 'suspenso'], { padrao: 'regular' });
  v.textoOpcional('medida_aplicada', { max: 500 });
  v.textoOpcional('observacoes', { max: 1000 });
}

function lerFiltros(query, { comAluno }) {
  const erros = {};
  const filtros = {};
  if (comAluno && query.aluno_id !== undefined) {
    try { filtros.aluno_id = lerId(query.aluno_id, 'aluno_id'); } catch (e) { Object.assign(erros, e.detalhes); }
  }
  if (query.gravidade !== undefined) {
    if (!GRAVIDADES.includes(query.gravidade)) erros.gravidade = `Valores aceites: ${GRAVIDADES.join(', ')}.`;
    else filtros.gravidade = query.gravidade;
  }
  for (const campo of ['de', 'ate']) {
    if (query[campo] === undefined || query[campo] === '') continue;
    if (!dataIsoValida(query[campo])) erros[campo] = 'Data inválida; use o formato AAAA-MM-DD.';
    else filtros[campo] = query[campo];
  }
  if (filtros.de && filtros.ate && filtros.de > filtros.ate) erros.ate = 'Deve ser igual ou posterior a "de".';
  if (Object.keys(erros).length > 0) throw erroValidacao(erros);
  return filtros;
}

function listar(db, filtros) {
  const condicoes = [];
  if (filtros.aluno_id) condicoes.push('o.aluno_id = @aluno_id');
  if (filtros.turma_id) condicoes.push('a.turma_id = @turma_id');
  if (filtros.gravidade) condicoes.push('o.gravidade = @gravidade');
  if (filtros.de) condicoes.push('o.data >= @de');
  if (filtros.ate) condicoes.push('o.data <= @ate');
  const where = condicoes.length ? `WHERE ${condicoes.join(' AND ')}` : '';
  return db.prepare(`${SELECT_OCORRENCIA} ${where} ${ORDEM}`).all(filtros);
}

/** /api/alunos/:id/ocorrencias: histórico e registo de ocorrências de um aluno. */
function rotasOcorrenciasDoAluno(db) {
  const router = Router({ mergeParams: true });

  const alunoExiste = db.prepare('SELECT id, turma_id FROM aluno WHERE id = ?');
  const obter = db.prepare(`${SELECT_OCORRENCIA} WHERE o.id = ?`);
  const inserir = db.prepare(
    `INSERT INTO ocorrencia (aluno_id, utilizador_id, tipo, descricao, data, gravidade, medida_aplicada, observacoes, situacao_disciplinar)
     VALUES (@aluno_id, @utilizador_id, @tipo, @descricao, @data, @gravidade, @medida_aplicada, @observacoes, @situacao_disciplinar)`
  );

  function lerAluno(req) {
    const alunoId = lerId(req.params.id);
    const aluno = alunoExiste.get(alunoId);
    if (!aluno || (req.utilizador.perfil === 'professor' && aluno.turma_id !== (db.prepare('SELECT turma_id FROM turma_professor WHERE professor_id = ?').get(req.utilizador.id)?.turma_id ?? null))) throw erroNaoEncontrado('Aluno não encontrado.');
    return alunoId;
  }

  router.get('/', (req, res) => {
    const aluno_id = lerAluno(req);
    res.json(listar(db, { ...lerFiltros(req.query, { comAluno: false }), aluno_id }));
  });

  router.post('/', (req, res) => {
    const aluno_id = lerAluno(req);
    const v = new Validador(req.body);
    validarConteudo(v);
    const dados = v.concluir();
    const { lastInsertRowid } = inserir.run({ ...dados, aluno_id, utilizador_id: req.utilizador.id });
    res.status(201).json(obter.get(lastInsertRowid));
  });

  return router;
}

/** Reuniões ligadas a uma ocorrência; professores só acedem à sua turma atual. */
function rotasReunioesDaOcorrencia(db) {
  const router = Router({ mergeParams: true });
  router.use(exigirPerfil('administrador', 'coordenador', 'professor'));
  const buscarOcorrencia = db.prepare(`${SELECT_OCORRENCIA} WHERE o.id = ?`);
  const listarReunioes = db.prepare(`SELECT r.id, r.ocorrencia_id, r.data, r.hora, r.motivo, r.estado, r.criada_em, r.utilizador_id, u.nome AS utilizador_nome
    FROM reuniao r JOIN utilizador u ON u.id=r.utilizador_id WHERE r.ocorrencia_id=? ORDER BY r.data, r.hora, r.id`);
  function ocorrenciaAutorizada(req) {
    const id = lerId(req.params.id);
    const o = buscarOcorrencia.get(id);
    if (!o) throw erroNaoEncontrado('Ocorrência não encontrada.');
    if (req.utilizador.perfil === 'professor') {
      const turmaId = db.prepare('SELECT turma_id FROM turma_professor WHERE professor_id=?').get(req.utilizador.id)?.turma_id;
      const aluno = db.prepare('SELECT turma_id FROM aluno WHERE id=?').get(o.aluno_id);
      if (!turmaId || aluno?.turma_id !== turmaId) throw erroNaoEncontrado('Ocorrência não encontrada.');
    }
    return id;
  }
  router.get('/', (req,res) => res.json(listarReunioes.all(ocorrenciaAutorizada(req))));
  router.post('/', (req,res) => {
    const ocorrenciaId=ocorrenciaAutorizada(req);
    const v=new Validador(req.body); v.data('data'); v.texto('hora',{max:5,padrao:/^(?:[01]\d|2[0-3]):[0-5]\d$/,mensagemPadrao:'Indique a hora no formato HH:MM.'}); v.texto('motivo',{max:500});
    const dados=v.concluir(); if(dados.data<hojeIso()) throw erroValidacao({data:'A reunião não pode ser marcada para uma data passada.'});
    const resultado=db.prepare('INSERT INTO reuniao (ocorrencia_id, utilizador_id, data, hora, motivo) VALUES (?, ?, ?, ?, ?)').run(ocorrenciaId,req.utilizador.id,dados.data,dados.hora,dados.motivo);
    res.status(201).json(listarReunioes.all(ocorrenciaId).find((r)=>r.id===Number(resultado.lastInsertRowid)));
  });
  return router;
}

/** /api/ocorrencias: consulta global, detalhe e correção. O aluno e o responsável nunca mudam. */
function rotasOcorrencias(db) {
  const router = Router();

  const obter = db.prepare(`${SELECT_OCORRENCIA} WHERE o.id = ?`);
  const atualizar = db.prepare(
    `UPDATE ocorrencia
        SET tipo = @tipo, descricao = @descricao, data = @data, gravidade = @gravidade,
            medida_aplicada = @medida_aplicada, observacoes = @observacoes, situacao_disciplinar = @situacao_disciplinar
      WHERE id = @id`
  );

  function obterOu404(id, utilizador) {
    const ocorrencia = obter.get(id);
    if (!ocorrencia) throw erroNaoEncontrado('Ocorrência não encontrada.');
    if (utilizador?.perfil === 'professor') {
      const turma = db.prepare('SELECT turma_id FROM turma_professor WHERE professor_id = ?').get(utilizador.id)?.turma_id ?? null;
      const aluno = db.prepare('SELECT turma_id FROM aluno WHERE id = ?').get(ocorrencia.aluno_id);
      if (!turma || aluno?.turma_id !== turma) throw erroNaoEncontrado('Ocorrência não encontrada.');
    }
    return ocorrencia;
  }

  router.use('/:id/reunioes', rotasReunioesDaOcorrencia(db));

  router.get('/', (req, res) => {
    const filtros = lerFiltros(req.query, { comAluno: true });
    if (req.utilizador.perfil === 'professor') {
      const turmaId = db.prepare('SELECT turma_id FROM turma_professor WHERE professor_id = ?').get(req.utilizador.id)?.turma_id;
      if (!turmaId) return res.json([]);
      filtros.turma_id = turmaId;
    }
    res.json(listar(db, filtros));
  });

  router.get('/:id', (req, res) => res.json(obterOu404(lerId(req.params.id), req.utilizador)));

  router.put('/:id', (req, res) => {
    const id = lerId(req.params.id);
    obterOu404(id, req.utilizador);
    const v = new Validador(req.body);
    validarConteudo(v);
    atualizar.run({ ...v.concluir(), id });
    res.json(obter.get(id));
  });

  // Registos disciplinares não se apagam: ficam como histórico do aluno.
  router.delete('/:id', (req, res) => {
    res.set('Allow', 'GET, PUT');
    throw new ErroApi(405, 'METODO_NAO_PERMITIDO', 'As ocorrências não são eliminadas; fazem parte do histórico do aluno.');
  });

  return router;
}

module.exports = { rotasOcorrencias, rotasOcorrenciasDoAluno, rotasReunioesDaOcorrencia };
