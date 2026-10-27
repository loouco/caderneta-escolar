'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { Validador, lerId, dataIsoValida } = require('../src/backend/validacao');

describe('dataIsoValida', () => {
  it('aceita datas reais', () => {
    assert.ok(dataIsoValida('2025-09-01'));
    assert.ok(dataIsoValida('2024-02-29')); // ano bissexto
  });

  it('rejeita formatos e datas impossíveis', () => {
    for (const v of ['2025-02-30', '2023-02-29', '01/09/2025', '2025-9-1', 'ontem', '', null, 20250901, '1800-01-01']) {
      assert.equal(dataIsoValida(v), false, `devia rejeitar ${v}`);
    }
  });
});

describe('lerId', () => {
  it('converte inteiros positivos', () => assert.equal(lerId('12'), 12));

  it('rejeita valores inválidos', () => {
    for (const v of ['0', '-1', '1.5', 'abc', '', '1; DROP TABLE aluno', undefined]) {
      assert.throws(() => lerId(v), (e) => e.status === 400);
    }
  });
});

describe('Validador', () => {
  it('rejeita corpo que não é objeto', () => {
    for (const corpo of [undefined, null, 'texto', 5, []]) {
      assert.throws(() => new Validador(corpo), (e) => e.status === 400 && Boolean(e.detalhes.corpo));
    }
  });

  it('remove espaços e ignora campos desconhecidos', () => {
    const v = new Validador({ nome: '  Ana  ', admin: true });
    v.texto('nome');
    assert.deepEqual(v.concluir(), { nome: 'Ana' });
  });

  it('acumula erros de vários campos', () => {
    const v = new Validador({});
    v.texto('a');
    v.data('b');
    assert.throws(() => v.concluir(), (e) => Boolean(e.detalhes.a && e.detalhes.b));
  });

  it('rejeita tipos errados em texto e em inteiros', () => {
    const v = new Validador({ nome: 123, id: '5' });
    v.texto('nome');
    v.inteiroPositivo('id');
    assert.throws(() => v.concluir(), (e) => e.detalhes.nome === 'Deve ser texto.' && Boolean(e.detalhes.id));
  });

  it('valida segredos sem remover espaços significativos', () => {
    const segredo = '  palavra-passe-segura  ';
    const v = new Validador({ palavra_passe: segredo });
    v.segredo('palavra_passe', { min: 12, max: 128 });
    assert.equal(v.concluir().palavra_passe, segredo);
  });

  it('rejeita segredos vazios, curtos ou maiores que o limite', () => {
    for (const segredo of ['', '   ', 'curta', 'x'.repeat(129)]) {
      const v = new Validador({ palavra_passe: segredo });
      v.segredo('palavra_passe', { min: 12, max: 128 });
      assert.throws(() => v.concluir(), (e) => Boolean(e.detalhes.palavra_passe));
    }
  });
});
