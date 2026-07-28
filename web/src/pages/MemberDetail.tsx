import { Link, useParams } from 'react-router'
import { db } from '../data'
import { useAsync } from '../lib/useAsync'
import { Badge, Card, CardHead, DaysLeft, Empty, ErrorBox, Loading } from '../components/ui'
import { maskPhone, money, wonExact } from '../lib/format'
import type { ContractStatus } from '../lib/types'

const STATUS_LABEL: Record<ContractStatus, string> = {
  active: '이용 중', suspended: '정지', completed: '종료', expired: '만료',
  cancelled: '취소', refunded: '환불', transferred_out: '양도함',
}

const METHOD_LABEL: Record<string, string> = {
  card: '카드', cash: '현금', transfer: '계좌이체', other: '기타',
}

export default function MemberDetail() {
  const { id = '' } = useParams()
  const { data, loading, error, reload } = useAsync(() => db.getMember(id), [id])

  if (loading && !data) return <Loading />
  if (error) return <ErrorBox error={error} onRetry={reload} />
  if (!data) return <Empty title="회원을 찾을 수 없습니다" />

  const { member: m, contracts, payments, sessions } = data
  const paid = payments.reduce((s, p) => s + p.amount, 0)
  const contracted = contracts
    .filter((c) => c.status !== 'cancelled' && c.status !== 'transferred_out')
    .reduce((s, c) => s + c.contractPrice, 0)
  const unpaid = contracted - paid

  return (
    <div className="space-y-4">
      <Link to="/members" className="inline-block text-sm text-ink-2 hover:text-ink">
        ‹ 회원 목록
      </Link>

      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className="text-lg font-semibold">{m.name}</h1>
          <span className="tnum text-sm text-ink-2">{maskPhone(m.phone)}</span>
          {m.activeContract?.daysLeft != null && m.activeContract.daysLeft <= 30 && (
            <DaysLeft days={m.activeContract.daysLeft} />
          )}
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
          <div><dt className="text-xs text-ink-2">지점</dt><dd>{m.branchName}</dd></div>
          <div><dt className="text-xs text-ink-2">유입경로</dt><dd>{m.channelName ?? '-'}</dd></div>
          <div><dt className="text-xs text-ink-2">최초 등록</dt><dd className="tnum">{m.firstRegisteredOn}</dd></div>
          <div>
            <dt className="text-xs text-ink-2">출생연도</dt>
            <dd className="tnum">{m.birthYear ?? '-'}</dd>
          </div>
        </dl>
        <div className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3 text-sm">
          <span className="text-ink-2">누적 결제</span>
          <span className="tnum font-medium">{wonExact(paid)}</span>
          {unpaid > 0 && (
            /* 미수금은 색만으로 알리지 않고 금액과 함께 글자로 붙인다 */
            <Badge tone="critical">미수금 {money(unpaid)}원</Badge>
          )}
        </div>
      </Card>

      <Card>
        <CardHead title="계약 이력" />
        {contracts.length === 0 ? (
          <Empty title="계약이 없습니다" />
        ) : (
          <div className="scroll-x">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-ink-2">
                  <th className="px-4 py-2 font-medium">상품</th>
                  <th className="px-4 py-2 font-medium">기간</th>
                  <th className="px-4 py-2 font-medium">진행</th>
                  <th className="px-4 py-2 font-medium">상태</th>
                  <th className="px-4 py-2 text-right font-medium">금액</th>
                </tr>
              </thead>
              <tbody>
                {contracts.map((c) => (
                  <tr key={c.id} className="border-b border-line/70 last:border-b-0">
                    <td className="px-4 py-2 font-medium">{c.productName}</td>
                    <td className="tnum px-4 py-2 text-ink-2">
                      {c.startedOn}{c.endsOn ? ` ~ ${c.endsOn}` : ''}
                    </td>
                    <td className="tnum px-4 py-2 text-ink-2">
                      {c.totalSessions !== null
                        ? `${c.usedSessions} / ${c.totalSessions}회`
                        : '-'}
                    </td>
                    <td className="px-4 py-2">
                      <Badge tone={c.status === 'active' ? 'ok' : 'neutral'}>
                        {STATUS_LABEL[c.status]}
                      </Badge>
                    </td>
                    <td className="tnum px-4 py-2 text-right">{wonExact(c.contractPrice)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHead title="결제 내역" />
          {payments.length === 0 ? (
            <Empty title="결제 내역이 없습니다" />
          ) : (
            <ul className="text-sm">
              {payments.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center gap-3 border-b border-line/70 px-4 py-2 last:border-b-0"
                >
                  <span className="tnum text-ink-2">{p.paidOn}</span>
                  <span className="text-ink-2">{METHOD_LABEL[p.method] ?? p.method}</span>
                  {p.kind === 'refund' && <Badge tone="critical">환불</Badge>}
                  <span
                    className={`tnum ml-auto font-medium ${p.amount < 0 ? 'text-critical' : ''}`}
                  >
                    {wonExact(p.amount)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHead title="PT 세션" />
          {sessions.length === 0 ? (
            <Empty title="세션 기록이 없습니다" />
          ) : (
            <ul className="max-h-80 overflow-y-auto text-sm">
              {sessions.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center gap-3 border-b border-line/70 px-4 py-2 last:border-b-0"
                >
                  <span className="tnum text-ink-2">{s.sessionAt.slice(0, 10)}</span>
                  <span className="text-ink-2">{s.trainerName}</span>
                  <span className="ml-auto">
                    {s.status === 'completed' ? (
                      <Badge tone="ok">진행</Badge>
                    ) : s.status === 'noshow' ? (
                      <Badge tone="serious">노쇼</Badge>
                    ) : (
                      <Badge tone="neutral">취소</Badge>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}
