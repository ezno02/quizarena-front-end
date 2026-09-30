// Importações nomeadas dos entrypoints corretos: o barrel `firebase-admin` não
// expõe `apps`/`credential`/`firestore` (esses existem no objeto `require()`,
// não no namespace ESM), e `FieldValue` vive no subpath `firestore`.
import { cert, getApps, initializeApp } from 'firebase-admin'
import { FieldValue, getFirestore as getAdminFirestore } from 'firebase-admin/firestore'

import {
  getFirebaseCredentials,
  isFirebaseConfigured,
  missingFirebaseVars,
} from './config.js'

/**
 * Em testes, `tests/firestoreStub.js` registra o stub e define
 * `QUIZ_ARENA_USE_FIRESTORE_STUB=1` para pular a validação de credenciais.
 */
function isStubbed() {
  return process.env.QUIZ_ARENA_USE_FIRESTORE_STUB === '1'
}

let firestore = null

export function getApp() {
  const [existing] = getApps()

  if (existing) {
    return existing
  }

  if (isStubbed()) {
    return initializeApp({ credential: cert({ projectId: 'stub', clientEmail: 'stub@stub', privateKey: 'stub' }) })
  }

  if (!isFirebaseConfigured()) {
    const error = new Error(
      `Firebase não configurado. Faltam as variáveis: ${missingFirebaseVars().join(', ')} (veja backend/.env.example).`,
    )
    error.status = 503
    error.code = 'FIREBASE_NOT_CONFIGURED'
    throw error
  }

  const credentials = getFirebaseCredentials()

  // Falhar aqui, no boot, é melhor do que descobrir no primeiro clique do
  // player: o `initializeApp` só validaria a chave na primeira transação e a
  // tela mostraria um 500 genérico.
  if (!credentials.privateKey.includes('-----BEGIN')) {
    const error = new Error(
      'FIREBASE_PRIVATE_KEY não parece uma chave de service account: falta o cabeçalho ' +
        '"-----BEGIN PRIVATE KEY-----". Se for uma API key do Firebase Web (começa com AIza), ' +
        'baixe a service account em Project settings > Service accounts. ' +
        'Diagnóstico: "npm run check:firebase".',
    )
    error.status = 503
    error.code = 'FIREBASE_BAD_CREDENTIALS'
    throw error
  }

  if (!credentials.clientEmail.endsWith('.iam.gserviceaccount.com')) {
    const error = new Error(
      `FIREBASE_CLIENT_EMAIL ("${credentials.clientEmail}") não é uma service account. ` +
        'O Admin SDK espera algo como ' +
        '"firebase-adminsdk-xxxxx@seu-projeto.iam.gserviceaccount.com". ' +
        'Diagnóstico: "npm run check:firebase".',
    )
    error.status = 503
    error.code = 'FIREBASE_BAD_CREDENTIALS'
    throw error
  }

  return initializeApp({ credential: cert(credentials) })
}

export function getFirestore() {
  if (!firestore) {
    firestore = getAdminFirestore(getApp())
  }

  return firestore
}

export function getFieldValue() {
  return FieldValue
}

export function isReady() {
  try {
    getApp()
    return true
  } catch {
    return false
  }
}
