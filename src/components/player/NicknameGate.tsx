import { type FormEvent, useState } from 'react'
import { Loader2, UserRound } from 'lucide-react'

import { QuizArenaBrand } from '../ui/QuizArenaBrand'

type NicknameGateProps = {
  onSubmit: (nickname: string) => Promise<void>
  error: string | null
}

/**
 * "Pesquisa Nickname" do fluxograma: o nickname é a identidade do player e é
 * único. Nickname novo cria o player no Firestore; nickname existente recupera
 * o mesmo player para continuar somando pontos.
 */
export function NicknameGate({ onSubmit, error }: NicknameGateProps) {
  const [nickname, setNickname] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const trimmed = nickname.trim()
  const canSubmit = trimmed.length >= 2 && !isSubmitting

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canSubmit) return

    setIsSubmitting(true)
    try {
      await onSubmit(trimmed)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="app-shell">
      <div className="flex min-h-screen items-center justify-center px-6 py-12">
        <form
          onSubmit={handleSubmit}
          className="panel w-full max-w-md p-7"
        >
          <div className="mb-5 flex justify-center">
            <QuizArenaBrand />
          </div>

          <h1 className="text-center text-xl font-extrabold text-white">
            Entre no Quiz Arena
          </h1>
          <p className="mx-auto mt-2 max-w-xs text-center text-[12px] leading-5 text-slate-400">
            Escolha um nickname para competir. Ele é único: se já existir, você
            continua com a pontuação e o ranking que já tinha.
          </p>

          <label
            htmlFor="nickname"
            className="mt-6 block text-[12px] font-semibold text-slate-300"
          >
            Nickname
          </label>
          <div className="answer-wrap mt-2">
            <input
              id="nickname"
              value={nickname}
              onChange={(event) => setNickname(event.target.value)}
              className="w-full bg-transparent text-white outline-none placeholder:text-slate-600"
              placeholder="Ex: Murilo"
              maxLength={24}
              autoComplete="off"
              autoFocus
            />
          </div>

          <button type="submit" disabled={!canSubmit} className="primary-button mt-4 w-full">
            {isSubmitting ? (
              <>
                <Loader2 size={15} className="spinner" /> Entrando...
              </>
            ) : (
              <>
                <UserRound size={15} /> Entrar no quiz
              </>
            )}
          </button>

          {error && <p className="mt-4 text-center text-[12px] text-red-300">{error}</p>}
        </form>
      </div>
    </div>
  )
}
