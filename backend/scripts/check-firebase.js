/**
 * Valida a configuração do Firebase Admin e testa a conexão real.
 *
 *   node scripts/check-firebase.js
 *
 * Different de `npm run daily`, este script não escreve nada: ele apenas
 * mostra o que está errado com as credenciais, se algo estiver.
 */
import { cert, getApps, initializeApp } from 'firebase-admin'
import { getFirestore } from 'firebase-admin/firestore'

import {
  isFirebaseConfigured,
  missingFirebaseVars,
  getFirebaseCredentials,
} from '../config.js'
import { getDayKey } from '../services/time.js'

function titulo(texto) {
  console.log(`\n=== ${texto} ===`)
}

titulo('Variáveis de ambiente')

for (const key of ['FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY']) {
  const value = process.env[key]

  if (!value) {
    console.log(`  ${key}: AUSENTE`)
    continue
  }

  if (key === 'FIREBASE_PRIVATE_KEY') {
    const temInicio = value.includes('-----BEGIN')
    console.log(`  ${key}: ${value.length} chars, cabeçalho PEM: ${temInicio ? 'sim' : 'NAO'}`)
    if (!temInicio) {
      console.log('    -> isso nao parece uma chave privada de service account.')
      console.log('       Se for uma API key do Firebase Web (comeca com AIza), faltou a service account.')
    }
    continue
  }

  console.log(`  ${key}: ${value}`)
}

const emailValido = /\.iam\.gserviceaccount\.com$/.test(process.env.FIREBASE_CLIENT_EMAIL ?? '')
if (process.env.FIREBASE_CLIENT_EMAIL && !emailValido) {
  console.log('\n  AVISO: FIREBASE_CLIENT_EMAIL nao termina em .iam.gserviceaccount.com.')
  console.log('          O Admin SDK exige uma service account, nao um e-mail de usuario.')
}

if (!isFirebaseConfigured()) {
  console.error(`\nFaltam: ${missingFirebaseVars().join(', ')}`)
  console.error('Copie backend/.env.example para backend/.env e preencha com a service account.')
  process.exit(1)
}

titulo('Inicializando o Admin SDK')

try {
  if (getApps().length === 0) {
    initializeApp({ credential: cert(getFirebaseCredentials()) })
  }
  console.log('  initializeApp: OK')
} catch (error) {
  console.error(`  FALHOU: ${error.message}`)
  process.exit(1)
}

titulo('Conectando no Firestore')

const db = getFirestore()

try {
  const questions = await db.collection('questions').limit(1).get()
  console.log(`  leitura em "questions": OK (${questions.size} documento(s) no sample)`)

  const players = await db.collection('players').limit(1).get()
  console.log(`  leitura em "players" : OK (${players.size} documento(s) no sample)`)

  const round = await db.collection('rounds').doc(getDayKey()).get()
  console.log(
    `  rodada de ${getDayKey()}: ${round.exists ? `${round.data().questionIds?.length ?? 0} questão(ões)` : 'ainda não sorteada'}`,
  )
} catch (error) {
  console.error(`  FALHOU: ${error.message}`)
  console.error('\n  Causas comuns:')
  console.error('   - Firestore não foi criado no projeto')
  console.error('   - a service account não tem permissão (papel "Cloud Datastore User")')
  console.error('   - o projectId não corresponde à service account')
  process.exit(1)
}

console.log('\nConfiguração do Firebase OK.')
