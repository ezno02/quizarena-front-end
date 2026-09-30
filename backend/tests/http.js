/**
 * Teste das rotas HTTP do backend, com o Firestore em memória.
 *
 * Verifica o contrato com o front: login por nickname, rodada do dia, envio de
 * resposta, recusa de repetição, ranking e o Script Diário protegido por
 * CRON_SECRET. Também confere que `correctAnswer` nunca vaza nas respostas.
 *
 * Roda com: node tests/http.js
 */
import assert from 'node:assert/strict'
import { register } from 'node:module'

import { FirestoreStub } from './firestoreStub.js'

process.env.QUIZ_ARENA_USE_FIRESTORE_STUB = '1'
process.env.CRON_SECRET = 'segredo-de-teste'
process.env.PLAYER_TOKEN_SECRET = 'segredo-de-sessao-de-teste'
process.env.APP_TIMEZONE = 'UTC'
process.env.PORT = '0'
process.env.NODE_ENV = 'test'

const stub = new FirestoreStub()
const serverTimestamp = () => ({ __type: 'serverTimestamp' })
const increment = (value) => ({ __type: 'increment', value })

let appInstance = null
const appStub = { firestore: () => stub }

globalThis.__quizArenaAdminStub = {
  cert: () => ({}),
  getApps: () => (appInstance ? [appInstance] : []),
  initializeApp: () => {
    appInstance = appStub
    return appStub
  },
  firestore: {
    getFirestore: () => stub,
    FieldValue: { serverTimestamp, increment },
  },
}

register(new URL('./hook.mjs', import.meta.url), import.meta.url)

// 8 disciplinas x 2 questões: dá para sortear 7 sem repetir disciplina.
const QUESTIONS = {}
for (const d of ['games', 'ciencia', 'historia', 'geografia', 'esportes', 'musica', 'cinema', 'literatura']) {
  for (let i = 1; i <= 2; i += 1) {
    // `disciplinaId` no documento, sem `disciplinaNome`: o backend precisa
    // derivar o rótulo da disciplina a partir do id, como na base real.
    QUESTIONS[`${d}-${i}`] = {
      disciplinaId: d,
      prompt: `Pergunta ${d} ${i}`,
      correctAnswer: `Resposta Secreta ${d} ${i}`,
      pontosBase: 100,
      ativa: true,
    }
  }
}
stub.seed('questions', QUESTIONS)

// app.js monta as rotas sem abrir a porta, então o teste escolhe a sua.
const { default: app } = await import('../app.js')

// Subir o servidor também garante a rodada do dia, como em produção.
const { ensureDailyRound } = await import('../services/rounds.js')

let server
let baseUrl

function request(path, options = {}) {
  return fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  })
}

async function login(nickname) {
  const response = await request('/api/players/login', {
    method: 'POST',
    body: JSON.stringify({ nickname }),
  })
  assert.equal(response.status, 200)
  return response.json()
}

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

server = app.listen(0)
await new Promise((resolve) => server.once('listening', resolve))
baseUrl = `http://127.0.0.1:${server.address().port}`

const dayKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC' }).format(new Date())

await ensureDailyRound(dayKey)

await test('GET /api/health responde e informa o dia da rodada', async () => {
  const response = await request('/api/health')
  const body = await response.json()

  assert.equal(response.status, 200)
  assert.equal(body.ok, true)
  assert.equal(body.dailyQuestionCount, 7)
  assert.equal(body.dayKey, dayKey)
})

await test('GET /api/quiz/today exige sessão', async () => {
  const response = await request('/api/quiz/today')
  const body = await response.json()

  assert.equal(response.status, 401)
  assert.match(body.message, /nickname/i)
})

await test('POST /api/quiz/answers sem token é recusado', async () => {
  const response = await request('/api/quiz/answers', {
    method: 'POST',
    body: JSON.stringify({ questionId: 'games-1', answer: 'x' }),
  })

  assert.equal(response.status, 401)
})

