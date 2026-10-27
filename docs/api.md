# API REST

Base: `http://localhost:3000/api`. Todas as respostas são JSON (excepto `204`).

As rotas escolares exigem autenticação. O servidor só aceita ligações da própria máquina (`127.0.0.1`) por omissão.

## Endpoints

### Saúde
| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/saude` | Confirma que o servidor está a responder |

### Autenticação e sessão
| Método | Rota | Descrição | Sucesso |
|---|---|---|---|
| POST | `/api/auth/entrar` | Autentica email e palavra-passe; emite cookie de sessão | 200 |
| GET | `/api/auth/sessao` | Devolve utilizador e token CSRF da sessão | 200 |
| POST | `/api/auth/sair` | Revoga a sessão atual | 204 |
| POST | `/api/auth/palavra-passe` | Altera a palavra-passe da sessão atual | 204 |

O pedido de entrada recebe `{ "email": "utilizador@escola.ao", "palavra_passe": "..." }`. A alteração de palavra-passe recebe `palavra_passe_atual` e `palavra_passe_nova`. As credenciais inválidas devolvem uma mensagem genérica (`401`). A sessão usa cookie `HttpOnly`, `SameSite=Strict` e validade de oito horas; em produção também requer `Secure` (sirva a aplicação por HTTPS). Pedidos de escrita autenticados devem incluir o `csrf_token` da sessão no cabeçalho `X-CSRF-Token`.

O perfil `coordenador` pode consultar anos letivos e turmas, e gerir alunos e ocorrências. O perfil `administrador` tem essas permissões e pode alterar anos letivos, turmas e contas:

| Método | Rota | Descrição | Sucesso |
|---|---|---|---|
| GET | `/api/utilizadores` | Lista contas sem palavras-passe ou hashes | 200 |
| POST | `/api/utilizadores` | Cria conta de administrador, coordenador ou professor (`nome`, `email`, `palavra_passe`, `perfil`) | 201 |
| GET | `/api/utilizadores/alunos-disponiveis` | Lista alunos sem conta vinculada | 200 |
| POST | `/api/utilizadores/alunos/:id/conta` | Cria conta de aluno associada ao registo (`nome`, `email`, `palavra_passe`) | 201 |
| PATCH | `/api/utilizadores/:id/estado` | Ativa ou desativa uma conta | 200 |

As palavras-passe têm 12–128 caracteres e são armazenadas com scrypt. Desativar uma conta revoga as respetivas sessões; o último administrador ativo não pode ser desativado. A conta de aluno fica vinculada a exatamente um aluno e não pode ser alterada pelo cliente.

### Portal do aluno
| Método | Rota | Descrição | Sucesso |
|---|---|---|---|
| GET | `/api/portal-aluno` | Consulta matrícula, estado escolar, turma e ano letivo do aluno autenticado | 200 |

O portal não aceita um identificador de aluno no pedido: devolve apenas o aluno associado à conta. Contas de aluno não podem consultar as rotas internas de alunos, turmas, ocorrências ou utilizadores.

### Anos letivos
| Método | Rota | Descrição | Sucesso |
|---|---|---|---|
| GET | `/api/anos-letivos` | Lista (mais recente primeiro) | 200 |
| GET | `/api/anos-letivos/:id` | Obtém um | 200 |
| POST | `/api/anos-letivos` | Cria | 201 |
| PUT | `/api/anos-letivos/:id` | Atualiza (todos os campos) | 200 |

Campos: `designacao` (máx. 20), `data_inicio`, `data_fim` (AAAA-MM-DD, fim > início), `estado` (`planeado`, `ativo`, `encerrado`; por omissão `planeado` na criação, obrigatório no PUT).

### Turmas
| Método | Rota | Descrição | Sucesso |
|---|---|---|---|
| GET | `/api/turmas?ano_letivo_id=` | Lista, com filtro opcional por ano | 200 |
| GET | `/api/turmas/:id` | Obtém uma | 200 |
| POST | `/api/turmas` | Cria | 201 |
| PUT | `/api/turmas/:id` | Atualiza `nome` e `classe` | 200 |
| DELETE | `/api/turmas/:id` | Elimina, só se não tiver alunos | 204 |

Campos: `nome`, `classe` (máx. 50) e, só na criação, `ano_letivo_id`. A resposta inclui `ano_letivo_designacao` e `total_alunos`.
Uma turma não muda de ano letivo.

### Alunos
| Método | Rota | Descrição | Sucesso |
|---|---|---|---|
| GET | `/api/alunos?q=&turma_id=&estado=` | Lista/pesquisa (ordenada por nome) | 200 |
| GET | `/api/alunos/:id` | Detalhe completo | 200 |
| POST | `/api/alunos` | Cria (estado inicial `ativo`) | 201 |
| PUT | `/api/alunos/:id` | Atualiza os dados do aluno | 200 |
| PATCH | `/api/alunos/:id/estado` | Altera o estado | 200 |
| DELETE | `/api/alunos/:id` | **Não permitido** (RN07) | 405 |

Campos: `numero_matricula` (máx. 30, único), `nome_completo` (máx. 150), `data_nascimento` (não futura),
`sexo` (`M` ou `F`), `encarregado_educacao` (máx. 150), `contacto` (6 a 20 dígitos, aceita `+`, espaços e `-`), `turma_id`.
Estados: `ativo`, `inativo`, `transferido`, `concluido`.

A pesquisa `q` procura no nome e na matrícula, ignorando maiúsculas e acentos (`joao` encontra `João`).
A **listagem** devolve só `id`, `numero_matricula`, `nome_completo`, `sexo`, `estado`, `turma_id`, `turma_nome` e `total_ocorrencias`.
Os dados pessoais (data de nascimento, encarregado, contacto) só aparecem no **detalhe** (RN09).

### Ocorrências (V4)
| Método | Rota | Descrição | Sucesso |
|---|---|---|---|
| GET | `/api/alunos/:id/ocorrencias?gravidade=&de=&ate=` | Histórico do aluno (mais recente primeiro) | 200 |
| POST | `/api/alunos/:id/ocorrencias` | Regista uma ocorrência | 201 |
| GET | `/api/ocorrencias?aluno_id=&gravidade=&de=&ate=` | Consulta global com filtros | 200 |
| GET | `/api/ocorrencias/:id` | Detalhe | 200 |
| PUT | `/api/ocorrencias/:id` | Corrige o conteúdo (nunca o aluno nem o responsável) | 200 |
| DELETE | `/api/ocorrencias/:id` | **Não permitido** (histórico preservado) | 405 |

Campos: `tipo` (máx. 60), `descricao` (máx. 2000), `data` (AAAA-MM-DD, não futura), `gravidade` (`leve`, `moderada`, `grave`, `muito_grave`),
`medida_aplicada` (opcional, máx. 500) e `observacoes` (opcional, máx. 1000). O responsável é sempre o utilizador da sessão; `utilizador_id` enviado pelo cliente é ignorado.
`de` e `ate` filtram por intervalo de datas (inclusivo). A resposta inclui `aluno_nome`, `aluno_matricula` e `utilizador_nome`.

## Formato dos erros

```json
{
  "erro": {
    "codigo": "VALIDACAO",
    "mensagem": "Os dados enviados são inválidos.",
    "detalhes": { "sexo": "Valores aceites: M, F." }
  }
}
```

| Estado | Código | Quando |
|---|---|---|
| 400 | `VALIDACAO` / `JSON_INVALIDO` | Dados inválidos (`detalhes` indica cada campo) |
| 404 | `NAO_ENCONTRADO` | Recurso ou rota inexistente |
| 405 | `METODO_NAO_PERMITIDO` | Tentativa de eliminar um aluno ou uma ocorrência |
| 409 | `CONFLITO` | Matrícula, designação ou turma duplicadas; turma com alunos |
| 401 | `NAO_AUTENTICADO` / `CREDENCIAIS_INVALIDAS` | Sessão ausente, expirada ou credenciais inválidas |
| 403 | `SEM_PERMISSAO` / `CSRF_INVALIDO` | Perfil insuficiente ou token CSRF ausente/inválido |
| 413 | `CORPO_GRANDE` | Corpo do pedido acima de 10 KB |
| 500 | `ERRO_INTERNO` | Falha inesperada (detalhes só no log do servidor) |

## Decisões de segurança

- Validação no servidor de todos os campos; campos desconhecidos são ignorados (o cliente não consegue definir `estado` ou `criado_em` na criação).
- Consultas SQL sempre parametrizadas (sem concatenar dados do utilizador).
- Respostas da API com `Cache-Control: no-store` e sem o cabeçalho `X-Powered-By`.
- Servidor limitado a `127.0.0.1` por omissão; para mudar, use a variável `HOST`.
- Sessões com token aleatório guardado como hash, cookie `HttpOnly`/`SameSite=Strict`, expiração de oito horas e proteção CSRF nas operações de escrita.
- Palavras-passe com hash scrypt e comparações de credenciais com mensagem genérica.
- Erros internos nunca expõem a stack ao cliente.

## Testar manualmente

Com o servidor a correr (`npm start`), use a extensão **REST Client** do VS Code com o ficheiro
[`api.http`](api.http), ou o Postman / Thunder Client.
