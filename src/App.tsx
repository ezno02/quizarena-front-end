import { FormEvent, useMemo, useState } from 'react'
import {
  ArrowRight,
  Award,
  CalendarDays,
  Check,
  ChevronDown,
  CircleHelp,
  Clock3,
  Gamepad2,
  History,
  Menu,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Trophy,
  UserRound,
  X,
} from 'lucide-react'

import type { AnswerSubmissionStatus, CurrentQuestion, CurrentUser, QuizArenaData, RankingPlayer, SubmitAnswerPayload, SubmitAnswerResult, ThemeHistoryItem, WeeklyTheme } from './types/quiz'
import { mockQuizData } from './data/mockQuizData'

// -----------------------------------------------------------------------------
// Componentes visuais reutilizáveis
// -----------------------------------------------------------------------------

function QuizArenaBrand() {
  return (
    <div className="flex items-center gap-3" aria-label="Quiz Arena">
      <img className="brand-logo" src="/quiz-arena-logo.png" alt="Quiz! Arena" />
    </div>
  )
}

type SectionHeadingProps = {
  icon: typeof Trophy
  children: string
  actionLabel?: string
}

function SectionHeading({ icon: Icon, children, actionLabel }: SectionHeadingProps) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <div className="flex items-center gap-2.5">
        <Icon size={17} className="text-cyan" strokeWidth={2.2} />
        <h2 className="text-[14px] font-bold tracking-wide text-slate-100">{children}</h2>
      </div>
      {actionLabel && (
        <button className="section-action" type="button">
          {actionLabel}
        </button>
      )}
    </div>
  )
}

// -----------------------------------------------------------------------------
// Coluna esquerda: tema atual e histórico
// -----------------------------------------------------------------------------

type LeftSidebarProps = {
  weeklyTheme: WeeklyTheme
  themeHistory: ThemeHistoryItem[]
}

function LeftSidebar({ weeklyTheme, themeHistory }: LeftSidebarProps) {
  return (
    <aside className="space-y-4">
      <section className="panel p-4">
        <SectionHeading icon={CalendarDays}>Tema da Semana</SectionHeading>

        <div className="topic-card">
          <div className="topic-icon"><Gamepad2 size={23} /></div>
          <div>
            <h3 className="text-[16px] font-extrabold text-white">{weeklyTheme.title}</h3>
            <p className="mt-1.5 text-[12px] leading-5 text-slate-400">{weeklyTheme.description}</p>
          </div>
        </div>

        <button className="secondary-button mt-3 w-full" type="button">
          <RefreshCw size={14} />
          Jogar este tema
        </button>
      </section>

      <section className="panel p-4">
        <SectionHeading icon={History} actionLabel="ver tudo">
          Histórico de Temas
        </SectionHeading>
        <p className="mb-3 -mt-2 text-[11px] text-slate-500">Últimos 30 dias</p>

        <div>
          {themeHistory.map((theme) => (
            <button className="history-row group" key={theme.title} type="button">
              <div className={`history-icon ${theme.tone}`}>
                <Gamepad2 size={15} />
              </div>
              <div className="min-w-0 flex-1 text-left">
                <p className="truncate text-[12px] font-semibold text-slate-200">{theme.title}</p>
                <p className="mt-0.5 text-[11px] text-slate-500">{theme.dateLabel}</p>
              </div>
              <ArrowRight size={13} className="history-arrow" />
            </button>
          ))}
        </div>
      </section>
    </aside>
  )
}

// -----------------------------------------------------------------------------
// Coluna direita: ranking e busca local
// -----------------------------------------------------------------------------

type RankingSidebarProps = {
  rankingPlayers: RankingPlayer[]
  currentUser: CurrentUser
}