await test('login cria player novo e devolve token', async () => {
  const { player, token } = await login('Murilo')

  assert.equal(player.nickname, 'Murilo')
  assert.equal(player.isNew, true)
  assert.equal(player.score, 0)
  assert.equal(player.rank, null)
  assert.equal(typeof token, 'string')
  assert.ok(token.length > 20)
})

await test('login com o mesmo nickname recupera o player', async () => {
  const { player, token } = await login('  MURILO ')

  assert.equal(player.isNew, false, 'não cria duplicata')
  assert.equal(player.id, 'murilo')
  assert.ok(token.length > 0)
})

await test('login com nickname inválido devolve 400', async () => {
  const response = await request('/api/players/login', {
    method: 'POST',
    body: JSON.stringify({ nickname: '!' }),
  })
  const body = await response.json()

  assert.equal(response.status, 400)
  assert.ok(body.message.length > 0)
})

await test('GET /api/quiz/today devolve 7 questões sem a resposta correta', async () => {
  const { token } = await login('Murilo')
  const response = await request('/api/quiz/today', { headers: { 'x-player-token': token } })
  const body = await response.json()

  assert.equal(response.status, 200)
  assert.equal(body.round.id, dayKey)
  assert.equal(body.questions.length, 7)
  assert.equal(body.answeredQuestionIds.length, 0)
  assert.equal(new Set(body.round.disciplineNames).size, 7, 'sem repetir disciplina')

  body.questions.forEach((question, index) => {
    assert.equal(question.questionNumber, index + 1)
    assert.equal(question.totalQuestions, 7)
    assert.ok(question.prompt.length > 0, 'pergunta com texto')
    assert.ok(question.disciplineName, `questão ${index} tem disciplina`)
  })

  // A resposta correta não pode aparecer em nenhum lugar do payload.
  const serialized = JSON.stringify(body)
  assert.equal(serialized.includes('Resposta Secreta'), false, 'correctAnswer vazou no payload')
  assert.equal(serialized.includes('correctAnswer'), false)
})

let tokenMurilo = (await login('Murilo')).token

await test('POST /api/quiz/answers registra e devolve o progresso', async () => {
  const today = await (await request('/api/quiz/today', { headers: { 'x-player-token': tokenMurilo } })).json()
  const question = today.questions[0]
  const correctAnswer = stub.read('questions', question.id).correctAnswer

  const response = await request('/api/quiz/answers', {
    method: 'POST',
    headers: { 'x-player-token': tokenMurilo },
    body: JSON.stringify({ questionId: question.id, answer: correctAnswer, responseTimeMs: 4321 }),
  })
  const body = await response.json()

  assert.equal(response.status, 200)
  assert.equal(body.correct, true, 'compara ignorando caixa/pontuação')
  assert.ok(body.pointsEarned > 0)
  assert.equal(body.answeredCount, 1)
  assert.equal(body.totalQuestions, 7)
  assert.equal(body.isLastQuestion, false)
  assert.equal(JSON.stringify(body).includes(correctAnswer), false, 'não devolve a correta')
})

await test('a resposta ficou registrada na questão com autor e tempo', async () => {
  const today = await (await request('/api/quiz/today', { headers: { 'x-player-token': tokenMurilo } })).json()
  const questionId = today.questions[0].id
  const registro = stub.read('questions', questionId).respostas[dayKey].murilo

  assert.equal(registro.id_questao, questionId)
  assert.equal(registro.tempoDeRespostaMs, 4321)
  assert.equal(registro.nickname, 'Murilo')
  assert.equal(registro.correta, true)
})

await test('repetir a mesma questão na mesma rodada devolve 409', async () => {
  const today = await (await request('/api/quiz/today', { headers: { 'x-player-token': tokenMurilo } })).json()

  const response = await request('/api/quiz/answers', {
    method: 'POST',
    headers: { 'x-player-token': tokenMurilo },
    body: JSON.stringify({ questionId: today.questions[0].id, answer: 'outra' }),
  })
  const body = await response.json()

  assert.equal(response.status, 409)
  assert.match(body.message, /já respondeu/i)
})

