import { api } from './api.js';
import { el, cabecalho, aviso } from './ui.js';

const resultado = document.getElementById('resultado');
const mensagens = document.getElementById('mensagens');
const formulario = document.getElementById('form-utilizador');
const perfil = document.getElementById('perfil');
const campoAluno = document.getElementById('campo-aluno');
const alunoSelect = document.getElementById('aluno_id');
const nomeInput = document.getElementById('nome');
const opcoesPerfil = {
  administrador: 'Administrador',
  coordenador: 'Coordenador',
  professor: 'Professor',
  aluno: 'Aluno',
};

async function atualizarAlunosDisponiveis() {
  campoAluno.hidden = perfil.value !== 'aluno';
  nomeInput.readOnly = perfil.value === 'aluno';
  nomeInput.placeholder = perfil.value === 'aluno' ? 'Preenchido pelo registo do aluno' : '';
  alunoSelect.required = perfil.value === 'aluno';
  if (perfil.value !== 'aluno') return;
  const alunos = await api('GET', '/utilizadores/alunos-disponiveis');
  alunoSelect.replaceChildren(el('option', { value: '' }, 'Escolha um aluno sem conta'));
  for (const aluno of alunos) {
    alunoSelect.append(el('option', { value: aluno.id }, `${aluno.nome_completo} · ${aluno.numero_matricula}`));
  }
  if (alunos.length === 0) aviso(mensagens, 'Todos os alunos já têm conta. Registe primeiro um aluno ou escolha outro perfil.');
}

perfil.addEventListener('change', () => {
  nomeInput.value = '';
  atualizarAlunosDisponiveis().catch((erro) => aviso(mensagens, erro.message));
});

alunoSelect.addEventListener('change', () => {
  nomeInput.value = alunoSelect.selectedOptions[0]?.textContent.split(' · ')[0] ?? '';
});

async function carregar() {
  try {
    const utilizadores = await api('GET', '/utilizadores');
    if (!utilizadores.length) {
      resultado.replaceChildren(el('p', { class: 'vazio' }, 'Ainda não existem utilizadores.'));
      return;
    }
    resultado.replaceChildren(el('div', { class: 'tabela-envolvente' },
      el('table', {},
        el('thead', {}, el('tr', {},
          ['Nome', 'Email', 'Perfil', 'Matrícula', 'Estado', 'Acesso'].map((rotulo) => el('th', {}, rotulo)))),
        el('tbody', {}, utilizadores.map((utilizador) => {
          const estado = el('span', {
            class: `etiqueta etiqueta--${utilizador.estado === 'ativo' ? 'ativo' : 'inativo'}`,
          }, utilizador.estado === 'ativo' ? 'Ativo' : 'Inativo');
          const alternar = el('button', {
            class: `botao botao--pequeno ${utilizador.estado === 'ativo' ? 'botao--perigo' : 'botao--secundario'}`,
            type: 'button',
            onclick: async () => {
              const proximo = utilizador.estado === 'ativo' ? 'inativo' : 'ativo';
              try {
                await api('PATCH', `/utilizadores/${utilizador.id}/estado`, { estado: proximo });
                aviso(mensagens, 'Estado do utilizador atualizado.', 'sucesso');
                await carregar();
              } catch (erro) {
                aviso(mensagens, erro.message);
              }
            },
          }, utilizador.estado === 'ativo' ? 'Desativar' : 'Ativar');
          return el('tr', {},
            el('td', {}, utilizador.nome),
            el('td', {}, utilizador.email),
            el('td', {}, opcoesPerfil[utilizador.perfil] ?? utilizador.perfil),
            el('td', {}, utilizador.numero_matricula ?? '—'),
            el('td', {}, estado),
            el('td', {}, alternar));
        }))));
  } catch (erro) {
    resultado.replaceChildren();
    aviso(mensagens, erro.message);
  }
}

formulario.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  if (!formulario.reportValidity()) return;
  const dados = Object.fromEntries(new FormData(formulario));
  const alunoId = dados.aluno_id;
  delete dados.aluno_id;
  if (dados.perfil === 'aluno') {
    delete dados.perfil;
    dados.nome = nomeInput.value;
  }
  const botao = formulario.querySelector('[type="submit"]');
  botao.disabled = true;
  try {
    const caminho = alunoId && perfil.value === 'aluno'
      ? `/utilizadores/alunos/${encodeURIComponent(alunoId)}/conta`
      : '/utilizadores';
    await api('POST', caminho, dados);
    formulario.reset();
    aviso(mensagens, 'Utilizador criado com sucesso.', 'sucesso');
    await carregar();
  } catch (erro) {
    aviso(mensagens, erro.message);
  } finally {
    botao.disabled = false;
  }
});

await cabecalho('utilizadores');
atualizarAlunosDisponiveis().catch((erro) => aviso(mensagens, erro.message));
carregar();
