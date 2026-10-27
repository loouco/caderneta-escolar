# Requisitos

## Requisitos funcionais
- RF01: Gerir alunos (criar, consultar, actualizar, inactivar).
- RF02: Gerir turmas e anos letivos.
- RF03: Registar ocorrências disciplinares associadas a um aluno.
- RF04: Consultar o histórico de ocorrências de um aluno.
- RF05: Pesquisar alunos (nome, matrícula, turma).
- RF06: Autenticar utilizadores (coordenador, administrador).
- RF07: Restringir funcionalidades de acordo com o perfil.
- RF08: Permitir ao aluno autenticar-se e consultar apenas o seu estado escolar, matrícula, turma e ano letivo.

## Requisitos não funcionais
- RNF01: Palavras-passe armazenadas apenas com hash.
- RNF02: Validação de todos os dados no backend.
- RNF03: Dados pessoais acessíveis apenas a utilizadores autenticados.
- RNF04: Persistência em ficheiro SQLite local.
- RNF05: Código coberto por testes automatizados nas regras críticas.

## Utilizadores
- **Administrador**: gere utilizadores, anos letivos e turmas.
- **Coordenador**: gere alunos e regista ocorrências.

O administrador pode gerir contas, anos letivos e turmas, além de aceder às funcionalidades escolares. O professor e o coordenador gerem alunos e ocorrências. O aluno consulta apenas o próprio estado escolar. Todos precisam de uma sessão válida.
