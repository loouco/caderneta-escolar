/** Cliente da API REST. Devolve JSON ou lança ErroApi com o código e os detalhes por campo. */
export class ErroApi extends Error {
  constructor(status, codigo, mensagem, detalhes) {
    super(mensagem);
    this.status = status;
    this.codigo = codigo;
    this.detalhes = detalhes ?? {};
  }
}

export async function api(metodo, caminho, corpo) {
  const opcoes = { method: metodo, headers: {} };
  if (corpo !== undefined) {
    opcoes.headers['Content-Type'] = 'application/json';
    opcoes.body = JSON.stringify(corpo);
  }
  let resposta;
  try {
    resposta = await fetch(`/api${caminho}`, opcoes);
  } catch {
    throw new ErroApi(0, 'REDE', 'Não foi possível contactar o servidor. Verifique se está a correr.');
  }
  if (resposta.status === 204) return null;
  let json = null;
  try { json = await resposta.json(); } catch { /* resposta sem JSON */ }
  if (!resposta.ok) {
    const e = json?.erro;
    throw new ErroApi(resposta.status, e?.codigo ?? 'ERRO', e?.mensagem ?? 'Ocorreu um erro inesperado.', e?.detalhes);
  }
  return json;
}

/** Monta uma query string ignorando valores vazios. */
export function consulta(parametros) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(parametros)) if (v !== undefined && v !== null && v !== '') q.set(k, v);
  const texto = q.toString();
  return texto ? `?${texto}` : '';
}
