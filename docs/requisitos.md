# Requisitos

## Requisitos funcionais
- RF01: Gerir alunos (criar, consultar, actualizar, inactivar).
- RF02: Gerir turmas e anos letivos.
- RF03: Registar ocorrências disciplinares associadas a um aluno.
- RF04: Consultar o histórico de ocorrências de um aluno.
- RF05: Pesquisar alunos (nome, matrícula, turma).
- RF06: Autenticar utilizadores (coordenador, administrador).
- RF07: Restringir funcionalidades de acordo com o perfil.

## Requisitos não funcionais
- RNF01: Palavras-passe armazenadas apenas com hash.
- RNF02: Validação de todos os dados no backend.
- RNF03: Dados pessoais acessíveis apenas a utilizadores autenticados.
- RNF04: Persistência em ficheiro SQLite local.
- RNF05: Código coberto por testes automatizados nas regras críticas.

## Utilizadores
- **Administrador**: gere utilizadores, anos letivos e turmas.
- **Coordenador**: gere alunos e regista ocorrências.

> Nota: as permissões exactas por perfil serão fechadas na V6.
