// Importações nomeadas dos entrypoints corretos: o barrel `firebase-admin` não
// expõe `apps`/`credential`/`firestore` (esses existem no objeto `require()`,
// não no namespace ESM), e `FieldValue` vive no subpath `firestore`.
import { cert, getApps, initializeApp } from 'firebase-admin'
import { FieldValue, getFirestore as getAdminFirestore } from 'firebase-admin/firestore'

import { getFirebaseCredentials, isFirebaseConfigured, missingFirebaseVars } from './config.js'

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

  return initializeApp({ credential: cert(getFirebaseCredentials()) })
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
