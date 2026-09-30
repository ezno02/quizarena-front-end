export function normalizeQuestion(rawQuestion, index = 0) {
  const source = rawQuestion ?? {}
  const id = String(source.id ?? source.questionId ?? source.slug ?? `q-${index + 1}`)

  return {
    id,
    category: String(source.category ?? source.theme ?? 'Geral'),
    prompt: String(
      source.prompt ?? source.question ?? source.text ?? 'Pergunta sem texto disponível.'
    ),
    highlightedText: String(
      source.highlightedText ?? source.highlight ?? source.answerHint ?? source.destaque ?? ''
    ),
    correctAnswer: String(
      source.correctAnswer ?? source.answer ?? source.correct ?? source.respostaCorreta ?? ''
    ),
    selectedForDay: Boolean(source.selectedForDay ?? source.selected_for_day ?? source.isSelectedForDay ?? false),
  }
}

export function pickRandomQuestion(questions, excludedId = null) {
  if (!Array.isArray(questions) || questions.length === 0) {
    return null
  }

  const availableQuestions = excludedId
    ? questions.filter((question) => normalizeQuestion(question).id !== excludedId)
    : questions

  const safeQuestions = availableQuestions.length > 0 ? availableQuestions : questions
  const randomIndex = Math.floor(Math.random() * safeQuestions.length)
  return normalizeQuestion(safeQuestions[randomIndex], randomIndex)
}

export function shuffleQuestions(questions) {
  const next = [...questions]
  for (let index = next.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1))
    ;[next[index], next[randomIndex]] = [next[randomIndex], next[index]]
  }
  return next
}

export function pickDailyQuestionSet(questions, limit = 7) {
  if (!Array.isArray(questions) || questions.length === 0) {
    return []
  }

  const normalized = questions.map((question, index) => normalizeQuestion(question, index))
  const selected = normalized.filter((question) => question.selectedForDay)
  const remaining = normalized.filter((question) => !question.selectedForDay)

  const base = shuffleQuestions(selected.length >= limit ? selected : [...selected, ...remaining])
  return base.slice(0, Math.min(limit, base.length)).map((question, index) => ({
    ...question,
    questionNumber: index + 1,
    totalQuestions: Math.min(limit, base.length),
    progressPercent: Math.round(((index + 1) / Math.max(1, Math.min(limit, base.length))) * 100),
  }))
}
