import { ChevronDown, LogOut, Menu, RefreshCw, UserRound, X } from 'lucide-react'

import { QuizArenaBrand } from '../ui/QuizArenaBrand'

type AppHeaderProps = {
  nickname: string
  isMobileMenuOpen: boolean
  onToggleMenu: () => void
  onChangePlayer: () => void
  onReload: () => void
  isReloading: boolean
}

export function AppHeader({
  nickname,
  isMobileMenuOpen,
  onToggleMenu,
  onChangePlayer,
  onReload,
  isReloading,
}: AppHeaderProps) {
  return (
    <header className="app-header">
      <QuizArenaBrand />

      <button
        className="mobile-menu-button"
        onClick={onToggleMenu}
        aria-label={isMobileMenuOpen ? 'Fechar menu' : 'Abrir menu'}
        aria-expanded={isMobileMenuOpen}
        type="button"
      >
        {isMobileMenuOpen ? <X size={19} /> : <Menu size={19} />}
      </button>

      <div className={`header-actions ${isMobileMenuOpen ? 'open' : ''}`}>
        <div className="header-user">
          <div className="header-avatar"><UserRound size={17} /></div>
          <div>
            <span>Jogando como</span>
            <strong>@{nickname}</strong>
          </div>
          <ChevronDown size={14} className="ml-2 text-slate-500" />
        </div>

        <div className="header-actions-row">
          <button
            type="button"
            onClick={onReload}
            disabled={isReloading}
            className="secondary-button"
          >
            <RefreshCw size={14} className={isReloading ? 'spinner' : ''} />
            Atualizar rodada
          </button>
          <button
            type="button"
            onClick={onChangePlayer}
            className="secondary-button"
          >
            <LogOut size={14} />
            Trocar nickname
          </button>
        </div>
      </div>
    </header>
  )
}
