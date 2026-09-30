// Contrato entre o backend Express/Firestore e a tela.
// Espelha as rotas em `backend/server.js` e o modelo descrito em
// `backend/FIRESTORE.md`. A resposta correta nunca chega aqui: a checagem e o
// cálculo de pontuação acontecem no servidor.

export type RankingTone = 'gold' | 'silver' | 'bronze'
export type AnswerSubmissionStatus = 'idle' | 'sending' | 'checked'

export type RankingPlayer = {
  id: string
  nickname: string
  /** Pontuação cumulativa, confirmada pelo Script Diário. */
  score: number
  /** Pontos de hoje, ainda provisórios (peso dinâmico só fecha à meia-noite). */
  pendingScore: number
  rank: number | null
  initials: string
  correctTotal: number
  createdAt: string | null
  tone?: RankingTone
}

export type PlayerProfile = {
  id: string
  nickname: string
  score: number
  pendingScore: number
  pointsToday: number
  rank: number | null
  initials: string
  answersTotal: number
  correctTotal: number
  createdAt: string | null
  /** true quando o nickname não existia e o player acabou de ser criado. */
  isNew: boolean
}

export type QuizQuestion = {
  id: string
  disciplineId: string
  disciplineName: string
  prompt: string
  /** Trecho de `prompt` que a UI destaca. Vazio = nenhuma ênfase. */
  highlightedText: string
  questionNumber: number
  totalQuestions: number
  progressPercent: number
}

export type RoundSummary = {
  id: string
  date: string
  label: string
  status: 'open' | 'closed'
  finalized: boolean
  questionCount: number
  disciplineNames: string[]
  warnings: string[]
}

export type AnswerDetail = {
  correta: boolean
  resposta: string
  tempoDeRespostaMs: number
  pontosPrevistos: number
}

export type QuizState = {
  round: RoundSummary
  player: PlayerProfile
  questions: QuizQuestion[]
  answeredQuestionIds: string[]
  answerDetail: Record<string, AnswerDetail>
  ranking: RankingPlayer[]
  rankingTotal: number
}

export type LoginResult = {
  player: PlayerProfile
  token: string
}

export type SubmitAnswerPayload = {
  questionId: string
  answer: string
  responseTimeMs: number
}

export type SubmitAnswerResult = {
  correct: boolean
  pointsEarned: number
  estimatedPoints: number
  weight: number
  answeredCount: number
  correctCount: number
  totalQuestions: number
  isLastQuestion: boolean
  message: string
}

export type RankingResponse = {
  players: RankingPlayer[]
  total: number
  searchedNickname?: string
  found?: boolean
}
