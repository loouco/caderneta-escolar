import { api, consulta } from './api.js';
import { el, cabecalho, etiqueta, aviso, formatarData, GRAVIDADES } from './ui.js';

cabecalho('ocorrencias');

const gravidade = document.getElementById('gravidade');
const de = document.getElementById('de');
const ate = document.getElementById('ate');
const resultado = document.getElementById('resultado');

for (const [valor, texto] of Object.entries(GRAVIDADES)) gravidade.append(el('option', { value: valor }, texto));

async function carregar() {
  try {
    const lista = await api('GET', `/ocorrencias${consulta({ gravidade: gravidade.value, de: de.value, ate: ate.value })}`);
    if (lista.length === 0) {
      resultado.replaceChildren(el('p', { class: 'vazio' }, 'Nenhuma ocorrência encontrada.'));
      return;
    }
    resultado.replaceChildren(el('div', { class: 'tabela-envolvente' }, el('table', {},
      el('thead', {}, el('tr', {}, ['Data', 'Aluno', 'Tipo', 'Gravidade', 'Responsável'].map((t) => el('th', {}, t)))),
      el('tbody', {}, lista.map((o) => el('tr', {},
        el('td', {}, formatarData(o.data)),
        el('td', {}, el('a', { href: `aluno.html?id=${o.aluno_id}` }, o.aluno_nome)),
        el('td', {}, o.tipo),
        el('td', {}, etiqueta(o.gravidade, GRAVIDADES)),
        el('td', {}, o.utilizador_nome)))))));
  } catch (erro) {
    resultado.replaceChildren();
    aviso(resultado, erro.message);
  }
}

for (const controlo of [gravidade, de, ate]) controlo.addEventListener('change', carregar);
carregar();
