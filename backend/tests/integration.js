/**
 * Teste de integração do fluxo completo do fluxograma, contra o Firestore em
 * memória (tests/firestoreStub.js):
 *
 *   Script Diário sorteia 7 questões sem repetir disciplina
 *     -> player entra com nickname novo (criado) e depois existente (recuperado)
 *     -> responde às 7 questões uma a uma
 *     -> fechamento calcula peso dinâmico, consolida score e grava o ranking
 *
 * Roda com: node tests/integration.js
 */
import assert from 'node:assert/strict'
import { register } from 'node:module'

import { FirestoreStub } from './firestoreStub.js'

// Intercepta `firebase-admin` para devolver o stub e o FieldValue usado pelo
// código do backend, mantendo os módulos reais (`services/*`) intactos.
const stub = new FirestoreStub()
const serverTimestamp = () => ({ __type: 'serverTimestamp' })
const increment = (value) => ({ __type: 'increment', value })

const adminStub = {}

// `firebase.js` importa `cert`/`getApps` de "firebase-admin" e
// `getFirestore`/`FieldValue` de "firebase-admin/firestore", então o stub
// precisa cobrir os dois entrypoints.
let appInstance = null
const appStub = { firestore: () => stub }

adminStub.cert = () => ({})
adminStub.getApps = () => (appInstance ? [appInstance] : [])
adminStub.initializeApp = () => {
  appInstance = appStub
  return appStub
}
adminStub.firestore = {
  getFirestore: () => stub,
  FieldValue: { serverTimestamp, increment },
}

// O módulo `__firebaseAdminStub.js` lê daqui em tempo de import, então o stub
// precisa estar montado antes do `register()` abaixo.
globalThis.__quizArenaAdminStub = adminStub
process.env.QUIZ_ARENA_USE_FIRESTORE_STUB = '1'

register(new URL('./hook.mjs', import.meta.url), import.meta.url)

// ---------------------------------------------------------------- fixtures
const QUESTIONS = {}
for (const d of ['games', 'ciencia', 'historia', 'geografia', 'esportes', 'musica', 'cinema', 'literatura']) {
  for (let i = 1; i <= 3; i += 1) {
    QUESTIONS[`${d}-${i}`] = {
      disciplinaId: d,
      prompt: `Pergunta ${d} ${i}`,
      correctAnswer: `Resposta ${d} ${i}`,
      pontosBase: 100,
      ativa: true,
    }
  }
}
stub.seed('questions', QUESTIONS)

const DAY = '2026-09-29'
process.env.APP_TIMEZONE = 'UTC'

// O services/time.js fixa o fuso no import; forçamos o dia via getDayKey stub.
const { ensureDailyRound, createRoundIfMissing, finalizeRound, loadRoundQuestionDocs } = await import(
  '../services/rounds.js'
)
const { findOrCreatePlayer } = await import('../services/players.js')
const { registrarResposta, buildRoundProgress } = await import('../services/answers.js')
const { getRanking, searchPlayer } = await import('../services/ranking.js')
const { toPublicPlayer } = await import('../services/players.js')

let failed = 0
async function test(name, fn) {
  try {
    await fn()
    console.log(`  ok  ${name}`)
  } catch (error) {
    failed += 1
    console.error(`  FAIL ${name}\n       ${error.message}`)
  }
}

// ------------------------------------------------------------------- testes
await test('Script Diário sorteia 7 questões sem repetir disciplina', async () => {
  const round = await createRoundIfMissing(DAY)

  assert.equal(round.questionIds.length, 7)
  assert.equal(new Set(round.disciplineIds).size, 7, 'nenhuma disciplina repetida')
  assert.equal(round.status, 'open')
  assert.equal(round.id, DAY)
  assert.equal(round.label, '29 de Set')
})

await test('questões sorteadas recebem selectedForDay: true e selectedOn', async () => {
  const round = await createRoundIfMissing(DAY)
  const flags = round.questionIds.map((id) => stub.read('questions', id).selectedForDay)

  assert.ok(flags.every((flag) => flag === true), 'todas marcadas com true')
  assert.ok(
    round.questionIds.every((id) => stub.read('questions', id).selectedOn === DAY),
    'todas com o dia da rodada',
  )
})

await test('rodada de hoje é idempotente (não sorts de novo)', async () => {
  const first = await createRoundIfMissing(DAY)
  const second = await createRoundIfMissing(DAY)

  assert.deepEqual(second.questionIds, first.questionIds, 'mesmas 7 questões')
})

