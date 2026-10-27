'use strict';

/**
 * Dados de exemplo para experimentar a aplicação (npm run db:seed).
 * Só corre numa base vazia, por isso é seguro executá-lo mais de uma vez.
 * Os utilizadores criados NÃO têm palavra-passe utilizável: o login real chega na V6.
 */
const { abrirBase } = require('./db');

const SEM_LOGIN = '!sem-login-ate-v6';

const db = abrirBase();
if (db.prepare('SELECT COUNT(*) AS n FROM ano_letivo').get().n > 0) {
  console.log('A base de dados já tem dados; nada foi alterado.');
  db.close();
  process.exit(0);
}

const inserirTudo = db.transaction(() => {
  const ano = db.prepare(
    "INSERT INTO ano_letivo (designacao, data_inicio, data_fim, estado) VALUES ('2026/2027', '2026-09-01', '2027-07-15', 'ativo')"
  ).run().lastInsertRowid;

  const turma = db.prepare('INSERT INTO turma (nome, classe, ano_letivo_id) VALUES (?, ?, ?)');
  const t7a = turma.run('7.ª A', '7.ª classe', ano).lastInsertRowid;
  const t9a = turma.run('9.ª A', '9.ª classe', ano).lastInsertRowid;
  const t9b = turma.run('9.ª B', '9.ª classe', ano).lastInsertRowid;

  const util = db.prepare("INSERT INTO utilizador (nome, email, palavra_passe_hash, perfil) VALUES (?, ?, ?, ?)");
  const ana = util.run('Ana Domingos', 'ana.domingos@escola.ao', SEM_LOGIN, 'coordenador').lastInsertRowid;
  const carlos = util.run('Carlos Baptista', 'carlos.baptista@escola.ao', SEM_LOGIN, 'coordenador').lastInsertRowid;
  util.run('Administrador do Sistema', 'admin@escola.ao', SEM_LOGIN, 'administrador');

  const aluno = db.prepare(
    `INSERT INTO aluno (numero_matricula, nome_completo, data_nascimento, sexo, encarregado_educacao, contacto, turma_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  const mariana = aluno.run('2026001', 'Mariana Domingos Pereira', '2012-04-12', 'F', 'Rosa Pereira', '923 111 222', t7a).lastInsertRowid;
  const joao = aluno.run('2026002', 'João Baptista Gonçalves', '2011-08-30', 'M', 'António Gonçalves', '912 333 444', t7a).lastInsertRowid;
  const sofia = aluno.run('2026003', 'Sofia Nzinga Francisco', '2010-01-22', 'F', 'Madalena Francisco', '924 555 666', t9a).lastInsertRowid;
  const pedro = aluno.run('2026004', 'Pedro Kiala Manuel', '2010-11-05', 'M', 'Isabel Manuel', '931 777 888', t9a).lastInsertRowid;
  aluno.run('2026005', 'Lúcia Sebastião Tavares', '2010-06-17', 'F', 'Jorge Tavares', '922 999 000', t9b);
  aluno.run('2026006', 'Ângelo Cabral Santos', '2010-09-03', 'M', 'Teresa Santos', '925 121 212', t9b);

  const oc = db.prepare(
    `INSERT INTO ocorrencia (aluno_id, utilizador_id, tipo, descricao, data, gravidade, medida_aplicada, observacoes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  oc.run(joao, ana, 'Atraso', 'Chegou 30 minutos depois do início da primeira aula.', '2026-09-14', 'leve', 'Advertência oral', null);
  oc.run(joao, ana, 'Indisciplina', 'Interrompeu a aula de Matemática várias vezes.', '2026-10-05', 'moderada', 'Comunicação ao encarregado de educação', 'Encarregado contactado por telefone.');
  oc.run(sofia, carlos, 'Falta de material', 'Sem o material pedido para a aula de Física, pela terceira vez.', '2026-10-12', 'leve', null, null);
  oc.run(pedro, carlos, 'Agressão', 'Envolveu-se numa briga no recreio.', '2026-10-19', 'grave', 'Suspensão de 2 dias', 'Reunião com o encarregado marcada.');
});

inserirTudo();
db.close();
console.log('Dados de exemplo criados: 1 ano letivo, 3 turmas, 6 alunos, 3 utilizadores e 4 ocorrências.');
