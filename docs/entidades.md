# Entidades

## AnoLetivo
| Atributo | Tipo | Restrições |
|---|---|---|
| id | inteiro | PK, automático |
| designacao | texto | obrigatório, único (ex.: "2025/2026") |
| data_inicio | data | obrigatório |
| data_fim | data | obrigatório, posterior a data_inicio |
| estado | texto | `planeado`, `ativo`, `encerrado` |

## Turma
| Atributo | Tipo | Restrições |
|---|---|---|
| id | inteiro | PK |
| nome | texto | obrigatório |
| classe | texto | obrigatório (ex.: "9.ª classe") |
| ano_letivo_id | inteiro | FK → AnoLetivo, obrigatório |

Único: (nome, ano_letivo_id).

## Aluno
| Atributo | Tipo | Restrições |
|---|---|---|
| id | inteiro | PK |
| numero_matricula | texto | obrigatório, único |
| nome_completo | texto | obrigatório |
| data_nascimento | data | obrigatório |
| sexo | texto | `M` ou `F` |
| encarregado_educacao | texto | obrigatório |
| contacto | texto | obrigatório (contacto do encarregado) |
| turma_id | inteiro | FK → Turma, obrigatório |
| estado | texto | `ativo`, `inativo`, `transferido`, `concluido` |
| criado_em | data/hora | automático |

## Utilizador
| Atributo | Tipo | Restrições |
|---|---|---|
| id | inteiro | PK |
| nome | texto | obrigatório |
| email | texto | obrigatório, único |
| palavra_passe_hash | texto | obrigatório (nunca em texto simples) |
| perfil | texto | `coordenador` ou `administrador` |
| estado | texto | `ativo` ou `inativo` |

## Ocorrência
| Atributo | Tipo | Restrições |
|---|---|---|
| id | inteiro | PK |
| aluno_id | inteiro | FK → Aluno, obrigatório |
| utilizador_id | inteiro | FK → Utilizador, obrigatório (responsável) |
| tipo | texto | obrigatório |
| descricao | texto | obrigatório |
| data | data | obrigatório |
| gravidade | texto | `leve`, `moderada`, `grave`, `muito_grave` |
| medida_aplicada | texto | opcional |
| observacoes | texto | opcional |

## Relações
- AnoLetivo 1—N Turma
- Turma 1—N Aluno
- Aluno 1—N Ocorrência
- Utilizador 1—N Ocorrência

## Decisões
- O coordenador é um Utilizador com perfil `coordenador`.
- Alunos nunca são eliminados fisicamente: usa-se `estado`.
- Todas as FK usam `ON DELETE RESTRICT` para preservar o histórico.
- Encarregado de educação mantido como campos do Aluno (simplicidade);
  normalização possível em evolução futura.