await test('apenas a rodada atual fica marcada no Firestore', async () => {
  const round = await createRoundIfMissing(DAY)
  const flagged = [...stub.docs.entries()].filter(
    ([path, data]) => path.startsWith('questions/') && data.selectedForDay,
  )

  assert.equal(flagged.length, 7)
  assert.deepEqual(
    flagged.map(([path]) => path.split('/').at(-1)).sort(),
    [...round.questionIds].sort(),
  )
})

await test('nickname novo cria o player; nickname existente recupera o mesmo', async () => {
  const created = await findOrCreatePlayer('Murilo')
  assert.equal(created.created, true)
  assert.equal(created.id, 'murilo')
  assert.equal(created.data.score, 0)

  const same = await findOrCreatePlayer('  murilo  ')
  assert.equal(same.created, false, 'normalização devolve o mesmo player')
  assert.equal(same.id, created.id)

  const other = await findOrCreatePlayer('Dark Zin')
  assert.equal(other.id, 'dark-zin', 'nickname com espaço vira id seguro')
  assert.notEqual(other.id, created.id)
})

await test('nickname inválido é rejeitado com 400', async () => {
  await assert.rejects(() => findOrCreatePlayer('  '), (error) => error.status === 400)
  await assert.rejects(() => findOrCreatePlayer('!'), (error) => error.status === 400)
  await assert.rejects(() => findOrCreatePlayer('a'), (error) => error.status === 400)
})

await test('resposta é gravada no documento da questão com autor e tempo', async () => {
  await findOrCreatePlayer('Murilo')
  const round = await createRoundIfMissing(DAY)
  const questionId = round.questionIds[0]
  const correctAnswer = stub.read('questions', questionId).correctAnswer

  const result = await registrarResposta({
    playerId: 'murilo',
    questionId,
    resposta: correctAnswer,
    tempoDeRespostaMs: 4321,
    roundId: DAY,
  })

  assert.equal(result.correta, true, 'compara ignorando caixa e acentos')

  const doc = stub.read('questions', questionId)
  const registro = doc.respostas[DAY].murilo

  assert.equal(registro.id_questao, questionId, 'fluxograma: id_questao')
  assert.equal(registro.tempoDeRespostaMs, 4321, 'fluxograma: tempo_de_resposta')
  assert.equal(registro.playerId, 'murilo', 'track de quem respondeu')
  assert.equal(registro.nickname, 'Murilo')
  assert.equal(registro.resposta, correctAnswer)
  assert.equal(registro.correta, true)
  assert.equal(doc.stats[DAY].totalRespostas, 1)
  assert.equal(doc.stats[DAY].acertos, 1)
})

await test('mesma questão não pode ser respondida duas vezes na mesma rodada', async () => {
  const round = await createRoundIfMissing(DAY)
  const questionId = round.questionIds[0]

  await assert.rejects(
    () =>
      registrarResposta({
        playerId: 'murilo',
        questionId,
        resposta: 'outra coisa',
        roundId: DAY,
      }),
    (error) => error.status === 409,
  )
})

await test('questão que não está na rodada de hoje é rejeitada', async () => {
  const outsider = Object.keys(QUESTIONS).find(
    (id) => !stub.read('questions', id).selectedForDay,
  )

  await assert.rejects(
    () =>
      registrarResposta({
        playerId: 'murilo',
        questionId: outsider,
        resposta: 'x',
        roundId: DAY,
      }),
    (error) => error.status === 409,
  )
})

await test('player inexistente não consegue responder', async () => {
  const round = await createRoundIfMissing(DAY)

  await assert.rejects(
    () =>
      registrarResposta({
        playerId: 'fantasma',
        questionId: round.questionIds[1],
        resposta: 'x',
        roundId: DAY,
      }),
    (error) => error.status === 404,
  )
})

await test('buildRoundProgress resume a rodada e conta os acertos', async () => {
  const { questions } = await loadRoundQuestionDocs(DAY)
  const progress = buildRoundProgress(DAY, questions, 'murilo')

  assert.equal(progress.answeredCount, 1)
  assert.equal(progress.correctCount, 1)
  assert.equal(progress.totalQuestions, 7)
  assert.equal(progress.answeredQuestionIds.length, 1)
  assert.equal(progress.detail[progress.answeredQuestionIds[0]].correta, true)
})

