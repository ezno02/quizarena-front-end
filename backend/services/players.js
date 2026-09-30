import { getFieldValue, getFirestore } from '../firebase.js'
import { buildNicknameKey, getInitials } from './text.js'

export const PLAYERS_COLLECTION = 'players'

const NICKNAME_MIN_LENGTH = 2
const NICKNAME_MAX_LENGTH = 24

function httpError(status, message) {
  const error = new Error(message)
  error.status = status
  return error
}

/** Aceita o valor cru do Firestore (Timestamp do Admin SDK ou ISO string). */
export function toIso(value) {
  if (!value) return null
  if (typeof value === 'string') return value
  if (typeof value?.toDate === 'function') return value.toDate().toISOString()
  return null
}

export function validateNickname(rawNickname) {
  const nickname = String(rawNickname ?? '').trim().replace(/\s+/g, ' ')

  if (!nickname) {
    return { ok: false, message: 'Digite um nickname para entrar no Quiz Arena.' }
  }

  if (nickname.length < NICKNAME_MIN_LENGTH || nickname.length > NICKNAME_MAX_LENGTH) {
    return {
      ok: false,
      message: `O nickname precisa ter entre ${NICKNAME_MIN_LENGTH} e ${NICKNAME_MAX_LENGTH} caracteres.`,
    }
  }

  const key = buildNicknameKey(nickname)

  if (!key || key.length < NICKNAME_MIN_LENGTH) {
    return {
      ok: false,
      message: 'Use pelo menos duas letras ou números no nickname (evite apenas símbolos).',
    }
  }

  return { ok: true, nickname, key }
}

/**
 * A chave do documento é o próprio nickname normalizado, então a unicidade
 * vem de graça: dois "Murilo" com capitalização/espaços diferentes caem no
 * mesmo documento e o segundo jogador continua o mesmo player.
 */
export async function findOrCreatePlayer(rawNickname) {
  const validation = validateNickname(rawNickname)

  if (!validation.ok) {
    throw httpError(400, validation.message)
  }

  const db = getFirestore()
  const ref = db.collection(PLAYERS_COLLECTION).doc(validation.key)
  const serverTimestamp = getFieldValue().serverTimestamp()

  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref)

    if (snapshot.exists) {
      transaction.update(ref, { lastActiveAt: serverTimestamp })
      return { id: snapshot.id, data: snapshot.data(), created: false }
    }

    const data = {
      nickname: validation.nickname,
      nicknameKey: validation.key,
      iniciais: getInitials(validation.nickname),
      score: 0,
      pendingScore: 0,
      pontosHoje: 0,
      rank: null,
      answersTotal: 0,
      correctTotal: 0,
      lastRoundId: null,
      createdAt: serverTimestamp,
      lastActiveAt: serverTimestamp,
    }

    transaction.create(ref, data)
    return { id: ref.id, data, created: true }
  })
}

export async function getPlayer(playerId) {
  if (!playerId) return null

  const snapshot = await getFirestore().collection(PLAYERS_COLLECTION).doc(String(playerId)).get()
  return snapshot.exists ? { id: snapshot.id, data: snapshot.data() } : null
}

export async function getAllPlayers() {
  const snapshot = await getFirestore().collection(PLAYERS_COLLECTION).get()

  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
    createdAtIso: toIso(doc.data()?.createdAt),
  }))
}

/** Shape enviado ao front-end (espelha `PlayerProfile` em src/types/quiz.ts). */
export function toPublicPlayer({ id, data }, { isNew = false } = {}) {
  return {
    id,
    nickname: data?.nickname ?? id,
    score: Number(data?.score ?? 0),
    pendingScore: Number(data?.pendingScore ?? 0),
    pointsToday: Number(data?.pontosHoje ?? 0),
    rank: data?.rank == null ? null : Number(data.rank),
    initials: data?.iniciais ?? getInitials(data?.nickname ?? id),
    answersTotal: Number(data?.answersTotal ?? 0),
    correctTotal: Number(data?.correctTotal ?? 0),
    createdAt: toIso(data?.createdAt),
    isNew,
  }
}
