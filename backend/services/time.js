import { APP_TIMEZONE } from '../config.js'

const DAY_KEY_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: APP_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

const MONTHS_SHORT = [
  'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
  'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez',
]

/**
 * Chave da rodada do dia no fuso configurado (ex.: "2026-09-29").
 * É essa chave que amarra questão, resposta e placar do mesmo dia.
 */
export function getDayKey(date = new Date(), timeZone = APP_TIMEZONE) {
  if (timeZone === APP_TIMEZONE) {
    return DAY_KEY_FORMATTER.format(date)
  }

  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

/** "2026-09-29" -> "29 de Set" (usado nos rótulos da UI). */
export function formatRoundLabel(dayKey) {
  const [year, month, day] = String(dayKey).split('-').map(Number)
  if (!year || !month || !day) {
    return String(dayKey)
  }

  return `${day} de ${MONTHS_SHORT[month - 1] ?? ''}`
}

/** Diferença em dias entre duas chaves "YYYY-MM-DD". */
export function diffInDays(fromDayKey, toDayKey) {
  const from = Date.parse(`${fromDayKey}T00:00:00Z`)
  const to = Date.parse(`${toDayKey}T00:00:00Z`)

  if (Number.isNaN(from) || Number.isNaN(to)) {
    return Number.POSITIVE_INFINITY
  }

  return Math.round((to - from) / 86_400_000)
}

export function shiftDayKey(dayKey, days) {
  const base = Date.parse(`${dayKey}T00:00:00Z`)
  if (Number.isNaN(base)) {
    return dayKey
  }

  return getDayKey(new Date(base + days * 86_400_000), 'UTC')
}
