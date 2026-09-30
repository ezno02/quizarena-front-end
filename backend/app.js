/**
 * Monta a aplicação Express sem iniciar o listener.
 *
 * `server.js` importa daqui e chama `boot()`; os testes (`tests/http.js`)
 * importam direto e sobem a porta que quiserem.
 */
import cors from 'cors'
import express from 'express'

import {
  APP_TIMEZONE,
  BASE_POINTS_PER_QUESTION,
  CRON_SECRET,
  DAILY_QUESTION_COUNT,
  RANKING_LIMIT,
  isFirebaseConfigured,
  missingFirebaseVars,
} from './config.js'
import { timingSafeEqual } from 'node:crypto'

import { buildRoundProgress, registrarResposta } from './services/answers.js'
import { getApp } from './firebase.js'
import { findOrCreatePlayer, getPlayer, toPublicPlayer } from './services/players.js'
import { getRanking, searchPlayer } from './services/ranking.js'
import { ensureDailyRound, loadRoundQuestionDocs } from './services/rounds.js'
import { normalizeQuestion, toPublicQuestion } from './services/questionService.js'
import { createPlayerToken, getAuthenticatedPlayerId } from './services/session.js'
import { getDayKey } from './services/time.js'

const app = express()

app.use(cors())
app.use(express.json({ limit: '32kb' }))

/**
 * O Express 4 não captura rejeição de Promise em handlers async: sem isto um
 * `throw` dentro de uma rota async deixa a requisição pendurada para sempre
 * (e o front fica carregando indefinidamente).
 */
function asyncRoute(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next)
  }
}

function httpError(status, message) {
  const error = new Error(message)
  error.status = status
  return error
}

function requirePlayer(req) {
  const playerId = getAuthenticatedPlayerId(req)

  if (!playerId) {
    throw httpError(401, 'Sessão inválida ou expirada. Entre com seu nickname novamente.')
  }

  return playerId
}

/** Carrega a rodada de hoje ou responde 409 se o Script Diário ainda não rodou. */
async function loadTodayRound() {
  const dayKey = getDayKey()
  const { round, questions } = await loadRoundQuestionDocs(dayKey)

  if (!round) {
    throw httpError(409, `A rodada de ${dayKey} ainda não foi sorteada. Rode "npm run daily" no backend.`)
  }

  return { dayKey, round, questions }
}

function toRoundSummary(round, questionCount) {
  return {
    id: round.id,
    date: round.date,
    label: round.label,
    status: round.status,
    finalized: round.status === 'closed',
    questionCount: questionCount ?? round.questionCount ?? 0,
    disciplineNames: round.disciplineNames ?? [],
    warnings: round.warnings ?? [],
  }
}

app.get('/api/health', (req, res) => {
  const configured = isFirebaseConfigured()

  // `getApp()` falha rápido se a chave não for uma service account, o que
  // transforma "tem .env" em "tem .env válido".
  let connected = false
  let firebaseError = null

  if (configured) {
    try {
      getApp()
      connected = true
    } catch (error) {
      firebaseError = error.message
    }
  }

  res.json({
    ok: true,
    service: 'quiz-arena-backend',
    firebase: configured ? (connected ? 'connected' : 'invalid-credentials') : 'not-configured',
    ...(firebaseError ? { firebaseError } : {}),
    dayKey: getDayKey(),
    timezone: APP_TIMEZONE,
    dailyQuestionCount: DAILY_QUESTION_COUNT,
    basePointsPerQuestion: BASE_POINTS_PER_QUESTION,
    rankingLimit: RANKING_LIMIT,
  })
})

/**
 * "Pesquisar nickname" + criação de player.
 * O nickname é único: a chave do documento no Firestore é o nickname
 * normalizado, então nickname novo cria o player e nickname existente
 * recupera o mesmo player para continuar somando pontos.
 */
app.post(
  '/api/players/login',
  asyncRoute(async (req, res) => {
    const { nickname } = req.body ?? {}
    const { id, data, created } = await findOrCreatePlayer(nickname)

    res.json({
      player: toPublicPlayer({ id, data }, { isNew: created }),
      token: createPlayerToken(id),
    })
  }),
)

app.get(
  '/api/players/me',
  asyncRoute(async (req, res) => {
    const player = await getPlayer(requirePlayer(req))

    if (!player) {
      throw httpError(404, 'Player não encontrado. Entre com seu nickname novamente.')
    }

    res.json({ player: toPublicPlayer(player) })
  }),
)

