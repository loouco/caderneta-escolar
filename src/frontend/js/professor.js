import { api, consulta } from './api.js';
import { el, cabecalho, aviso, debounce, rotuloTurma, etiqueta, ESTADOS_ALUNO } from './ui.js';

const resultado = document.getElementById('resultado');
const resumo = document.getElementById('resumo');
const q = document.getElementById('q');
let turma = null;
let alunosVisiveis = [];
let turmaCarregada = false;

// Não bloquear o painel à espera do cabeçalho/autenticação: o estado de carregamento aparece logo.
void cabecalho('professor');

function mensagemEstado(texto) {
  resultado.replaceChildren(el('section', { class: 'painel' }, el('p', { class: 'vazio' }, texto)));
}

function desenharLista() {
  if (!turma) {
    mensagemEstado('Ainda não tem uma turma atribuída. A administração da escola precisa associar a sua conta a uma turma.');
    return;
  }
  if (!alunosVisiveis.length) {
    mensagemEstado(q.value.trim() ? 'Nenhum aluno corresponde à pesquisa.' : 'Ainda não há alunos nesta turma.');
    return;
  }
  const linhas = alunosVisiveis.map((aluno) => el('tr', {},
    el('td', {}, aluno.numero_matricula),
    el('td', {}, el('a', { href: `aluno.html?id=${aluno.id}` }, aluno.nome_completo)),
    el('td', {}, etiqueta(aluno.estado, ESTADOS_ALUNO)),
    el('td', { class: 'num' }, String(aluno.total_ocorrencias)),
    el('td', {},
      el('a', { class: 'botao botao--secundario botao--pequeno', href: `aluno.html?id=${aluno.id}` }, 'Ver aluno e ocorrências'),
      el('a', { class: 'botao botao--pequeno', href: `aluno.html?id=${aluno.id}&ocorrencia=nova` }, 'Registar ocorrência'))));
  resultado.replaceChildren(el('div', { class: 'tabela-envolvente' }, el('table', {},
    el('thead', {}, el('tr', {}, ['Matrícula', 'Aluno', 'Estado', 'Ocorrências', 'Ações'].map((texto) => el('th', {}, texto)))),
    el('tbody', {}, linhas))));
}

async function carregar() {
  if (!turmaCarregada) return;
  if (!turma) { desenharLista(); return; }
  mensagemEstado('A carregar alunos da turma…');
  try {
    alunosVisiveis = await api('GET', `/alunos${consulta({ q: q.value.trim() })}`);
    desenharLista();
  } catch (erro) {
    alunosVisiveis = [];
    resultado.replaceChildren();
    aviso(resultado, `${erro.message} Atualize a página; se o problema continuar, confirme a atribuição da turma e a sessão.`);
  }
}

async function iniciar() {
  mensagemEstado('A carregar a sua turma…');
  try {
    const turmas = await api('GET', '/turmas');
    turma = turmas[0] ?? null;
    turmaCarregada = true;
    if (!turma) {
      resumo.replaceChildren(el('h2', {}, 'Turma não atribuída'), el('p', {}, 'Peça à administração da escola para atribuir uma turma à sua conta.'));
      desenharLista();
      return;
    }
    resumo.replaceChildren(el('h2', {}, rotuloTurma(turma)), el('p', {}, `${turma.classe} · ${turma.total_alunos} aluno(s) · Ano letivo ${turma.ano_letivo_designacao}`));
    await carregar();
  } catch (erro) {
    resumo.replaceChildren();
    aviso(resumo, `${erro.message} Não foi possível carregar a turma. Atualize a página ou inicie sessão novamente.`);
    mensagemEstado('Os dados da turma ainda não foram carregados.');
  }
}

q.addEventListener('input', debounce(carregar));
iniciar();
