import type { ReactNode } from 'react';
import type { AuthResponse, FundsResponse } from './api/client';

export type NavPage =
  | 'trade'
  | 'journal'
  | 'settings'
  | 'broker'
  | 'algos';

const NAV: Array<{ id: NavPage; label: string; section?: string }> = [
  { id: 'trade', label: 'Home', section: 'Trading' },
  { id: 'journal', label: 'Journal', section: 'Trading' },
  { id: 'settings', label: 'Settings', section: 'Trading' },
  { id: 'broker', label: 'Broker', section: 'Connect' },
  { id: 'algos', label: 'Algo Studio', section: 'Automate' },
];

function formatINR(value: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value);
}

interface AdminLayoutProps {
  auth: AuthResponse;
  activeNav: NavPage;
  onNavChange: (nav: NavPage) => void;
  onLogout: () => void;
  tradingMode: 'PAPER' | 'LIVE';
  onModeChange: (mode: 'PAPER' | 'LIVE') => void;
  funds: FundsResponse | null;
  pageTitle: string;
  headerActions?: ReactNode;
  children: ReactNode;
}

export function AdminLayout({
  auth,
  activeNav,
  onNavChange,
  onLogout,
  tradingMode,
  onModeChange,
  funds,
  pageTitle,
  headerActions,
  children,
}: AdminLayoutProps) {
  let lastSection = '';

  return (
    <div className="admin-app">
      <aside className="admin-sidebar">
        <div className="sidebar-brand">
          <span className="brand-icon">₹</span>
          <div>
            <strong>Paper Trading</strong>
            <span className="brand-sub">Admin Console</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          {NAV.map((item) => {
            const showSection = item.section !== lastSection;
            lastSection = item.section ?? lastSection;
            return (
              <div key={item.id}>
                {showSection && item.section && (
                  <div className="nav-section">{item.section}</div>
                )}
                <button
                  type="button"
                  className={activeNav === item.id ? 'nav-item active' : 'nav-item'}
                  onClick={() => onNavChange(item.id)}
                >
                  {item.label}
                </button>
              </div>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-user">
            <span className="user-avatar">{auth.user.email[0]?.toUpperCase()}</span>
            <div>
              <div className="user-name">{auth.user.name ?? auth.user.email.split('@')[0]}</div>
              <div className="user-email">{auth.user.email}</div>
            </div>
          </div>
          <button type="button" className="btn-logout" onClick={onLogout}>
            Logout
          </button>
        </div>
      </aside>

      <div className="admin-main">
        <header className="admin-header">
          <div className="header-left">
            <h1>{pageTitle}</h1>
            <span className={tradingMode === 'LIVE' ? 'badge badge-live' : 'badge'}>
              {tradingMode === 'LIVE' ? 'LIVE' : 'PAPER'}
            </span>
          </div>

          <div className="header-stats">
            {funds && (
              <>
                <div className="stat-pill">
                  <span className="stat-label">Available</span>
                  <span className="stat-value">{formatINR(funds.available)}</span>
                </div>
                <div className="stat-pill">
                  <span className="stat-label">Used</span>
                  <span className="stat-value">{formatINR(funds.used)}</span>
                </div>
                <div className="stat-pill">
                  <span className="stat-label">Unrealized P/L</span>
                  <span className={`stat-value ${funds.unrealizedPL < 0 ? 'loss' : 'profit'}`}>
                    {formatINR(funds.unrealizedPL)}
                  </span>
                </div>
              </>
            )}
          </div>

          <div className="header-actions">
            <div className="mode-switch">
              <button
                type="button"
                className={tradingMode === 'PAPER' ? 'mode-btn active' : 'mode-btn'}
                onClick={() => onModeChange('PAPER')}
              >
                Paper
              </button>
              <button
                type="button"
                className={tradingMode === 'LIVE' ? 'mode-btn active live' : 'mode-btn'}
                onClick={() => onModeChange('LIVE')}
              >
                Live
              </button>
            </div>
            {headerActions}
          </div>
        </header>

        <main className="admin-content">{children}</main>
      </div>
    </div>
  );
}

export function pageTitleForNav(nav: NavPage): string {
  const titles: Record<NavPage, string> = {
    trade: 'Home',
    journal: 'Trade Journal',
    settings: 'Settings',
    broker: 'Broker Connection',
    algos: 'Algo Studio',
  };
  return titles[nav];
}
