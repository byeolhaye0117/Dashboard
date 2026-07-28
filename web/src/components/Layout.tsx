import { NavLink, Outlet } from 'react-router'
import { useApp } from '../app/state'
import { isDemo } from '../data'
import { addMonths, monthLabel } from '../lib/format'

const NAV = [
  { to: '/', label: '홈', end: true },
  { to: '/members', label: '회원' },
  { to: '/register', label: '신규 등록' },
  { to: '/retention', label: '재등록 관리' },
  { to: '/consultations', label: '상담' },
]

function BranchPicker() {
  const { branches, branchId, setBranchId } = useApp()
  return (
    <select
      value={branchId ?? ''}
      onChange={(e) => setBranchId(e.target.value || null)}
      aria-label="지점 선택"
      className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm font-medium text-ink"
    >
      <option value="">전 지점</option>
      {branches.map((b) => (
        <option key={b.id} value={b.id}>{b.name}</option>
      ))}
    </select>
  )
}

function MonthPicker() {
  const { month, setMonth } = useApp()
  return (
    <div className="flex items-center rounded-lg border border-line bg-surface">
      <button
        onClick={() => setMonth(addMonths(month, -1))}
        aria-label="이전 달"
        className="px-2 py-1.5 text-ink-2 hover:text-ink"
      >
        ‹
      </button>
      <span className="min-w-[6.5rem] px-1 text-center text-sm font-medium">
        {monthLabel(month)}
      </span>
      <button
        onClick={() => setMonth(addMonths(month, 1))}
        aria-label="다음 달"
        className="px-2 py-1.5 text-ink-2 hover:text-ink"
      >
        ›
      </button>
    </div>
  )
}

export default function Layout() {
  const { theme, toggleTheme } = useApp()

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 border-b border-line bg-canvas/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5">
          <span className="text-sm font-semibold tracking-tight">헬스장 업무 대시보드</span>
          {isDemo && (
            <span className="rounded border border-line px-1.5 py-0.5 text-[11px] text-ink-3">
              데모 데이터
            </span>
          )}
          <div className="ml-auto flex items-center gap-2">
            <BranchPicker />
            <MonthPicker />
            <button
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? '라이트 모드로' : '다크 모드로'}
              className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm"
            >
              {theme === 'dark' ? '☀' : '☾'}
            </button>
          </div>
        </div>

        <nav className="scroll-x mx-auto max-w-[1400px] px-2">
          <ul className="flex gap-1">
            {NAV.map((n) => (
              <li key={n.to}>
                <NavLink
                  to={n.to}
                  end={n.end}
                  className={({ isActive }) =>
                    `block border-b-2 px-3 py-2 text-sm whitespace-nowrap transition ${
                      isActive
                        ? 'border-series font-semibold text-ink'
                        : 'border-transparent text-ink-2 hover:text-ink'
                    }`
                  }
                >
                  {n.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      <main className="mx-auto max-w-[1400px] px-4 py-5">
        <Outlet />
      </main>
    </div>
  )
}
