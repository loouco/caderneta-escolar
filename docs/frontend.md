# Frontend (V5)

HTML, CSS e JavaScript puro (módulos ES), servido pelo Express a partir de `src/frontend/`. Sem frameworks nem passo de compilação.

## Páginas
| Página | Função |
|---|---|
| `login.html` | Ecrã de entrada (só visual até à V6; "Entrar" navega para a lista de alunos) |
| `alunos.html` | Listagem e pesquisa de alunos (nome/matrícula, turma, estado) |
| `aluno-form.html` | Criar (`?`) ou editar (`?id=`) um aluno |
| `aluno.html?id=` | Ficha do aluno, mudança de estado e **histórico de ocorrências** (registar, filtrar por gravidade, corrigir) |
| `ocorrencias.html` | Consulta global de ocorrências com filtros de gravidade e período |
| `turmas.html` | Anos letivos e turmas (criar e listar; eliminar turmas vazias) |

## Código (`src/frontend/js/`)
- `api.js`: cliente da API; converte erros do servidor em `ErroApi` com os erros por campo.
- `ui.js`: construção de elementos (`el`), rótulos, datas, formulários e erros por campo.
- Um módulo por página (`alunos.js`, `aluno.js`, …).

## Decisões
- **Sem `innerHTML`:** todo o conteúdo dinâmico entra com `textContent`/`createElement`, para que dados de alunos nunca sejam interpretados como HTML (XSS). Um teste automático garante-o.
- **O servidor é a autoridade:** o frontend só ajuda (campos obrigatórios, limites, `max` nas datas); as mensagens de erro mostradas junto de cada campo vêm da validação do backend (RN08).
- **Estado e gravidade com texto e cor**, nunca só cor.
- **Responsável pela ocorrência:** escolhido num menu até à V6, quando passa a ser o utilizador autenticado.
- Alunos nunca são eliminados: a ficha só permite mudar o estado (RN07). Ocorrências só se corrigem (RN13).
