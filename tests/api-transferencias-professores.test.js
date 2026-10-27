'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { iniciar, dadosAno, dadosTurma, dadosAluno, dadosOcorrencia } = require('./auxiliar');

let app; let turmaA; let turmaB; let turmaOutroAno; let aluno; let professorId;
const criarProfessor = (nome, estado = 'ativo', perfil = 'professor') => Number(app.db.prepare(
  "INSERT INTO utilizador (nome,email,palavra_passe_hash,perfil,estado) VALUES (?,?,'hash-de-teste',?,?)"
).run(nome, `${nome.toLowerCase().replaceAll(' ','')}@escola.ao`, perfil, estado).lastInsertRowid);

beforeEach(async () => {
  app = await iniciar();
  const ano = await app.pedir('POST','/api/anos-letivos',dadosAno());
  turmaA = (await app.pedir('POST','/api/turmas',dadosTurma(ano.corpo.id))).corpo;
  turmaB = (await app.pedir('POST','/api/turmas',dadosTurma(ano.corpo.id,{nome:'9.ª B'}))).corpo;
  const outro = (await app.pedir('POST','/api/anos-letivos',dadosAno({designacao:'2026/2027',data_inicio:'2026-09-01',data_fim:'2027-07-15'}))).corpo;
  turmaOutroAno = (await app.pedir('POST','/api/turmas',dadosTurma(outro.id,{nome:'10.ª A'}))).corpo;
  aluno = (await app.pedir('POST','/api/alunos',dadosAluno(turmaA.id))).corpo;
  professorId = criarProfessor('Professor Um');
});
afterEach(async () => { await app.fechar(); });

describe('atribuição professor-turma', () => {
  it('aceita a atribuição, mas impede duas turmas por professor e dois professores na turma', async () => {
    assert.equal((await app.pedir('PUT',`/api/turmas/${turmaA.id}/professor`,{professor_id:professorId})).status,200);
    assert.equal((await app.pedir('PUT',`/api/turmas/${turmaB.id}/professor`,{professor_id:professorId})).status,409);
    const outroProfessor=criarProfessor('Professor Dois');
    assert.equal((await app.pedir('PUT',`/api/turmas/${turmaA.id}/professor`,{professor_id:outroProfessor})).status,200);
    assert.equal((await app.pedir('GET',`/api/turmas/${turmaA.id}`)).corpo.professor_id,outroProfessor);
  });
  it('recusa professor inativo ou utilizador com outro perfil', async () => {
    const inativo=criarProfessor('Professor Inativo','inativo'); const coordenador=criarProfessor('Coordenador','ativo','coordenador');
    assert.equal((await app.pedir('PUT',`/api/turmas/${turmaA.id}/professor`,{professor_id:inativo})).status,400);
    assert.equal((await app.pedir('PUT',`/api/turmas/${turmaA.id}/professor`,{professor_id:coordenador})).status,400);
  });
  it('permite remover a atribuição', async () => {
    await app.pedir('PUT',`/api/turmas/${turmaA.id}/professor`,{professor_id:professorId});
    assert.equal((await app.pedir('PUT',`/api/turmas/${turmaA.id}/professor`,{professor_id:null})).corpo.professor_id,null);
  });
});

