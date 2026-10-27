'use strict';

const { Router } = require('express');
const { Validador, lerId } = require('../validacao');
const { ErroApi, erroNaoEncontrado, erroValidacao, erroConflito } = require('../erros');
const { rotasOcorrenciasDoAluno } = require('./ocorrencias');

const { exigirPerfil } = require('../autenticacao');
const ESTADOS = ['ativo', 'inativo', 'transferido', 'concluido'];

// Detalhe completo (dados pessoais) só no acesso a um aluno concreto.
const SELECT_DETALHE = `
  SELECT a.id, a.numero_matricula, a.nome_completo, a.data_nascimento, a.sexo,
         COALESCE((SELECT o.situacao_disciplinar FROM ocorrencia o WHERE o.aluno_id=a.id ORDER BY o.data DESC, o.id DESC LIMIT 1), 'regular') AS situacao_disciplinar,
         a.encarregado_educacao, a.contacto, a.turma_id, a.estado, a.criado_em,
         t.nome AS turma_nome, t.classe AS turma_classe,
         al.designacao AS ano_letivo_designacao
    FROM aluno a
    JOIN turma t ON t.id = a.turma_id
    JOIN ano_letivo al ON al.id = t.ano_letivo_id`;

// A listagem não inclui encarregado nem contacto (RN09: não expor dados pessoais sem necessidade).
const SELECT_LISTA = `
  SELECT a.id, a.numero_matricula, a.nome_completo, a.sexo, a.estado,
         a.turma_id, t.nome AS turma_nome,
         (SELECT COUNT(*) FROM ocorrencia WHERE aluno_id = a.id) AS total_ocorrencias
    FROM aluno a
    JOIN turma t ON t.id = a.turma_id`;

function validarAluno(corpo) {
  const v = new Validador(corpo);
  v.texto('numero_matricula', { max: 30 });
  v.texto('nome_completo', { max: 150 });
  v.data('data_nascimento', { naoFutura: true });
  v.opcao('sexo', ['M', 'F']);
  v.texto('encarregado_educacao', { max: 150 });
  v.texto('contacto', {
    max: 20,
    padrao: /^\+?[0-9][0-9\s-]{5,19}$/,
    mensagemPadrao: 'Contacto inválido (6 a 20 dígitos; pode incluir +, espaços e hífens).',
  });
  v.inteiroPositivo('turma_id');
  return v.concluir();
}

function validarEstado(corpo) {
  const v = new Validador(corpo);
  v.opcao('estado', ESTADOS);
  return v.concluir();
}

const semAcentos = (texto) => texto.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const escaparLike = (texto) => texto.replace(/[\\%_]/g, '\\$&');

function lerFiltros(query) {
  const erros = {};
  const filtros = {};

  if (query.q !== undefined) {
    if (typeof query.q !== 'string') erros.q = 'Deve ser texto.';
    else if (query.q.trim().length > 100) erros.q = 'Máximo de 100 caracteres.';
    else if (query.q.trim()) filtros.q = query.q.trim();
  }
  if (query.turma_id !== undefined) {
    try { filtros.turma_id = lerId(query.turma_id, 'turma_id'); } catch (e) { Object.assign(erros, e.detalhes); }
  }
  if (query.estado !== undefined) {
    if (!ESTADOS.includes(query.estado)) erros.estado = `Valores aceites: ${ESTADOS.join(', ')}.`;
    else filtros.estado = query.estado;
  }
  if (Object.keys(erros).length > 0) throw erroValidacao(erros);
  return filtros;
}

