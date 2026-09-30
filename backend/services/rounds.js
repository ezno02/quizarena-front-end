import {
  BASE_POINTS_PER_QUESTION,
  DAILY_QUESTION_COUNT,
  QUESTION_COOLDOWN_DAYS,
} from '../config.js'
import { getFieldValue, getFirestore } from '../firebase.js'
import {
  filterEligibleQuestions,
  normalizeQuestion,
  selectDailyQuestions,
} from './questionService.js'
import { atribuirRanks, montarPlacar } from './scoring.js'
import { PLAYERS_COLLECTION, getAllPlayers } from './players.js'
import { formatRoundLabel, getDayKey } from './time.js'

export const ROUNDS_COLLECTION = 'rounds'
export const QUESTIONS_COLLECTION = 'questions'
export const DISCIPLINES_COLLECTION = 'disciplinas'

const FIRESTORE_BATCH_LIMIT = 400

function chunk(items, size) {
  const batches = []
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size))
  }
  return batches
}

function httpError(status, message) {
  const error = new Error(message)
  error.status = status
  return error
}

async function loadAllQuestions() {
  const snapshot = await getFirestore().collection(QUESTIONS_COLLECTION).get()
  return snapshot.docs.map((doc, index) => normalizeQuestion({ id: doc.id, ...doc.data() }, index))
}

export async function getRound(roundId) {
  const snapshot = await getFirestore().collection(ROUNDS_COLLECTION).doc(roundId).get()
  return snapshot.exists ? snapshot.data() : null
}

/**
 * Carrega a rodada e as questões em bruto (mantendo `respostas` e `stats`),
 * na ordem definida no sorteio.
 */
export async function loadRoundQuestionDocs(roundId) {
  const round = await getRound(roundId)

  if (!round || !Array.isArray(round.questionIds) || round.questionIds.length === 0) {
    return { round: null, questions: [] }
  }

  const db = getFirestore()
  const refs = round.questionIds.map((id) => db.collection(QUESTIONS_COLLECTION).doc(id))
  const snapshots = await db.getAll(...refs)

  const byId = new Map()
  for (const snapshot of snapshots) {
    if (snapshot.exists) {
      byId.set(snapshot.id, { id: snapshot.id, ...snapshot.data() })
    }
  }

  const questions = round.questionIds.map((id) => byId.get(id)).filter(Boolean)

  return { round, questions }
}

/** Carrega a rodada e as questões já normalizadas (sem `respostas`). */
export async function loadRoundQuestions(roundId) {
  const { round, questions } = await loadRoundQuestionDocs(roundId)

  return {
    round,
    questions: questions.map((question, index) => normalizeQuestion(question, index)),
  }
}

/**
 * Desmarca `selectedForDay` das questões que não entraram na rodada atual.
 * A fonte da verdade continua sendo `rounds/<dayKey>.questionIds`; a flag é
 * apenas o marcador booleano pedido no fluxograma.
 */
async function clearPreviousSelection(keepIds) {
  const db = getFirestore()
  const now = getFieldValue().serverTimestamp()
  const snapshot = await db.collection(QUESTIONS_COLLECTION).where('selectedForDay', '==', true).get()
  const stale = snapshot.docs.filter((doc) => !keepIds.includes(doc.id))

  for (const docs of chunk(stale, FIRESTORE_BATCH_LIMIT)) {
    const batch = db.batch()
    for (const doc of docs) {
      batch.update(doc.ref, { selectedForDay: false, updatedAt: now })
    }
    await batch.commit()
  }
}

/**
 * Cria a rodada do dia se ela ainda não existir.
 *
 * Sorteia 7 questões sem repetir disciplina, marca `selectedForDay: true` +
 * `selectedOn: <dayKey>` em cada uma e persiste o snapshot em `rounds/<dayKey>`.
 * A criação é feita em transação, então rodar o script várias vezes (ou duas
 * instâncias do backend ao mesmo tempo) não gera rodadas duplicadas.
 */
