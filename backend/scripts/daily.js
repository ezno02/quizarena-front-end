/**
 * Script Diário do fluxograma.
 *
 * Uso no cronjob (00h00 do fuso APP_TIMEZONE):
 *   0 0 * * *  cd /caminho/backend && /usr/bin/node scripts/daily.js >> logs/daily.log 2>&1
 *
 * O que ele faz, na ordem do fluxograma:
 *   1. fecha rodadas antigas que ficaram abertas (cálculo de pontuação + ranking);
 *   2. sorteia 7 questões sem repetir disciplina e marca `selectedForDay: true`;
 *   3. abre a rodada do dia em `rounds/<YYYY-MM-DD>`.
 *
 * Também roda automaticamente no boot do backend (server.js), então subir o
 * servidor já garante a rodada do dia. Rodar duas vezes não duplica nada.
 *
 * Flags:
 *   --finalize=YYYY-MM-DD   fecha apenas a rodada informada
 *   --dry-run               só mostra o que seria feito
 */
import {
  DAILY_QUESTION_COUNT,
  isFirebaseConfigured,
  missingFirebaseVars,
} from '../config.js'
import { createRoundIfMissing, finalizeOpenRoundsBefore, finalizeRound } from '../services/rounds.js'
import { getDayKey } from '../services/time.js'

function parseArgs(argv) {
  const args = { finalize: null, dryRun: false }

  for (const arg of argv) {
    if (arg.startsWith('--finalize=')) {
      args.finalize = arg.slice('--finalize='.length).trim()
    } else if (arg === '--dry-run') {
      args.dryRun = true
    }
  }

  return args
}

function describeResult(result) {
  if (!result) return 'nada a fazer'

  if (result.alreadyFinalized) {
    return `rodada ${result.roundId} já estava fechada`
  }

  const [
    { questionId, acertos, totalRespostas, peso, pontos } = {},
  ] = result.questionScores ?? []

  return [
    `rodada ${result.roundId} fechada`,
    `${result.playerCount} player(s) com acerto`,
    `${result.totalAnswers} resposta(s) registrada(s)`,
    questionId
      ? `ex.: ${questionId} -> ${acertos}/${totalRespostas} acertos, peso ${peso}x, ${pontos} pts`
      : null,
  ]
    .filter(Boolean)
    .join(' | ')
}

async function main() {
  const args = parseArgs(process.argv.slice(2))

  if (!isFirebaseConfigured()) {
    console.error(
      `[quiz-arena] Firebase não configurado. Faltam: ${missingFirebaseVars().join(', ')}\n` +
        'Preencha o backend/.env a partir do backend/.env.example.',
    )
    process.exitCode = 1
    return
  }

  if (args.finalize) {
    const result = await finalizeRound(args.finalize)
    console.log(`[quiz-arena] ${describeResult(result)}`)
    return
  }

  const dayKey = getDayKey()

  if (args.dryRun) {
    const round = await createRoundIfMissing(dayKey, { questionCount: DAILY_QUESTION_COUNT })
    console.log(
      `[quiz-arena] dry-run: rodada ${round.id} -> ${round.questionIds.length} questões em ` +
        `${new Set(round.disciplineIds).size} disciplinas distintas.`,
    )
    console.log(JSON.stringify({ questionIds: round.questionIds, disciplines: round.disciplineNames }, null, 2))
    return
  }

  const { round, finalized } = await finalizeAll()
  console.log(`[quiz-arena] rodada do dia ${dayKey}:`)
  console.log(`  questões: ${round.questionIds.length} -> ${round.disciplineNames.join(', ')}`)
  for (const result of finalized) {
    console.log(`  fechamento: ${describeResult(result)}`)
  }
  for (const warning of round.warnings ?? []) {
    console.warn(`  aviso: ${warning}`)
  }
}

// Mesma ordem do `ensureDailyRound` do servidor: fecha o que ficou para trás
// antes de abrir a rodada de hoje.
async function finalizeAll() {
  const dayKey = getDayKey()
  const finalized = await finalizeOpenRoundsBefore(dayKey)
  const round = await createRoundIfMissing(dayKey, { questionCount: DAILY_QUESTION_COUNT })

  return { round, finalized }
}

await main()
