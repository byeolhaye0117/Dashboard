import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { db } from '../data'
import { useApp } from '../app/state'
import { useAsync } from '../lib/useAsync'
import { Badge, Button, Card, Empty, ErrorBox, Input, Loading, Select } from '../components/ui'
import type { ProductKind, Role } from '../lib/types'

/**
 * 설정 — 지점 · 상품 · 직원 · 유입경로.
 *
 * 상품 가격 하나 바꾸려고 DB 관리 화면에 들어가야 한다면 아무도 안 고친다.
 * 그래서 표를 엑셀처럼 그 자리에서 고칠 수 있게 만든다.
 * 값을 바꾸면 저장 버튼이 그 줄에만 나타난다.
 */

const KIND_LABEL: Record<ProductKind, string> = {
  membership: '기간제 회원권',
  pt: 'PT 횟수권',
  group: '그룹수업',
  addon: '부가상품',
}

const ROLE_LABEL: Record<Role, string> = {
  owner: '관장 (전 지점)',
  manager: '매니저',
  desk: '데스크',
  trainer: '트레이너',
}

const TABS = [
  ['branches', '지점'],
  ['products', '상품·가격'],
  ['staff', '직원'],
  ['channels', '유입경로'],
] as const

function Toast({ msg, tone }: { msg: string; tone: 'ok' | 'bad' }) {
  return (
    <div
      className={`fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-lg border px-4 py-2 text-sm shadow-lg ${
        tone === 'ok' ? 'border-ok/50 bg-surface text-ink' : 'border-critical/50 bg-surface text-critical'
      }`}
      role="status"
    >
      {msg}
    </div>
  )
}

/** 값이 바뀐 줄에만 저장/되돌리기가 뜬다 */
function RowActions({
  dirty, saving, onSave, onReset,
}: {
  dirty: boolean
  saving: boolean
  onSave: () => void
  onReset: () => void
}) {
  if (!dirty) return <span className="text-xs text-ink-3">—</span>
  return (
    <span className="flex justify-end gap-1">
      <Button variant="primary" onClick={onSave} disabled={saving}>
        {saving ? '저장 중' : '저장'}
      </Button>
      <Button variant="ghost" onClick={onReset}>되돌리기</Button>
    </span>
  )
}

const cell = 'w-full rounded border border-transparent bg-transparent px-2 py-1 text-sm hover:border-line focus:border-line focus:bg-surface'

