import { api, consulta } from './api.js';
import {
  el, cabecalho, campo, selecao, etiqueta, aviso, limparAviso, mostrarErros, lerFormulario,
  formatarData, idDaUrl, GRAVIDADES, ESTADOS_ALUNO, SITUACOES_DISCIPLINARES, SEXOS,
} from './ui.js';

const utilizador = await cabecalho('alunos');
const professor = utilizador?.perfil === 'professor';

const id = idDaUrl();
const raiz = document.getElementById('ficha');
const TIPOS_SUGERIDOS = ['Atraso', 'Falta de material', 'Indisciplina', 'Falta de respeito', 'Agressão', 'Uso indevido de telemóvel', 'Danos materiais'];

let aluno;
let historicoEl;
let filtroGravidade;
let formOcorrencia;
let transferenciasEl;
let emEdicao = null; // ocorrência a corrigir, ou null quando se está a registar uma nova

async function iniciar() {
  try {
    aluno = await api('GET', `/alunos/${encodeURIComponent(id)}`);
  } catch (erro) {
    aviso(raiz, erro.status === 404 ? 'Aluno não encontrado.' : erro.message);
    return;
  }
  document.title = `${aluno.nome_completo} | Caderneta Escolar`;
  desenharFicha();
  await Promise.all([carregarHistorico(), carregarTransferencias()]);
  if (professor && new URLSearchParams(location.search).get('ocorrencia') === 'nova') abrirFormulario(null);
}

function desenharFicha() {
  const dado = (rotulo, valor) => [el('dt', {}, rotulo), el('dd', {}, valor)];
  const seletorEstado = selecao(Object.entries(ESTADOS_ALUNO), aluno.estado);
  seletorEstado.setAttribute('aria-label', 'Estado do aluno');
  const botaoEstado = el('button', { class: 'botao botao--secundario', type: 'button' }, 'Alterar estado');
  botaoEstado.addEventListener('click', async () => {
    try {
      aluno = await api('PATCH', `/alunos/${encodeURIComponent(id)}/estado`, { estado: seletorEstado.value });
      desenharFicha();
      aviso(raiz, 'Estado atualizado.', 'sucesso');
    } catch (erro) {
      aviso(raiz, erro.message);
    }
  });

  historicoEl = el('ol', { class: 'historico' });
  filtroGravidade = selecao(Object.entries(GRAVIDADES), '', { vazio: 'Todas as gravidades' });
  filtroGravidade.setAttribute('aria-label', 'Filtrar por gravidade');
  filtroGravidade.addEventListener('change', carregarHistorico);

  const novo = el('button', { class: 'botao', type: 'button' }, 'Registar ocorrência');
  const transferir = el('button', { class: 'botao botao--secundario', type: 'button' }, 'Transferir de turma');
  transferir.addEventListener('click', abrirTransferencia);
  transferenciasEl = el('ol', { class: 'historico' });
  novo.addEventListener('click', () => abrirFormulario(null));
  if (professor) { seletorEstado.disabled = true; botaoEstado.hidden = true; }
  formOcorrencia = el('section', { class: 'painel', hidden: true });

  raiz.replaceChildren(
    el('div', { class: 'topo' },
      el('h1', {}, aluno.nome_completo),
      !professor && el('a', { class: 'botao botao--secundario', href: `aluno-form.html?id=${aluno.id}` }, 'Editar dados')),
    el('section', { class: 'painel' },
      el('dl', { class: 'ficha' },
        dado('Matrícula', aluno.numero_matricula),
        dado('Turma', `${aluno.turma_nome} (${aluno.ano_letivo_designacao})`),
        dado('Data de nascimento', formatarData(aluno.data_nascimento)),
        dado('Sexo', SEXOS[aluno.sexo]),
        dado('Encarregado de educação', aluno.encarregado_educacao),
        dado('Contacto', aluno.contacto),
        dado('Estado da matrícula', etiqueta(aluno.estado, ESTADOS_ALUNO)),
        dado('Situação disciplinar', etiqueta(aluno.situacao_disciplinar, SITUACOES_DISCIPLINARES))),
      !professor && el('div', { class: 'filtros', style: 'margin: 1rem 0 0' }, seletorEstado, botaoEstado)),
    el('div', { class: 'topo' }, el('h2', { style: 'margin:0' }, 'Histórico de ocorrências'), el('div', { class: 'filtros', style: 'margin:0' }, filtroGravidade, novo, !professor && transferir)),
    formOcorrencia, historicoEl,
    el('h2', {}, 'Histórico de transferências'), transferenciasEl);
}

async function carregarTransferencias() {
  try {
    const lista = await api('GET', `/alunos/${encodeURIComponent(id)}/transferencias`);
    transferenciasEl.replaceChildren(...(lista.length ? lista.map((t) => el('li', { class: 'ocorrencia' }, `${t.turma_origem_nome} → ${t.turma_destino_nome} · ${t.data_hora} · por ${t.utilizador_nome}`, t.motivo && el('p', {}, t.motivo))) : [el('li', { class: 'vazio' }, 'Ainda não houve transferências internas.') ]));
  } catch (erro) { aviso(raiz, erro.message); }
}

