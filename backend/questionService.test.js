import assert from 'node:assert/strict'
import { pickRandomQuestion } from './questionService.js'

const questions = [
  { id: 'q-1', prompt: 'Primeira' },
  { id: 'q-2', prompt: 'Segunda' },
  { id: 'q-3', prompt: 'Terceira' },
]

const chosen = pickRandomQuestion(questions)

assert.ok(questions.some((question) => question.id === chosen.id), 'deve selecionar uma questão existente')
assert.equal(chosen.prompt.length > 0, true, 'deve manter a pergunta com conteúdo')

console.log('questionService ok')
