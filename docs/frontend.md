# Frontend

HTML, CSS e JavaScript puro (módulos ES), servido pelo Express a partir de `src/frontend/`. Sem frameworks nem passo de compilação.

## Páginas
| Página | Função |
|---|---|
| `login.html` | Entrada real com mensagem de erro e navegação após autenticação |
| `alunos.html` | Listagem e pesquisa de alunos (nome/matrícula, turma, estado) |
| `aluno-form.html` | Criar (`?`) ou editar (`?id=`) um aluno |
| `aluno.html?id=` | Ficha do aluno, mudança de estado e **histórico de ocorrências** (registar, filtrar por gravidade, corrigir) |
| `ocorrencias.html` | Consulta global de ocorrências com filtros de gravidade e período |
| `turmas.html` | Anos letivos e turmas (criar e listar; eliminar turmas vazias) |
| `utilizadores.html` | Gestão de contas, disponível apenas para administradores |
| `portal-aluno.html` | Consulta privada do estado e matrícula do aluno autenticado |

## Código (`src/frontend/js/`)
- `api.js`: cliente da API; converte erros do servidor em `ErroApi` com os erros por campo.
- `ui.js`: construção de elementos (`el`), rótulos, datas, formulários e erros por campo.
- Um módulo por página (`alunos.js`, `aluno.js`, …).

## Decisões
- **Sem `innerHTML`:** todo o conteúdo dinâmico entra com `textContent`/`createElement`, para que dados de alunos nunca sejam interpretados como HTML (XSS). Um teste automático garante-o.
- **O servidor é a autoridade:** o frontend só ajuda (campos obrigatórios, limites, `max` nas datas); as mensagens de erro mostradas junto de cada campo vêm da validação do backend (RN08).
- **Estado e gravidade com texto e cor**, nunca só cor.
- **Responsável pela ocorrência:** definido pelo utilizador autenticado no backend; o formulário não aceita um responsável fornecido pelo cliente.
- Alunos nunca são eliminados: a ficha só permite mudar o estado (RN07). Ocorrências só se corrigem (RN13).
- A navegação mostra a conta autenticada e oferece término de sessão; as páginas internas exigem uma sessão ativa.
- O ecrã de entrada e a área interna usam uma identidade visual consistente, responsiva e acessível por teclado.