/** "Buscar questões do dia (7 questões)" — a mesma rodada para todo mundo. */
app.get(
  '/api/quiz/today',
  asyncRoute(async (req, res) => {
    const playerId = requirePlayer(req)
    const { round, questions: rawQuestions } = await loadTodayRound()
    const player = await getPlayer(playerId)

    if (!player) {
      throw httpError(404, 'Player não encontrado. Entre com seu nickname novamente.')
    }

    const questions = rawQuestions.map((question, index) => normalizeQuestion(question, index))
    const progress = buildRoundProgress(getDayKey(), rawQuestions, playerId)
    const { players: ranking, total } = await getRanking()

    res.json({
      round: toRoundSummary(round, questions.length),
      player: toPublicPlayer(player),
      questions: questions.map((question, index) => toPublicQuestion(question, index + 1, questions.length)),
      answeredQuestionIds: progress.answeredQuestionIds,
      answerDetail: progress.detail,
      ranking,
      rankingTotal: total,
    })
  }),
)

/** "Salvar respostas" — grava no documento da questão e atualiza a pontuação. */
app.post(
  '/api/quiz/answers',
  asyncRoute(async (req, res) => {
    const playerId = requirePlayer(req)
    const { questionId, resposta, answer, tempoDeRespostaMs, responseTimeMs } = req.body ?? {}
    const texto = resposta ?? answer

    if (!questionId || typeof texto !== 'string' || !texto.trim()) {
      throw httpError(400, 'Informe questionId e uma resposta com pelo menos 1 caractere.')
    }

    if (texto.length > 120) {
      throw httpError(400, 'A resposta pode ter no máximo 120 caracteres.')
    }

    const { dayKey, questions: rawQuestions } = await loadTodayRound()
    const resultado = await registrarResposta({
      playerId,
      questionId: String(questionId),
      resposta: texto,
      tempoDeRespostaMs: tempoDeRespostaMs ?? responseTimeMs,
      roundId: dayKey,
    })

    // Releitura para devolver o progresso exato da rodada.
    const { questions: atualizadas } = await loadRoundQuestionDocs(dayKey)
    const progress = buildRoundProgress(dayKey, atualizadas, playerId)

    res.json({
      correct: resultado.correta,
      pointsEarned: resultado.pontosDia,
      estimatedPoints: resultado.correta ? resultado.pesoPrevisto.pontos : 0,
      weight: resultado.pesoPrevisto.peso,
      answeredCount: progress.answeredCount,
      correctCount: progress.correctCount,
      totalQuestions: progress.totalQuestions,
      isLastQuestion: progress.answeredCount >= progress.totalQuestions,
      message: resultado.correta
        ? `Boa! +${resultado.pontosDia} pts (peso ${resultado.pesoPrevisto.peso}x).`
        : 'Resposta não reconhecida. Segue para a próxima questão.',
    })
  }),
)

/** Ranking lateral. Com `?nickname=` busca o player e devolve a posição dele. */
app.get(
  '/api/ranking',
  asyncRoute(async (req, res) => {
    const nickname = String(req.query.nickname ?? '').trim()

    if (nickname) {
      const { player, matches, total } = await searchPlayer(nickname)

      return res.json({
        players: matches,
        total,
        searchedNickname: nickname,
        found: Boolean(player),
      })
    }

    const limit = Math.min(Math.max(Number(req.query.limit) || RANKING_LIMIT, 1), 50)
    const { players, total } = await getRanking({ limit })

    return res.json({ players, total })
  }),
)

/**
 * "Script Diário (cronjob às 00h00)" — ponto de entrada HTTP para o agendador.
 * O mesmo script roda no boot do servidor; as duas rotas são idempotentes.
 */
app.post(
  '/api/daily/run',
  asyncRoute(async (req, res) => {
    if (!CRON_SECRET) {
      throw httpError(503, 'Defina CRON_SECRET no backend/.env para habilitar o script diário.')
    }

    const provided = Buffer.from(String(req.headers['x-cron-secret'] ?? ''))
    const expected = Buffer.from(CRON_SECRET)

    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
      throw httpError(401, 'CRON_SECRET inválido.')
    }

    const dayKey = getDayKey()
    const { round, finalized } = await ensureDailyRound(dayKey)

    res.json({
      ok: true,
      dayKey,
      round: toRoundSummary(round),
      finalizedRounds: finalized,
    })
  }),
)

app.use((req, res) => {
  res.status(404).json({ message: `Rota não encontrada: ${req.method} ${req.path}` })
})

// eslint-disable-next-line no-unused-vars
app.use((error, req, res, next) => {
  // Erros com `status` explícito foram gerados por nós (validação, Firebase não
  // configurado, rodada inexistente) e a mensagem é útil para o front.
  const isExpected = Number.isInteger(error?.status) && error.status >= 400 && error.status < 600
  const status = isExpected ? error.status : 500

  if (!isExpected) {
    console.error('[quiz-arena] Erro inesperado:', error)
  }

  res.status(status).json({
    message: isExpected ? error.message : 'Erro interno no backend do Quiz Arena.',
    ...(!isExpected && process.env.NODE_ENV !== 'production' ? { detail: error.message } : {}),
  })
})

export default app
