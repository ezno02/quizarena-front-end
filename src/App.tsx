import { useCallback, useEffect, useRef, useState } from 'react'
import { Award, RefreshCw } from 'lucide-react'

import { AppHeader } from './components/layout/AppHeader'
import { RankingSidebar, type SearchState } from './components/layout/RankingSidebar'
import { NicknameGate } from './components/player/NicknameGate'
import { QuestionCard } from './components/question/QuestionCard'
import { QuizSummary } from './components/question/QuizSummary'
import {
  ApiError,
  clearSession,
  hasSession,
  loadQuizState,
  login,
  searchRanking,
  submitAnswer,
} from './services/quizApi'
import type {
  AnswerSubmissionStatus,
  PlayerProfile,
  QuizState,
  RankingPlayer,
  SubmitAnswerResult,
} from './types/quiz'

type View = 'nickname' | 'quiz' | 'summary'

const SEARCH_DEBOUNCE_MS = 300

function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message
  }
  if (error instanceof Error) {
    return error.message
  }
  return 'Ocorreu um erro inesperado. Tente novamente.'
}

function isAuthError(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 401 || error.status === 403)
}

/** Índice da primeira questão ainda não respondida, ou -1 se a rodada acabou. */
function firstUnansweredIndex(state: QuizState): number {
  const answered = new Set(state.answeredQuestionIds)
  const index = state.questions.findIndex((question) => !answered.has(question.id))
  return index
}

