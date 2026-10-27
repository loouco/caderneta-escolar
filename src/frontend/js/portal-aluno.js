import { api } from './api.js';
import { el, cabecalho, aviso, formatarData, ESTADOS_ALUNO, SITUACOES_DISCIPLINARES, GRAVIDADES, etiqueta } from './ui.js';

await cabecalho('portal-aluno');
const mensagens = document.getElementById('mensagens');
const vazia = (texto) => el('li', { class: 'portal-vazio' }, texto);

try {
  const aluno = await api('GET', '/portal-aluno');
  document.title = `Portal da família | ${aluno.nome_completo}`;
  document.getElementById('nome-aluno').textContent = `Olá, ${aluno.nome_completo.split(' ')[0]}.`;
  document.getElementById('estado-aluno').replaceChildren(
    el('div', { class: 'portal-estado__item' }, el('span', { class: 'portal-kicker' }, 'MATRÍCULA'), etiqueta(aluno.estado, ESTADOS_ALUNO), el('small', {}, aluno.estado === 'ativo' ? 'Inscrição ativa' : ESTADOS_ALUNO[aluno.estado] ?? aluno.estado)),
    el('div', { class: 'portal-estado__item' }, el('span', { class: 'portal-kicker' }, 'SITUAÇÃO DISCIPLINAR'), etiqueta(aluno.situacao_disciplinar, SITUACOES_DISCIPLINARES), el('small', {}, SITUACOES_DISCIPLINARES[aluno.situacao_disciplinar] ?? 'Regular')),
    el('div', { class: 'portal-estado__item' }, el('span', { class: 'portal-kicker' }, 'OCORRÊNCIAS'), el('strong', { class: 'portal-numero' }, String(aluno.total_ocorrencias)), el('small', {}, aluno.total_ocorrencias === 1 ? 'registo no histórico' : 'registos no histórico')),
  );
  const dados = [
    ['Número de matrícula', aluno.numero_matricula],
    ['Turma', `${aluno.turma_nome} · ${aluno.turma_classe}`],
    ['Ano letivo', aluno.ano_letivo],
  ];
  document.getElementById('dados-aluno').replaceChildren(...dados.flatMap(([rotulo, valor]) => [el('dt', {}, rotulo), el('dd', {}, valor)]));

  const ocorrencias = aluno.ocorrencias ?? [];
  document.getElementById('total-ocorrencias').textContent = `${ocorrencias.length} ${ocorrencias.length === 1 ? 'registo' : 'registos'}`;
  document.getElementById('lista-ocorrencias').replaceChildren(...(ocorrencias.length ? ocorrencias.map((o) => el('li', { class: 'portal-item' },
    el('div', { class: 'portal-item__topo' }, el('strong', {}, o.tipo), el('span', { class: 'portal-data' }, formatarData(o.data))),
    el('div', { class: 'portal-etiquetas' }, etiqueta(o.gravidade, GRAVIDADES), etiqueta(o.situacao_disciplinar, SITUACOES_DISCIPLINARES)),
    el('p', {}, o.descricao),
    o.medida_aplicada && el('p', { class: 'portal-item__nota' }, el('strong', {}, 'Medida: '), o.medida_aplicada),
  )) : [vazia('Ainda não existem ocorrências registadas.') ]));

  const reunioes = aluno.reunioes ?? [];
  document.getElementById('lista-reunioes').replaceChildren(...(reunioes.length ? reunioes.map((r) => el('li', { class: 'portal-item portal-item--reuniao' },
    el('div', { class: 'portal-item__topo' }, el('strong', {}, r.ocorrencia_tipo), etiqueta(r.estado, { marcada: 'Marcada', realizada: 'Realizada', cancelada: 'Cancelada' })),
    el('p', { class: 'portal-reuniao__data' }, `${formatarData(r.data)} · ${r.hora}`),
    el('p', {}, r.motivo),
    el('small', { class: 'portal-item__nota' }, `Agendada pela escola${r.marcado_por ? ` · ${r.marcado_por}` : ''}`),
  )) : [vazia('Não há reuniões marcadas neste momento.') ]));
} catch (erro) {
  aviso(mensagens, erro.message);
}
