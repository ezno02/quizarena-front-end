# Quiz Arena — Backend

API Express + Firebase Admin SDK. Segue o fluxograma `Quiz!Arena.png`: o Script
Diário sorteia 7 questões por dia, o player entra com um nickname único, responde
uma questão por vez, e o peso dinâmico de cada resposta é calculado à meia-noite.

## Rodar

```bash
npm install
cp .env.example .env   # preencha com a service account (veja abaixo)
npm run check:firebase # confirme que a conexão está OK
npm run dev            # http://localhost:4002
```

Sem as variáveis `FIREBASE_*` o servidor sobe, mas as rotas de dados respondem
**503** com a lista do que falta. Não existe fallback em arquivo: o Firestore é a
única fonte de verdade.

## Antes de rodar: conferir o Firebase

```bash
npm run check:firebase
```

O script não escreve nada. Ele valida o `.env`, mostra o erro real caso algo
esteja errado e testa a leitura de `questions`, `players` e da rodada do dia.
Se ele imprimir "Configuração do Firebase OK", o restante funciona.

O `.env` precisa de uma **service account** (Admin SDK), não das credenciais do
Firebase Web:

| Variável | Valor esperado |
| -------- | -------------- |
| `FIREBASE_PROJECT_ID` | o id do projeto (`meu-projeto-abc12`) |
| `FIREBASE_CLIENT_EMAIL` | `firebase-adminsdk-xxxxx@meu-projeto-abc12.iam.gserviceaccount.com` |
| `FIREBASE_PRIVATE_KEY` | a chave PEM completa, entre `-----BEGIN PRIVATE KEY-----` e `-----END PRIVATE KEY-----` |

Uma API key do Firebase Web (começa com `AIza`) **não** funciona aqui: ela
autentica o navegador, não o servidor. Para gerar a chave:

1. Firebase console → **Project settings** → **Service accounts**
2. **Generate new private key** → baixa um `.json`
3. Copie `project_id`, `client_email` e `private_key` para o `backend/.env`

No `.json` a chave vem com `\n` literais. O backend troca por quebra de linha
automatically, então pode colar o valor como está, entre aspas.

A service account também precisa do papel **Cloud Datastore User** no projeto,
senão a leitura falha com `PERMISSION_DENIED`.

## Script Diário (cronjob às 00h00)

```bash
npm run daily                     # fecha rodadas antigas e abre a de hoje
npm run daily -- --dry-run        # mostra o que seria sorteado
npm run daily -- --finalize=2026-09-29
```

No crontab (`0 0 * * *`, fuso `APP_TIMEZONE`):

```cron
0 0 * * * cd /caminho/backend && /usr/bin/node scripts/daily.js >> logs/daily.log 2>&1
```

O mesmo script roda no boot do servidor, então subir a aplicação já garante a
rodada do dia. As duas entradas são **idempotentes**: rodar várias vezes não
sorteia de novo nem duplica pontos.

O Script Diário faz, na ordem do fluxograma:

1. **Cálculo de pontuação** — peso dinâmico por raridade, comparando as respostas
   de todos os players (ver abaixo).
2. **Ranking** — consolida o score cumulativo, zera `pendingScore` e grava a
   posição de cada player.
3. **Sorteio** — 7 questões sem repetir disciplina, marcando `selectedForDay: true`.

Alternativa por HTTP (útil para um agendador externo):

```bash
curl -X POST http://localhost:4002/api/daily/run -H "x-cron-secret: $CRON_SECRET"
```

## Peso dinâmico

```
raridade = 1 - (acertos / respostas)
peso     = 0.5 + 1.5 * raridade        # faixa 0.5 .. 2.0
pontos   = pontosBase * peso          # pontosBase = 100 por padrão
```

Quem acerta uma resposta que quase ninguém acertou vale o dobro. O cálculo é
feito no fechamento do dia, comparando as respostas de todos os players — por
isso a resposta é gravada junto com o autor e o `tempoDeRespostaMs` dentro do
documento da questão.

## Endpoints

| Método | Rota                  | Auth                  | Descrição |
| ------ | --------------------- | --------------------- | --------- |
| GET    | `/api/health`         | —                     | Estado do serviço e do dia da rodada |
| POST   | `/api/players/login`  | —                     | Cria ou recupera o player pelo nickname e devolve o token |
| GET    | `/api/players/me`     | token                 | Perfil do player |
| GET    | `/api/quiz/today`     | token                 | As 7 questões de hoje + progresso + ranking |
| POST   | `/api/quiz/answers`   | token                 | Grava a resposta e devolve o progresso |
| GET    | `/api/ranking`        | —                     | Top N; com `?nickname=` busca por prefixo |
| POST   | `/api/daily/run`      | `x-cron-secret`       | Script Diário |

Sessão: o `POST /players/login` devolve um token HMAC que o front envia em
`x-player-token`. Sem `PLAYER_TOKEN_SECRET`/`CRON_SECRET` no `.env` o segredo é
gerado em memória e toda sessão expira quando o processo reinicia.

## Regras de unicidade e resposta única

- **Nickname único**: o id do documento em `players` é o nickname normalizado
  (minúsculas, sem acento, espaços viram `-`). `"Murilo"`, `"murilo"` e
  `"  murilo "` são o mesmo player.
- **Uma resposta por questão por rodada**: garantido em transação, junto com a
  gravação. A segunda tentativa recebe 409.
- **`correctAnswer` nunca sai do backend.** O `toPublicQuestion()` remove a
  resposta e as alternativas antes de responder ao navegador.

## Testes

```bash
npm test
```

Três suítes, todas sem precisar de credenciais:

- `tests/run.js` — lógica pura (normalização, sorteio, peso dinâmico, ranking).
- `tests/integration.js` — fluxo completo do fluxograma contra um Firestore em
  memória (`tests/firestoreStub.js`).
- `tests/http.js` — contrato das rotas, incluindo a checagem de que a resposta
  correta não vaza no payload.

O stub implementa apenas o que o projeto usa e **não substitui o Firestore
real**; ele existe para validar a orquestração sem credenciais.

## Modelo de dados

Veja [FIRESTORE.md](FIRESTORE.md) para as coleções, os campos lidos da base de
questões existente e o que o Script Diário grava.
