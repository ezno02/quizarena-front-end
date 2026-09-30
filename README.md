# Quiz Arena

Quiz diário com ranking global. Vite + React + TypeScript no front, Express +
Firestore no back, seguindo o fluxograma `Quiz!Arena.png`.

## Como o jogo funciona

1. O **Script Diário** roda às 00h00 e sorteia **7 questões** da base, sem
   repetir disciplina, marcando cada uma com `selectedForDay: true`.
2. O player entra com um **nickname único**. Nickname novo cria o player no
   Firestore; nickname existente recupera o mesmo player e continua somando
   pontos.
3. As questões são exibidas **uma por vez**. A resposta é gravada dentro do
   documento da questão, junto com o autor e o tempo de resposta.
4. À meia-noite o Script Diário calcula o **peso dinâmico** de cada questão
   pela raridade das respostas de todos, consolida o score e grava o ranking.
5. O ranking fica na lateral da tela, com busca por nickname.

## Rodar

```bash
# terminal 1 — backend (precisa do backend/.env com as credenciais do Firebase)
cd backend
npm install
npm run dev        # http://localhost:4002

# terminal 2 — front
npm install
npm run dev        # http://localhost:3000
```

O Vite faz proxy de `/api` para `localhost:4002`. Para apontar para outro
backend, defina `VITE_API_URL` (veja `.env.example`).

## Testes

```bash
cd backend && npm test
```

Roda sem credenciais: lógica pura, fluxo completo do fluxograma contra um
Firestore em memória, e o contrato HTTP das rotas.

## Script Diário

```bash
cd backend
npm run daily                      # fecha as rodadas antigas e abre a de hoje
npm run daily -- --dry-run         # mostra o que seria sorteado
```

Detalhe do cálculo, do cronjob e dos endpoints em
[backend/README.md](backend/README.md). Modelo de dados em
[backend/FIRESTORE.md](backend/FIRESTORE.md).

## Estrutura

```text
src/
  App.tsx                       orquestra: nickname -> 7 questões -> resumo
  types/quiz.ts                 contrato com a API
  services/quizApi.ts           client HTTP com token e timeout
  components/
    player/NicknameGate.tsx     entrada pelo nickname
    question/QuestionCard.tsx   uma questão por vez
    question/QuizSummary.tsx    fim da rodada
    layout/RankingSidebar.tsx   ranking lateral + busca
backend/
  server.js                     sobe o HTTP e garante a rodada do dia
  app.js                        rotas Express
  scripts/daily.js              Script Diário (cronjob 00h00)
  services/                     rounds, answers, players, ranking, scoring
  tests/                        run, integration e http
```

## Observações

- O front nunca lê o Firestore direto. Todo dado passa pela API, então a resposta
  correta e o cálculo de pontuação ficam no servidor.
- `firestore.rules` nega tudo para o cliente: o Admin SDK é o único dono dos
  dados.
- O documento de cada questão acumula as respostas de cada rodada em que ela
  aparece. O sorteio evita repetir uma questão dentro de
  `QUESTION_COOLDOWN_DAYS` (30 por padrão) para o documento não crescer sem
  limite — vale acompanhar o tamanho, pois o Firestore limita a 1 MiB.