export async function createRoundIfMissing(dayKey, { questionCount = DAILY_QUESTION_COUNT } = {}) {
  const db = getFirestore()
  const roundRef = db.collection(ROUNDS_COLLECTION).doc(dayKey)
  const now = getFieldValue().serverTimestamp()

  const existing = await roundRef.get()
  if (existing.exists && existing.data()?.questionIds?.length) {
    return existing.data()
  }

  const allQuestions = await loadAllQuestions()
  const eligible = filterEligibleQuestions(allQuestions, dayKey, QUESTION_COOLDOWN_DAYS)
  const pool = eligible.length >= questionCount ? eligible : allQuestions.filter((question) => question.ativa)
  const selected = selectDailyQuestions(pool, questionCount)

  if (selected.length === 0) {
    throw httpError(
      409,
      'Nenhuma questão cadastrada em `questions`. Verifique se a base de questões está populada no Firestore.',
    )
  }

  const warnings = []
  if (eligible.length < questionCount) {
    warnings.push(
      `Só ${eligible.length} questões estão fora da janela de ${QUESTION_COOLDOWN_DAYS} dias; o sorteio incluiu questões recentes.`,
    )
  }
  if (selected.length < questionCount) {
    warnings.push(`Só foi possível montar ${selected.length} de ${questionCount} questões nesta rodada.`)
  }

  const roundData = {
    id: dayKey,
    date: dayKey,
    label: formatRoundLabel(dayKey),
    status: 'open',
    questionCount: selected.length,
    questionIds: selected.map((question) => question.id),
    disciplineIds: [...new Set(selected.map((question) => question.disciplinaId))],
    disciplineNames: [...new Set(selected.map((question) => question.disciplinaNome))],
    createdAt: now,
    finalizedAt: null,
    finalizedBy: null,
    questionScores: [],
    scoreboard: [],
    warnings,
  }

  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(roundRef)

    if (snapshot.exists && snapshot.data()?.questionIds?.length) {
      return
    }

    transaction.set(roundRef, roundData)

    for (const question of selected) {
      transaction.update(db.collection(QUESTIONS_COLLECTION).doc(question.id), {
        selectedForDay: true,
        selectedOn: dayKey,
        updatedAt: now,
      })
    }
  })

  const persisted = (await roundRef.get()).data() ?? roundData
  await clearPreviousSelection(persisted.questionIds ?? [])

  return persisted
}

/**
 * Fecha rodadas antigas que ficaram com `status: 'open'` (ex.: backend ficou
 * fora do ar na virada do dia). Roda antes de abrir a rodada de hoje.
 */
export async function finalizeOpenRoundsBefore(dayKey, { dryRun = false } = {}) {
  const db = getFirestore()
  const snapshot = await db.collection(ROUNDS_COLLECTION).where('status', '==', 'open').get()
  const stale = snapshot.docs
    .map((doc) => doc.id)
    .filter((id) => id < dayKey)
    .sort()

  const finalized = []
  for (const roundId of stale) {
    if (dryRun) {
      finalized.push({ roundId, status: 'pending' })
      continue
    }

    const result = await finalizeRound(roundId)
    if (result) {
      finalized.push(result)
    }
  }

  return finalized
}

/**
 * Script Diário — parte 1 e 2 do fluxograma:
 *  1. "Cálculo de Pontuação das Alternativas" (peso dinâmico por raridade);
 *  2. "Ranking: calcular o ranking dos players e salvar no firebase".
 *
 * Idempotente: rodar duas vezes não duplica pontos, porque a pontuação do dia
 * entra em `score` e `pendingScore` é zerado.
 */
