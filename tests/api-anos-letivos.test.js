'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { iniciar, dadosAno } = require('./auxiliar');

let app;
beforeEach(async () => { app = await iniciar(); });
afterEach(async () => { await app.fechar(); });

describe('API de anos letivos', () => {
  it('cria um ano letivo (estado "planeado" por omissão)', async () => {
    const { estado, ...semEstado } = dadosAno();
    const r = await app.pedir('POST', '/api/anos-letivos', semEstado);
    assert.equal(r.status, 201);
    assert.equal(r.corpo.estado, 'planeado');
    assert.ok(r.corpo.id);
  });

  it('RN12: rejeita data de fim igual ou anterior à de início', async () => {
    const r = await app.pedir('POST', '/api/anos-letivos', dadosAno({ data_fim: '2025-09-01' }));
    assert.equal(r.status, 400);
    assert.ok(r.corpo.erro.detalhes.data_fim);
  });

  it('rejeita datas inválidas e estado inválido', async () => {
    const r = await app.pedir('POST', '/api/anos-letivos', dadosAno({ data_inicio: '2025-02-30', estado: 'x' }));
    assert.equal(r.status, 400);
    assert.ok(r.corpo.erro.detalhes.data_inicio);
    assert.ok(r.corpo.erro.detalhes.estado);
  });

  it('rejeita designação duplicada com 409', async () => {
    await app.pedir('POST', '/api/anos-letivos', dadosAno());
    const r = await app.pedir('POST', '/api/anos-letivos', dadosAno());
    assert.equal(r.status, 409);
  });

  it('lista, obtém e devolve 404/400 quando apropriado', async () => {
    const criado = await app.pedir('POST', '/api/anos-letivos', dadosAno());
    assert.equal((await app.pedir('GET', '/api/anos-letivos')).corpo.length, 1);
    assert.equal((await app.pedir('GET', `/api/anos-letivos/${criado.corpo.id}`)).status, 200);
    assert.equal((await app.pedir('GET', '/api/anos-letivos/999')).status, 404);
    assert.equal((await app.pedir('GET', '/api/anos-letivos/abc')).status, 400);
  });

  it('atualiza um ano letivo; o estado é obrigatório no PUT', async () => {
    const criado = await app.pedir('POST', '/api/anos-letivos', dadosAno());
    const url = `/api/anos-letivos/${criado.corpo.id}`;

    const ok = await app.pedir('PUT', url, dadosAno({ estado: 'encerrado' }));
    assert.equal(ok.status, 200);
    assert.equal(ok.corpo.estado, 'encerrado');

    const { estado, ...semEstado } = dadosAno();
    assert.equal((await app.pedir('PUT', url, semEstado)).status, 400);
  });
});
