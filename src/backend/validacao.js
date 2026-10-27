'use strict';

const { erroValidacao } = require('./erros');

const REGEX_DATA = /^\d{4}-\d{2}-\d{2}$/;

/** Verifica formato AAAA-MM-DD e que a data existe de facto (rejeita 2025-02-30). */
function dataIsoValida(valor) {
  if (typeof valor !== 'string' || !REGEX_DATA.test(valor)) return false;
  const [a, m, d] = valor.split('-').map(Number);
  if (a < 1900) return false;
  const data = new Date(Date.UTC(a, m - 1, d));
  return data.getUTCFullYear() === a && data.getUTCMonth() === m - 1 && data.getUTCDate() === d;
}

function hojeIso() {
  return new Date().toISOString().slice(0, 10);
}

/** Converte um identificador vindo do URL em inteiro positivo, ou rejeita com 400. */
function lerId(valor, campo = 'id') {
  if (typeof valor !== 'string' || !/^[1-9]\d{0,14}$/.test(valor)) {
    throw erroValidacao({ [campo]: 'Deve ser um número inteiro positivo.' });
  }
  return Number(valor);
}

/**
 * Valida um corpo de pedido campo a campo.
 * Só os campos pedidos entram em `dados`: o resto é ignorado (evita "mass assignment").
 * Os erros ficam indexados por campo; a primeira mensagem de cada campo prevalece.
 */
class Validador {
  constructor(corpo) {
    if (corpo === null || typeof corpo !== 'object' || Array.isArray(corpo)) {
      throw erroValidacao({ corpo: 'O corpo do pedido deve ser um objeto JSON.' });
    }
    this.corpo = corpo;
    this.dados = {};
    this.erros = {};
  }

  erro(campo, mensagem) {
    this.erros[campo] ??= mensagem;
  }

  texto(campo, { max = 150, padrao, mensagemPadrao } = {}) {
    const valor = this.corpo[campo];
    if (valor === undefined || valor === null) return this.erro(campo, 'Campo obrigatório.');
    if (typeof valor !== 'string') return this.erro(campo, 'Deve ser texto.');
    const limpo = valor.trim();
    if (!limpo) return this.erro(campo, 'Campo obrigatório.');
    if (limpo.length > max) return this.erro(campo, `Máximo de ${max} caracteres.`);
    if (padrao && !padrao.test(limpo)) return this.erro(campo, mensagemPadrao ?? 'Formato inválido.');
    this.dados[campo] = limpo;
  }

  /** Texto opcional: ausente, nulo ou vazio ficam a null. */
  textoOpcional(campo, { max = 500 } = {}) {
    const valor = this.corpo[campo];
    if (valor === undefined || valor === null) { this.dados[campo] = null; return; }
    if (typeof valor !== 'string') return this.erro(campo, 'Deve ser texto.');
    const limpo = valor.trim();
    if (limpo.length > max) return this.erro(campo, `Máximo de ${max} caracteres.`);
    this.dados[campo] = limpo || null;
  }

  data(campo, { naoFutura = false } = {}) {
    const valor = this.corpo[campo];
    if (valor === undefined || valor === null || valor === '') return this.erro(campo, 'Campo obrigatório.');
    if (!dataIsoValida(valor)) return this.erro(campo, 'Data inválida; use o formato AAAA-MM-DD.');
    if (naoFutura && valor > hojeIso()) return this.erro(campo, 'Não pode ser uma data futura.');
    this.dados[campo] = valor;
  }

  opcao(campo, valores, { padrao } = {}) {
    const valor = this.corpo[campo];
    if (valor === undefined || valor === null) {
      if (padrao !== undefined) {
        this.dados[campo] = padrao;
        return;
      }
      return this.erro(campo, 'Campo obrigatório.');
    }
    if (!valores.includes(valor)) return this.erro(campo, `Valores aceites: ${valores.join(', ')}.`);
    this.dados[campo] = valor;
  }

  inteiroPositivo(campo) {
    const valor = this.corpo[campo];
    if (valor === undefined || valor === null) return this.erro(campo, 'Campo obrigatório.');
    if (!Number.isSafeInteger(valor) || valor <= 0) return this.erro(campo, 'Deve ser um número inteiro positivo.');
    this.dados[campo] = valor;
  }

  concluir() {
    if (Object.keys(this.erros).length > 0) throw erroValidacao(this.erros);
    return this.dados;
  }
}

module.exports = { Validador, lerId, dataIsoValida, hojeIso };