export async function finalizeRound(roundId) {
  const db = getFirestore()
  const roundRef = db.collection(ROUNDS_COLLECTION).doc(roundId)
  const roundSnapshot = await roundRef.get()

  if (!roundSnapshot.exists) {
    return null
  }

  const round = roundSnapshot.data()

  if (round.status === 'closed') {
    return { roundId, status: 'closed', alreadyFinalized: true }
  }

  const questionIds = round.questionIds ?? []
  const questionRefs = questionIds.map((id) => db.collection(QUESTIONS_COLLECTION).doc(id))
  const [questionSnapshots, players] = await Promise.all([
    questionRefs.length ? db.getAll(...questionRefs) : Promise.resolve([]),
    getAllPlayers(),
  ])

  const questoes = questionSnapshots
    .filter((snapshot) => snapshot.exists)
    .map((snapshot) => {
      const data = snapshot.data()

      return {
        id: snapshot.id,
        pontosBase: data.pontosBase,
        // Só as respostas DESTA rodada: o documento guarda o histórico de
        // todas as rodadas em que a questão apareceu.
        respostas: data.respostas?.[roundId] ?? {},
      }
    })

  const { questionScores, placar } = montarPlacar(questoes, BASE_POINTS_PER_QUESTION)
  const porJogador = new Map(placar.map((linha) => [linha.playerId, linha]))

  const now = getFieldValue().serverTimestamp()

  // Snapshot com score já somado, para o ranking ser atribuído em uma passada só.
  const comPontos = players.map((player) => {
    const doDia = porJogador.get(player.id)
    const pontosDia = doDia?.pontosDia ?? 0

    return {
      ...player,
      pontosDia,
      score: Number(player.score ?? 0) + pontosDia,
    }
  })

  const ranked = atribuirRanks(comPontos)

  // 1) Persiste o peso dinâmico de cada questão da rodada.
  for (const docs of chunk(questionScores, FIRESTORE_BATCH_LIMIT)) {
    const batch = db.batch()

    for (const stats of docs) {
      batch.update(db.collection(QUESTIONS_COLLECTION).doc(stats.questionId), {
        [`stats.${roundId}.totalRespostas`]: stats.totalRespostas,
        [`stats.${roundId}.acertos`]: stats.acertos,
        [`stats.${roundId}.percentualAcerto`]: stats.percentualAcerto,
        [`stats.${roundId}.raridade`]: stats.raridade,
        [`stats.${roundId}.peso`]: stats.peso,
        [`stats.${roundId}.pontos`]: stats.pontos,
        [`stats.${roundId}.distribuicao`]: stats.distribuicao,
        updatedAt: now,
      })
    }

    await batch.commit()
  }

  // 2) Consolida a pontuação e salva o ranking cumulativo dos players.
  for (const docs of chunk(ranked, FIRESTORE_BATCH_LIMIT)) {
    const batch = db.batch()

    for (const player of docs) {
      batch.update(db.collection(PLAYERS_COLLECTION).doc(player.id), {
        score: player.score,
        pendingScore: 0,
        pontosHoje: player.pontosDia,
        rank: player.rank,
        lastRoundId: roundId,
        updatedAt: now,
      })
    }

    await batch.commit()
  }

  const totalAnswers = questionScores.reduce((sum, stats) => sum + stats.totalRespostas, 0)

  await roundRef.update({
    status: 'closed',
    finalizedAt: now,
    finalizedBy: 'script-diario',
    playerCount: placar.length,
    totalAnswers,
    questionScores,
    scoreboard: ranked.slice(0, 50).map((player) => ({
      playerId: player.id,
      nickname: player.nickname,
      score: player.score,
      pontosDia: player.pontosDia,
      rank: player.rank,
    })),
  })

  return {
    roundId,
    status: 'closed',
    playerCount: placar.length,
    totalAnswers,
    questionScores,
    scoreboard: ranked.slice(0, 50),
  }
}

/**
 * Garante a rodada do dia: fecha as anteriores e abre a de hoje.
 * Roda no boot do servidor e no cronjob das 00h00.
 */
export async function ensureDailyRound(dayKey = getDayKey(), options = {}) {
  const finalized = await finalizeOpenRoundsBefore(dayKey, options)
  const round = await createRoundIfMissing(dayKey, options)

  return { dayKey, round, finalized }
}

export async function getOpenRounds() {
  const snapshot = await getFirestore().collection(ROUNDS_COLLECTION).where('status', '==', 'open').get()
  return snapshot.docs.map((doc) => doc.data())
}
