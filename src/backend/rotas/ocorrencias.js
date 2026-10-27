'use strict';

const { Router } = require('express');
const { Validador, lerId, dataIsoValida } = require('../validacao');
const { ErroApi, erroNaoEncontrado, erroValidacao } = require('../erros');

const GRAVIDADES = ['leve', 'moderada', 'grave', 'muito_grave'];

const SELECT_OCORRENCIA = `
  SELECT o.id, o.aluno_id, a.nome_completo AS aluno_nome, a.numero_matricula AS aluno_matricula,
         o.utilizador_id, u.nome AS utilizador_nome,
         o.tipo, o.descricao, o.data, o.gravidade, o.medida_aplicada, o.observacoes
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
  if (filtros.gravidade) condicoes.push('o.gravidade = @gravidade');
  if (filtros.de) condicoes.push('o.data >= @de');
  if (filtros.ate) condicoes.push('o.data <= @ate');
  const where = condicoes.length ? `WHERE ${condicoes.join(' AND ')}` : '';
  return db.prepare(`${SELECT_OCORRENCIA} ${where} ${ORDEM}`).all(filtros);
}

/** /api/alunos/:id/ocorrencias: histórico e registo de ocorrências de um aluno. */
function rotasOcorrenciasDoAluno(db) {
  const router = Router({ mergeParams: true });

  const alunoExiste = db.prepare('SELECT 1 FROM aluno WHERE id = ?');
  const utilizadorAtivo = db.prepare("SELECT 1 FROM utilizador WHERE id = ? AND estado = 'ativo'");
  const obter = db.prepare(`${SELECT_OCORRENCIA} WHERE o.id = ?`);
  const inserir = db.prepare(
    `INSERT INTO ocorrencia (aluno_id, utilizador_id, tipo, descricao, data, gravidade, medida_aplicada, observacoes)
     VALUES (@aluno_id, @utilizador_id, @tipo, @descricao, @data, @gravidade, @medida_aplicada, @observacoes)`
  );

  function lerAluno(req) {
    const alunoId = lerId(req.params.id);
    if (!alunoExiste.get(alunoId)) throw erroNaoEncontrado('Aluno não encontrado.');
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
    // PROVISÓRIO (V4): o responsável vem no corpo do pedido. Na V6 passa a ser o utilizador da sessão.
    v.inteiroPositivo('utilizador_id');
    const dados = v.concluir();
    if (!utilizadorAtivo.get(dados.utilizador_id)) {
      throw erroValidacao({ utilizador_id: 'O utilizador indicado não existe ou está inativo.' });
    }
    const { lastInsertRowid } = inserir.run({ ...dados, aluno_id });
    res.status(201).json(obter.get(lastInsertRowid));
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
            medida_aplicada = @medida_aplicada, observacoes = @observacoes
      WHERE id = @id`
  );

  function obterOu404(id) {
    const ocorrencia = obter.get(id);
    if (!ocorrencia) throw erroNaoEncontrado('Ocorrência não encontrada.');
    return ocorrencia;
  }

  router.get('/', (req, res) => res.json(listar(db, lerFiltros(req.query, { comAluno: true }))));

  router.get('/:id', (req, res) => res.json(obterOu404(lerId(req.params.id))));

  router.put('/:id', (req, res) => {
    const id = lerId(req.params.id);
    obterOu404(id);
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

module.exports = { rotasOcorrencias, rotasOcorrenciasDoAluno };
