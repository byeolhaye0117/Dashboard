import { useState } from 'react'
import { Link } from 'react-router'
import { useApp } from '../app/state'
import { db } from '../data'
import { useAsync } from '../lib/useAsync'
import { Badge, Card, DaysLeft, Empty, ErrorBox, Input, Loading } from '../components/ui'
import { maskPhone, money, phoneTail } from '../lib/format'
import type { MemberRow } from '../lib/types'

function Status({ m }: { m: MemberRow }) {
  const c = m.activeContract
  if (!c) return <Badge tone="neutral">만료 · 미등록</Badge>
  if (c.sessionsLeft !== null) {
    return (
      <Badge tone={c.sessionsLeft <= 2 ? 'serious' : 'ok'}>
        잔여 {c.sessionsLeft}회
      </Badge>
    )
  }
  if (c.daysLeft !== null && c.daysLeft <= 30) return <DaysLeft days={c.daysLeft} />
  return <Badge tone="ok">이용 중</Badge>
}

export default function Members() {
  const { branchId } = useApp()
  const [q, setQ] = useState('')
  const { data, loading, error, reload } = useAsync(
    () => db.listMembers(branchId, q),
    [branchId, q],
  )

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
        <h2 className="text-sm font-semibold">회원</h2>
        <div className="ml-auto w-full sm:w-72">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="이름 또는 연락처로 검색"
            aria-label="회원 검색"
          />
        </div>
      </div>

      {error && <ErrorBox error={error} onRetry={reload} />}
      {loading && !data && <Loading />}
      {data && data.length === 0 && (
        <Empty title="해당하는 회원이 없습니다" hint={q ? '검색어를 바꿔보세요' : undefined} />
      )}

      {data && data.length > 0 && (
        <>
          {/* 데스크톱: 표 — 정보 밀도를 우선한다 */}
          <div className="scroll-x hidden md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-ink-2">
                  <th className="px-4 py-2 font-medium">이름</th>
                  <th className="px-4 py-2 font-medium">연락처</th>
                  <th className="px-4 py-2 font-medium">지점</th>
                  <th className="px-4 py-2 font-medium">현재 이용</th>
                  <th className="px-4 py-2 font-medium">상태</th>
                  <th className="px-4 py-2 font-medium">유입경로</th>
                  <th className="px-4 py-2 text-right font-medium">누적 결제</th>
                </tr>
              </thead>
              <tbody>
                {data.map((m) => (
                  <tr key={m.id} className="border-b border-line/70 last:border-b-0 hover:bg-surface-2">
                    <td className="px-4 py-2">
                      <Link to={`/members/${m.id}`} className="font-medium hover:underline">
                        {m.name}
                      </Link>
                      {/* 동명이인은 이름만으로 구분되지 않는다 */}
                      <span className="tnum ml-1.5 text-xs text-ink-3">{phoneTail(m.phone)}</span>
                    </td>
                    <td className="tnum px-4 py-2 text-ink-2">{maskPhone(m.phone)}</td>
                    <td className="px-4 py-2 text-ink-2">{m.branchName}</td>
                    <td className="px-4 py-2 text-ink-2">{m.activeContract?.productName ?? '-'}</td>
                    <td className="px-4 py-2"><Status m={m} /></td>
                    <td className="px-4 py-2 text-ink-2">{m.channelName ?? '-'}</td>
                    <td className="tnum px-4 py-2 text-right">{money(m.totalPaid)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 모바일: 카드 — 표를 그대로 밀어넣으면 못 읽는다 */}
          <ul className="md:hidden">
            {data.map((m) => (
              <li key={m.id} className="border-b border-line px-4 py-3 last:border-b-0">
                <Link to={`/members/${m.id}`} className="flex items-center gap-2">
                  <span className="font-medium">{m.name}</span>
                  <span className="tnum text-xs text-ink-3">{phoneTail(m.phone)}</span>
                  <span className="ml-auto"><Status m={m} /></span>
                </Link>
                <p className="mt-1 text-xs text-ink-2">
                  {m.branchName} · {m.activeContract?.productName ?? '이용 중인 상품 없음'}
                </p>
              </li>
            ))}
          </ul>
          <p className="border-t border-line px-4 py-2 text-xs text-ink-3">
            {data.length}명
            {data.length >= 300 && ' (300명까지만 표시합니다. 검색으로 좁혀주세요)'}
          </p>
        </>
      )}
    </Card>
  )
}
