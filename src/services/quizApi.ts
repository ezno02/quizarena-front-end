import type {
  LoginResult,
  PlayerProfile,
  QuizState,
  RankingResponse,
  SubmitAnswerPayload,
  SubmitAnswerResult,
} from '../types/quiz'

const API_BASE_URL = import.meta.env.VITE_API_URL ?? '/api'

const TOKEN_STORAGE_KEY = 'quiz-arena:player-token'
const PLAYER_STORAGE_KEY = 'quiz-arena:player-id'

/**
 * Uma requisição que nunca responde deixaria a tela em "carregando" para
 * sempre, então toda chamada tem prazo máximo.
 */
const DEFAULT_TIMEOUT_MS = 15_000

type RequestOptions = RequestInit & { timeoutMs?: number }

export class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY)
  } catch {
    return null
  }
}

function getPlayerId(): string | null {
  try {
    return localStorage.getItem(PLAYER_STORAGE_KEY)
  } catch {
    return null
  }
}

export function hasSession(): boolean {
  return Boolean(getToken() && getPlayerId())
}

export function clearSession(): void {
  try {
    localStorage.removeItem(TOKEN_STORAGE_KEY)
    localStorage.removeItem(PLAYER_STORAGE_KEY)
  } catch {
    // localStorage indisponível (modo privado): seguir sem sessão persistida.
  }
}

async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, headers, ...rest } = options
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  const token = getToken()

  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...rest,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'x-player-token': token } : {}),
        ...(headers ?? {}),
      },
      signal: controller.signal,
    })

    if (!response.ok) {
      const raw = await response.text()
      let message = raw || 'Erro ao comunicar com o backend do Quiz Arena.'

      try {
        const parsed = JSON.parse(raw) as { message?: string; detail?: string }
        message = parsed.message ?? parsed.detail ?? message
      } catch {
        // Resposta não-JSON: mantém o texto bruto.
      }

      throw new ApiError(message, response.status)
    }

    return (await response.json()) as T
  } catch (error) {
    if (error instanceof ApiError) {
      throw error
    }

    if (controller.signal.aborted) {
      throw new ApiError('O backend demorou demais para responder. Tente novamente.', 408)
    }

    throw new ApiError(
      'Não foi possível conectar no backend. Ele está rodando na porta 4002?',
      0,
    )
  } finally {
    clearTimeout(timeout)
  }
}

/** Cria o player se o nickname for novo, ou recupera o player existente. */
export async function login(nickname: string): Promise<LoginResult> {
  const result = await apiRequest<LoginResult>('/players/login', {
    method: 'POST',
    body: JSON.stringify({ nickname }),
  })

  try {
    localStorage.setItem(TOKEN_STORAGE_KEY, result.token)
    localStorage.setItem(PLAYER_STORAGE_KEY, result.player.id)
  } catch {
    // Sem persistência a sessão vale só para a aba atual.
  }

  return result
}

/** As 7 questões da rodada de hoje + progresso do player + ranking. */
export function loadQuizState(): Promise<QuizState> {
  return apiRequest<QuizState>('/quiz/today')
}

export function submitAnswer(payload: SubmitAnswerPayload): Promise<SubmitAnswerResult> {
  return apiRequest<SubmitAnswerResult>('/quiz/answers', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function loadRanking(limit?: number): Promise<RankingResponse> {
  const query = limit ? `?limit=${limit}` : ''
  return apiRequest<RankingResponse>(`/ranking${query}`)
}

/** "Pesquisar nickname": devolve o player e a posição dele, fora do top N. */
export function searchRanking(nickname: string): Promise<RankingResponse> {
  return apiRequest<RankingResponse>(`/ranking?nickname=${encodeURIComponent(nickname)}`)
}

export async function getProfile(): Promise<PlayerProfile> {
  const result = await apiRequest<{ player: PlayerProfile }>('/players/me')
  return result.player
}
