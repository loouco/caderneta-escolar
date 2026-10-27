import { api } from './api.js';
import { el, cabecalho, campo, selecao, etiqueta, aviso, limparAviso, mostrarErros, lerFormulario, formatarData, ESTADOS_ANO } from './ui.js';

cabecalho('turmas');

const mensagens = document.getElementById('mensagens');
const formAno = document.getElementById('form-ano');
const formTurma = document.getElementById('form-turma');

const tabela = (cabecas, linhas, vazio) => linhas.length === 0
  ? el('p', { class: 'vazio' }, vazio)
  : el('div', { class: 'tabela-envolvente' }, el('table', {},
    el('thead', {}, el('tr', {}, cabecas.map((c) => el('th', {}, c)))), el('tbody', {}, linhas)));

async function carregar() {
  try {
    const [anos, turmas] = await Promise.all([api('GET', '/anos-letivos'), api('GET', '/turmas')]);
    desenharAnos(anos);
    desenharTurmas(turmas);
    prepararFormTurma(anos);
  } catch (erro) {
    aviso(mensagens, erro.message);
  }
}

function desenharAnos(anos) {
  document.getElementById('anos').replaceChildren(tabela(['Designação', 'Início', 'Fim', 'Estado'],
    anos.map((a) => el('tr', {}, el('td', {}, a.designacao), el('td', {}, formatarData(a.data_inicio)), el('td', {}, formatarData(a.data_fim)), el('td', {}, etiqueta(a.estado, ESTADOS_ANO)))),
    'Ainda não há anos letivos.'));
}

function desenharTurmas(turmas) {
  const linhas = turmas.map((t) => {
    const eliminar = el('button', { class: 'botao botao--perigo botao--pequeno', type: 'button', disabled: t.total_alunos > 0, title: t.total_alunos > 0 ? 'Só é possível eliminar turmas sem alunos.' : null }, 'Eliminar');
    eliminar.addEventListener('click', async () => {
      if (!confirm(`Eliminar a turma ${t.nome} (${t.ano_letivo_designacao})?`)) return;
      try {
        await api('DELETE', `/turmas/${t.id}`);
        await carregar();
        aviso(mensagens, 'Turma eliminada.', 'sucesso');
      } catch (erro) {
        aviso(mensagens, erro.message);
      }
    });
    return el('tr', {}, el('td', {}, t.nome), el('td', {}, t.classe), el('td', {}, t.ano_letivo_designacao), el('td', { class: 'num' }, String(t.total_alunos)), el('td', {}, eliminar));
  });
  document.getElementById('turmas').replaceChildren(tabela(['Turma', 'Classe', 'Ano letivo', 'Alunos', ''], linhas, 'Ainda não há turmas.'));
}

function montarFormAno() {
  formAno.replaceChildren(
    campo({ nome: 'designacao', rotulo: 'Designação (ex.: 2026/2027)', controlo: el('input', { type: 'text', maxlength: 20, required: true }) }),
    campo({ nome: 'data_inicio', rotulo: 'Data de início', controlo: el('input', { type: 'date', required: true }) }),
    campo({ nome: 'data_fim', rotulo: 'Data de fim', controlo: el('input', { type: 'date', required: true }) }),
    campo({ nome: 'estado', rotulo: 'Estado', controlo: selecao(Object.entries(ESTADOS_ANO), 'planeado') }),
    el('div', { class: 'acoes' }, el('button', { class: 'botao', type: 'submit' }, 'Criar ano letivo')));
}

function prepararFormTurma(anos) {
  formTurma.replaceChildren(
    campo({ nome: 'nome', rotulo: 'Nome (ex.: 9.ª A)', controlo: el('input', { type: 'text', maxlength: 50, required: true }) }),
    campo({ nome: 'classe', rotulo: 'Classe (ex.: 9.ª classe)', controlo: el('input', { type: 'text', maxlength: 50, required: true }) }),
    campo({ nome: 'ano_letivo_id', rotulo: 'Ano letivo', controlo: selecao(anos.map((a) => [a.id, a.designacao]), '', { vazio: 'Escolha…' }) }),
    el('div', { class: 'acoes' }, el('button', { class: 'botao', type: 'submit' }, 'Criar turma')));
}

function submeter(formulario, caminho, sucesso) {
  formulario.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const dados = lerFormulario(formulario);
    if (dados.ano_letivo_id === '') delete dados.ano_letivo_id;
    try {
      await api('POST', caminho, dados);
      formulario.reset();
      mostrarErros(formulario, null);
      await carregar();
      aviso(mensagens, sucesso, 'sucesso');
    } catch (erro) {
      if (mostrarErros(formulario, erro) && erro.codigo === 'VALIDACAO') aviso(mensagens, 'Corrija os campos assinalados.');
      else aviso(mensagens, erro.message);
    }
  });
}

montarFormAno();
submeter(formAno, '/anos-letivos', 'Ano letivo criado.');
submeter(formTurma, '/turmas', 'Turma criada.');
carregar();
