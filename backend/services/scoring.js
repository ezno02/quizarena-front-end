import { MAX_DYNAMIC_WEIGHT, MIN_DYNAMIC_WEIGHT } from '../config.js'

function round(value, decimals = 2) {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

/**
 * Lê o mapa `respostas.<roundId>` da questão e devolve a distribuição de
 * respostas dos players. É a base do "peso dinâmico" do fluxograma: quanto
 * menos players acertaram, maior a raridade e maior o peso da questão.
 */
export function aggregateRespostas(respostas = {}) {
  const lista = Object.values(respostas ?? {})

  const porResposta = new Map()
  for (const registro of lista) {
    const chave = registro?.respostaNormalizada || '(vazio)'
    porResposta.set(chave, (porResposta.get(chave) ?? 0) + 1)
  }

  const distribuicao = [...porResposta.entries()]
    .map(([resposta, contagem]) => ({ resposta, contagem }))
    .sort((a, b) => b.contagem - a.contagem || a.resposta.localeCompare(b.resposta))

  const acertosJogadores = lista
    .filter((registro) => registro?.correta)
    .map((registro) => ({
      playerId: registro.playerId,
      nickname: registro.nickname ?? null,
      tempoDeRespostaMs: Number(registro.tempoDeRespostaMs) || null,
    }))

  return {
    total: lista.length,
    acertos: acertosJogadores.length,
    distribuicao,
    acertosJogadores,
  }
}

/**
 * "Pontuação com peso dinâmico que dependerá da raridade de respostas,
 *  comparando respostas entre todos os players e fazendo o cálculo ao final do dia."
 *
 *   raridade = 1 - (% de acertos)
 *   peso     = 0.5 + 1.5 * raridade      (faixa 0.5 .. 2.0)
 *   pontos   = pontosBase * peso
 *
 * Se ninguém respondeu ainda, a questão vale o peso máximo.
 */
export function calcularPesoDinamico({ acertos = 0, total = 0, pontosBase = 100 } = {}) {
  const respondidas = total > 0
  const percentualAcerto = respondidas ? acertos / total : 0
  const raridade = respondidas ? 1 - percentualAcerto : 1
  const peso = MIN_DYNAMIC_WEIGHT + (MAX_DYNAMIC_WEIGHT - MIN_DYNAMIC_WEIGHT) * raridade
  const pontos = Math.max(1, Math.round(pontosBase * peso))

  return {
    pontosBase,
    totalRespostas: total,
    acertos,
    percentualAcerto: round(percentualAcerto, 4),
    raridade: round(raridade, 4),
    peso: round(peso, 4),
    pontos,
  }
}

/**
 * Calcula o peso final de cada questão da rodada e monta o placar do dia.
 *
 * @param {Array<{id: string, pontosBase?: number, respostas?: object}>} questoes
 *        Questões da rodada já com o mapa `respostas` da rodada preenchido.
 * @param {number} pontosPadrao usado quando a questão não define `pontosBase`.
 */
export function montarPlacar(questoes, pontosPadrao = 100) {
  const porJogador = new Map()

  const questionScores = questoes.map((questao) => {
    const stats = aggregateRespostas(questao.respostas)
    const peso = calcularPesoDinamico({
      acertos: stats.acertos,
      total: stats.total,
      pontosBase: Number(questao.pontosBase) || pontosPadrao,
    })

    for (const acerto of stats.acertosJogadores) {
      if (!porJogador.has(acerto.playerId)) {
        porJogador.set(acerto.playerId, {
          playerId: acerto.playerId,
          nickname: acerto.nickname,
          acertos: 0,
          pontosDia: 0,
          respostas: [],
        })
      }

      const entry = porJogador.get(acerto.playerId)
      entry.acertos += 1
      entry.pontosDia += peso.pontos
      entry.respostas.push({
        questionId: questao.id,
        pontos: peso.pontos,
        tempoDeRespostaMs: acerto.tempoDeRespostaMs,
      })
    }

    return {
      questionId: questao.id,
      ...peso,
      // Só as respostas mais frequentes entram no snapshot, para auditar a raridade.
      distribuicao: stats.distribuicao.slice(0, 5),
    }
  })

  const placar = [...porJogador.values()].sort(
    (a, b) => b.pontosDia - a.pontosDia || b.acertos - a.acertos || String(a.nickname).localeCompare(String(b.nickname)),
  )

  return { questionScores, placar }
}

/**
 * Ordena o ranking global (cumulativo) e atribui a posição de cada player.
 * Desempate: pontos -> acertos totais -> player mais antigo -> id.
 */
export function ordenarRanking(players) {
  return [...(players ?? [])].sort(
    (a, b) =>
      Number(b.score ?? 0) - Number(a.score ?? 0) ||
      Number(b.correctTotal ?? 0) - Number(a.correctTotal ?? 0) ||
      String(a.createdAtIso ?? '').localeCompare(String(b.createdAtIso ?? '')) ||
      String(a.id).localeCompare(String(b.id)),
  )
}

export function atribuirRanks(players) {
  return ordenarRanking(players).map((player, index) => ({ ...player, rank: index + 1 }))
}
