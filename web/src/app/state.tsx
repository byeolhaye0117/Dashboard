import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { db } from '../data'
import type { Branch } from '../lib/types'
import { ymd } from '../lib/format'

interface AppState {
  branches: Branch[]
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

  useEffect(() => {
    db.listBranches().then(setBranches).catch(() => setBranches([]))
  }, [])

  const setBranchId = useCallback((id: string | null) => {
    setBranchIdRaw(id)
    if (id) localStorage.setItem(BRANCH_KEY, id)
    else localStorage.removeItem(BRANCH_KEY)
  }, [])

  const value = useMemo<AppState>(
    () => ({
      branches, branchId, setBranchId, month, setMonth, theme,
      toggleTheme: () => setTheme((t) => (t === 'dark' ? 'light' : 'dark')),
    }),
    [branches, branchId, setBranchId, month, theme],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useApp(): AppState {
  const v = useContext(Ctx)
  if (!v) throw new Error('AppStateProvider 안에서만 쓸 수 있습니다')
  return v
}
