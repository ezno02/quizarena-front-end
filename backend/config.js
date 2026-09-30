import 'dotenv/config'

const FIREBASE_KEYS = ['FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY']

/** O fluxograma fixa 7 questões por rodada diária. */
export const DAILY_QUESTION_COUNT = 7

/** Fuso usado para definir a "rodada do dia" (chave YYYY-MM-DD). */
export const APP_TIMEZONE = process.env.APP_TIMEZONE || 'America/Sao_Paulo'

export const PORT = Number(process.env.PORT || 4002)

/** Protege POST /api/daily/run, chamado pelo cronjob das 00h00. */
export const CRON_SECRET = process.env.CRON_SECRET || ''

/** Segredo de assinatura dos tokens de sessão dos players. */
export const PLAYER_TOKEN_SECRET = process.env.PLAYER_TOKEN_SECRET || CRON_SECRET || ''

/** Pontuação base de cada questão antes da aplicação do peso dinâmico. */
export const BASE_POINTS_PER_QUESTION = Number(process.env.BASE_POINTS_PER_QUESTION || 100)

/** Limite do peso dinâmico:raridade máxima (ninguém acerta) -> 2.0, todo mundo acerta -> 0.5. */
export const MIN_DYNAMIC_WEIGHT = 0.5
export const MAX_DYNAMIC_WEIGHT = 2

export const RANKING_LIMIT = Number(process.env.RANKING_LIMIT || 10)

/**
 * Evita que a mesma questão reapareça em rodadas muito próximas. Como as
 * respostas ficam dentro do documento da questão (uma entrada por
 * rodada/jogador), essa janela também mantém o documento dentro do limite
 * de 1 MiB do Firestore.
 */
export const QUESTION_COOLDOWN_DAYS = Number(process.env.QUESTION_COOLDOWN_DAYS || 30)

export function missingFirebaseVars() {
  return FIREBASE_KEYS.filter((key) => !process.env[key] || !process.env[key].trim())
}

export function isFirebaseConfigured() {
  return missingFirebaseVars().length === 0
}

export function getFirebaseCredentials() {
  if (!isFirebaseConfigured()) {
    return null
  }

  return {
    projectId: process.env.FIREBASE_PROJECT_ID.trim(),
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL.trim(),
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  }
}
