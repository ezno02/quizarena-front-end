/**
 * Instala as credenciais da service account a partir do .json baixado do
 * Firebase console, escrevendo no backend/.env.
 *
 *   npm run setup:firebase -- caminho/para/service-account.json
 *
 * Por que existe: colar a chave privada no .env à mão é propenso a erro — o
 * `\n` do JSON pode virar quebra real, as aspas podem ser perdidas e o
 * `private_key` tem que continuar em uma linha só. Este script faz isso
 * corretamente e valida antes de gravar.
 */
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const envPath = path.join(__dirname, '..', '.env')

function fail(message) {
  console.error(`\n[quiz-arena] ${message}\n`)
  process.exit(1)
}

const caminho = process.argv[2]

if (!caminho) {
  fail(
    'Informe o caminho do .json da service account.\n\n' +
      '  npm run setup:firebase -- C:/Users/voce/Downloads/projeto-fetec-xxxx.json\n\n' +
      'Para baixar: Firebase console > Project settings > Service accounts >\n' +
      'Generate new private key.',
  )
}

let conta

try {
  // O .json baixado do console costuma vir com BOM (UTF-8 com BOM) no Windows,
  // e o JSON.parse não aceita BOM no início.
  const bruto = await readFile(path.resolve(caminho), 'utf8')
  conta = JSON.parse(bruto.replace(/^﻿/, ''))
} catch (error) {
  fail(`Não consegui ler o arquivo "${caminho}": ${error.message}`)
}

const projectId = conta?.project_id
const clientEmail = conta?.client_email
const privateKey = conta?.private_key

if (!projectId || !clientEmail || !privateKey) {
  fail(
    'O arquivo não tem os campos esperados (project_id, client_email, private_key).\n' +
      'Se for a chave de API do Firebase Web, ela não serve para o backend.\n' +
      'Baixe a service account em Project settings > Service accounts.',
  )
}

if (!privateKey.includes('-----BEGIN PRIVATE KEY-----')) {
  fail('O campo private_key não contém uma chave PEM válida.')
}

if (!clientEmail.endsWith('.iam.gserviceaccount.com')) {
  fail(`O client_email "${clientEmail}" não é uma service account.`)
}

// Reexprime o private_key com quebras de linha reais, que é o formato que o
// SDK espera. No .env vai entre aspas e com \n escapado, como no .env.example.
const chaveComQuebras = privateKey.replace(/\r\n/g, '\n').trim()

const valores = {
  FIREBASE_PROJECT_ID: projectId,
  FIREBASE_CLIENT_EMAIL: clientEmail,
  FIREBASE_PRIVATE_KEY: `"${chaveComQuebras.replace(/\n/g, '\\n')}"`,
}

// Preserva o resto do .env (PORT, CRON_SECRET, etc.) e só troca as três linhas.
let conteudo = ''

try {
  conteudo = await readFile(envPath, 'utf8')
} catch {
  conteudo = '# Configuracao local do Quiz Arena (backend)\n'
}

const linhas = conteudo.split(/\r?\n/)
const vistas = new Set()

const atualizadas = linhas.map((linha) => {
  const match = linha.match(/^\s*([A-Z0-9_]+)\s*=/)

  if (!match || !(match[1] in valores)) {
    return linha
  }

  vistas.add(match[1])
  return `${match[1]}=${valores[match[1]]}`
})

for (const [chave, valor] of Object.entries(valores)) {
  if (!vistas.has(chave)) {
    atualizadas.push(`${chave}=${valor}`)
  }
}

await writeFile(envPath, `${atualizadas.join('\n').replace(/\n+$/, '')}\n`, 'utf8')

console.log(`
[quiz-arena] Credenciais instaladas no backend/.env

  project_id : ${projectId}
  client_email: ${clientEmail}
  private_key : ${chaveComQuebras.split('\n').length} linhas PEM

 proximo passo:

  npm run check:firebase
`)
