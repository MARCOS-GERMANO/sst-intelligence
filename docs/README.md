# SST Intelligence 1.0 — MVP

Dashboard, obras, trabalhadores, inspeções, checklist e NCs — com login e dados reais via Supabase.

## Executar
1. Instale Node.js 20+.
2. Copie `src/config.example.js` para `src/config.js` e preencha com a URL e a anon key do seu projeto Supabase (Project Settings → API).
3. Aplique o schema: veja `docs/SUPABASE.md`.
4. Na pasta do projeto: `npm install`
5. Execute: `npm start`
6. Abra `http://localhost:3000` e entre com um usuário criado no Supabase Auth.

## Testes
Um smoke test automatizado simula o DOM com um Supabase falso (sem rede) e navega por todas as telas (Dashboard, Inspeções, NCs, Obras, Trabalhadores) e pelo fluxo completo de inspeção (nova inspeção → checklist → finalizar → NC automática), verificando se algum script quebra.

`npm test`

## Backend Supabase
Schema completo (tabelas, RLS por papel e trigger de NC automática) em
`supabase/migrations/0001_init.sql` — detalhes em `docs/SUPABASE.md`.

## Próximos passos
Formulários de cadastro de obra/trabalhador (hoje só leitura), upload de
fotos nas inspeções (Supabase Storage) e mais tipos de checklist além
do NR-18.

