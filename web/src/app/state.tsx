import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { db } from '../data'
import type { Branch } from '../lib/types'
import { ymd } from '../lib/format'

interface AppState {
  branches: Branch[]
  /**
   * 설정에서 지점을 추가·수정한 뒤 호출한다.
   * 이게 없으면 지점을 새로 만들어도 상단 선택 목록에 나타나지 않아,
   * 새 지점으로 회원을 등록할 수가 없다.
   */
  refreshBranches: () => Promise<void>
  /** null = 전 지점 */
  branchId: string | null
  setBranchId: (id: string | null) => void
  month: string
  setMonth: (m: string) => void
  theme: 'light' | 'dark'
  toggleTheme: () => void
}

const Ctx = createContext<AppState | null>(null)

const THEME_KEY = 'gym-dash-theme'
const BRANCH_KEY = 'gym-dash-branch'

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [branches, setBranches] = useState<Branch[]>([])
  const [branchId, setBranchIdRaw] = useState<string | null>(
    () => localStorage.getItem(BRANCH_KEY) || null,
  )
  const [month, setMonth] = useState(() => ymd(new Date()).slice(0, 7) + '-01')
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem(THEME_KEY)
    if (saved === 'light' || saved === 'dark') return saved
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  })

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem(THEME_KEY, theme)
  }, [theme])

  const refreshBranches = useCallback(async () => {
    try {
      setBranches(await db.listBranches())
    } catch {
      setBranches([])
    }
  }, [])

  useEffect(() => {
    void refreshBranches()
  }, [refreshBranches])

  const setBranchId = useCallback((id: string | null) => {
    setBranchIdRaw(id)
    if (id) localStorage.setItem(BRANCH_KEY, id)
    else localStorage.removeItem(BRANCH_KEY)
  }, [])

  const value = useMemo<AppState>(
    () => ({
      branches, refreshBranches, branchId, setBranchId, month, setMonth, theme,
      toggleTheme: () => setTheme((t) => (t === 'dark' ? 'light' : 'dark')),
    }),
    [branches, refreshBranches, branchId, setBranchId, month, theme],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useApp(): AppState {
  const v = useContext(Ctx)
  if (!v) throw new Error('AppStateProvider 안에서만 쓸 수 있습니다')
  return v
}
