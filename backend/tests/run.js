/**
 * Testes da lógica pura do backend (roda sem Firebase).
 *   node tests/run.js
 */
import assert from 'node:assert/strict'

import { buildNicknameKey, getInitials, normalizeAnswer, normalizeText } from '../services/text.js'
import {
  filterEligibleQuestions,
  isAnswerCorrect,
  normalizeQuestion,
  pickRandomQuestion,
  selectDailyQuestions,
  toPublicQuestion,
} from '../services/questionService.js'
import {
  aggregateRespostas,
  atribuirRanks,
  calcularPesoDinamico,
  montarPlacar,
  ordenarRanking,
} from '../services/scoring.js'
import { formatRoundLabel, getDayKey, shiftDayKey } from '../services/time.js'
import { createPlayerToken, verifyPlayerToken } from '../services/session.js'

const tests = []
function test(name, fn) {
  tests.push({ name, fn })
}

// ------------------------------------------------------------------- text
test('normalizeText remove acento, pontuação e colapsa espaços', () => {
  assert.equal(normalizeText('  AÇÃO   &  reacting! '), 'acao reacting')
  assert.equal(normalizeText('Ç'), 'c')
  assert.equal(normalizeText(null), '')
})

test('normalizeAnswer descarta artigo inicial', () => {
  assert.equal(normalizeAnswer('The Legend of Zelda'), 'legend of zelda')
  assert.equal(normalizeAnswer('aocs'), 'aocs', 'não remove artigo quando vira a palavra inteira')
  assert.equal(normalizeAnswer('  O   Portal '), 'portal')
  assert.equal(normalizeAnswer('Édition — Spécial!'), 'edition special')
})

test('buildNicknameKey gera chave única e segura para id do Firestore', () => {
  assert.equal(buildNicknameKey('Murilo'), 'murilo')
  assert.equal(buildNicknameKey('  murilo  '), 'murilo')
  assert.equal(buildNicknameKey('Dark Zin'), 'dark-zin')
  assert.equal(buildNicknameKey('Dark/Zin'), 'dark-zin', 'remove "/" que é inválido em id')
  assert.equal(buildNicknameKey('!!!'), '', 'nickname só com símbolo é inválido')
  assert.equal(buildNicknameKey('a'), 'a')
  assert.equal(buildNicknameKey('A'.repeat(200)).length, 60)
})

test('getInitials usa até 2 letras', () => {
  assert.equal(getInitials('murilo'), 'M')
  assert.equal(getInitials('dark zin'), 'DZ')
  assert.equal(getInitials(''), 'J')
})

// -------------------------------------------------------- questionService
test('normalizeQuestion aceita os aliases da base existente', () => {
  const a = normalizeQuestion({ questionId: 'q1', question: 'Quem?', respostaCorreta: 'X', theme: 'games' })
  assert.equal(a.id, 'q1')
  assert.equal(a.prompt, 'Quem?')
  assert.equal(a.correctAnswer, 'X')
  assert.equal(a.disciplinaId, 'games')

  const b = normalizeQuestion({ slug: 'q2', text: 'Onde?', answer: 'Y', categoria: 'Ciência' })
  assert.equal(b.id, 'q2')
  assert.equal(b.prompt, 'Onde?')
  assert.equal(b.correctAnswer, 'Y')
  assert.equal(b.disciplinaNome, 'Ciência')
})

test('isAnswerCorrect aceita correta, alternativa e rejeita distrator', () => {
  const q = normalizeQuestion({
    id: 'q1',
    prompt: 'p',
    correctAnswer: 'Ocarina of Time',
    alternativas: ['Zelda', { texto: 'N64', correta: false }],
  })

  assert.equal(isAnswerCorrect(q, 'ocarina of time'), true, 'case-insensitive')
  assert.equal(isAnswerCorrect(q, '  Ocarina   of Time! '), true, 'ignora pontuação e espaços')
  assert.equal(isAnswerCorrect(q, 'Zelda'), true, 'alternativa em string é aceita')
  assert.equal(isAnswerCorrect(q, 'n64'), false, 'alternativa marcada como distrator')
  assert.equal(isAnswerCorrect(q, 'mario'), false)
  assert.equal(isAnswerCorrect(q, '   '), false, 'resposta vazia nunca pontua')
  assert.equal(isAnswerCorrect(q, 'ocarina'), false, 'resposta parcial não pontua')
})

test('toPublicQuestion não expõe a resposta correta', () => {
  const q = normalizeQuestion({ id: 'q1', prompt: 'p', correctAnswer: 'segredo', alternativa: ['x'] })
  const publicQuestion = toPublicQuestion(q, 3, 7)

  assert.deepEqual(Object.keys(publicQuestion).sort(), [
    'disciplineId', 'disciplineName', 'highlightedText', 'id',
    'progressPercent', 'prompt', 'questionNumber', 'totalQuestions',
  ])
  assert.equal(JSON.stringify(publicQuestion).includes('segredo'), false)
  assert.equal(publicQuestion.questionNumber, 3)
  assert.equal(publicQuestion.progressPercent, 43)
})

