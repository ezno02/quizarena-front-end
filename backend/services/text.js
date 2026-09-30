const ARTICLES = new Set([
  'o', 'a', 'os', 'as', 'um', 'uma', 'uns', 'umas',
  'the', 'an',
])

/**
 * Minúsculas, sem acento, sem pontuação e com espaços colapsados.
 * Usado tanto para comparar respostas quanto para gerar a chave única do player.
 */
export function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Normaliza a resposta para comparação, removendo artigos iniciais
 * ("the legend of zelda" === "legend of zelda").
 */
export function normalizeAnswer(value) {
  const parts = normalizeText(value).split(' ').filter(Boolean)

  while (parts.length > 1 && ARTICLES.has(parts[0])) {
    parts.shift()
  }

  return parts.join(' ')
}

/**
 * Chave/id do player derivada do nickname. É o que garante a unicidade:
 * "Murilo", "murilo" e "  murilo  " viram o mesmo documento.
 * O resultado é seguro para usar como id de documento e como chave de mapa
 * dentro do Firestore (sem ponto, sem barra, sem espaço).
 */
export function buildNicknameKey(value) {
  const slug = normalizeText(value)
    .replace(/\s+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')

  return slug.slice(0, 60)
}

export function getInitials(value) {
  const parts = String(value ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)

  const initials = parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')

  return initials || 'J'
}