describe('acesso do professor e transferência interna', () => {
  it('professor sem turma recebe lista vazia e não acede a uma turma por ID', async () => {
    const sessao=app.criarSessao(professorId);
    assert.deepEqual((await app.pedirComo('GET','/api/alunos',undefined,sessao)).corpo,[]);
    assert.deepEqual((await app.pedirComo('GET','/api/turmas',undefined,sessao)).corpo,[]);
    assert.equal((await app.pedirComo('GET',`/api/alunos/${aluno.id}`,undefined,sessao)).status,404);
  });
  it('limita turma, alunos e ocorrências à turma atribuída e permite editar ocorrências da turma', async () => {
    const alunoA2=(await app.pedir('POST','/api/alunos',dadosAluno(turmaA.id,{numero_matricula:'2025003',nome_completo:'Rita Matondo'}))).corpo;
    const alunoB=(await app.pedir('POST','/api/alunos',dadosAluno(turmaB.id,{numero_matricula:'2025002',nome_completo:'Pedro Santos'}))).corpo;
    await app.pedir('PUT',`/api/turmas/${turmaA.id}/professor`,{professor_id:professorId});
    const sessao=app.criarSessao(professorId);
    assert.equal((await app.pedirComo('GET','/api/alunos',undefined,sessao)).corpo.length,2);
    assert.equal((await app.pedirComo('GET',`/api/alunos/${alunoB.id}`,undefined,sessao)).status,404);
    assert.equal((await app.pedirComo('GET',`/api/turmas/${turmaB.id}`,undefined,sessao)).status,404);
    assert.equal((await app.pedirComo('GET','/api/turmas/professores-disponiveis',undefined,sessao)).status,403);
    assert.equal((await app.pedirComo('POST',`/api/alunos/${alunoB.id}/ocorrencias`,dadosOcorrencia(professorId),sessao)).status,404);
    const ocorrencia=(await app.pedirComo('POST',`/api/alunos/${aluno.id}/ocorrencias`,dadosOcorrencia(999),sessao));
    assert.equal(ocorrencia.status,201);
    assert.equal((await app.pedirComo('GET','/api/ocorrencias',undefined,sessao)).corpo.length,1);
    assert.equal((await app.pedirComo('PUT',`/api/ocorrencias/${ocorrencia.corpo.id}`,{...dadosOcorrencia(999),descricao:'Descrição corrigida'},sessao)).corpo.descricao,'Descrição corrigida');
    const eventoB=(await app.pedir('POST',`/api/alunos/${alunoB.id}/ocorrencias`,dadosOcorrencia(app.utilizadorId))).corpo;
    assert.equal((await app.pedirComo('GET',`/api/ocorrencias/${eventoB.id}`,undefined,sessao)).status,404);
    assert.equal((await app.pedirComo('PUT',`/api/ocorrencias/${eventoB.id}`,dadosOcorrencia(app.utilizadorId),sessao)).status,404);
    assert.ok(alunoA2.id);
    assert.equal((await app.pedirComo('POST','/api/alunos',dadosAluno(turmaA.id),sessao)).status,403);
  });
  it('o professor marca uma reunião na ocorrência e a família vê situação, histórico e reunião', async () => {
    await app.pedir('PUT',`/api/turmas/${turmaA.id}/professor`,{professor_id:professorId});
    const professorSessao=app.criarSessao(professorId);
    const evento=(await app.pedirComo('POST',`/api/alunos/${aluno.id}/ocorrencias`,{...dadosOcorrencia(professorId),situacao_disciplinar:'suspenso'},professorSessao)).corpo;
    assert.equal(evento.situacao_disciplinar,'suspenso');
    const data=new Date(Date.now()+86400000).toISOString().slice(0,10);
    const reuniao=await app.pedirComo('POST',`/api/ocorrencias/${evento.id}/reunioes`,{data,hora:'14:30',motivo:'Conversar sobre o acompanhamento do aluno.'},professorSessao);
    assert.equal(reuniao.status,201);
    assert.equal(reuniao.corpo.estado,'marcada');
    const alunoFora=(await app.pedir('POST','/api/alunos',dadosAluno(turmaB.id,{numero_matricula:'2025008'}))).corpo;
    const eventoFora=(await app.pedir('POST',`/api/alunos/${alunoFora.id}/ocorrencias`,dadosOcorrencia(app.utilizadorId))).corpo;
    assert.equal((await app.pedirComo('POST',`/api/ocorrencias/${eventoFora.id}/reunioes`,{data,hora:'15:00',motivo:'Fora da turma'},professorSessao)).status,404);

    const contaId=Number(app.db.prepare("INSERT INTO utilizador (nome,email,palavra_passe_hash,perfil,aluno_id) VALUES ('Encarregado','familia@escola.ao','hash','aluno',?)").run(aluno.id).lastInsertRowid);
    const portal=await app.pedirComo('GET','/api/portal-aluno',undefined,app.criarSessao(contaId));
    assert.equal(portal.status,200);
    assert.equal(portal.corpo.estado,'ativo');
    assert.equal(portal.corpo.situacao_disciplinar,'suspenso');
    assert.equal(portal.corpo.total_ocorrencias,1);
    assert.equal(portal.corpo.ocorrencias[0].situacao_disciplinar,'suspenso');
    assert.equal(portal.corpo.reunioes.length,1);
    assert.equal(portal.corpo.reunioes[0].motivo,'Conversar sobre o acompanhamento do aluno.');
    assert.equal(portal.corpo.contacto,undefined);
  });
  it('actualiza turma, mantém aluno activo e guarda autor, motivo e ocorrências', async () => {
    await app.pedir('POST',`/api/alunos/${aluno.id}/ocorrencias`,dadosOcorrencia(app.utilizadorId));
    const r=await app.pedir('POST',`/api/alunos/${aluno.id}/transferencias`,{turma_destino_id:turmaB.id,motivo:'Mudança de turno'});
    assert.equal(r.status,201); assert.equal(r.corpo.aluno.turma_id,turmaB.id); assert.equal(r.corpo.aluno.estado,'ativo');
    assert.equal(r.corpo.transferencias[0].utilizador_id,app.utilizadorId); assert.equal(r.corpo.transferencias[0].motivo,'Mudança de turno');
    assert.equal((await app.pedir('GET',`/api/alunos/${aluno.id}/ocorrencias`)).corpo.length,1);
  });
  it('rejeita destino igual, inexistente ou de outro ano sem alterar registos', async () => {
    for (const id of [turmaA.id,999,turmaOutroAno.id]) assert.equal((await app.pedir('POST',`/api/alunos/${aluno.id}/transferencias`,{turma_destino_id:id})).status,400);
    assert.equal((await app.pedir('GET',`/api/alunos/${aluno.id}`)).corpo.turma_id,turmaA.id);
    assert.equal((await app.pedir('GET',`/api/alunos/${aluno.id}/transferencias`)).corpo.length,0);
  });
  it('reverte o histórico se a atualização do aluno falhar', async () => {
    app.db.exec(`CREATE TRIGGER falhar_transferencia BEFORE UPDATE OF turma_id ON aluno BEGIN SELECT RAISE(ABORT, 'falha forçada'); END`);
    const falha = await app.pedir('POST',`/api/alunos/${aluno.id}/transferencias`,{turma_destino_id:turmaB.id});
    assert.equal(falha.status,400);
    assert.equal(app.db.prepare('SELECT turma_id FROM aluno WHERE id=?').get(aluno.id).turma_id,turmaA.id);
    assert.equal(app.db.prepare('SELECT COUNT(*) AS n FROM transferencia_turma WHERE aluno_id=?').get(aluno.id).n,0);
  });
});