test('selectDailyQuestions sorteia 7 sem repetir disciplina', () => {
  const base = []
  for (const d of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i']) {
    for (let i = 0; i < 3; i += 1) {
      base.push({ id: `${d}${i}`, disciplinaId: d, prompt: `p${d}${i}` })
    }
  }

  const selected = selectDailyQuestions(base, 7)
  assert.equal(selected.length, 7)
  assert.equal(new Set(selected.map((q) => q.disciplinaId)).size, 7, 'nenhuma disciplina repetida')
})

test('selectDailyQuestions completa o total quando faltam disciplinas', () => {
  const base = [
    { id: 'a1', disciplinaId: 'a', prompt: 'p' },
    { id: 'a2', disciplinaId: 'a', prompt: 'p' },
    { id: 'a3', disciplinaId: 'a', prompt: 'p' },
    { id: 'b1', disciplinaId: 'b', prompt: 'p' },
  ]

  const selected = selectDailyQuestions(base, 7)
  assert.equal(selected.length, 4, 'devolve o que existe, sem travar o sorteio')
  assert.equal(new Set(selected.map((q) => q.id)).size, 4, 'não repete a mesma questão')
})

test('selectDailyQuestions ignora questão inativa ou sem pergunta', () => {
  const selected = selectDailyQuestions([
    { id: 'a1', disciplinaId: 'a', prompt: 'p' },
    { id: 'b1', disciplinaId: 'b', prompt: 'p', ativa: false },
    { id: 'c1', disciplinaId: 'c', prompt: '   ' },
  ], 7)

  assert.deepEqual(selected.map((q) => q.id), ['a1'])
})

test('filterEligibleQuestions respeita a janela de cooldown', () => {
  const pool = [
    { id: 'nova', prompt: 'p' },
    { id: 'ontem', prompt: 'p', selectedOn: '2026-09-28' },
    { id: 'velha', prompt: 'p', selectedOn: '2026-08-01' },
    { id: 'off', prompt: 'p', ativa: false },
  ]

  assert.deepEqual(
    filterEligibleQuestions(pool, '2026-09-29', 30).map((q) => q.id),
    ['nova', 'velha'],
  )
})

test('pickRandomQuestion devolve uma questão da lista', () => {
  const questions = [{ id: 'q-1', prompt: 'Primeira' }, { id: 'q-2', prompt: 'Segunda' }]
  const chosen = pickRandomQuestion(questions)

  assert.ok(questions.some((q) => q.id === chosen.id))
  assert.ok(chosen.prompt.length > 0)
  assert.equal(pickRandomQuestion([]), null)
})

// ---------------------------------------------------------------- scoring
test('calcularPesoDinamico vale mais quanto mais rara é a resposta', () => {
  const todoAcertou = calcularPesoDinamico({ acertos: 20, total: 20, pontosBase: 100 })
  const metade = calcularPesoDinamico({ acertos: 10, total: 20, pontosBase: 100 })
  const ninguem = calcularPesoDinamico({ acertos: 0, total: 20, pontosBase: 100 })

  assert.equal(todoAcertou.raridade, 0)
  assert.equal(todoAcertou.peso, 0.5)
  assert.equal(todoAcertou.pontos, 50)

  assert.equal(metade.raridade, 0.5)
  assert.equal(metade.peso, 1.25)
  assert.equal(metade.pontos, 125)

  assert.equal(ninguem.raridade, 1)
  assert.equal(ninguem.peso, 2)
  assert.equal(ninguem.pontos, 200)

  assert.ok(ninguem.pontos > metade.pontos && metade.pontos > todoAcertou.pontos)
})

test('calcularPesoDinamico usa peso máximo quando ninguém respondeu', () => {
  const vazio = calcularPesoDinamico({ acertos: 0, total: 0, pontosBase: 100 })
  assert.equal(vazio.peso, 2)
  assert.equal(vazio.pontos, 200)
})

test('aggregateRespostas conta acertos e agrupa respostas parecidas', () => {
  const stats = aggregateRespostas({
    murilo: { playerId: 'murilo', nickname: 'Murilo', correta: true, respostaNormalizada: 'zelda', tempoDeRespostaMs: 100 },
    ana: { playerId: 'ana', nickname: 'Ana', correta: false, respostaNormalizada: 'zelda', tempoDeRespostaMs: 200 },
    bob: { playerId: 'bob', nickname: 'Bob', correta: false, respostaNormalizada: 'mario', tempoDeRespostaMs: 300 },
  })

  assert.equal(stats.total, 3)
  assert.equal(stats.acertos, 1)
  assert.equal(stats.distribuicao[0].resposta, 'zelda')
  assert.equal(stats.distribuicao[0].contagem, 2)
  assert.deepEqual(stats.acertosJogadores, [{ playerId: 'murilo', nickname: 'Murilo', tempoDeRespostaMs: 100 }])
})

