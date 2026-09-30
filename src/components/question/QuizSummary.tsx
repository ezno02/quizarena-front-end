import { CalendarClock, CheckCircle2, CircleX, Hash, RefreshCw, Trophy } from 'lucide-react'

import type { PlayerProfile, RoundSummary } from '../../types/quiz'

type QuizSummaryProps = {
  round: RoundSummary
  player: PlayerProfile
  answeredCount: number
  correctCount: number
  rankingTotal: number
  onRestart: () => void
}

/** Fim da rodada: a 7ª resposta encerra o quiz (não existe loop infinito). */
export function QuizSummary({
  round,
  player,
  answeredCount,
  correctCount,
  rankingTotal,
  onRestart,
}: QuizSummaryProps) {
  const accuracy = answeredCount > 0 ? Math.round((correctCount / answeredCount) * 100) : 0
  const isRanked = player.rank != null

  return (
    <section className="question-shell">
      <div className="question-topline">
        <div className="flex items-center gap-2">
          <span className="live-dot" />
          <span className="text-[12px] font-semibold text-slate-300">Rodada de {round.label} encerrada</span>
        </div>
        <div className="flex items-center gap-2 text-[12px] font-medium text-slate-500">
          <CalendarClock size={14} />
          Fecha à meia-noite
        </div>
      </div>

      <div className="progress-track">
        <div className="progress-value" style={{ width: '100%' }} />
      </div>

      <div className="question-body">
        <div className="question-tag">
          <Trophy size={15} /> Resumo do dia
        </div>

        <h1 className="question-title">
          {answeredCount === round.questionCount
            ? 'Você concluiu a rodada de hoje.'
            : `Você respondeu ${answeredCount} de ${round.questionCount} questões.`}
        </h1>

        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="panel p-4 text-center">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">Acertos</p>
            <p className="mt-1 text-2xl font-extrabold text-emerald-300">{correctCount}</p>
          </div>
          <div className="panel p-4 text-center">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">Precisão</p>
            <p className="mt-1 text-2xl font-extrabold text-cyan">{accuracy}%</p>
          </div>
          <div className="panel p-4 text-center">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">Pontos hoje</p>
            <p className="mt-1 text-2xl font-extrabold text-violet-300">
              {player.pointsToday.toLocaleString('pt-BR')}
            </p>
          </div>
          <div className="panel p-4 text-center">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">Posição</p>
            <p className="mt-1 text-2xl font-extrabold text-white">
              {isRanked ? `${player.rank}º` : '—'}
            </p>
          </div>
        </div>

        <div className="mt-5 space-y-2 text-[12px] leading-5 text-slate-400">
          <p className="flex items-start gap-2">
            <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-cyan" />
            As {round.questionCount} questões de hoje saíram de {round.disciplineNames.length} disciplinas
            diferentes, sorteadas pelo Script Diário.
          </p>
          <p className="flex items-start gap-2">
            <Hash size={14} className="mt-0.5 shrink-0 text-cyan" />
            Pontuação total: <strong className="text-slate-200">{player.score.toLocaleString('pt-BR')} pts</strong>
            {rankingTotal > 0 && <> entre {rankingTotal} players</>}.
          </p>
          <p className="flex items-start gap-2">
            <CircleX size={14} className="mt-0.5 shrink-0 text-cyan" />
            Os pontos de hoje são provisórios: à meia-noite o Script Diário
            calcula o peso final de cada questão pela raridade das respostas,
            consolida o ranking e sorteia a rodada de amanhã.
          </p>
        </div>

        <button type="button" onClick={onRestart} className="secondary-button mt-7 w-full">
          <RefreshCw size={14} />
          Revisar o resultado da rodada
        </button>
      </div>
    </section>
  )
}