export default function App() {
  const [view, setView] = useState<View>('nickname')
  const [quizState, setQuizState] = useState<QuizState | null>(null)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [status, setStatus] = useState<AnswerSubmissionStatus>('idle')
  const [feedback, setFeedback] = useState<SubmitAnswerResult | null>(null)
  const [answerError, setAnswerError] = useState<string | null>(null)

  const [searchTerm, setSearchTerm] = useState('')
  const [searchState, setSearchState] = useState<SearchState>('idle')
  const [searchResults, setSearchResults] = useState<RankingPlayer[] | null>(null)
  const [searchedNickname, setSearchedNickname] = useState('')
  const [foundPlayer, setFoundPlayer] = useState(false)

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [isReloading, setIsReloading] = useState(false)

  // Momento em que a questão atual apareceu, para medir `tempo_de_resposta`.
  const questionShownAt = useRef(Date.now())

  const applyQuizState = useCallback((data: QuizState) => {
    const nextIndex = firstUnansweredIndex(data)

    setQuizState(data)
    questionShownAt.current = Date.now()

    if (nextIndex === -1) {
      setCurrentIndex(Math.max(0, data.questions.length - 1))
      setView('summary')
    } else {
      setCurrentIndex(nextIndex)
      setView('quiz')
    }
  }, [])

  const loadState = useCallback(async () => {
    const data = await loadQuizState()
    applyQuizState(data)
    return data
  }, [applyQuizState])

  // Bootstrap: com sessão salva vai direto para a rodada; sem ela, pede nickname.
  useEffect(() => {
    let cancelled = false

    async function bootstrap() {
      if (!hasSession()) {
        if (!cancelled) {
          setView('nickname')
          setIsLoading(false)
        }
        return
      }

      try {
        const data = await loadQuizState()
        if (cancelled) return
        applyQuizState(data)
      } catch (err) {
        if (cancelled) return

        if (isAuthError(err)) {
          clearSession()
          setView('nickname')
        } else {
          setError(describeError(err))
          setView('quiz')
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    void bootstrap()

    return () => {
      cancelled = true
    }
  }, [applyQuizState])

  // "Pesquisa Nickname" com debounce: o ranking é global, então a busca vai ao
  // backend em vez de filtrar só o top N que veio na tela.
  useEffect(() => {
    const term = searchTerm.trim()

    if (!term) {
      setSearchState('idle')
      setSearchResults(null)
      setFoundPlayer(false)
      return
    }

    let cancelled = false
    setSearchState('loading')

    const timer = setTimeout(async () => {
      try {
        const result = await searchRanking(term)
        if (cancelled) return
        setSearchResults(result.players)
        setFoundPlayer(Boolean(result.found))
        setSearchedNickname(term)
        setSearchState('done')
      } catch {
        if (cancelled) return
        setSearchResults([])
        setFoundPlayer(false)
        setSearchedNickname(term)
        setSearchState('done')
      }
    }, SEARCH_DEBOUNCE_MS)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [searchTerm])

  async function handleNicknameSubmit(nickname: string) {
    setError(null)
    setIsLoading(true)

    try {
      const { player } = await login(nickname)

      try {
        localStorage.setItem('quiz-arena-nickname', player.nickname)
      } catch {
        // Sem persistência o nickname continua válido na aba atual.
      }

      await loadState()
    } catch (err) {
      setError(describeError(err))
    } finally {
      setIsLoading(false)
    }
  }

  /**
   * Reflete a resposta no estado local assim que o backend confirma.
   *
   * Sem isso `answeredQuestionIds` continuaria vazio até o próximo refetch e o
   * botão "Próxima questão" voltaria para a pergunta 1 — o loop infinito que a
   * tela apresentava antes.
   */
  function applyAnswerResult(
    questionId: string,
    answer: string,
    responseTimeMs: number,
    result: SubmitAnswerResult,
  ) {
    setQuizState((current) => {
      if (!current) return current

      const answeredQuestionIds = current.answeredQuestionIds.includes(questionId)
        ? current.answeredQuestionIds
        : [...current.answeredQuestionIds, questionId]

      return {
        ...current,
        answeredQuestionIds,
        answerDetail: {
          ...current.answerDetail,
          [questionId]: {
            correta: result.correct,
            resposta: answer,
            tempoDeRespostaMs: responseTimeMs,
            pontosPrevistos: result.pointsEarned,
          },
        },
        player: {
          ...current.player,
          pendingScore: current.player.pendingScore + result.pointsEarned,
          pointsToday: current.player.pointsToday + result.pointsEarned,
        },
      }
    })
  }

  async function handleAnswerSubmit(answer: string) {
    if (!quizState) return

    const question = quizState.questions[currentIndex]
    if (!question) return

    const responseTimeMs = Date.now() - questionShownAt.current

    setStatus('sending')
    setAnswerError(null)

    try {
      const result = await submitAnswer({
        questionId: question.id,
        answer,
        responseTimeMs,
      })

      applyAnswerResult(question.id, answer, responseTimeMs, result)
      setFeedback(result)
      setStatus('checked')
    } catch (err) {
      setStatus('idle')
      setAnswerError(describeError(err))
    }
  }

  async function handleNext() {
    if (!quizState) return

    const answered = new Set(quizState.answeredQuestionIds)
    const current = quizState.questions[currentIndex]
    if (current) {
      answered.add(current.id)
    }

    setFeedback(null)
    setAnswerError(null)
    setStatus('idle')

    if (answered.size >= quizState.questions.length) {
      // Fim da rodada: recarrega para trazer pontuação e ranking atualizados.
      try {
        await loadState()
      } catch (err) {
        setError(describeError(err))
      }
      setView('summary')
      return
    }

    const next = quizState.questions.findIndex((question) => !answered.has(question.id))

    if (next === -1) {
      try {
        await loadState()
      } catch (err) {
        setError(describeError(err))
      }
      setView('summary')
      return
    }

    setCurrentIndex(next)
    questionShownAt.current = Date.now()
  }

  async function handleReload() {
    setIsReloading(true)
    setError(null)
    setFeedback(null)
    setAnswerError(null)
    setStatus('idle')

    try {
      await loadState()
    } catch (err) {
      if (isAuthError(err)) {
        clearSession()
        setQuizState(null)
        setView('nickname')
      } else {
        setError(describeError(err))
      }
    } finally {
      setIsReloading(false)
    }
  }

  function handleChangeNickname() {
    clearSession()
    setQuizState(null)
    setFeedback(null)
    setAnswerError(null)
    setStatus('idle')
    setSearchTerm('')
    setError(null)
    setView('nickname')
  }

  const answeredCount = quizState?.answeredQuestionIds.length ?? 0
  const correctCount = quizState
    ? quizState.answeredQuestionIds.filter((id) => quizState.answerDetail[id]?.correta).length
    : 0

  if (isLoading) {
    return (
      <div className="app-shell">
        <div className="flex min-h-[60vh] items-center justify-center text-sm text-slate-300">
          Carregando a rodada de hoje...
        </div>
      </div>
    )
  }

  if (view === 'nickname' || !quizState) {
    if (view !== 'nickname' && error) {
      return (
        <div className="app-shell">
          <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
            <p className="max-w-md text-sm text-red-300">{error}</p>
            <div className="flex gap-2">
              <button type="button" onClick={handleReload} className="primary-button">
                <RefreshCw size={14} /> Tentar de novo
              </button>
              <button type="button" onClick={handleChangeNickname} className="secondary-button">
                Trocar nickname
              </button>
            </div>
          </div>
        </div>
      )
    }

    return <NicknameGate onSubmit={handleNicknameSubmit} error={error} />
  }

  const player: PlayerProfile = quizState.player
  const currentQuestion = quizState.questions[currentIndex]

  return (
    <div className="app-shell">
      <AppHeader
        nickname={player.nickname}
        isMobileMenuOpen={isMobileMenuOpen}
        onToggleMenu={() => setIsMobileMenuOpen((open) => !open)}
        onChangePlayer={handleChangeNickname}
        onReload={handleReload}
        isReloading={isReloading}
      />

      <main className="dashboard-grid">
        {view === 'summary' || !currentQuestion ? (
          <QuizSummary
            round={quizState.round}
            player={player}
            answeredCount={answeredCount}
            correctCount={correctCount}
            rankingTotal={quizState.rankingTotal}
            onRestart={handleReload}
          />
        ) : (
          <QuestionCard
            key={currentQuestion.id}
            question={currentQuestion}
            roundLabel={quizState.round.label}
            answeredCount={answeredCount}
            status={status}
            feedback={feedback}
            error={answerError}
            onSubmit={handleAnswerSubmit}
            onNext={handleNext}
          />
        )}

        <RankingSidebar
          rankingPlayers={quizState.ranking}
          currentUser={player}
          searchTerm={searchTerm}
          onSearchTermChange={setSearchTerm}
          searchState={searchState}
          searchResults={searchResults}
          searchedNickname={searchedNickname}
          foundPlayer={foundPlayer}
        />
      </main>

      <footer className="app-footer">
        <span>Quiz Arena</span>
        <span>{quizState.round.questionCount} questões por dia, sorteadas sem repetir disciplina.</span>
        <span className="flex items-center gap-1">
          <Award size={13} /> Ranking consolidado à meia-noite
        </span>
      </footer>
    </div>
  )
}
