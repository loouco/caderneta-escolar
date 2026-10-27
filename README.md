# Caderneta Escolar

Sistema web para gestão de alunos e ocorrências disciplinares.
Projecto académico da disciplina de Engenharia de Software.

## Tecnologias
- Frontend: HTML, CSS e JavaScript puro
- Backend: Node.js + Express
- Base de dados: SQLite (ficheiro local)
- Testes: Node.js Test Runner
- Versionamento: Git e GitHub

## Estado do projecto
| Versão | Descrição | Estado |
|---|---|---|
| V1 | Planeamento e estrutura | Concluída |
| V2 | Base de dados | Concluída |
| V3 | Backend (CRUD alunos e turmas) | Concluída |
| V4 | Ocorrências | Pendente |
| V5 | Frontend | Pendente |
| V6 | Autenticação | Pendente |
| V7 | Testes e finalização | Pendente |

## Documentação
- [Requisitos](docs/requisitos.md)
- [Entidades](docs/entidades.md)
- [Regras de negócio](docs/regras-negocio.md)
- [Base de dados](docs/base-dados.md)
- [API REST](docs/api.md)

## Requisitos de ambiente
- Node.js 20 ou superior

## Como executar
```bash
npm install        # instala as dependências
npm start          # arranca o servidor em http://localhost:3000
npm test           # corre os testes
```
Com o servidor a correr, abra http://localhost:3000 para ver o ecrã de login.
A API está documentada em [docs/api.md](docs/api.md).
A base de dados `database/caderneta.db` é criada automaticamente no primeiro arranque.

> A API ainda não tem autenticação (V6). Por segurança, o servidor só aceita ligações locais.
