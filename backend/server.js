/**
 * Ponto de entrada do backend: sobe o HTTP na porta configurada e garante a
 * rodada do dia (mesma lógica do Script Diário, ver scripts/daily.js).
 *
 * A aplicação Express está em app.js para os testes poderem importá-la sem
 * abrir a porta.
 */
import { pathToFileURL } from 'node:url'

import {
  APP_TIMEZONE,
  BASE_POINTS_PER_QUESTION,
  DAILY_QUESTION_COUNT,
  PORT,
  isFirebaseConfigured,
  missingFirebaseVars,
} from './config.js'
import app from './app.js'
import { getApp } from './firebase.js'
import { ensureDailyRound } from './services/rounds.js'
import { isEphemeralSecret } from './services/session.js'
import { getDayKey } from './services/time.js'

export { app }
export default app

export async function boot() {
  if (isEphemeralSecret) {
    console.warn(
      '[quiz-arena] PLAYER_TOKEN_SECRET/CRON_SECRET não definidos: as sessões são invalidadas a cada reinício.',
    )
  }

  if (!isFirebaseConfigured()) {
    console.error(
      `[quiz-arena] Firebase não configurado (faltam ${missingFirebaseVars().join(', ')}). ` +
        'As rotas de dados respondem 503 até o backend/.env estar preenchido.',
    )
  } else {
    // Chamar getApp() aqui transforma credencial inválida em erro de boot, com a
    // mensagem na tela, em vez de um 500 na hora de o player clicar em "Entrar".
    try {
      getApp()
    } catch (error) {
      console.error(`[quiz-arena] Credenciais do Firebase inválidas: ${error.message}`)
      console.error('[quiz-arena] Rode "npm run check:firebase" para o diagnóstico completo.')
    }

    try {
      const { dayKey, round, finalized } = await ensureDailyRound()
      console.log(
        `[quiz-arena] Rodada ${dayKey} pronta: ${round.questionIds.length} questões ` +
          `(${round.disciplineNames.join(', ')}). Rodadas fechadas: ${finalized.length}.`,
      )
    } catch (error) {
      console.error('[quiz-arena] Falha ao preparar a rodada do dia:', error.message)
    }
  }

  return app.listen(PORT, () => {
    console.log(`Backend do Quiz Arena rodando em http://localhost:${PORT} (${APP_TIMEZONE})`)
  })
}

// Só sobe o listener quando este arquivo é o entrypoint; os testes importam
// `app` direto. `pathToFileURL` evita comparar `file://C:/...` com
// `file:///C:/...` (três barras), o que impedia o boot de rodar no Windows.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await boot()
}
