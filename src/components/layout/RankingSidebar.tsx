import { Loader2, Search, Trophy, X } from 'lucide-react'

import type { PlayerProfile, RankingPlayer } from '../../types/quiz'
import { SectionHeading } from '../ui/SectionHeading'

export type SearchState = 'idle' | 'loading' | 'done'

type RankingSidebarProps = {
  rankingPlayers: RankingPlayer[]
  currentUser: PlayerProfile
  searchTerm: string
  onSearchTermChange: (value: string) => void
  searchState: SearchState
  searchResults: RankingPlayer[] | null
  searchedNickname: string
  foundPlayer: boolean
}

function PlayerRow({ player }: { player: RankingPlayer }) {
  const rank = player.rank ?? '—'

  return (
    <div className={`rank-row ${player.rank && player.rank <= 3 ? `top-rank ${player.tone ?? ''}` : ''}`}>
      <span className="rank-number">{rank}</span>
      <div className="avatar">{player.initials}</div>
      <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-slate-200">
        {player.nickname}
      </span>
      <span className="text-[11px] font-bold tabular-nums text-slate-400">
        {player.score.toLocaleString('pt-BR')} <em>pts</em>
      </span>
    </div>
  )
}

export function RankingSidebar({
  rankingPlayers,
  currentUser,
  searchTerm,
  onSearchTermChange,
  searchState,
  searchResults,
  searchedNickname,
  foundPlayer,
}: RankingSidebarProps) {
  const isSearching = searchTerm.trim().length > 0
  // O player atual já aparece fixado no rodapé do card: repetir na lista
  // mostraria a mesma pontuação duas vezes.
  // O player atual já aparece fixado no rodapé do card: repetir na lista
  // mostraria a mesma pontuação duas vezes.
  const basePlayers = isSearching
    ? searchResults ?? []
    : rankingPlayers.filter((player) => player.id !== currentUser.id)
  const visiblePlayers = isSearching
    ? basePlayers.filter((player) => player.id !== currentUser.id)
    : basePlayers

  return (
    <aside className="panel p-4">
      <SectionHeading icon={Trophy}>Ranking</SectionHeading>

      <div className="search-box mb-4">
        {searchState === 'loading' ? (
          <Loader2 size={16} className="shrink-0 animate-spin text-cyan" />
        ) : (
          <Search size={16} className="shrink-0 text-slate-500" />
        )}
        <input
          value={searchTerm}
          onChange={(event) => onSearchTermChange(event.target.value)}
          placeholder="Pesquisar jogador"
          aria-label="Pesquisar jogador pelo nickname"
        />
        {isSearching && (
          <button
            onClick={() => onSearchTermChange('')}
            aria-label="Limpar busca"
            type="button"
          >
            <X size={14} />
          </button>
        )}
      </div>

      <div className="space-y-1">
        {visiblePlayers.map((player) => (
          <PlayerRow key={player.id} player={player} />
        ))}

        {isSearching && searchState === 'done' && !foundPlayer && (
          <p className="px-1 py-3 text-[12px] leading-5 text-slate-500">
            Nenhum player com o nickname <strong className="text-slate-300">{searchedNickname}</strong>.
            Use o mesmo nickname para continuar de onde parou.
          </p>
        )}
      </div>

      <div className="my-rank mt-4">
        <span className="text-[12px] font-extrabold text-violet-300">
          {currentUser.rank ?? '—'}
        </span>
        <div className="avatar me">{currentUser.initials}</div>
        <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-white">
          {currentUser.nickname}
        </span>
        <span className="text-[11px] font-bold tabular-nums text-cyan">
          {currentUser.score.toLocaleString('pt-BR')} <em>pts</em>
        </span>
      </div>
    </aside>
  )
}