test('montarPlacar paga o peso raro e consolida o dia do player', () => {
  // q1 ninguém acerta (peso 2.0 -> 200 pts, mas ninguém leva)
  // q2 metade acerta (peso 1.25 -> 125 pts)
  // q3 todo mundo acerta (peso 0.5 -> 50 pts)
  const { questionScores, placar } = montarPlacar([
    {
      id: 'q1',
      pontosBase: 100,
      respostas: {
        murilo: { playerId: 'murilo', nickname: 'Murilo', correta: false, tempoDeRespostaMs: 5 },
        ana: { playerId: 'ana', nickname: 'Ana', correta: false, tempoDeRespostaMs: 6 },
      },
    },
    {
      id: 'q2',
      pontosBase: 100,
      respostas: {
        murilo: { playerId: 'murilo', nickname: 'Murilo', correta: true, tempoDeRespostaMs: 10 },
        ana: { playerId: 'ana', nickname: 'Ana', correta: false, tempoDeRespostaMs: 20 },
      },
    },
    {
      id: 'q3',
      pontosBase: 100,
      respostas: {
        murilo: { playerId: 'murilo', nickname: 'Murilo', correta: true, tempoDeRespostaMs: 30 },
        ana: { playerId: 'ana', nickname: 'Ana', correta: true, tempoDeRespostaMs: 40 },
      },
    },
  ])

  assert.equal(questionScores[0].pontos, 200, 'ninguém acerta -> peso máximo')
  assert.equal(questionScores[1].pontos, 125, 'metade acerta -> peso intermediário')
  assert.equal(questionScores[2].pontos, 50, 'todo mundo acerta -> peso mínimo')

  const murilo = placar.find((p) => p.playerId === 'murilo')
  const ana = placar.find((p) => p.playerId === 'ana')

  assert.equal(murilo.acertos, 2)
  assert.equal(murilo.pontosDia, 175, '125 + 50')
  assert.equal(ana.acertos, 1)
  assert.equal(ana.pontosDia, 50)
  assert.equal(placar[0].playerId, 'murilo', 'ordena por pontos do dia')
})

test('montarPlacar não credita player que errou tudo', () => {
  const { placar } = montarPlacar([
    { id: 'q1', respostas: { ana: { playerId: 'ana', nickname: 'Ana', correta: false } } },
  ])

  assert.equal(placar.length, 0)
})

test('ordenarRanking e atribuirRanks desempatam por acertos e antiguidade', () => {
  const ordered = ordenarRanking([
    { id: 'b', nickname: 'B', score: 100, correctTotal: 5, createdAtIso: '2026-01-01' },
    { id: 'a', nickname: 'A', score: 100, correctTotal: 9, createdAtIso: '2026-02-01' },
    { id: 'c', nickname: 'C', score: 300, correctTotal: 1, createdAtIso: '2026-03-01' },
  ])

  assert.deepEqual(ordered.map((p) => p.id), ['c', 'a', 'b'])
  assert.deepEqual(atribuirRanks(ordered).map((p) => p.rank), [1, 2, 3])
})

test('ordenarRanking não muta a lista original', () => {
  const original = [{ id: 'a', score: 1 }, { id: 'b', score: 2 }]
  ordenarRanking(original)
  assert.deepEqual(original.map((p) => p.id), ['a', 'b'])
})

// ------------------------------------------------------------------- time
test('getDayKey respeita o fuso', () => {
  // 2026-09-30T02:00Z ainda é 29/09 em São Paulo (UTC-3).
  const instante = new Date('2026-09-30T02:00:00Z')
  assert.equal(getDayKey(instante, 'UTC'), '2026-09-30')
  assert.equal(getDayKey(instante, 'America/Sao_Paulo'), '2026-09-29')
})

test('formatRoundLabel gera o rótulo exibido na UI', () => {
  assert.equal(formatRoundLabel('2026-09-29'), '29 de Set')
  assert.equal(formatRoundLabel('2026-01-05'), '5 de Jan')
  assert.equal(formatRoundLabel('lixo'), 'lixo')
})

test('shiftDayKey volta um dia', () => {
  assert.equal(shiftDayKey('2026-09-29', -1), '2026-09-28')
  assert.equal(shiftDayKey('2026-01-01', -1), '2025-12-31')
})

// --------------------------------------------------------------- session
test('token de sessão valida o player e rejeita adulteração', () => {
  const token = createPlayerToken('murilo')
  assert.equal(verifyPlayerToken(token).playerId, 'murilo')

  const [payload, signature] = token.split('.')
  assert.equal(verifyPlayerToken(`${payload}.${signature}x`), null, 'assinatura adulterada')
  assert.equal(verifyPlayerToken('lixo.lixo'), null)
  assert.equal(verifyPlayerToken(undefined), null)
})

test('token de sessão rejeita payload expirado', () => {
  const token = createPlayerToken('murilo')
  const [payload] = token.split('.')
  const payloadDecodificado = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
  assert.ok(payloadDecodificado.expiresAt > Date.now())
})

// ------------------------------------------------------------------ runner
let failed = 0
for (const { name, fn } of tests) {
  try {
    await fn()
    console.log(`  ok  ${name}`)
  } catch (error) {
    failed += 1
    console.error(`  FAIL ${name}`)
    console.error(`       ${error.message}`)
  }
}

console.log(`\n${tests.length - failed}/${tests.length} testes passando.`)
process.exitCode = failed > 0 ? 1 : 0
