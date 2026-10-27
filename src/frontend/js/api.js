/** Cliente da API REST. Devolve JSON ou lança ErroApi com o código e os detalhes por campo. */
export class ErroApi extends Error {
  constructor(status, codigo, mensagem, detalhes) {
    super(mensagem);
    this.status = status;
    this.codigo = codigo;
    this.detalhes = detalhes ?? {};
  }
}

let tokenCSRF = null;

export function definirTokenCSRF(token) {
  tokenCSRF = token;
}

export async function api(metodo, caminho, corpo) {
  const metodoSeguro = ['GET', 'HEAD', 'OPTIONS'].includes(metodo.toUpperCase());
  if (!metodoSeguro && !tokenCSRF && caminho !== '/auth/entrar') {
    const sessao = await api('GET', '/auth/sessao');
    definirTokenCSRF(sessao.csrf_token);
  }
  const opcoes = { method: metodo, headers: {} };
  if (!metodoSeguro && tokenCSRF) {
    opcoes.headers['X-CSRF-Token'] = tokenCSRF;
  }
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
    if (resposta.status === 401 && caminho !== '/auth/entrar' &&
        !['/', '/login.html'].includes(location.pathname)) {
      location.replace('/login.html');
    }
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
