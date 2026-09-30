# Modelo de dados do Quiz Arena (Firestore)

O backend é o **único** cliente do Firestore (Admin SDK). O front-end conversa
sempre com a API Express, então a resposta correta nunca é exposta no navegador.

## Coleções

| Coleção      | Quem escreve                | Finalidade |
| ------------ | --------------------------- | ---------- |
| `questions`  | base de questões (importada) + Script Diário | sorteio do dia e track de respostas |
| `disciplinas`| base de disciplinas         | agrupamento usado no sorteio |
| `rounds`     | Script Diário               | snapshot da rodada e placar do dia |
| `players`    | API + Script Diário         | nickname único, pontuação e ranking |

---

## `questions/{questionId}`

Documento da base de questões. O backend normaliza na leitura
(`backend/services/questionService.js`), então **qualquer um** dos aliases abaixo
funciona sem migração.

| Campo lido pelo backend                | Aliases aceitos                                              |
| -------------------------------------- | ------------------------------------------------------------ |
| `id`                                   | id do documento, `questionId`, `slug`                        |
| `disciplinaId`                         | `disciplineId`, `disciplina`, `categoria`, `category`, `theme`|
| `disciplinaNome`                       | `disciplineName`, `categoria`, `category`                    |
| `prompt`                               | `question`, `text`                                           |
| `highlightedText`                      | `highlight`, `destaque`, `answerHint`                        |
| `correctAnswer`                        | `respostaCorreta`, `correct`, `answer`                       |
| `alternativas`                         | `alternatives`, `options`                                    |
| `pontosBase`                           | — (default 100)                                              |
| `ativa`                                | — (default `true`)                                           |

`alternativas` é a lista de **respostas também aceitas** (variações de escrita).
Três formatos são aceitos:

```jsonc
["zelda", "the legend of zelda"]        // ambas corretas
[{ "texto": "zelda", "correta": false }] // distrator conhecido (nunca pontua)
[{ "texto": "zelda", "correta": true  }] // resposta aceita
```

Qualquer outra resposta digitada é considerada errada.

### Campos gerenciados pelo backend

```jsonc
{
  "selectedForDay": true,     // bool: "foi selecionada para a rodada de hoje?"
  "selectedOn": "2026-09-29", // dia da rodada

  // track de quem respondeu e o que respondeu (exigido pelo fluxograma).
  // Uma entrada por (rodada, player):
  "respostas": {
    "2026-09-29": {
      "murilo": {
        "id_questao": "games-001",
        "idRodada": "2026-09-29",
        "playerId": "murilo",
        "nickname": "Murilo",
        "resposta": "Ocarina of Time",
        "respostaNormalizada": "ocarina of time",
        "correta": true,
        "tempoDeRespostaMs": 8420,
        "pontosPrevistos": 180,
        "answeredAt": "2026-09-29T14:03:11.204Z"
      }
    }
  },

  // agregado do Script Diário (uma entrada por rodada)
  "stats": {
    "2026-09-29": {
      "totalRespostas": 42,
      "acertos": 7,
      "percentualAcerto": 0.1667,
      "raridade": 0.8333,
      "peso": 1.75,
      "pontos": 175,
      "distribuicao": [{ "resposta": "ocarina of time", "contagem": 7 }]
    }
  }
}
```

> `respostas` cresce uma vez por rodada em que a questão aparece. Para isso o
> sorteio evita repetir uma questão dentro de `QUESTION_COOLDOWN_DAYS`
> (default 30). Monitorar o tamanho do documento: o Firestore limita a 1 MiB.
> A distribuição de respostas (`distribuicao`) é calculada no Script Diário a
> partir de `respostas`, não no caminho de escrita.

## `disciplinas/{disciplinaId}`

```jsonc
{ "nome": "Games", "ativa": true }
```

O backend não depende deste documento para o sorteio: ele agrupa por
`questions.disciplinaId`. A coleção serve para administration/relatórios.

## `players/{playerId}`

O **id do documento é o nickname normalizado** (`buildNicknameKey`): minúsculas,
sem acento, espaços viram `-`. É isso que garante a unicidade pedida no
fluxograma — `"Murilo"`, `"murilo"` e `"  murilo "` caem no mesmo player.

```jsonc
{
  "nickname": "Murilo",
  "nicknameKey": "murilo",
  "iniciais": "M",
  "score": 1180,          // cumulativo (confirmado pelo Script Diário)
  "pendingScore": 340,    // pontos de hoje, ainda provisórios
  "pontosHoje": 340,
  "rank": 12,             // gravado pelo Script Diário
  "answersTotal": 63,
  "correctTotal": 41,
  "lastRoundId": "2026-09-29",
  "createdAt": "server_timestamp",
  "lastActiveAt": "server_timestamp"
}
```

## `rounds/{YYYY-MM-DD}`

```jsonc
{
  "id": "2026-09-29",
  "label": "29 de Set",
  "status": "open",           // "open" -> "closed" no fechamento
  "questionCount": 7,
  "questionIds": ["games-001", "ciencia-002", "..."],
  "disciplineIds": ["games", "ciencia", "..."],
  "disciplineNames": ["Games", "Ciência", "..."],
  "createdAt": "server_timestamp",
  "finalizedAt": "server_timestamp",
  "finalizedBy": "script-diario",
  "questionScores": [ /* peso dinâmico de cada questão */ ],
  "scoreboard": [ /* top 50 do dia, já com score cumulativo */ ],
  "warnings": []
}
```

`rounds` é a fonte da verdade da rodada: `questionIds` define exatamente quais
7 questões valem naquele dia. A flag `selectedForDay` em `questions` é o marcador
booleano pedido no fluxograma.