function rotasAlunos(db) {
  const router = Router();

  const obter = db.prepare(`${SELECT_DETALHE} WHERE a.id = ?`);
  const turmaExiste = db.prepare('SELECT 1 FROM turma WHERE id = ?');
  const inserir = db.prepare(
    `INSERT INTO aluno (numero_matricula, nome_completo, data_nascimento, sexo, encarregado_educacao, contacto, turma_id)
     VALUES (@numero_matricula, @nome_completo, @data_nascimento, @sexo, @encarregado_educacao, @contacto, @turma_id)`
  );
  const atualizar = db.prepare(
    `UPDATE aluno
        SET numero_matricula = @numero_matricula, nome_completo = @nome_completo,
            data_nascimento = @data_nascimento, sexo = @sexo,
            encarregado_educacao = @encarregado_educacao, contacto = @contacto, turma_id = @turma_id
      WHERE id = @id`
  );
  const mudarEstado = db.prepare('UPDATE aluno SET estado = @estado WHERE id = @id');
  const inserirTransferencia = db.prepare(`INSERT INTO transferencia_turma (aluno_id, turma_origem_id, turma_destino_id, utilizador_id, motivo) VALUES (?, ?, ?, ?, ?)`);
  const atualizarTurma = db.prepare('UPDATE aluno SET turma_id = ? WHERE id = ?');
  const turmaTransferivel = db.prepare('SELECT id, ano_letivo_id FROM turma WHERE id = ?');
  const listarTransferencias = db.prepare(`SELECT x.id, x.aluno_id, x.turma_origem_id, o.nome AS turma_origem_nome, o.classe AS turma_origem_classe, x.turma_destino_id, d.nome AS turma_destino_nome, d.classe AS turma_destino_classe, x.data_hora, x.utilizador_id, u.nome AS utilizador_nome, x.motivo FROM transferencia_turma x JOIN turma o ON o.id=x.turma_origem_id JOIN turma d ON d.id=x.turma_destino_id JOIN utilizador u ON u.id=x.utilizador_id WHERE x.aluno_id=? ORDER BY x.data_hora DESC, x.id DESC`);

  function obterOu404(id, utilizador) {
    const aluno = obter.get(id);
    if (!aluno || (utilizador?.perfil === 'professor' && aluno.turma_id !== turmaDoProfessor(utilizador.id))) throw erroNaoEncontrado('Aluno não encontrado.');
    return aluno;
  }

  const turmaDoProfessor = (id) => db.prepare('SELECT turma_id FROM turma_professor WHERE professor_id = ?').get(id)?.turma_id ?? null;

  function validarComTurma(corpo) {
    const dados = validarAluno(corpo);
    if (!turmaExiste.get(dados.turma_id)) {
      throw erroValidacao({ turma_id: 'A turma indicada não existe.' });
    }
    return dados;
  }

  router.get('/', (req, res) => {
    const filtros = lerFiltros(req.query);
    const condicoes = [];
    const parametros = {};

    if (filtros.q) {
      condicoes.push("(sem_acentos(a.nome_completo) LIKE @q ESCAPE '\\' OR sem_acentos(a.numero_matricula) LIKE @q ESCAPE '\\')");
      parametros.q = `%${escaparLike(semAcentos(filtros.q))}%`;
    }
    if (req.utilizador.perfil === 'professor') {
      const turmaId = turmaDoProfessor(req.utilizador.id);
      if (!turmaId) return res.json([]);
      if (filtros.turma_id && filtros.turma_id !== turmaId) return res.json([]);
      condicoes.push('a.turma_id = @professor_turma_id'); parametros.professor_turma_id = turmaId;
    }
    if (filtros.turma_id) {
      condicoes.push('a.turma_id = @turma_id');
      parametros.turma_id = filtros.turma_id;
    }
    if (filtros.estado) {
      condicoes.push('a.estado = @estado');
      parametros.estado = filtros.estado;
    }

    const where = condicoes.length ? `WHERE ${condicoes.join(' AND ')}` : '';
    const linhas = db.prepare(`${SELECT_LISTA} ${where} ORDER BY a.nome_completo COLLATE NOCASE`).all(parametros);
    res.json(linhas);
  });

  // V4: histórico de ocorrências do aluno (GET e POST em /api/alunos/:id/ocorrencias).
  router.use('/:id/ocorrencias', rotasOcorrenciasDoAluno(db));

  router.get('/:id', (req, res) => res.json(obterOu404(lerId(req.params.id), req.utilizador)));

  router.post('/', exigirPerfil('administrador'), (req, res) => {
    const dados = validarComTurma(req.body); // o estado inicial é sempre "ativo" (valor por omissão da BD)
    const { lastInsertRowid } = inserir.run(dados);
    res.status(201).json(obter.get(lastInsertRowid));
  });

  router.put('/:id', exigirPerfil('administrador'), (req, res) => {
    const id = lerId(req.params.id);
    const atual = obterOu404(id);
    const dados = validarComTurma(req.body);
    if (dados.turma_id !== atual.turma_id) throw erroValidacao({ turma_id: 'Use a transferência interna para mudar o aluno de turma.' });
    atualizar.run({ ...dados, id });
    res.json(obter.get(id));
  });

  router.get('/:id/transferencias', (req, res) => { const aluno = obterOu404(lerId(req.params.id), req.utilizador); res.json(listarTransferencias.all(aluno.id)); });

  router.post('/:id/transferencias', exigirPerfil('administrador'), (req, res) => {
    const alunoId = lerId(req.params.id); const aluno = obterOu404(alunoId, req.utilizador);
    const v = new Validador(req.body); v.inteiroPositivo('turma_destino_id'); v.textoOpcional('motivo', { max: 500 }); const dados = v.concluir();
    const destino = turmaTransferivel.get(dados.turma_destino_id);
    if (!destino) throw erroValidacao({ turma_destino_id: 'A turma de destino não existe.' });
    if (destino.id === aluno.turma_id) throw erroValidacao({ turma_destino_id: 'Escolha uma turma diferente da atual.' });
    const origem = turmaTransferivel.get(aluno.turma_id);
    if (destino.ano_letivo_id !== origem.ano_letivo_id) throw erroValidacao({ turma_destino_id: 'A transferência deve ocorrer no mesmo ano letivo.' });
    const transferir = db.transaction(() => {
      inserirTransferencia.run(alunoId, aluno.turma_id, destino.id, req.utilizador.id, dados.motivo ?? null);
      const resultado = atualizarTurma.run(destino.id, alunoId);
      if (resultado.changes !== 1) throw new Error('O aluno deixou de existir durante a transferência.');
    });
    transferir.immediate();
    res.status(201).json({ aluno: obter.get(alunoId), transferencias: listarTransferencias.all(alunoId) });
  });

  router.patch('/:id/estado', exigirPerfil('administrador'), (req, res) => {
    const id = lerId(req.params.id);
    obterOu404(id);
    mudarEstado.run({ ...validarEstado(req.body), id });
    res.json(obter.get(id));
  });

  // RN07: alunos nunca são eliminados; o histórico é preservado e o aluno passa a inativo.
  router.delete('/:id', (req, res) => {
    res.set('Allow', 'GET, PUT, PATCH');
    throw new ErroApi(
      405,
      'METODO_NAO_PERMITIDO',
      'Alunos não são eliminados. Para os retirar de uso, altere o estado (PATCH /api/alunos/:id/estado).'
    );
  });

  return router;
}

module.exports = { rotasAlunos };
