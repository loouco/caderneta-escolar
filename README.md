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
| V4 | Ocorrências | Concluída |
| V5 | Frontend | Concluída |
| V6–V7 | Autenticação, testes e finalização | Concluídas em conjunto |

## Documentação
- [Requisitos](docs/requisitos.md)
- [Entidades](docs/entidades.md)
- [Regras de negócio](docs/regras-negocio.md)
- [Base de dados](docs/base-dados.md)
- [API REST](docs/api.md)
- [Frontend](docs/frontend.md)

## Requisitos de ambiente
- Node.js 20 ou superior

## Como executar
```bash
npm install        # instala as dependências
npm run db:demo    # (opcional) cria contas e alunos de demonstração e imprime senhas aleatórias
npm run db:criar-administrador # cria a conta inicial (palavra-passe introduzida sem eco)
npm start          # arranca o servidor em http://localhost:3000
npm test           # corre os testes
npm run db:seed    # (opcional) cria dados de exemplo numa base vazia
```

Na primeira utilização, execute `npm run db:demo` para criar seis alunos com contas próprias, dois professores e um administrador. O comando apresenta palavras-passe aleatórias uma única vez: guarde-as antes de fechar o terminal. Para uma instalação sem dados de demonstração, execute `npm run db:criar-administrador` num terminal interactivo e siga as instruções. Os alunos entram em **O meu estado** para consultar a matrícula e a turma. Os administradores também podem criar contas para alunos existentes na área **Utilizadores**.
A API está documentada em [docs/api.md](docs/api.md).
A base de dados `database/caderneta.db` é criada automaticamente no primeiro arranque.

Por omissão, o servidor só aceita ligações locais (`127.0.0.1`). Para uma instalação acessível na rede, configure um proxy HTTPS antes de definir `HOST`; em produção os cookies são marcados como `Secure`.

As sessões expiram após oito horas, usam cookies `HttpOnly`/`SameSite=Strict`, tokens CSRF nos pedidos de escrita e hashes de palavra-passe scrypt. Professores e coordenadores gerem alunos e ocorrências; só o administrador pode gerir contas, anos letivos e turmas. Cada conta de aluno só pode consultar o próprio estado e matrícula.
