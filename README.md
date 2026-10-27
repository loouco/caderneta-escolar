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
| V3 | Backend (CRUD alunos e turmas) | Pendente |
| V4 | Ocorrências | Pendente |
| V5 | Frontend | Pendente |
| V6 | Autenticação | Pendente |
| V7 | Testes e finalização | Pendente |

## Documentação
- [Requisitos](docs/requisitos.md)
- [Entidades](docs/entidades.md)
- [Regras de negócio](docs/regras-negocio.md)
- [Base de dados](docs/base-dados.md)

## Requisitos de ambiente
- Node.js 20 ou superior

## Como executar
```bash
npm install        # instala as dependências
npm run db:init    # cria a base de dados SQLite
npm test           # corre os testes
```
O servidor web será documentado a partir da V3.
