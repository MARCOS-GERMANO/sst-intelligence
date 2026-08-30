# Backend Supabase — SST Intelligence

Schema inicial em `supabase/migrations/0001_init.sql`, testado de ponta a
ponta num PostgreSQL 16 local (com um stub do schema `auth` do Supabase)
antes de ser entregue.

## Como aplicar
1. Crie um projeto em https://supabase.com
2. **SQL Editor** → cole o conteúdo de `supabase/migrations/0001_init.sql` → **Run**
   (ou, se preferir a CLI: `supabase db push`, com o arquivo já na pasta `supabase/migrations/`)

## O que o schema cria

**Tabelas:** `profiles`, `sites` (obras), `workers` (trabalhadores),
`inspections` (inspeções), `inspection_items` (itens de checklist),
`non_conformities` (NCs).

**Provisionamento automático de perfil:** ao cadastrar um usuário no
Supabase Auth, um trigger cria a linha correspondente em `profiles`
automaticamente (papel padrão: `tecnico`).

**Códigos automáticos:** inspeções recebem código `INS-00001`,
`INS-00002`... e NCs recebem `NC-2026-000001`... — gerados por sequence,
sem precisar informar nada no insert.

**Trigger de NC automática:** ao inserir um item de checklist
(`inspection_items`) com `result = 'nao_conforme'`, uma NC é criada
sozinha em `non_conformities`, puxando a obra e a descrição do item.
Itens `conforme` ou `na` não geram nada.

**Papéis:** `admin`, `tst`, `tecnico`, `supervisor` (coluna `role` em
`profiles`). Só `admin`/`tst` podem cadastrar obras, trabalhadores e
mudar o status de uma NC (validar/fechar). Qualquer usuário autenticado
pode ler os dados e registrar suas próprias inspeções.

## Testado localmente
Rodei o script inteiro num Postgres 16 real (com um stub simulando
`auth.users`/`auth.uid()`/`auth.role()` do Supabase) e confirmei:
- Cadastro de usuário → perfil criado automaticamente
- Item de checklist não conforme → NC gerada sozinha, com o código certo
- Item conforme → não gera NC
- Usuário anônimo → bloqueado pelo RLS (0 linhas)
- Técnico → lê normalmente, mas é bloqueado ao tentar criar obra ou
  fechar uma NC
- TST → consegue criar obra e fechar NC

## Próximo passo
Conectar o frontend (`src/app.js`) ao Supabase via `supabase-js`,
substituindo os dados mockados por consultas reais, e adicionar a tela
de login.