function RankingSidebar({ rankingPlayers, currentUser }: RankingSidebarProps) {
  const [searchText, setSearchText] = useState('')

  // Filtra o mock local. Na integração, essa busca pode ser substituída por
  // uma query do Firestore ou por um filtro sobre os dados já carregados.
  const visiblePlayers = useMemo(() => {
    const normalizedSearch = searchText.trim().toLowerCase()
    if (!normalizedSearch) return rankingPlayers

    return rankingPlayers.filter((player) =>
      player.nickname.toLowerCase().includes(normalizedSearch),
    )
  }, [rankingPlayers, searchText])

  function clearPlayerSearch() {
    setSearchText('')
  }

  return (
    <aside className="panel p-4">
      <SectionHeading icon={Trophy}>Ranking</SectionHeading>

      <div className="search-box mb-4">
        <Search size={16} className="shrink-0 text-slate-500" />
        <input
          value={searchText}
          onChange={(event) => setSearchText(event.target.value)}
          placeholder="Pesquisar jogador"
          aria-label="Pesquisar jogador"
        />
        {searchText && (
          <button onClick={clearPlayerSearch} aria-label="Limpar busca" type="button">
            <X size={14} />
          </button>
        )}
      </div>

      <div className="space-y-1">
        {visiblePlayers.map((player) => (
          <div
            className={`rank-row ${player.rank <= 3 ? `top-rank ${player.tone}` : ''}`}
            key={player.id}
          >
            <span className="rank-number">{player.rank}</span>
            <div className="avatar">{player.initials}</div>
            <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-slate-200">
              {player.nickname}
            </span>
            <span className="text-[11px] font-bold tabular-nums text-slate-400">
              {player.score} <em>pts</em>
            </span>
          </div>
        ))}
      </div>

      <div className="my-rank mt-4">
        <span className="text-[12px] font-extrabold text-violet-300">{currentUser.rank}</span>
        <div className="avatar me">{currentUser.initials}</div>
        <span className="flex-1 text-[12px] font-semibold text-white">{currentUser.nickname}</span>
        <span className="text-[11px] font-bold tabular-nums text-cyan">
          {currentUser.score.toLocaleString('pt-BR')} <em>pts</em>
        </span>
      </div>
    </aside>
  )
}

// -----------------------------------------------------------------------------
// Área principal: pergunta e envio da resposta
// -----------------------------------------------------------------------------

type QuestionCardProps = {
  question: CurrentQuestion
  currentUser: CurrentUser
  onSubmitAnswer?: (payload: SubmitAnswerPayload) => Promise<SubmitAnswerResult>
}

