import { type FormEvent, useEffect, useState } from 'react'
import {
  ArrowRight,
  Check,
  CircleHelp,
  CircleX,
  Clock3,
  Gamepad2,
  ShieldCheck,
  Trophy,
} from 'lucide-react'

import type {
  AnswerSubmissionStatus,
  QuizQuestion,
  SubmitAnswerResult,
} from '../../types/quiz'

type QuestionCardProps = {
  question: QuizQuestion
  roundLabel: string
  answeredCount: number
  status: AnswerSubmissionStatus
  feedback: SubmitAnswerResult | null
  error: string | null
  onSubmit: (answer: string) => Promise<void>
  onNext: () => void
}

/** Destaca a entidade citada na pergunta, quando o backend informou o trecho. */
function renderPrompt(prompt: string, highlightedText: string) {
  if (!highlightedText) {
    return prompt
  }

  const index = prompt.indexOf(highlightedText)

  if (index === -1) {
    return prompt
  }

  return (
    <>
      {prompt.slice(0, index)}
      <span>{highlightedText}</span>
      {prompt.slice(index + highlightedText.length)}
    </>
  )
}

export function QuestionCard({
  question,
  roundLabel,
  answeredCount,
  status,
  feedback,
  error,
  onSubmit,
  onNext,
}: QuestionCardProps) {
  const [answerText, setAnswerText] = useState('')

  // Trocar de questão precisa zerar o formulário e o feedback da anterior.
  useEffect(() => {
    setAnswerText('')
  }, [question.id])

  const isChecked = status === 'checked' && feedback !== null
  const canSubmit = answerText.trim().length >= 1 && status === 'idle'
  const isLastQuestion = question.questionNumber >= question.totalQuestions

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canSubmit) return
    await onSubmit(answerText.trim())
  }

  return (
    <section className="question-shell">
      <div className="question-topline">
        <div className="flex items-center gap-2">
          <span className="live-dot" />
          <span className="text-[12px] font-semibold text-slate-300">Rodada de {roundLabel}</span>
        </div>
        <div className="flex items-center gap-2 text-[12px] font-medium text-slate-500">
          <Clock3 size={14} />
          {answeredCount} de {question.totalQuestions} respondidas
        </div>
      </div>

      <div className="progress-track">
        <div
          className="progress-value"
          style={{
            width: `${Math.round((answeredCount / Math.max(1, question.totalQuestions)) * 100)}%`,
          }}
        />
      </div>

      <div className="question-body">
        <div className="question-tag">
          <Gamepad2 size={15} /> {question.disciplineName}
        </div>
        <p className="mt-6 text-center text-[12px] font-semibold uppercase tracking-[0.22em] text-slate-500">
          Pergunta {question.questionNumber} de {question.totalQuestions}
        </p>
        <h1 className="question-title">{renderPrompt(question.prompt, question.highlightedText)}</h1>
        <p className="question-helper">
          <CircleHelp size={15} />
          Uma resposta por pergunta. O peso dos pontos depende de quantos
          players acertaram cada questão.
        </p>

        {isChecked && feedback ? (
          <div className="mt-8">
            <div
              className={`flex items-start gap-3 rounded-2xl border p-4 ${
                feedback.correct
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
                  : 'border-amber-500/40 bg-amber-500/10 text-amber-200'
              }`}
            >
              {feedback.correct ? <Check size={18} className="mt-0.5 shrink-0" /> : <CircleX size={18} className="mt-0.5 shrink-0" />}
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-bold">
                  {feedback.correct ? 'Resposta correta!' : 'Não foi dessa vez.'}
                </p>
                <p className="mt-1 text-[12px] leading-5 opacity-90">{feedback.message}</p>
                {feedback.correct && (
                  <p className="mt-1 text-[11px] opacity-70">
                    Peso atual {feedback.weight}x — o valor definitivo é fechado
                    pelo Script Diário à meia-noite.
                  </p>
                )}
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between gap-3">
              <p className="text-[11px] text-slate-500">
                {feedback.answeredCount} de {feedback.totalQuestions} concluídas
              </p>
              <button type="button" onClick={onNext} className="primary-button shrink-0">
                {isLastQuestion ? (
                  <>
                    Ver resultado <Trophy size={15} />
                  </>
                ) : (
                  <>
                    Próxima questão <ArrowRight size={16} />
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-8">
            <label htmlFor="answer" className="sr-only">Sua resposta</label>
            <div className="answer-wrap">
              <textarea
                id="answer"
                value={answerText}
                onChange={(event) => setAnswerText(event.target.value)}
                disabled={status !== 'idle'}
                maxLength={120}
                placeholder="Escreva sua resposta aqui..."
                rows={3}
              />
              <span className="answer-count">{answerText.length}/120</span>
            </div>

            {error && <p className="mt-3 text-[12px] text-red-300">{error}</p>}

            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="text-[11px] text-slate-500">
                {status === 'sending' ? 'Enviando para o backend...' : 'A resposta é registrada no Firestore.'}
              </p>
              <button type="submit" disabled={!canSubmit} className="primary-button shrink-0">
                {status === 'sending' ? (
                  <>
                    <span className="spinner" /> Enviando...
                  </>
                ) : (
                  <>
                    Enviar resposta <ArrowRight size={16} />
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>

      <div className="question-footer">
        <ShieldCheck size={15} />
        Suas respostas ficam privadas até o resultado da rodada.
      </div>
    </section>
  )
}
