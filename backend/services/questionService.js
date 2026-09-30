import { normalizeAnswer, normalizeText } from './text.js'

/**
 * `alternativas` é a lista de respostas também aceitas pela questão
 * (variações de escrita, apelidos, etc.). Aceita três formatos:
 *
 *   ['zelda', 'the legend of zelda']              -> ambas corretas
 *   [{ texto: 'zelda', correta: false }]          -> distrator conhecido
 *   [{ texto: 'zelda', correta: true  }]          -> resposta aceita
 *
 * Qualquer outra resposta digitada é considerada errada. A resposta correta
 * principal vive em `correctAnswer` e nunca é enviada ao front-end.
 */
function normalizeAlternativas(raw) {
  if (!Array.isArray(raw)) {
    return []
  }

  return raw
    .map((item) => {
      if (typeof item === 'string') {
        return { texto: item, correta: true, textoNormalizado: normalizeAnswer(item) }
      }

      const texto = String(item?.texto ?? item?.text ?? '')
      if (!texto.trim()) {
        return null
      }

      return {
        texto,
        correta: item?.correta === undefined ? true : Boolean(item.correta),
        textoNormalizado: normalizeAnswer(texto),
      }
    })
    .filter((item) => item && item.textoNormalizado.length > 0)
}

export function normalizeQuestion(rawQuestion, index = 0) {
  const source = rawQuestion ?? {}
  const disciplinaId = String(
    source.disciplinaId ??
      source.disciplineId ??
      source.disciplina ??
      source.categoria ??
      source.category ??
      source.theme ??
      'geral',
  )
  // Sem nome explícito, usa o id: senão todas as questões caem em "Geral" e o
  // rótulo da disciplina exibido no front fica inútil.
  const disciplinaNome = String(
    source.disciplinaNome ?? source.disciplineName ?? source.categoria ?? source.category ?? disciplinaId,
  )
  const correctAnswer = String(
    source.correctAnswer ?? source.respostaCorreta ?? source.correct ?? source.answer ?? '',
  )

  return {
    id: String(source.id ?? source.questionId ?? source.slug ?? `q-${index + 1}`),
    disciplinaId,
    disciplinaNome,
    categoria: disciplinaNome,
    prompt: String(source.prompt ?? source.question ?? source.text ?? 'Pergunta sem texto disponível.'),
    highlightedText: String(source.highlightedText ?? source.highlight ?? source.destaque ?? ''),
    correctAnswer,
    correctAnswerNormalized: normalizeAnswer(correctAnswer),
    alternativas: normalizeAlternativas(source.alternativas ?? source.alternatives ?? source.options),
    pontosBase: Number(source.pontosBase ?? 100),
    selectedForDay: Boolean(source.selectedForDay ?? false),
    selectedOn: source.selectedOn ?? null,
    ativa: source.ativa === undefined ? true : Boolean(source.ativa),
  }
}

/** Compara a resposta do player com a correta e com as alternativas aceitas. */
export function isAnswerCorrect(question, answer) {
  const candidate = normalizeAnswer(answer)

  if (!candidate) {
    return false
  }

  if (question.correctAnswerNormalized && candidate === question.correctAnswerNormalized) {
    return true
  }

  return question.alternativas.some(
    (alternativa) => alternativa.correta && alternativa.textoNormalizado === candidate,
  )
}

/**
 * Remove `correctAnswer` e `alternativas` antes de mandar a questão para o
 * navegador. Os nomes de saída são os do contrato do front
 * (`src/types/quiz.ts`).
 */
export function toPublicQuestion(question, questionNumber, totalQuestions) {
  const total = Math.max(1, totalQuestions || 1)
  const number = Math.min(Math.max(1, questionNumber || 1), total)

  return {
    id: question.id,
    disciplineId: question.disciplinaId,
    disciplineName: question.disciplinaNome,
    prompt: question.prompt,
    highlightedText: question.highlightedText,
    questionNumber: number,
    totalQuestions: total,
    progressPercent: Math.round((number / total) * 100),
  }
}

export function shuffleQuestions(questions) {
  const next = [...questions]
  for (let index = next.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1))
    ;[next[index], next[randomIndex]] = [next[randomIndex], next[index]]
  }
  return next
}

export function pickRandomQuestion(questions, excludedId = null) {
  if (!Array.isArray(questions) || questions.length === 0) {
    return null
  }

  const available = excludedId
    ? questions.filter((question) => normalizeQuestion(question).id !== excludedId)
    : questions

  const pool = available.length > 0 ? available : questions
  return normalizeQuestion(pool[Math.floor(Math.random() * pool.length)])
}

/**
 * Sorteia `count` questões sem repetir a mesma disciplina.
 *
 * 1ª passada: uma questão de cada disciplina (rodízio), até completar o total.
 * 2ª passada: se não houver disciplinas suficientes, preenche com a próxima
 * questão ainda não usada de cada disciplina — assim o sorteio nunca trava
 * quando o banco tem menos de 7 disciplinas.
 */
export function selectDailyQuestions(questions, count = 7) {
  const byDiscipline = new Map()

  for (const [index, raw] of (questions ?? []).entries()) {
    const question = normalizeQuestion(raw, index)

    if (!question.ativa || !question.prompt.trim()) {
      continue
    }

    if (!byDiscipline.has(question.disciplinaId)) {
      byDiscipline.set(question.disciplinaId, { id: question.disciplinaId, nome: question.disciplinaNome, questions: [] })
    }

    byDiscipline.get(question.disciplinaId).questions.push(question)
  }

  const groups = shuffleQuestions([...byDiscipline.values()]).map((group) => ({
    ...group,
    questions: shuffleQuestions(group.questions),
  }))

  const selected = []
  let pass = 0

  while (selected.length < count && groups.some((group) => group.questions.length > pass)) {
    for (const group of groups) {
      if (selected.length >= count) {
        break
      }

      if (group.questions[pass]) {
        selected.push(group.questions[pass])
      }
    }
    pass += 1
  }

  return selected
}

/**
 * Filtra as questões que podem participar do sorteio de hoje, priorizando as
 * que não apareceram nos últimos `cooldownDays` dias. Se o pool fresco for
 * menor que o necessário, completa com as demais para nunca falhar.
 */
export function filterEligibleQuestions(questions, dayKey, cooldownDays = 30) {
  const eligible = (questions ?? []).filter((question) => {
    if (question.ativa === false) {
      return false
    }

    if (!question.selectedOn) {
      return true
    }

    return daysSince(question.selectedOn, dayKey) >= cooldownDays
  })

  return eligible
}

function daysSince(fromDayKey, dayKey) {
  const from = Date.parse(`${fromDayKey}T00:00:00Z`)
  const to = Date.parse(`${dayKey}T00:00:00Z`)

  if (Number.isNaN(from) || Number.isNaN(to)) {
    return Number.POSITIVE_INFINITY
  }

  return Math.round((to - from) / 86_400_000)
}

export { normalizeText }