await test('a sessão retoma a rodada de onde parou', async () => {
  const today = await (await request('/api/quiz/today', { headers: { 'x-player-token': tokenMurilo } })).json()

  assert.equal(today.answeredQuestionIds.length, 1)
  assert.equal(today.questions[0].id, today.answeredQuestionIds[0])
  assert.equal(today.answerDetail[today.questions[0].id].correta, true)
  assert.ok(today.player.pendingScore > 0, 'pontos do dia acumulados')
})

await test('resposta vazia e questionId inválido devolvem 400', async () => {
  const empty = await request('/api/quiz/answers', {
    method: 'POST',
    headers: { 'x-player-token': tokenMurilo },
    body: JSON.stringify({ questionId: 'games-1', answer: '   ' }),
  })
  assert.equal(empty.status, 400)

  const noQuestion = await request('/api/quiz/answers', {
    method: 'POST',
    headers: { 'x-player-token': tokenMurilo },
    body: JSON.stringify({ answer: 'algo' }),
  })
  assert.equal(noQuestion.status, 400)

  const tooLong = await request('/api/quiz/answers', {
    method: 'POST',
    headers: { 'x-player-token': tokenMurilo },
    body: JSON.stringify({ questionId: 'games-1', answer: 'x'.repeat(200) }),
  })
  assert.equal(tooLong.status, 400)
})

await test('token adulterado é recusado', async () => {
  const response = await request('/api/quiz/today', {
    headers: { 'x-player-token': 'payload.naoassinado' },
  })

  assert.equal(response.status, 401)
})

await test('ranking lista os players e ordena por score', async () => {
  const response = await request('/api/ranking')
  const body = await response.json()

  assert.equal(response.status, 200)
  assert.ok(body.total >= 1)
  assert.ok(body.players.length >= 1)
  for (let i = 1; i < body.players.length; i += 1) {
    assert.ok(body.players[i - 1].score >= body.players[i].score, 'ordem decrescente')
  }
})

await test('ranking?nickname encontra o player por prefixo, exato ou parcial', async () => {
  const exact = await (await request('/api/ranking?nickname=murilo')).json()
  assert.equal(exact.found, true)
  assert.equal(exact.players[0].nickname, 'Murilo')

  const withSpace = await (await request('/api/ranking?nickname=%20MURILO%20')).json()
  assert.equal(withSpace.found, true, 'normaliza caixa e espaços')
  assert.equal(withSpace.players[0].nickname, 'Murilo')

  const partial = await (await request('/api/ranking?nickname=mu')).json()
  assert.equal(partial.found, true, 'busca por prefixo')
  assert.equal(partial.players[0].nickname, 'Murilo')

  const missing = await (await request('/api/ranking?nickname=naoexiste')).json()
  assert.equal(missing.found, false)
  assert.equal(missing.players.length, 0)
})

await test('o player completa as 7 questões e a rodada fecha no 7º envio', async () => {
  const { token } = await login('Ana')

  for (let index = 0; index < 7; index += 1) {
    const today = await (await request('/api/quiz/today', { headers: { 'x-player-token': token } })).json()
    const question = today.questions.find((q) => !today.answeredQuestionIds.includes(q.id))
    if (!question) break

    const correctAnswer = stub.read('questions', question.id).correctAnswer
    const body = await (
      await request('/api/quiz/answers', {
        method: 'POST',
        headers: { 'x-player-token': token },
        body: JSON.stringify({ questionId: question.id, answer: correctAnswer, responseTimeMs: 1000 + index }),
      })
    ).json()

    assert.equal(body.correct, true)
    assert.equal(body.totalQuestions, 7)
    assert.equal(body.isLastQuestion, index === 6, 'só a 7ª marca isLastQuestion')
  }

  const final = await (await request('/api/quiz/today', { headers: { 'x-player-token': token } })).json()
  assert.equal(final.answeredQuestionIds.length, 7, 'rodada completa: o loop do front para aqui')
  assert.ok(final.player.pointsToday > 0)
})