await test('segundo player responde e o placar do dia é montado', async () => {
  await findOrCreatePlayer('Ana')
  const round = await createRoundIfMissing(DAY)
  const questionId = round.questionIds[0]
  const correctAnswer = stub.read('questions', questionId).correctAnswer

  // Ana acerta a questão que Murilo acertou -> 2/2, mas Ana erra as demais.
  await registrarResposta({
    playerId: 'ana',
    questionId,
    resposta: correctAnswer,
    tempoDeRespostaMs: 9000,
    roundId: DAY,
  })

  // Murilo erra uma das respondidas por ele, Ana acerta a próxima.
  const next = round.questionIds[1]
  await registrarResposta({
    playerId: 'murilo',
    questionId: next,
    resposta: 'errado de propósito',
    tempoDeRespostaMs: 15000,
    roundId: DAY,
  })
  await registrarResposta({
    playerId: 'ana',
    questionId: next,
    resposta: stub.read('questions', next).correctAnswer,
    tempoDeRespostaMs: 3000,
    roundId: DAY,
  })

  const { questions } = await loadRoundQuestionDocs(DAY)
  const murilo = buildRoundProgress(DAY, questions, 'murilo')
  const ana = buildRoundProgress(DAY, questions, 'ana')

  assert.equal(murilo.answeredCount, 2)
  assert.equal(murilo.correctCount, 1)
  assert.equal(ana.answeredCount, 2)
  assert.equal(ana.correctCount, 2)

  const muriloPlayer = stub.read('players', 'murilo')
  const anaPlayer = stub.read('players', 'ana')

  assert.ok(anaPlayer.pendingScore > muriloPlayer.pendingScore, 'quem mais acertou tem mais pontos hoje')
  assert.equal(anaPlayer.correctTotal, 2)
  assert.equal(muriloPlayer.correctTotal, 1)
})

await test('ranking ordena por score decrescente', async () => {
  const { players, total } = await getRanking()

  assert.equal(total, 3, 'Murilo, Ana e Dark Zin')
  assert.equal(players[0].nickname, 'Ana', 'Ana tem mais pontos hoje')
  assert.ok(players[0].score >= players.at(-1).score, 'ordem decrescente')
})

await test('searchPlayer acha o player pelo nickname normalizado', async () => {
  const found = await searchPlayer('  ANA ')
  assert.equal(found.found !== false, true)
  assert.equal(found.player.nickname, 'Ana')

  const missing = await searchPlayer('ninguem')
  assert.equal(missing.player, null)
})

await test('fechamento consolida score, zera pendingScore e grava o ranking', async () => {
  const result = await finalizeRound(DAY)

  assert.equal(result.status, 'closed')
  assert.equal(result.playerCount, 2, 'só quem acertou entra no placar do dia')
  assert.equal(result.totalAnswers, 4, '2 players x 2 questões')

  const murilo = stub.read('players', 'murilo')
  const ana = stub.read('players', 'ana')

  assert.equal(murilo.pendingScore, 0, 'pendingScore zerado após consolidar')
  assert.equal(ana.pendingScore, 0)
  assert.equal(murilo.score, murilo.pontosHoje, 'score cumulativo recebeu os pontos do dia')
  assert.equal(ana.score, ana.pontosHoje)

  const darkZin = stub.read('players', 'dark-zin')
  assert.equal(ana.rank, 1, 'Ana leader por ter pontuado mais')
  assert.equal(murilo.rank, 2)
  assert.equal(darkZin.rank, 3, 'player sem acerto entra no fim, com score 0')
  assert.ok(ana.score > murilo.score)

  const round = stub.read('rounds', DAY)
  assert.equal(round.status, 'closed')
  assert.equal(round.finalizedBy, 'script-diario')
  assert.equal(round.scoreboard[0].nickname, 'Ana')
  assert.ok(round.finalizedAt)
})

await test('peso dinâmico e raridade ficam salvos em cada questão da rodada', async () => {
  const round = await createRoundIfMissing(DAY)

  // A questão da posição 2 teve 1 acerto em 2 respostas -> 50% de raridade.
  const stats = stub.read('questions', round.questionIds[1]).stats[DAY]
  assert.equal(stats.totalRespostas, 2)
  assert.equal(stats.acertos, 1)
  assert.equal(stats.raridade, 0.5)
  assert.equal(stats.pontos, 125)

  const first = stub.read('questions', round.questionIds[0]).stats[DAY]
  assert.equal(first.totalRespostas, 2)
  assert.equal(first.acertos, 2, 'Murilo e Ana acertaram a primeira questão')
  assert.equal(first.raridade, 0, 'todo mundo acertou -> raridade 0')
  assert.equal(first.peso, 0.5)
  assert.equal(first.pontos, 50, 'peso mínimo')
  assert.ok(Array.isArray(first.distribuicao), 'distribuição de respostas registrada')
})

