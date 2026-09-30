import { RANKING_LIMIT } from '../config.js'
import { getFirestore } from '../firebase.js'
import { PLAYERS_COLLECTION, toIso } from './players.js'
import { buildNicknameKey, getInitials } from './text.js'

const TONE_BY_RANK = { 1: 'gold', 2: 'silver', 3: 'bronze' }

function toRankingPlayer(doc) {
  const data = doc.data?.() ?? doc

  return {
    id: doc.id ?? data.nicknameKey,
    nickname: data.nickname ?? doc.id,
    score: Number(data.score ?? 0),
    pendingScore: Number(data.pendingScore ?? 0),
    rank: data.rank == null ? null : Number(data.rank),
    initials: data.iniciais ?? getInitials(data.nickname ?? doc.id),
    correctTotal: Number(data.correctTotal ?? 0),
    createdAt: toIso(data.createdAt),
    tone: TONE_BY_RANK[Number(data.rank)] ?? undefined,
  }
}

/** Ranking global (cumulativo, ordenado pelo Script Diário). */
export async function getRanking({ limit = RANKING_LIMIT } = {}) {
  const db = getFirestore()
  const snapshot = await db
    .collection(PLAYERS_COLLECTION)
    .orderBy('score', 'desc')
    .orderBy('correctTotal', 'desc')
    .limit(limit)
    .get()

  const total = await db.collection(PLAYERS_COLLECTION).count().get()

  return { players: snapshot.docs.map(toRankingPlayer), total: total.data().count }
}

/**
 * "Pesquisar nickname" do fluxograma: localiza um player pelo nickname e
 * devolve a posição dele no ranking, mesmo fora do top N.
 *
 * A busca é por prefixo do nickname normalizado, então "lucas" acha "LucasBR".
 * O índice do documento já é a chave normalizada, o que torna isso uma query de
 * intervalo (`>= "lucas"` e `< "lucas\\uffff"`) — sem varrer a coleção.
 */
export async function searchPlayer(rawNickname, { limit = 10 } = {}) {
  const key = buildNicknameKey(rawNickname)

  if (!key) {
    return { player: null, total: 0, matches: [] }
  }

  const db = getFirestore()
  const collection = db.collection(PLAYERS_COLLECTION)

  const matchesSnapshot = await collection
    .where('nicknameKey', '>=', key)
    .where('nicknameKey', '<=', `${key}\uffff`)
    .orderBy('nicknameKey')
    .limit(limit)
    .get()

  const matches = matchesSnapshot.docs.map(toRankingPlayer)

  // Correspondência exata tem prioridade sobre o resto.
  const exact = matches.find((player) => player.id === key)
  const total = await collection.count().get()

  return {
    player: exact ?? matches[0] ?? null,
    matches: exact ? [exact, ...matches.filter((m) => m.id !== exact.id)] : matches,
    total: total.data().count,
  }
}
