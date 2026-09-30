import { BASE_POINTS_PER_QUESTION } from '../config.js'
import { getFieldValue, getFirestore } from '../firebase.js'
import { isAnswerCorrect, normalizeQuestion } from './questionService.js'
import { normalizeAnswer } from './text.js'
import { calcularPesoDinamico } from './scoring.js'
import { PLAYERS_COLLECTION } from './players.js'
import { QUESTIONS_COLLECTION } from './rounds.js'

const MAX_RESPONSE_TIME_MS = 6 * 60 * 60 * 1000

function httpError(status, message) {
  const error = new Error(message)
  error.status = status
  return error
}

/**
 * Grava a resposta do player dentro do próprio documento da questão:
 *
 *   questions/<questionId>
 *     respostas:
 *       2026-09-29:
 *         <playerId>: { id_questao, playerId, nickname, resposta,
 *                        respostaNormalizada, correta, tempoDeRespostaMs, ... }
 *
 * É esse mapa que permite (a) não deixar o player responder a mesma questão
 * duas vezes na mesma rodada e (b) o Script Diário comparar as respostas de
 * todos os players para calcular a raridade e o ranking.
 */
export async function registrarResposta({ playerId, questionId, resposta, tempoDeRespostaMs, roundId }) {
  const db = getFirestore()
  const questionRef = db.collection(QUESTIONS_COLLECTION).doc(questionId)
  const playerRef = db.collection(PLAYERS_COLLECTION).doc(playerId)
  const respostaNormalizada = normalizeAnswer(resposta)
  const tempo = Math.min(Math.max(Number(tempoDeRespostaMs) || 0, 0), MAX_RESPONSE_TIME_MS)
  const now = getFieldValue().serverTimestamp()

  return db.runTransaction(async (transaction) => {
    const [questionSnapshot, playerSnapshot] = await transaction.getAll(questionRef, playerRef)

    if (!playerSnapshot.exists) {
      throw httpError(404, 'Player não encontrado. Entre com seu nickname novamente.')
    }

    if (!questionSnapshot.exists) {
      throw httpError(404, 'Questão não encontrada.')
    }

    const rawQuestion = questionSnapshot.data()

    if (rawQuestion.selectedForDay !== true || rawQuestion.selectedOn !== roundId) {
      throw httpError(409, 'Esta questão não faz parte da rodada de hoje.')
    }

    const respostasDaRodada = rawQuestion.respostas?.[roundId] ?? {}

    if (respostasDaRodada[playerId]) {
      throw httpError(409, 'Você já respondeu esta questão na rodada de hoje.')
    }

    const question = normalizeQuestion({ id: questionId, ...rawQuestion })
    const player = playerSnapshot.data()
    const correta = isAnswerCorrect(question, resposta)

    const stats = rawQuestion.stats?.[roundId] ?? { totalRespostas: 0, acertos: 0 }
    const totalApos = Number(stats.totalRespostas ?? 0) + 1
    const acertosApos = Number(stats.acertos ?? 0) + (correta ? 1 : 0)

    // Prévia do peso: o valor definitivo sai no Script Diário, quando todas as
    // respostas do dia estiverem registradas.
    const peso = calcularPesoDinamico({
      acertos: acertosApos,
      total: totalApos,
      pontosBase: Number(question.pontosBase) || BASE_POINTS_PER_QUESTION,
    })

    const pontosDia = correta ? peso.pontos : 0
    const respostaPath = `respostas.${roundId}.${playerId}`

    transaction.update(questionRef, {
      [respostaPath]: {
        id_questao: questionId,
        idRodada: roundId,
        playerId,
        nickname: player.nickname,
        resposta: String(resposta).trim(),
        respostaNormalizada,
        correta,
        tempoDeRespostaMs: tempo,
        pontosPrevistos: pontosDia,
        answeredAt: new Date().toISOString(),
      },
      [`stats.${roundId}.totalRespostas`]: totalApos,
      [`stats.${roundId}.acertos`]: acertosApos,
      updatedAt: now,
    })

    transaction.update(playerRef, {
      pendingScore: getFieldValue().increment(pontosDia),
      answersTotal: getFieldValue().increment(1),
      correctTotal: getFieldValue().increment(correta ? 1 : 0),
      pontosHoje: getFieldValue().increment(pontosDia),
      lastRoundId: roundId,
      updatedAt: now,
    })

    return {
      correta,
      pontosDia,
      pesoPrevisto: peso,
      totalRespostas: totalApos,
      playerId,
      nickname: player.nickname,
    }
  })
}

/**
 * Estado das respostas do player na rodada. Serve para a UI retomar de onde
 * parou, exibir o placar parcial e não repetir pergunta.
 */
export function buildRoundProgress(roundId, questions, playerId) {
  const answeredQuestionIds = []
  const detail = {}

  for (const question of questions) {
    const registro = question.respostas?.[roundId]?.[playerId]

    if (!registro) continue

    answeredQuestionIds.push(question.id)
    detail[question.id] = {
      correta: Boolean(registro.correta),
      resposta: registro.resposta,
      tempoDeRespostaMs: Number(registro.tempoDeRespostaMs) || 0,
      pontosPrevistos: Number(registro.pontosPrevistos) || 0,
    }
  }

  return {
    answeredQuestionIds,
    detail,
    answeredCount: answeredQuestionIds.length,
    totalQuestions: questions.length,
    correctCount: answeredQuestionIds.filter((id) => detail[id].correta).length,
  }
}