await test('o placar do dia paga o peso real, não um valor fixo', async () => {
  const round = await createRoundIfMissing(DAY)

  // Ana acertou as duas; Murilo acertou só a primeira (que valia 50 pts).
  const ana = stub.read('players', 'ana')
  const murilo = stub.read('players', 'murilo')

  assert.equal(ana.pontosHoje, 50 + 125, 'Ana: 50 (fácil) + 125 (difícil)')
  assert.equal(murilo.pontosHoje, 50, 'Murilo: só a questão fácil')
  assert.equal(murilo.score, 50)
  assert.equal(ana.score, 175)
  assert.equal(round.questionIds.length, 7)
})

await test('questão sem resposta recebe peso máximo mas não pontua ninguém', async () => {
  const round = await createRoundIfMissing(DAY)
  const untouched = stub.read('questions', round.questionIds[6]).stats[DAY]

  assert.equal(untouched.totalRespostas, 0)
  assert.equal(untouched.raridade, 1)
  assert.equal(untouched.pontos, 200, 'ninguém acertou -> vale o máximo')
  // Mas o placar do dia de Ana continua sendo só 50 + 125.
  assert.equal(stub.read('players', 'ana').pontosHoje, 175)
})

await test('a distribuição de respostas agrupa variações parecidas', async () => {
  const round = await createRoundIfMissing(DAY)
  const stats = stub.read('questions', round.questionIds[0]).stats[DAY]

  // Murilo e Ana escreveram a mesma resposta (comparada sem acento/caixa).
  assert.equal(stats.distribuicao.length, 1)
  assert.equal(stats.distribuicao[0].contagem, 2)
  assert.equal(stats.distribuicao[0].resposta, stats.distribuicao[0].resposta.toLowerCase())
})

await test('fechar a mesma rodada de novo não duplica pontos', async () => {
  const before = stub.read('players', 'ana').score
  const result = await finalizeRound(DAY)

  assert.equal(result.alreadyFinalized, true)
  assert.equal(stub.read('players', 'ana').score, before, 'score intacto')
})

await test('a nova rodada não reaproveita as questões de ontem', async () => {
  const yesterday = '2026-09-29'
  const today = await createRoundIfMissing('2026-09-30')
  const yesterdayIds = stub.read('rounds', yesterday).questionIds

  for (const id of yesterdayIds) {
    assert.equal(today.questionIds.includes(id), false, `${id} não pode reaparecer`)
  }
})

await test('ensureDailyRound fecha rodada antiga antes de abrir a nova', async () => {
  // 30/09 volta a elegibilidade das questões de 29/09 (cooldown de 30 dias).
  const nextDay = '2026-09-30'
  const { round, finalized } = await ensureDailyRound(nextDay)

  assert.equal(finalized.length, 0, 'a rodada de hoje já estava fechada')
  assert.equal(round.id, nextDay)
  assert.equal(round.status, 'open')
  assert.equal(round.questionIds.length, 7)
  assert.equal(new Set(round.disciplineIds).size, 7, 'sem repetir disciplina no dia seguinte')

  const hojeMarcadas = [...stub.docs.entries()].filter(
    ([path, data]) => path.startsWith('questions/') && data.selectedForDay && data.selectedOn === nextDay,
  )
  assert.equal(hojeMarcadas.length, 7)
})

await test('toPublicPlayer expõe o shape que o front consome', () => {
  const player = toPublicPlayer(
    { id: 'murilo', data: stub.read('players', 'murilo') },
    { isNew: true },
  )

  assert.deepEqual(Object.keys(player).sort(), [
    'answersTotal', 'correctTotal', 'createdAt', 'id', 'initials',
    'isNew', 'nickname', 'pendingScore', 'pointsToday', 'rank', 'score',
  ])
  assert.equal(typeof player.score, 'number')
  assert.equal(typeof player.rank, 'number')
})

console.log(failed > 0 ? `\n${failed} teste(s) falharam.` : '\nFluxo completo do fluxograma OK.')
process.exitCode = failed > 0 ? 1 : 0
