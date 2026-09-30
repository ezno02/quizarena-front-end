// Redireciona os entrypoints do firebase-admin para o stub em memória durante
// os testes: o barrel "firebase-admin" e o subpath "firebase-admin/firestore".
const ALVO_FIRESTORE = 'firebase-admin/firestore'

export function resolve(specifier, context, nextResolve) {
  if (specifier === 'firebase-admin' || specifier === ALVO_FIRESTORE) {
    return {
      url: new URL('./__firebaseAdminStub.js', import.meta.url).href,
      shortCircuit: true,
      format: 'module',
    }
  }

  return nextResolve(specifier, context)
}