function QuestionCard({ question, currentUser, onSubmitAnswer }: QuestionCardProps) {
  const [answerText, setAnswerText] = useState('')
  const [submissionStatus, setSubmissionStatus] = useState<AnswerSubmissionStatus>('idle')

  const canSubmitAnswer = answerText.trim().length >= 2 && submissionStatus === 'idle'

  async function handleAnswerSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canSubmitAnswer) return

    setSubmissionStatus('sending')

    // Quando o backend fornecer onSubmitAnswer, o front envia este payload
    // diretamente para a implementação Firebase/Firestore.
    if (onSubmitAnswer) {
      try {
        await onSubmitAnswer({
          userId: currentUser.id,
          questionId: question.id,
          answer: answerText.trim(),
        })
        setSubmissionStatus('checked')
      } catch {
        // Mantém o formulário editável se a gravação no Firebase falhar.
        setSubmissionStatus('idle')
      }
      return
    }

    // Fallback visual enquanto o projeto ainda estiver usando os mocks.
    window.setTimeout(() => setSubmissionStatus('checked'), 800)
  }

  function handleNewQuestion() {
    setAnswerText('')
    setSubmissionStatus('idle')
  }

  return (
    <section className="question-shell">
      <div className="question-topline">
        <div className="flex items-center gap-2">
          <span className="live-dot" />
          <span className="text-[12px] font-semibold text-slate-300">Sua vez</span>
        </div>
        <div className="flex items-center gap-3 text-[12px] font-medium text-slate-500">
          <Clock3 size={14} />
          Tempo livre
          <span className="text-slate-300">•</span>
          {question.progressPercent}%
        </div>
      </div>

      <div className="progress-track">
        <div className="progress-value" style={{ width: `${question.progressPercent}%` }} />
      </div>

      <div className="question-body">
        <div className="question-tag"><Gamepad2 size={15} /> {question.category}</div>
        <p className="mt-6 text-center text-[12px] font-semibold uppercase tracking-[0.22em] text-slate-500">
          Pergunta {question.questionNumber} de {question.totalQuestions}
        </p>
        <h1 className="question-title">
          {question.prompt} <span>{question.highlightedText}</span>?
        </h1>
        <p className="question-helper">
          <CircleHelp size={15} />
          Digite o nome do jogo exatamente como você lembra.
        </p>

        <form onSubmit={handleAnswerSubmit} className="mt-8">
          <label htmlFor="answer" className="sr-only">Sua resposta</label>
          <div className={`answer-wrap ${submissionStatus === 'checked' ? 'success' : ''}`}>
            <textarea
              id="answer"
              value={answerText}
              onChange={(event) => setAnswerText(event.target.value)}
              disabled={submissionStatus !== 'idle'}
              maxLength={120}
              placeholder="Escreva sua resposta aqui..."
              rows={3}
            />
            <span className="answer-count">{answerText.length}/120</span>
          </div>

          <div className="mt-3 flex items-center justify-between gap-3">
            <p className={`text-[11px] ${submissionStatus === 'checked' ? 'text-emerald-300' : 'text-slate-500'}`}>
              {submissionStatus === 'checked' ? (
                <><Check size={13} className="mr-1 inline" /> Resposta registrada e enviada para checagem.</>
              ) : 'Uma resposta por pergunta.'}
            </p>

            {submissionStatus === 'checked' ? (
              <button type="button" onClick={handleNewQuestion} className="secondary-button shrink-0">
                <RefreshCw size={14} />
                Outra pergunta
              </button>
            ) : (
              <button type="submit" disabled={!canSubmitAnswer} className="primary-button shrink-0">
                {submissionStatus === 'sending' ? (
                  <><span className="spinner" /> Checando...</>
                ) : (
                  <>Enviar resposta <ArrowRight size={16} /></>
                )}
              </button>
            )}
          </div>
        </form>
      </div>

      <div className="question-footer">
        <ShieldCheck size={15} />
        Suas respostas ficam privadas até o resultado da rodada.
      </div>
    </section>
  )
}

// -----------------------------------------------------------------------------
// Shell da página
// -----------------------------------------------------------------------------

type AppProps = {
  quizData?: QuizArenaData
  onSubmitAnswer?: (payload: SubmitAnswerPayload) => Promise<SubmitAnswerResult>
}

export default function App({ quizData = mockQuizData, onSubmitAnswer }: AppProps) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  function toggleMobileMenu() {
    setIsMobileMenuOpen((isOpen) => !isOpen)
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <QuizArenaBrand />

        <button
          className="mobile-menu-button"
          onClick={toggleMobileMenu}
          aria-label="Abrir menu"
          type="button"
        >
          {isMobileMenuOpen ? <X size={19} /> : <Menu size={19} />}
        </button>

        <div className={`header-actions ${isMobileMenuOpen ? 'open' : ''}`}>
          <div className="header-user">
            <div className="header-avatar"><UserRound size={17} /></div>
            <div>
              <span>Jogando como</span>
              <strong>@{quizData.currentUser.nickname}</strong>
            </div>
            <ChevronDown size={14} className="ml-2 text-slate-500" />
          </div>

          <div className="header-topic">
            <div className="header-topic-icon"><Sparkles size={16} /></div>
            <div>
              <span>Tema da semana</span>
              <strong>{quizData.weeklyTheme.title}</strong>
            </div>
          </div>
        </div>
      </header>

      <main className="dashboard-grid">
        <LeftSidebar weeklyTheme={quizData.weeklyTheme} themeHistory={quizData.themeHistory} />
        <QuestionCard question={quizData.currentQuestion} currentUser={quizData.currentUser} onSubmitAnswer={onSubmitAnswer} />
        <RankingSidebar rankingPlayers={quizData.rankingPlayers} currentUser={quizData.currentUser} />
      </main>

      <footer className="app-footer">
        <span>Quiz Arena</span>
        <span>Feito para quem gosta de saber um pouco mais.</span>
        <span className="flex items-center gap-1"><Award size={13} /> Rodada semanal</span>
      </footer>
    </div>
  )
}
