-- Caderneta Escolar | Esquema da base de dados (SQLite)
-- Ordem de criação respeita as dependências entre tabelas.
-- Datas em formato ISO (AAAA-MM-DD), validadas com "date(x) IS x" (o IS trata NULL como falso).
-- As chaves estrangeiras exigem PRAGMA foreign_keys = ON (feito em db.js).

CREATE TABLE IF NOT EXISTS ano_letivo (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  designacao   TEXT    NOT NULL UNIQUE
                       CHECK (length(trim(designacao)) > 0),
  data_inicio  TEXT    NOT NULL CHECK (date(data_inicio) IS data_inicio),
  data_fim     TEXT    NOT NULL CHECK (date(data_fim) IS data_fim),
  estado       TEXT    NOT NULL DEFAULT 'planeado'
                       CHECK (estado IN ('planeado', 'ativo', 'encerrado')),
  CHECK (data_fim > data_inicio)                                   -- RN12
);

CREATE TABLE IF NOT EXISTS turma (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  nome           TEXT    NOT NULL CHECK (length(trim(nome)) > 0),
  classe         TEXT    NOT NULL CHECK (length(trim(classe)) > 0),
  ano_letivo_id  INTEGER NOT NULL
                         REFERENCES ano_letivo (id) ON DELETE RESTRICT,   -- RN06
  UNIQUE (nome, ano_letivo_id)
);

CREATE TABLE IF NOT EXISTS aluno (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  numero_matricula      TEXT    NOT NULL UNIQUE                          -- RN01
                                CHECK (length(trim(numero_matricula)) > 0),
  nome_completo         TEXT    NOT NULL CHECK (length(trim(nome_completo)) > 0),
  data_nascimento       TEXT    NOT NULL CHECK (date(data_nascimento) IS data_nascimento),
  sexo                  TEXT    NOT NULL CHECK (sexo IN ('M', 'F')),
  encarregado_educacao  TEXT    NOT NULL CHECK (length(trim(encarregado_educacao)) > 0),
  contacto              TEXT    NOT NULL CHECK (length(trim(contacto)) > 0),
  turma_id              INTEGER NOT NULL
                                REFERENCES turma (id) ON DELETE RESTRICT,
  estado                TEXT    NOT NULL DEFAULT 'ativo'
                                CHECK (estado IN ('ativo', 'inativo', 'transferido', 'concluido')),
  criado_em             TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS utilizador (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  nome                TEXT    NOT NULL CHECK (length(trim(nome)) > 0),
  email               TEXT    NOT NULL UNIQUE COLLATE NOCASE             -- RN11
                              CHECK (length(trim(email)) > 0),
  palavra_passe_hash  TEXT    NOT NULL CHECK (length(palavra_passe_hash) > 0),
  perfil              TEXT    NOT NULL CHECK (perfil IN ('coordenador', 'administrador')),
  estado              TEXT    NOT NULL DEFAULT 'ativo'
                              CHECK (estado IN ('ativo', 'inativo'))
);

CREATE TABLE IF NOT EXISTS ocorrencia (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  aluno_id         INTEGER NOT NULL
                           REFERENCES aluno (id) ON DELETE RESTRICT,     -- RN02, RN07
  utilizador_id    INTEGER NOT NULL
                           REFERENCES utilizador (id) ON DELETE RESTRICT, -- RN02
  tipo             TEXT    NOT NULL CHECK (length(trim(tipo)) > 0),       -- RN04
  descricao        TEXT    NOT NULL CHECK (length(trim(descricao)) > 0),  -- RN04
  data             TEXT    NOT NULL CHECK (date(data) IS data),            -- RN04
  gravidade        TEXT    NOT NULL
                           CHECK (gravidade IN ('leve', 'moderada', 'grave', 'muito_grave')), -- RN05
  medida_aplicada  TEXT,
  observacoes      TEXT
);

-- Índices para as consultas mais frequentes (pesquisa e histórico).
CREATE INDEX IF NOT EXISTS idx_turma_ano_letivo   ON turma (ano_letivo_id);
CREATE INDEX IF NOT EXISTS idx_aluno_turma        ON aluno (turma_id);
CREATE INDEX IF NOT EXISTS idx_aluno_nome         ON aluno (nome_completo);
CREATE INDEX IF NOT EXISTS idx_ocorrencia_aluno   ON ocorrencia (aluno_id, data);
CREATE INDEX IF NOT EXISTS idx_ocorrencia_utiliz  ON ocorrencia (utilizador_id);
