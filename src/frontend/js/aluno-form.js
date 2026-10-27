import { api } from './api.js';
import { el, cabecalho, campo, selecao, aviso, mostrarErros, lerFormulario, idDaUrl, rotuloTurma, SEXOS } from './ui.js';

cabecalho('alunos');

const id = idDaUrl();
const painel = document.getElementById('painel');

async function iniciar() {
  let aluno = {};
  let turmas;
  try {
    [turmas, aluno] = await Promise.all([api('GET', '/turmas'), id ? api('GET', `/alunos/${encodeURIComponent(id)}`) : {}]);
  } catch (erro) {
    aviso(painel, erro.message);
    return;
  }
  if (id) document.getElementById('titulo').textContent = 'Editar aluno';
  if (turmas.length === 0) {
    painel.replaceChildren(el('p', {}, 'Ainda não existem turmas. ', el('a', { href: 'turmas.html' }, 'Crie primeiro um ano letivo e uma turma.')));
    return;
  }

  const hoje = new Date().toISOString().slice(0, 10);
  const form = el('form', { class: 'formulario', novalidate: true },
    campo({ nome: 'numero_matricula', rotulo: 'Número de matrícula', controlo: el('input', { type: 'text', maxlength: 30, required: true, value: aluno.numero_matricula ?? '' }) }),
    campo({ nome: 'nome_completo', rotulo: 'Nome completo', controlo: el('input', { type: 'text', maxlength: 150, required: true, value: aluno.nome_completo ?? '' }) }),
    campo({ nome: 'data_nascimento', rotulo: 'Data de nascimento', controlo: el('input', { type: 'date', max: hoje, required: true, value: aluno.data_nascimento ?? '' }) }),
    campo({ nome: 'sexo', rotulo: 'Sexo', controlo: selecao(Object.entries(SEXOS), aluno.sexo ?? '', { vazio: 'Escolha…' }) }),
    campo({ nome: 'encarregado_educacao', rotulo: 'Encarregado de educação', controlo: el('input', { type: 'text', maxlength: 150, required: true, value: aluno.encarregado_educacao ?? '' }) }),
    campo({ nome: 'contacto', rotulo: 'Contacto do encarregado', controlo: el('input', { type: 'tel', maxlength: 20, required: true, value: aluno.contacto ?? '' }) }),
    campo({ nome: 'turma_id', rotulo: 'Turma', controlo: selecao(turmas.map((t) => [t.id, rotuloTurma(t)]), aluno.turma_id ?? '', { vazio: 'Escolha…' }) }),
    el('div', { class: 'acoes' },
      el('button', { class: 'botao', type: 'submit' }, id ? 'Guardar alterações' : 'Criar aluno'),
      el('a', { class: 'botao botao--secundario', href: id ? `aluno.html?id=${encodeURIComponent(id)}` : 'alunos.html' }, 'Cancelar')));

  form.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const botao = form.querySelector('button[type="submit"]');
    botao.disabled = true;
    try {
      const dados = lerFormulario(form);
      if (dados.turma_id === '') delete dados.turma_id; // o servidor responde "Campo obrigatório"
      const guardado = id ? await api('PUT', `/alunos/${encodeURIComponent(id)}`, dados) : await api('POST', '/alunos', dados);
      location.href = `aluno.html?id=${guardado.id}`;
    } catch (erro) {
      if (!mostrarErros(form, erro) || erro.codigo !== 'VALIDACAO') aviso(painel, erro.message);
      else aviso(painel, 'Corrija os campos assinalados.');
      botao.disabled = false;
    }
  });
  painel.replaceChildren(form);
}

iniciar();
