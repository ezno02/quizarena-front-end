// Contratos de dados usados pela tela. O backend/Firebase deve devolver dados
// compatíveis com estas interfaces para alimentar os componentes.

export type ThemeTone = 'cyan' | 'coral' | 'amber' | 'green' | 'blue'
export type RankingTone = 'gold' | 'silver' | 'bronze'
export type AnswerSubmissionStatus = 'idle' | 'sending' | 'checked'

export type ThemeHistoryItem = {
  id: string
  title: string
  dateLabel: string
  tone: ThemeTone
}

export type WeeklyTheme = {
  id: string
  title: string
  description: string
}

export type RankingPlayer = {
  id: string
  nickname: string
  score: number
  rank: number
  initials: string
  tone?: RankingTone
}

export type CurrentUser = {
  id: string
  nickname: string
  score: number
  rank: number
  initials: string
}

export type CurrentQuestion = {
  id: string
  category: string
  prompt: string
  highlightedText: string
  questionNumber: number
  totalQuestions: number
  progressPercent: number
}

export type QuizArenaData = {
  currentUser: CurrentUser
  weeklyTheme: WeeklyTheme
  themeHistory: ThemeHistoryItem[]
  rankingPlayers: RankingPlayer[]
  currentQuestion: CurrentQuestion
}

export type SubmitAnswerPayload = {
  userId: string
  questionId: string
  answer: string
}

export type SubmitAnswerResult = {
  answerId: string
  status: 'pending' | 'checking' | 'checked'
  accepted: boolean | null
  points: number
  message?: string
}
