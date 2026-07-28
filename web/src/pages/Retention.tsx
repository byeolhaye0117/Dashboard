import { Link, useSearchParams } from 'react-router'
import { useApp } from '../app/state'
import { db } from '../data'
import { useAsync } from '../lib/useAsync'
import { Badge, Card, DaysLeft, Empty, ErrorBox, Loading } from '../components/ui'
import { maskPhone } from '../lib/format'

/**
 * 재등록 관리 — 만료 임박과 PT 소진 임박을 한 곳에 모은다.
 * 둘 다 "지금 연락하면 돈이 되는 명단"이라는 점에서 같은 일이다.
 */
export default function Retention() {
  const { branchId } = useApp()
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'pt' ? 'pt' : 'membership'

  const expiring = useAsync(() => db.listExpiring(branchId, 30), [branchId])
  const lowSession = useAsync(() => db.listLowSessions(branchId), [branchId])

  const cur = tab === 'pt' ? lowSession : expiring

  return (
    <Card>
      <div className="flex items-center gap-1 border-b border-line px-2 py-2">
        {(
          [
            ['membership', '만료 임박', expiring.data?.length],
            ['pt', 'PT 소진 임박', lowSession.data?.length],
          ] as const
        ).map(([key, label, count]) => (
          <button
            key={key}
            onClick={() => setParams(key === 'pt' ? { tab: 'pt' } : {})}
            className={`rounded-lg px-3 py-1.5 text-sm transition ${
              tab === key ? 'bg-surface-2 font-semibold text-ink' : 'text-ink-2 hover:text-ink'
            }`}
          >
            {label}
            {count != null && <span className="tnum ml-1.5 text-xs text-ink-3">{count}</span>}
          </button>
        ))}
      </div>

      {cur.error && <ErrorBox error={cur.error} onRetry={cur.reload} />}
      {cur.loading && !cur.data && <Loading />}

      {tab === 'membership' && expiring.data && (
        expiring.data.length === 0 ? (
          <Empty title="30일 내 만료 예정인 회원이 없습니다" />
        ) : (
          <div className="scroll-x">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-ink-2">
                  <th className="px-4 py-2 font-medium">회원</th>
                  <th className="px-4 py-2 font-medium">연락처</th>
                  <th className="px-4 py-2 font-medium">지점</th>
                  <th className="px-4 py-2 font-medium">상품</th>
                  <th className="px-4 py-2 font-medium">만료일</th>
                  <th className="px-4 py-2 font-medium">남은 기간</th>
                </tr>
              </thead>
              <tbody>
                {expiring.data.map((r) => (
                  <tr key={r.contractId} className="border-b border-line/70 last:border-b-0 hover:bg-surface-2">
                    <td className="px-4 py-2">
                      <Link to={`/members/${r.memberId}`} className="font-medium hover:underline">
                        {r.memberName}
                      </Link>
                    </td>
                    <td className="tnum px-4 py-2">
                      {r.memberPhone ? (
                        <a href={`tel:${r.memberPhone}`} className="text-ink-2 hover:text-ink hover:underline">
                          {maskPhone(r.memberPhone)}
                        </a>
                      ) : '-'}
                    </td>
                    <td className="px-4 py-2 text-ink-2">{r.branchName}</td>
                    <td className="px-4 py-2 text-ink-2">{r.productName}</td>
                    <td className="tnum px-4 py-2 text-ink-2">{r.endsOn}</td>
                    <td className="px-4 py-2"><DaysLeft days={r.daysLeft} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {tab === 'pt' && lowSession.data && (
        lowSession.data.length === 0 ? (
          <Empty title="잔여 2회 이하인 PT 회원이 없습니다" />
        ) : (
          <div className="scroll-x">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-ink-2">
                  <th className="px-4 py-2 font-medium">회원</th>
                  <th className="px-4 py-2 font-medium">연락처</th>
                  <th className="px-4 py-2 font-medium">지점</th>
                  <th className="px-4 py-2 font-medium">트레이너</th>
                  <th className="px-4 py-2 font-medium">진행</th>
                  <th className="px-4 py-2 font-medium">잔여</th>
                </tr>
              </thead>
              <tbody>
                {lowSession.data.map((r) => (
                  <tr key={r.contractId} className="border-b border-line/70 last:border-b-0 hover:bg-surface-2">
                    <td className="px-4 py-2">
                      <Link to={`/members/${r.memberId}`} className="font-medium hover:underline">
                        {r.memberName}
                      </Link>
                    </td>
                    <td className="tnum px-4 py-2">
                      {r.memberPhone ? (
                        <a href={`tel:${r.memberPhone}`} className="text-ink-2 hover:text-ink hover:underline">
                          {maskPhone(r.memberPhone)}
                        </a>
                      ) : '-'}
                    </td>
                    <td className="px-4 py-2 text-ink-2">{r.branchName}</td>
                    <td className="px-4 py-2 text-ink-2">{r.trainerName ?? '-'}</td>
                    <td className="tnum px-4 py-2 text-ink-2">
                      {r.usedSessions} / {r.totalSessions}회
                    </td>
                    <td className="px-4 py-2">
                      <Badge tone={r.sessionsLeft === 0 ? 'critical' : 'serious'}>
                        {r.sessionsLeft}회 남음
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </Card>
  )
}
