import { api, consulta } from './api.js';
import { el, cabecalho, etiqueta, aviso, debounce, rotuloTurma, ESTADOS_ALUNO } from './ui.js';

cabecalho('alunos');

const q = document.getElementById('q');
const turma = document.getElementById('turma');
const estado = document.getElementById('estado');
const resultado = document.getElementById('resultado');

for (const [valor, texto] of Object.entries(ESTADOS_ALUNO)) estado.append(el('option', { value: valor }, texto));

async function carregar() {
  try {
    const alunos = await api('GET', `/alunos${consulta({ q: q.value.trim(), turma_id: turma.value, estado: estado.value })}`);
    desenhar(alunos);
  } catch (erro) {
    resultado.replaceChildren();
    aviso(resultado, erro.message);
  }
}

function desenhar(alunos) {
  if (alunos.length === 0) {
    resultado.replaceChildren(el('p', { class: 'vazio' }, 'Nenhum aluno encontrado.'));
    return;
  }
  const linhas = alunos.map((a) => el('tr', {},
    el('td', {}, a.numero_matricula),
    el('td', {}, el('a', { href: `aluno.html?id=${a.id}` }, a.nome_completo)),
    el('td', {}, a.turma_nome),
    el('td', {}, etiqueta(a.estado, ESTADOS_ALUNO)),
    el('td', { class: 'num' }, String(a.total_ocorrencias))));
  resultado.replaceChildren(el('div', { class: 'tabela-envolvente' }, el('table', {},
    el('thead', {}, el('tr', {},
      el('th', {}, 'Matrícula'), el('th', {}, 'Nome'), el('th', {}, 'Turma'), el('th', {}, 'Estado'), el('th', { class: 'num' }, 'Ocorrências'))),
    el('tbody', {}, linhas))));
}

async function iniciar() {
  try {
    const turmas = await api('GET', '/turmas');
    for (const t of turmas) turma.append(el('option', { value: t.id }, rotuloTurma(t)));
  } catch (erro) {
    aviso(resultado, erro.message);
  }
  await carregar();
}

q.addEventListener('input', debounce(carregar));
turma.addEventListener('change', carregar);
estado.addEventListener('change', carregar);
iniciar();