export default function Settings() {
  const [params, setParams] = useSearchParams()
  const tabParam = params.get('tab')
  const tab = (TABS.find(([k]) => k === tabParam)?.[0] ?? 'branches') as (typeof TABS)[number][0]

  const [toast, setToast] = useState<{ msg: string; tone: 'ok' | 'bad' } | null>(null)
  const notify = (msg: string, tone: 'ok' | 'bad' = 'ok') => {
    setToast({ msg, tone })
    setTimeout(() => setToast(null), 2600)
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="scroll-x flex gap-1 border-b border-line px-2 py-2">
          {TABS.map(([key, label]) => (
            <button
              key={key}
              onClick={() => setParams(key === 'branches' ? {} : { tab: key })}
              className={`rounded-lg px-3 py-1.5 text-sm whitespace-nowrap transition ${
                tab === key ? 'bg-surface-2 font-semibold text-ink' : 'text-ink-2 hover:text-ink'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === 'branches' && <Branches notify={notify} />}
        {tab === 'products' && <Products notify={notify} />}
        {tab === 'staff' && <Staff notify={notify} />}
        {tab === 'channels' && <Channels notify={notify} />}
      </Card>

      {toast && <Toast msg={toast.msg} tone={toast.tone} />}
    </div>
  )
}

type Notify = (msg: string, tone?: 'ok' | 'bad') => void

// ─────────────────────────────────────────────────────────────────────
// 지점
// ─────────────────────────────────────────────────────────────────────
function Branches({ notify }: { notify: Notify }) {
  const { refreshBranches } = useApp()
  const { data, loading, error, reload } = useAsync(() => db.listAllBranches(), [])
  const [edits, setEdits] = useState<Record<string, { code: string; name: string; isActive: boolean }>>({})
  const [saving, setSaving] = useState<string | null>(null)
  const [adding, setAdding] = useState({ code: '', name: '' })

  if (loading && !data) return <Loading />
  if (error) return <ErrorBox error={error} onRetry={reload} />
  if (!data) return null

  const valueOf = (b: (typeof data)[number]) =>
    edits[b.id] ?? { code: b.code, name: b.name, isActive: b.isActive }
  const dirty = (b: (typeof data)[number]) => {
    const v = valueOf(b)
    return v.code !== b.code || v.name !== b.name || v.isActive !== b.isActive
  }

  const save = async (id: string) => {
    const v = edits[id]
    if (!v) return
    setSaving(id)
    try {
      await db.updateBranch(id, v)
      setEdits((e) => { const n = { ...e }; delete n[id]; return n })
      reload()
      await refreshBranches()
      notify('저장했습니다')
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), 'bad')
    } finally {
      setSaving(null)
    }
  }

  const add = async () => {
    if (!adding.code.trim() || !adding.name.trim()) return
    setSaving('new')
    try {
      await db.createBranch({ code: adding.code.trim().toUpperCase(), name: adding.name.trim(), isActive: true })
      setAdding({ code: '', name: '' })
      reload()
      await refreshBranches()
      notify('지점을 추가했습니다')
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), 'bad')
    } finally {
      setSaving(null)
    }
  }

  return (
    <>
      <div className="scroll-x">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-ink-2">
              <th className="px-3 py-2 font-medium">코드</th>
              <th className="px-3 py-2 font-medium">지점 이름</th>
              <th className="px-3 py-2 font-medium">운영</th>
              <th className="px-3 py-2 text-right font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {data.map((b) => {
              const v = valueOf(b)
              const set = (patch: Partial<typeof v>) =>
                setEdits((e) => ({ ...e, [b.id]: { ...v, ...patch } }))
              return (
                <tr key={b.id} className="border-b border-line/70 last:border-b-0">
                  <td className="px-2 py-1">
                    <input
                      className={`${cell} tnum w-20 uppercase`}
                      value={v.code}
                      onChange={(e) => set({ code: e.target.value.toUpperCase() })}
                      aria-label={`${b.name} 코드`}
                    />
                  </td>
                  <td className="px-2 py-1">
                    <input
                      className={cell}
                      value={v.name}
                      onChange={(e) => set({ name: e.target.value })}
                      aria-label={`${b.name} 이름`}
                    />
                  </td>
                  <td className="px-3 py-1">
                    <label className="flex cursor-pointer items-center gap-2">
                      <input
                        type="checkbox"
                        checked={v.isActive}
                        onChange={(e) => set({ isActive: e.target.checked })}
                      />
                      <span className="text-xs text-ink-2">{v.isActive ? '운영 중' : '폐점'}</span>
                    </label>
                  </td>
                  <td className="px-3 py-1 text-right">
                    <RowActions
                      dirty={dirty(b)}
                      saving={saving === b.id}
                      onSave={() => save(b.id)}
                      onReset={() => setEdits((e) => { const n = { ...e }; delete n[b.id]; return n })}
                    />
                  </td>
                </tr>
              )
            })}

            <tr className="bg-surface-2/60">
              <td className="px-2 py-2">
                <Input
                  value={adding.code}
                  onChange={(e) => setAdding((a) => ({ ...a, code: e.target.value.toUpperCase() }))}
                  placeholder="JS"
                  aria-label="새 지점 코드"
                  className="w-20"
                />
              </td>
              <td className="px-2 py-2" colSpan={2}>
                <Input
                  value={adding.name}
                  onChange={(e) => setAdding((a) => ({ ...a, name: e.target.value }))}
                  placeholder="새 지점 이름"
                  aria-label="새 지점 이름"
                />
              </td>
              <td className="px-3 py-2 text-right">
                <Button
                  variant="primary"
                  onClick={add}
                  disabled={!adding.code.trim() || !adding.name.trim() || saving === 'new'}
                >
                  추가
                </Button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="border-t border-line px-4 py-2 text-xs text-ink-3">
        지점은 지우지 않고 <b>폐점 처리</b>합니다. 문을 닫아도 그 지점이 올린 과거 매출은 남아야 하기 때문입니다.
      </p>
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────
// 상품
// ─────────────────────────────────────────────────────────────────────
function Products({ notify }: { notify: Notify }) {
  const { data, loading, error, reload } = useAsync(
    async () => ({ products: await db.listAllProducts(), branches: await db.listBranches() }),
    [],
  )
  const [edits, setEdits] = useState<Record<string, { name: string; listPrice: number; isActive: boolean }>>({})
  const [saving, setSaving] = useState<string | null>(null)
  const [adding, setAdding] = useState({
    name: '', kind: 'membership' as ProductKind, measure: '', listPrice: '',
  })

  if (loading && !data) return <Loading />
  if (error) return <ErrorBox error={error} onRetry={reload} />
  if (!data) return null

  const valueOf = (p: (typeof data.products)[number]) =>
    edits[p.id] ?? { name: p.name, listPrice: p.listPrice, isActive: p.isActive }
  const dirty = (p: (typeof data.products)[number]) => {
    const v = valueOf(p)
    return v.name !== p.name || v.listPrice !== p.listPrice || v.isActive !== p.isActive
  }

  const save = async (id: string) => {
    const p = data.products.find((x) => x.id === id)
    const v = edits[id]
    if (!p || !v) return
    setSaving(id)
    try {
      await db.updateProduct(id, {
        branchId: p.branchId, kind: p.kind,
        durationDays: p.durationDays, sessionCount: p.sessionCount,
        name: v.name, listPrice: v.listPrice, isActive: v.isActive,
      })
      setEdits((e) => { const n = { ...e }; delete n[id]; return n })
      reload()
      notify('저장했습니다')
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), 'bad')
    } finally {
      setSaving(null)
    }
  }

  const isSessionKind = adding.kind === 'pt' || adding.kind === 'group'

  const add = async () => {
    const measure = Number(adding.measure)
    if (!adding.name.trim() || !measure) return
    setSaving('new')
    try {
      await db.createProduct({
        branchId: null,
        name: adding.name.trim(),
        kind: adding.kind,
        durationDays: isSessionKind ? null : measure,
        sessionCount: isSessionKind ? measure : null,
        listPrice: Number(adding.listPrice || 0),
        isActive: true,
      })
      setAdding({ name: '', kind: 'membership', measure: '', listPrice: '' })
      reload()
      notify('상품을 추가했습니다')
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), 'bad')
    } finally {
      setSaving(null)
    }
  }

  return (
    <>
      <div className="scroll-x">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-ink-2">
              <th className="px-3 py-2 font-medium">상품 이름</th>
              <th className="px-3 py-2 font-medium">종류</th>
              <th className="px-3 py-2 font-medium">기간/횟수</th>
              <th className="px-3 py-2 text-right font-medium">가격</th>
              <th className="px-3 py-2 font-medium">판매</th>
              <th className="px-3 py-2 text-right font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {data.products.map((p) => {
              const v = valueOf(p)
              const set = (patch: Partial<typeof v>) =>
                setEdits((e) => ({ ...e, [p.id]: { ...v, ...patch } }))
              return (
                <tr key={p.id} className="border-b border-line/70 last:border-b-0">
                  <td className="px-2 py-1">
                    <input
                      className={cell}
                      value={v.name}
                      onChange={(e) => set({ name: e.target.value })}
                      aria-label={`${p.name} 이름`}
                    />
                  </td>
                  <td className="px-3 py-1 text-ink-2">{KIND_LABEL[p.kind]}</td>
                  <td className="tnum px-3 py-1 text-ink-2">
                    {p.durationDays ? `${p.durationDays}일` : `${p.sessionCount}회`}
                  </td>
                  <td className="px-2 py-1">
                    <input
                      className={`${cell} tnum text-right`}
                      value={v.listPrice.toLocaleString()}
                      onChange={(e) => set({ listPrice: Number(e.target.value.replace(/\D/g, '')) || 0 })}
                      inputMode="numeric"
                      aria-label={`${p.name} 가격`}
                    />
                  </td>
                  <td className="px-3 py-1">
                    <label className="flex cursor-pointer items-center gap-2">
                      <input
                        type="checkbox"
                        checked={v.isActive}
                        onChange={(e) => set({ isActive: e.target.checked })}
                      />
                      <span className="text-xs text-ink-2">{v.isActive ? '판매 중' : '중단'}</span>
                    </label>
                  </td>
                  <td className="px-3 py-1 text-right">
                    <RowActions
                      dirty={dirty(p)}
                      saving={saving === p.id}
                      onSave={() => save(p.id)}
                      onReset={() => setEdits((e) => { const n = { ...e }; delete n[p.id]; return n })}
                    />
                  </td>
                </tr>
              )
            })}

            <tr className="bg-surface-2/60">
              <td className="px-2 py-2">
                <Input
                  value={adding.name}
                  onChange={(e) => setAdding((a) => ({ ...a, name: e.target.value }))}
                  placeholder="새 상품 이름"
                  aria-label="새 상품 이름"
                />
              </td>
              <td className="px-2 py-2">
                <Select
                  value={adding.kind}
                  onChange={(e) => setAdding((a) => ({ ...a, kind: e.target.value as ProductKind }))}
                  aria-label="새 상품 종류"
                >
                  {(Object.keys(KIND_LABEL) as ProductKind[]).map((k) => (
                    <option key={k} value={k}>{KIND_LABEL[k]}</option>
                  ))}
                </Select>
              </td>
              <td className="px-2 py-2">
                <Input
                  value={adding.measure}
                  onChange={(e) => setAdding((a) => ({ ...a, measure: e.target.value.replace(/\D/g, '') }))}
                  placeholder={isSessionKind ? '횟수' : '일수'}
                  inputMode="numeric"
                  aria-label="새 상품 기간 또는 횟수"
                  className="w-24"
                />
              </td>
              <td className="px-2 py-2">
                <Input
                  value={adding.listPrice}
                  onChange={(e) => setAdding((a) => ({ ...a, listPrice: e.target.value.replace(/\D/g, '') }))}
                  placeholder="가격"
                  inputMode="numeric"
                  aria-label="새 상품 가격"
                  className="text-right"
                />
              </td>
              <td colSpan={2} className="px-3 py-2 text-right">
                <Button
                  variant="primary"
                  onClick={add}
                  disabled={!adding.name.trim() || !adding.measure || saving === 'new'}
                >
                  추가
                </Button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="border-t border-line px-4 py-2 text-xs text-ink-3">
        가격을 바꿔도 <b>이미 판 계약은 그대로</b> 남습니다. 새로 등록하는 회원부터 바뀐 가격이 적용됩니다.
        <br />
        안 파는 상품은 지우지 말고 <b>판매 중단</b>으로 두세요. 지우면 그 상품으로 등록했던 과거 매출이 깨집니다.
      </p>
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────
// 직원
// ─────────────────────────────────────────────────────────────────────
function Staff({ notify }: { notify: Notify }) {
  const { data, loading, error, reload } = useAsync(
    async () => ({ staff: await db.listStaff(), branches: await db.listBranches() }),
    [],
  )
  const [edits, setEdits] = useState<Record<string, { name: string; role: Role; branchId: string | null; isActive: boolean }>>({})
  const [saving, setSaving] = useState<string | null>(null)

  if (loading && !data) return <Loading />
  if (error) return <ErrorBox error={error} onRetry={reload} />
  if (!data) return null

  const valueOf = (s: (typeof data.staff)[number]) =>
    edits[s.id] ?? { name: s.name, role: s.role, branchId: s.branchId, isActive: s.isActive }
  const dirty = (s: (typeof data.staff)[number]) => {
    const v = valueOf(s)
    return v.name !== s.name || v.role !== s.role || v.branchId !== s.branchId || v.isActive !== s.isActive
  }

  const save = async (id: string) => {
    const v = edits[id]
    if (!v) return
    setSaving(id)
    try {
      await db.updateStaff(id, v)
      setEdits((e) => { const n = { ...e }; delete n[id]; return n })
      reload()
      notify('저장했습니다')
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), 'bad')
    } finally {
      setSaving(null)
    }
  }

  return (
    <>
      {data.staff.length === 0 ? (
        <Empty title="등록된 직원이 없습니다" hint="아래 안내대로 계정을 먼저 만들어주세요" />
      ) : (
        <div className="scroll-x">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-ink-2">
                <th className="px-3 py-2 font-medium">이름</th>
                <th className="px-3 py-2 font-medium">역할</th>
                <th className="px-3 py-2 font-medium">소속 지점</th>
                <th className="px-3 py-2 font-medium">재직</th>
                <th className="px-3 py-2 text-right font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {data.staff.map((s) => {
                const v = valueOf(s)
                const set = (patch: Partial<typeof v>) =>
                  setEdits((e) => ({ ...e, [s.id]: { ...v, ...patch } }))
                return (
                  <tr key={s.id} className="border-b border-line/70 last:border-b-0">
                    <td className="px-2 py-1">
                      <input
                        className={cell}
                        value={v.name}
                        onChange={(e) => set({ name: e.target.value })}
                        aria-label={`${s.name} 이름`}
                      />
                    </td>
                    <td className="px-2 py-1">
                      <select
                        className={cell}
                        value={v.role}
                        onChange={(e) => set({ role: e.target.value as Role })}
                        aria-label={`${s.name} 역할`}
                      >
                        {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
                          <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-1">
                      <select
                        className={cell}
                        value={v.branchId ?? ''}
                        onChange={(e) => set({ branchId: e.target.value || null })}
                        aria-label={`${s.name} 소속 지점`}
                      >
                        <option value="">본사 (전 지점)</option>
                        {data.branches.map((b) => (
                          <option key={b.id} value={b.id}>{b.name}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-1">
                      <label className="flex cursor-pointer items-center gap-2">
                        <input
                          type="checkbox"
                          checked={v.isActive}
                          onChange={(e) => set({ isActive: e.target.checked })}
                        />
                        <span className="text-xs text-ink-2">{v.isActive ? '재직' : '퇴사'}</span>
                      </label>
                    </td>
                    <td className="px-3 py-1 text-right">
                      <RowActions
                        dirty={dirty(s)}
                        saving={saving === s.id}
                        onSave={() => save(s.id)}
                        onReset={() => setEdits((e) => { const n = { ...e }; delete n[s.id]; return n })}
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="border-t border-line px-4 py-3 text-xs text-ink-2">
        <p className="mb-1.5 font-medium text-ink">직원을 새로 추가하려면</p>
        <p>
          비밀번호가 걸린 로그인 계정이라 이 화면에서는 만들 수 없습니다.
          Supabase → <b>Authentication → Users → Add user</b> 에서 이메일·비밀번호로
          계정을 만들면 <b>여기 목록에 자동으로 나타납니다.</b> 그 뒤 역할과 지점은 이 화면에서 정하세요.
        </p>
        <p className="mt-2">
          퇴사자는 지우지 말고 <b>재직 체크를 해제</b>하세요.
          바로 로그인이 막히고, 그 직원이 등록했던 회원 기록은 그대로 남습니다.
        </p>
      </div>
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────
// 유입경로
// ─────────────────────────────────────────────────────────────────────
function Channels({ notify }: { notify: Notify }) {
  const { data, loading, error, reload } = useAsync(() => db.listChannels(), [])
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)

  if (loading && !data) return <Loading />
  if (error) return <ErrorBox error={error} onRetry={reload} />

  const add = async () => {
    if (!name.trim()) return
    setSaving(true)
    try {
      await db.createChannel(name.trim())
      setName('')
      reload()
      notify('유입경로를 추가했습니다')
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), 'bad')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <ul className="p-4">
        <li className="flex flex-wrap gap-2">
          {data?.map((c) => <Badge key={c.id}>{c.name}</Badge>)}
        </li>
      </ul>
      <div className="flex gap-2 border-t border-line px-4 py-3">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') add() }}
          placeholder="예: 유튜브, 지역 카페, 현수막"
          aria-label="새 유입경로"
          className="max-w-xs"
        />
        <Button variant="primary" onClick={add} disabled={!name.trim() || saving}>추가</Button>
      </div>
      <p className="border-t border-line px-4 py-2 text-xs text-ink-3">
        회원이 <b>어디 보고 왔는지</b>입니다. 상담 화면에서 경로별 전환율이 나오고,
        그게 광고비를 어디에 쓸지 정하는 근거가 됩니다.
      </p>
    </>
  )
}