async function abrirTransferencia() {
  const turmas = await api('GET', '/turmas');
  const destinos = turmas.filter((t) => t.ano_letivo_designacao === aluno.ano_letivo_designacao && t.id !== aluno.turma_id);
  if (!destinos.length) { aviso(raiz, 'Não há outra turma disponível no mesmo ano letivo.'); return; }
  const painelTransferencia = el('section', { class: 'painel' });
  const form = el('form', { class: 'formulario', novalidate: true },
    campo({ nome: 'turma_destino_id', rotulo: 'Turma atual: ' + aluno.turma_nome + ' · Turma de destino', controlo: selecao(destinos.map((t) => [t.id, `${t.nome} — ${t.classe}`]), '', { vazio: 'Escolha…' }) }),
    campo({ nome: 'motivo', rotulo: 'Motivo (opcional)', controlo: el('textarea', { maxlength: 500 }) }),
    el('div', { class: 'acoes' }, el('button', { class: 'botao', type: 'submit' }, 'Confirmar transferência'), el('button', { class: 'botao botao--secundario', type: 'button', onclick: () => painelTransferencia.remove() }, 'Cancelar')));
  form.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const dados = lerFormulario(form); dados.turma_destino_id = Number(dados.turma_destino_id);
    if (!confirm(`Transferir ${aluno.nome_completo} de ${aluno.turma_nome} para a turma selecionada?`)) return;
    const botao = form.querySelector('button[type="submit"]'); botao.disabled = true;
    try { const resultado = await api('POST', `/alunos/${aluno.id}/transferencias`, dados); aluno = resultado.aluno; painelTransferencia.remove(); desenharFicha(); await Promise.all([carregarHistorico(), carregarTransferencias()]); aviso(raiz, 'Transferência registada e turma atualizada.', 'sucesso'); }
    catch (erro) { if (!mostrarErros(form, erro) || erro.codigo !== 'VALIDACAO') aviso(painelTransferencia, erro.message); else aviso(painelTransferencia, 'Corrija os campos assinalados.'); botao.disabled = false; }
  });
  painelTransferencia.append(el('h3', {}, 'Transferência interna'), form); raiz.insertBefore(painelTransferencia, historicoEl);
}

async function carregarHistorico() {
  try {
    const lista = await api('GET', `/alunos/${encodeURIComponent(id)}/ocorrencias${consulta({ gravidade: filtroGravidade.value })}`);
    await desenharHistorico(lista);
  } catch (erro) {
    aviso(raiz, erro.message);
  }
}

async function desenharHistorico(lista) {
  if (lista.length === 0) {
    historicoEl.replaceChildren(el('li', { class: 'vazio' }, filtroGravidade.value ? 'Nenhuma ocorrência com esta gravidade.' : 'Este aluno não tem ocorrências registadas.'));
    return;
  }
  const cartoes = await Promise.all(lista.map(async (o) => {
    let reunioes = [];
    try { reunioes = await api('GET', `/ocorrencias/${o.id}/reunioes`); } catch { /* Mantém a ocorrência visível se as reuniões não carregarem. */ }
    const corrigir = el('button', { class: 'botao botao--secundario botao--pequeno', type: 'button' }, 'Editar ocorrência');
    corrigir.addEventListener('click', () => abrirFormulario(o));
    const marcarReuniao = el('button', { class: 'botao botao--pequeno', type: 'button' }, 'Marcar reunião');
    marcarReuniao.addEventListener('click', () => abrirFormularioReuniao(o));
    const resumoReunioes = reunioes.map((r) => el('div', { class: 'reuniao-inline' },
      `Reunião ${r.estado === 'marcada' ? 'marcada' : r.estado}: ${formatarData(r.data)} às ${r.hora}`,
      el('p', {}, r.motivo)));
    return el('li', { class: `ocorrencia ocorrencia--${o.gravidade}` },
      el('div', { class: 'ocorrencia__topo' },
        el('span', { class: 'ocorrencia__tipo' }, o.tipo),
        etiqueta(o.gravidade, GRAVIDADES),
        etiqueta(o.situacao_disciplinar, SITUACOES_DISCIPLINARES),
        el('span', { class: 'ocorrencia__data' }, formatarData(o.data))),
      el('p', {}, o.descricao),
      o.medida_aplicada && el('p', {}, el('strong', {}, 'Medida aplicada: '), o.medida_aplicada),
      o.observacoes && el('p', {}, el('strong', {}, 'Observações: '), o.observacoes),
      resumoReunioes,
      el('div', { class: 'ocorrencia__meta' }, `Registado por ${o.utilizador_nome}`),
      corrigir, professor && marcarReuniao);
  }));
  historicoEl.replaceChildren(...cartoes);
}

