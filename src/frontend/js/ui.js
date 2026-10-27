/** Utilitários de interface. Os dados entram sempre como texto (textContent), nunca como HTML: evita XSS. */

export function el(tag, atributos = {}, ...filhos) {
  const no = document.createElement(tag);
  for (const [chave, valor] of Object.entries(atributos)) {
    if (valor === undefined || valor === null || valor === false) continue;
    if (chave.startsWith('on')) no.addEventListener(chave.slice(2), valor);
    else if (chave === 'class') no.className = valor;
    else no.setAttribute(chave, valor === true ? '' : valor);
  }
  no.append(...filhos.flat().filter((f) => f !== undefined && f !== null && f !== false));
  return no;
}

export const GRAVIDADES = { leve: 'Leve', moderada: 'Moderada', grave: 'Grave', muito_grave: 'Muito grave' };
export const ESTADOS_ALUNO = { ativo: 'Ativo', inativo: 'Inativo', transferido: 'Transferido', concluido: 'Concluído' };
export const ESTADOS_ANO = { planeado: 'Planeado', ativo: 'Ativo', encerrado: 'Encerrado' };
export const SEXOS = { M: 'Masculino', F: 'Feminino' };

/** "2026-10-12" -> "12/10/2026" (sem passar por Date, para evitar desvios de fuso horário). */
export function formatarData(iso) {
  if (typeof iso !== 'string') return '';
  const [a, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}

export const etiqueta = (valor, rotulos) => el('span', { class: `etiqueta etiqueta--${valor}` }, rotulos[valor] ?? valor);

export function cabecalho(ativo) {
  const ligacoes = [
    ['alunos', 'alunos.html', 'Alunos'],
    ['ocorrencias', 'ocorrencias.html', 'Ocorrências'],
    ['turmas', 'turmas.html', 'Turmas e anos letivos'],
  ];
  const alvo = document.getElementById('cabecalho');
  alvo.className = 'cabecalho';
  alvo.append(
    el('div', { class: 'cabecalho__interior' },
      el('span', { class: 'cabecalho__marca' }, 'Caderneta Escolar'),
      el('nav', { 'aria-label': 'Principal' },
        ligacoes.map(([id, href, texto]) => el('a', { href, 'aria-current': id === ativo ? 'page' : false }, texto))),
      el('a', { class: 'sair', href: 'login.html' }, 'Sair'))
  );
}

/** Mostra uma mensagem no topo de um contentor, substituindo a anterior. */
export function aviso(contentor, mensagem, tipo = 'erro') {
  limparAviso(contentor);
  contentor.prepend(el('div', { class: `aviso aviso--${tipo}`, role: tipo === 'erro' ? 'alert' : 'status', 'data-aviso': '' }, mensagem));
}
export function limparAviso(contentor) {
  contentor.querySelectorAll('[data-aviso]').forEach((n) => n.remove());
}

/** Campo de formulário: rótulo + controlo + espaço para o erro do servidor. */
export function campo({ nome, rotulo, controlo, larga = false }) {
  controlo.id = nome;
  controlo.name = nome;
  const erro = el('div', { class: 'erro-campo', id: `erro-${nome}` });
  controlo.setAttribute('aria-describedby', erro.id);
  return el('div', { class: `campo${larga ? ' campo--larga' : ''}` }, el('label', { for: nome }, rotulo), controlo, erro);
}

export function selecao(opcoes, valorInicial = '', { vazio } = {}) {
  const s = el('select');
  if (vazio !== undefined) s.append(el('option', { value: '' }, vazio));
  for (const [valor, texto] of opcoes) s.append(el('option', { value: valor }, texto));
  s.value = String(valorInicial);
  return s;
}

/** Limpa os erros de um formulário e mostra os do servidor junto de cada campo. */
export function mostrarErros(formulario, erro) {
  formulario.querySelectorAll('.erro-campo').forEach((n) => { n.textContent = ''; });
  formulario.querySelectorAll('[aria-invalid]').forEach((n) => n.removeAttribute('aria-invalid'));
  let alguma = false;
  for (const [nomeCampo, texto] of Object.entries(erro?.detalhes ?? {})) {
    const alvo = formulario.querySelector(`#erro-${nomeCampo}`);
    if (!alvo) continue;
    alvo.textContent = texto;
    formulario.querySelector(`[name="${nomeCampo}"]`)?.setAttribute('aria-invalid', 'true');
    alguma = true;
  }
  return alguma;
}

/** Lê o formulário para um objeto; os campos terminados em _id passam a número. */
export function lerFormulario(formulario) {
  const dados = {};
  for (const [chave, valor] of new FormData(formulario)) {
    const texto = typeof valor === 'string' ? valor.trim() : valor;
    dados[chave] = chave.endsWith('_id') && texto !== '' ? Number(texto) : texto;
  }
  return dados;
}

export const idDaUrl = () => new URLSearchParams(location.search).get('id');

export function rotuloTurma(t) {
  return `${t.nome} (${t.ano_letivo_designacao})`;
}

export function debounce(fn, ms = 250) {
  let temporizador;
  return (...args) => { clearTimeout(temporizador); temporizador = setTimeout(() => fn(...args), ms); };
}
