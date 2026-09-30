# AGENTS.md

## Overview
Quiz diário com ranking global: Vite + React + TypeScript no front
([src/App.tsx](src/App.tsx)) e API Express + Firebase Admin SDK no back
([backend/app.js](backend/app.js)). O comportamento segue o fluxograma
[Quiz!Arena.png](Quiz!Arena.png).

## Arquitetura em uma frase
O **Script Diário** sorteia 7 questões por dia no Firestore; o player entra com
um **nickname único**, responde **uma questão por vez**, e o **peso dinâmico** de
cada resposta é calculado à meia-noite comparando todos os players.

## Key workflows
- Frontend: `npm install` e `npm run dev` (porta 3000, faz proxy de `/api` para 4002).
- Backend: `cd backend`, `npm install`, `npm run dev` (porta 4002).
- Script Diário (cronjob 00h00): `cd backend && npm run daily`.
- Testes: `cd backend && npm test` (não precisa de credenciais).
- Build: `npm run build`.

## Contrato com o Firestore
- O backend é o **único** cliente do Firestore. O front nunca usa o SDK do
  cliente, e `backend/firestore.rules` nega tudo para ele.
- A base de questões já vem populada. O backend normaliza na leitura
  (`backend/services/questionService.js`) e aceita vários nomes de campo —
  ver a tabela de aliases em [backend/FIRESTORE.md](backend/FIRESTORE.md).
  **Não criar seed de questões.**
- `correctAnswer` nunca é enviado ao navegador (`toPublicQuestion` remove).
- O modelo completo está em [backend/FIRESTORE.md](backend/FIRESTORE.md).

## Regras de domínio que não podem quebrar
- **7 questões por dia, sem repetir disciplina** (`selectDailyQuestions`).
- **Nickname único**: o id do documento em `players` é o nickname normalizado.
  Nunca usar um id aleatório, ou o mesmo player passa a existir duplicado.
- **Uma resposta por questão por rodada**, garantido dentro da transação em
  `registrarResposta`. A segunda tentativa recebe 409.
- **Peso dinâmico**: `peso = 0.5 + 1.5 * raridade`, onde
  `raridade = 1 - acertos/respostas`. Calculado só no fechamento do dia.
- **Idempotência**: `createRoundIfMissing` e `finalizeRound` podem rodar várias
  vezes no dia sem duplicar rodada nem pontuação.

## Questão flow rules
- O estado da rodada vem do Firestore (`rounds/<YYYY-MM-DD>`), não do cliente.
  O contador de sessão (`x-session-id`) que existia antes foi removido: ele
  fazia cada GET consumir uma questão e produzia o carregamento infinito.
- Depois da 7ª resposta a tela vai para o resumo. Não há "próxima pergunta"
  indefinida.
- Se a rodada ainda não foi sorteada, `/api/quiz/today` responde 409 com a
  instrução de rodar `npm run daily`.

## Common pitfalls
- **Erro em rota async sem wrapper**: o Express 4 não captura rejeição de Promise.
  Toda rota nova precisa do `asyncRoute` de [backend/app.js](backend/app.js), ou a
  requisição fica pendurada e o front carrega para sempre.
- **`toPublicQuestion` define o contrato do front.** Se renomear um campo, mudar
  junto [src/types/quiz.ts](src/types/quiz.ts) e o componente que consome.
- **Não usar `getApp().firestore()` fora de `getFirestore()`** nos testes: o stub
  de `tests/firestoreStub.js` é injetado pelo hook `tests/hook.mjs`.
- Ao mexer no backend, matar processos `node.exe` antigos antes de reiniciar
  (porta 4002 fica presa).
- Manter os tipos de [src/types/quiz.ts](src/types/quiz.ts) alinhados com as
  rotas.