function abrirFormularioReuniao(ocorrencia) {
  const hoje = new Date().toISOString().slice(0, 10);
  const painel = el('section', { class: 'painel painel--rosa' });
  const formulario = el('form', { class: 'formulario', novalidate: true },
    campo({ nome: 'data', rotulo: 'Data da reunião', controlo: el('input', { type: 'date', min: hoje, required: true }) }),
    campo({ nome: 'hora', rotulo: 'Hora', controlo: el('input', { type: 'time', required: true }) }),
    campo({ nome: 'motivo', rotulo: 'Assunto para a família', larga: true, controlo: el('textarea', { maxlength: 500, required: true }) }),
    el('div', { class: 'acoes' },
      el('button', { class: 'botao', type: 'submit' }, 'Confirmar reunião'),
      el('button', { class: 'botao botao--secundario', type: 'button', onclick: () => painel.remove() }, 'Cancelar')));
  formulario.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const botao = formulario.querySelector('[type="submit"]'); botao.disabled = true;
    try {
      await api('POST', `/ocorrencias/${ocorrencia.id}/reunioes`, lerFormulario(formulario));
      painel.remove(); await carregarHistorico(); aviso(raiz, 'Reunião marcada e visível no portal da família.', 'sucesso');
    } catch (erro) {
      if (!mostrarErros(formulario, erro) || erro.codigo !== 'VALIDACAO') aviso(painel, erro.message);
      else aviso(painel, 'Corrija os campos assinalados.');
      botao.disabled = false;
    }
  });
  painel.append(el('h3', {}, `Marcar reunião · ${ocorrencia.tipo}`), formulario);
  raiz.insertBefore(painel, historicoEl);
}

function abrirFormulario(ocorrencia) {
  emEdicao = ocorrencia;
  const o = ocorrencia ?? {};
  const hoje = new Date().toISOString().slice(0, 10);
  const lista = el('datalist', { id: 'tipos' }, TIPOS_SUGERIDOS.map((t) => el('option', { value: t })));

  const form = el('form', { class: 'formulario', novalidate: true },
    campo({ nome: 'tipo', rotulo: 'Tipo', controlo: el('input', { type: 'text', maxlength: 60, list: 'tipos', required: true, value: o.tipo ?? '' }) }),
    campo({ nome: 'data', rotulo: 'Data', controlo: el('input', { type: 'date', max: hoje, required: true, value: o.data ?? hoje }) }),
    campo({ nome: 'gravidade', rotulo: 'Gravidade', controlo: selecao(Object.entries(GRAVIDADES), o.gravidade ?? '', { vazio: 'Escolha…' }) }),
    campo({ nome: 'situacao_disciplinar', rotulo: 'Situação do aluno após a ocorrência', controlo: selecao(Object.entries(SITUACOES_DISCIPLINARES), o.situacao_disciplinar ?? aluno.situacao_disciplinar ?? 'regular') }),
    campo({ nome: 'descricao', rotulo: 'Descrição', larga: true, controlo: el('textarea', { maxlength: 2000, required: true }, o.descricao ?? '') }),
    campo({ nome: 'medida_aplicada', rotulo: 'Medida aplicada (opcional)', larga: true, controlo: el('input', { type: 'text', maxlength: 500, value: o.medida_aplicada ?? '' }) }),
    campo({ nome: 'observacoes', rotulo: 'Observações (opcional)', larga: true, controlo: el('textarea', { maxlength: 1000 }, o.observacoes ?? '') }),
    el('div', { class: 'acoes' },
      el('button', { class: 'botao', type: 'submit' }, ocorrencia ? 'Guardar correção' : 'Registar'),
      el('button', { class: 'botao botao--secundario', type: 'button', onclick: fecharFormulario }, 'Cancelar')),
    lista);

  form.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const botao = form.querySelector('button[type="submit"]');
    botao.disabled = true;
    const dados = lerFormulario(form);
    try {
      if (emEdicao) await api('PUT', `/ocorrencias/${emEdicao.id}`, dados);
      else await api('POST', `/alunos/${encodeURIComponent(id)}/ocorrencias`, dados);
      fecharFormulario();
      await carregarHistorico();
      aviso(raiz, emEdicao ? 'Ocorrência corrigida.' : 'Ocorrência registada.', 'sucesso');
    } catch (erro) {
      if (mostrarErros(form, erro) && erro.codigo === 'VALIDACAO') aviso(formOcorrencia, 'Corrija os campos assinalados.');
      else aviso(formOcorrencia, erro.message);
      botao.disabled = false;
    }
  });

  formOcorrencia.replaceChildren(el('h3', { style: 'margin-top:0' }, ocorrencia ? 'Corrigir ocorrência' : 'Nova ocorrência'), form);
  formOcorrencia.hidden = false;
  form.querySelector('input').focus();
}

function fecharFormulario() {
  formOcorrencia.hidden = true;
  formOcorrencia.replaceChildren();
}

iniciar();
