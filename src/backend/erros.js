'use strict';

/** Erro previsto da API: transporta o estado HTTP e um código estável. */
class ErroApi extends Error {
  constructor(status, codigo, mensagem, detalhes) {
    super(mensagem);
    this.status = status;
    this.codigo = codigo;
    this.detalhes = detalhes;
  }
}

const erroValidacao = (detalhes, mensagem = 'Os dados enviados são inválidos.') =>
  new ErroApi(400, 'VALIDACAO', mensagem, detalhes);
const erroNaoEncontrado = (mensagem) => new ErroApi(404, 'NAO_ENCONTRADO', mensagem);
const erroConflito = (mensagem) => new ErroApi(409, 'CONFLITO', mensagem);

const MENSAGENS_UNICO = {
  'aluno.numero_matricula': 'Já existe um aluno com este número de matrícula.',
  'turma.nome, turma.ano_letivo_id': 'Já existe uma turma com este nome neste ano letivo.',
  'ano_letivo.designacao': 'Já existe um ano letivo com esta designação.',
};

function responder(res, status, codigo, mensagem, detalhes) {
  const erro = { codigo, mensagem };
  if (detalhes) erro.detalhes = detalhes;
  res.status(status).json({ erro });
}

/** Middleware final: converte qualquer erro numa resposta JSON sem expor detalhes internos. */
// eslint-disable-next-line no-unused-vars
function tratarErros(err, req, res, next) {
  if (err instanceof ErroApi) {
    return responder(res, err.status, err.codigo, err.message, err.detalhes);
  }
  if (err.type === 'entity.parse.failed') {
    return responder(res, 400, 'JSON_INVALIDO', 'O corpo do pedido não é um JSON válido.');
  }
  if (err.type === 'entity.too.large') {
    return responder(res, 413, 'CORPO_GRANDE', 'O corpo do pedido é demasiado grande.');
  }
  // Rede de segurança: restrições da base de dados não apanhadas pela validação.
  if (typeof err.code === 'string' && err.code.startsWith('SQLITE_CONSTRAINT')) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      const chave = err.message.replace('UNIQUE constraint failed: ', '');
      return responder(res, 409, 'CONFLITO', MENSAGENS_UNICO[chave] ?? 'Já existe um registo com estes dados.');
    }
    if (err.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
      return responder(res, 409, 'CONFLITO', 'O registo está em uso e não pode ser alterado ou eliminado.');
    }
    return responder(res, 400, 'VALIDACAO', 'Os dados violam uma restrição da base de dados.');
  }
  console.error(err); // fica só no servidor; o cliente nunca vê a stack
  return responder(res, 500, 'ERRO_INTERNO', 'Erro interno do servidor.');
}

module.exports = { ErroApi, erroValidacao, erroNaoEncontrado, erroConflito, tratarErros };