await test('Script Diário sem CRON_SECRET válido devolve 401', async () => {
  const semSegredo = await request('/api/daily/run', { method: 'POST' })
  assert.equal(semSegredo.status, 401)

  const segredoErrado = await request('/api/daily/run', {
    method: 'POST',
    headers: { 'x-cron-secret': 'chute' },
  })
  assert.equal(segredoErrado.status, 401)
})

await test('rodada ainda em andamento não é fechada ao rodar o script no meio do dia', async () => {
  const response = await request('/api/daily/run', {
    method: 'POST',
    headers: { 'x-cron-secret': 'segredo-de-teste' },
  })
  const body = await response.json()

  assert.equal(response.status, 200)
  assert.equal(body.round.id, dayKey)
  assert.equal(body.round.finalized, false, 'jogadores ainda respondem hoje')
  assert.deepEqual(body.finalizedRounds, [], 'nada a fechar hoje')
})

await test('no dia seguinte o script fecha a rodada de ontem e abre a nova', async () => {
  const tomorrow = new Date(Date.now() + 86_400_000)
  const nextDayKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC' }).format(tomorrow)

  const { round, finalized } = await ensureDailyRound(nextDayKey)

  assert.equal(round.id, nextDayKey, 'rodada de amanhã criada')
  assert.equal(round.status, 'open')
  assert.equal(round.questionIds.length, 7)

  const closed = finalized.find((entry) => entry.roundId === dayKey)
  assert.ok(closed, 'a rodada de hoje foi fechada')
  assert.equal(closed.status, 'closed')

  const yesterday = stub.read('rounds', dayKey)
  assert.equal(yesterday.status, 'closed')
  assert.equal(yesterday.finalizedBy, 'script-diario')

  for (const id of yesterday.questionIds) {
    assert.equal(round.questionIds.includes(id), false, 'questão de ontem não se repete')
  }

  const ana = stub.read('players', 'ana')
  assert.equal(ana.pendingScore, 0, 'pendingScore zerado')
  assert.equal(ana.score, ana.pontosHoje, 'score cumulativo consolidado')
  assert.equal(ana.rank, 1, 'Ana completou a rodada e lidera')

  // A questão só pode ter sido marcada uma vez: 7 flags, todas do dia.
  const flagged = [...stub.docs.entries()].filter(
    ([path, data]) => path.startsWith('questions/') && data.selectedForDay,
  )
  assert.equal(flagged.length, 7)
})

await test('rodada de ontem não aceita mais respostas depois de fechada', async () => {
  const { token } = await login('Bob')
  const yesterday = await (
    await request(`/api/quiz/today?date=${dayKey}`, { headers: { 'x-player-token': token } })
  ).json()

  // As questões de ontem foram desmarcadas quando a rodada de hoje abriu, então
  // `selectedOn` não bate mais e o envio é recusado com 409.
  assert.ok(yesterday.round.id === dayKey || yesterday.round.questionCount >= 0)

  const response = await request('/api/quiz/answers', {
    method: 'POST',
    headers: { 'x-player-token': token },
    body: JSON.stringify({
      questionId: yesterday.questions[0].id,
      answer: 'qualquer',
      responseTimeMs: 100,
    }),
  })

  // Ou a rodada de hoje não existe para o endpoint, ou a questão foi desvalidada:
  // em nenhum caso a resposta entra no placar já congelado de ontem.
  assert.ok([409].includes(response.status), `esperava 409, veio ${response.status}`)
  assert.equal(stub.read('players', 'bob').rank, null)
})

await test('rota inexistente devolve 404 em JSON', async () => {
  const response = await request('/api/nao-existe')
  const body = await response.json()

  assert.equal(response.status, 404)
  assert.ok(body.message.includes('/api/nao-existe'))
})

server.close()
console.log(failed > 0 ? `\n${failed} teste(s) falharam.` : '\nContrato HTTP OK.')
process.exitCode = failed > 0 ? 1 : 0
