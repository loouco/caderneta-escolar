# Regras de negócio

| ID | Regra |
|---|---|
| RN01 | O número de matrícula do aluno é único. |
| RN02 | Uma ocorrência pertence a exactamente um aluno e identifica o utilizador responsável. |
| RN03 | Um aluno pode ter várias ocorrências. |
| RN04 | Tipo, descrição e data da ocorrência são obrigatórios. |
| RN05 | A gravidade só aceita: leve, moderada, grave, muito_grave. |
| RN06 | Uma turma pertence a um único ano letivo. |
| RN07 | Alunos com ocorrências não são eliminados; passam a estado inativo. |
| RN08 | Todos os dados são validados no backend, independentemente do frontend. |
| RN09 | Palavras-passe são guardadas com hash; dados pessoais não são expostos em respostas desnecessárias. |
| RN10 | Só utilizadores autenticados e autorizados acedem às funcionalidades internas. |
| RN11 | O email do utilizador é único. |
| RN12 | A data de fim do ano letivo é posterior à data de início. |
