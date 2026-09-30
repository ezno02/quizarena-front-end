// Stub único para os dois entrypoints do firebase-admin. O `firebase.js`
// importa `cert`/`getApps` do barrel e `getFirestore`/`FieldValue` do subpath
// firestore, então este módulo exporta a união dos dois.
//
// Este arquivo NÃO é regerado em runtime: o `tests/integration.js` e o
// `tests/http.js` só preenchem `globalThis.__quizArenaAdminStub` antes de o
// hook redirecionar os imports para cá.
const admin = globalThis.__quizArenaAdminStub

export const cert = (...args) => admin.cert(...args)
export const getApps = (...args) => admin.getApps(...args)
export const initializeApp = (...args) => admin.initializeApp(...args)
export const getApp = (...args) => admin.getApp?.(...args)
export const deleteApp = (...args) => admin.deleteApp?.(...args)

export const getFirestore = (...args) => admin.firestore.getFirestore(...args)
export const FieldValue = admin.firestore.FieldValue

export default admin
