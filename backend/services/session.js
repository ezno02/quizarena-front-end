import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

import { PLAYER_TOKEN_SECRET } from '../config.js'

const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000

/**
 * Segredo usado para assinar o token de sessão. Se não vier do `.env`, geramos
 * um aleatório por processo: o backend continua funcionando, mas todo mundo
 * precisa entrar de novo quando ele reinicia.
 */
const SECRET = PLAYER_TOKEN_SECRET || randomBytes(32).toString('hex')

export const isEphemeralSecret = !PLAYER_TOKEN_SECRET

function sign(payload) {
  return createHmac('sha256', SECRET).update(payload).digest('base64url')
}

export function createPlayerToken(playerId) {
  const payload = Buffer.from(
    JSON.stringify({ playerId, issuedAt: Date.now(), expiresAt: Date.now() + TOKEN_TTL_MS }),
  ).toString('base64url')

  return `${payload}.${sign(payload)}`
}

export function verifyPlayerToken(token) {
  if (!token || typeof token !== 'string') {
    return null
  }

  const [payload, signature] = token.split('.')

  if (!payload || !signature) {
    return null
  }

  const expected = sign(payload)
  const given = Buffer.from(signature)
  const wanted = Buffer.from(expected)

  if (given.length !== wanted.length || !timingSafeEqual(given, wanted)) {
    return null
  }

  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))

    if (typeof parsed.playerId !== 'string' || !parsed.playerId) {
      return null
    }

    if (typeof parsed.expiresAt === 'number' && parsed.expiresAt < Date.now()) {
      return null
    }

    return parsed
  } catch {
    return null
  }
}

/** Lê o player autenticado a partir do header `x-player-token`. */
export function getAuthenticatedPlayerId(req) {
  const header = req.headers['x-player-token'] ?? req.headers.authorization?.replace(/^Bearer\s+/i, '')
  return verifyPlayerToken(header)?.playerId ?? null
}
