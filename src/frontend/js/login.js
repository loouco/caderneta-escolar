import { api, definirTokenCSRF, ErroApi } from './api.js';

const formulario = document.getElementById('form-login');
const mensagem = document.getElementById('mensagem');
const botao = document.getElementById('botao-entrar');

try {
  const sessao = await api('GET', '/auth/sessao');
  location.replace(sessao.utilizador.perfil === 'aluno' ? '/portal-aluno.html' : sessao.utilizador.perfil === 'professor' ? '/professor.html' : '/alunos.html');
} catch {
  // Sem sessão ativa, permanece no formulário de autenticação.
}

formulario.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  mensagem.hidden = true;
  mensagem.textContent = '';
  if (!formulario.reportValidity()) return;

  botao.disabled = true;
  botao.firstElementChild.textContent = 'A validar acesso…';
  const dados = new FormData(formulario);
  try {
    const sessao = await api('POST', '/auth/entrar', {
      email: dados.get('email'),
      palavra_passe: dados.get('palavra_passe'),
    });
    definirTokenCSRF(sessao.csrf_token);
    location.replace(sessao.utilizador.perfil === 'aluno' ? '/portal-aluno.html' : sessao.utilizador.perfil === 'professor' ? '/professor.html' : '/alunos.html');
  } catch (erro) {
    mensagem.textContent = erro instanceof ErroApi
      ? erro.message
      : 'Não foi possível iniciar sessão. Tente novamente.';
    mensagem.hidden = false;
    document.getElementById('palavra_passe').focus();
  } finally {
    botao.disabled = false;
    botao.firstElementChild.textContent = 'Entrar na caderneta';
  }
});
