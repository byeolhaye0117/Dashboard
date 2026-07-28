import { Link } from 'react-router'
import { useApp } from '../app/state'
import { db } from '../data'
import { useAsync } from '../lib/useAsync'
import { Card, CardHead, ErrorBox, Loading, StatCard } from '../components/ui'
import { BranchRevenueBars, RevenueTrend } from '../components/charts'
import { monthLabel, prevComparableRange } from '../lib/format'

/**
 * 할 일 한 줄.
 * 대시보드가 버려지는 가장 흔한 이유는 "예쁜데 볼 이유가 없어서"다.
 * 숫자 옆에 항상 "그래서 뭘 해야 하는지"를 붙인다.
 */
function TodoRow({ count, text, to, cta }: { count: number; text: string; to: string; cta: string }) {
  const none = count === 0
  return (
    <li className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-b-0">
      <span
        className={`tnum inline-flex min-w-8 justify-center rounded-md border px-1.5 py-0.5 text-sm font-semibold ${
          none ? 'border-line text-ink-3' : 'border-serious/50 text-ink'
        }`}
      >
        {count}
      </span>
      <span className={`flex-1 text-sm ${none ? 'text-ink-3' : 'text-ink'}`}>{text}</span>
      {!none && (
        <Link
          to={to}
          className="rounded-lg border border-line px-2.5 py-1 text-xs font-medium text-ink hover:bg-surface-2"
        >
          {cta}
        </Link>
      )}
    </li>
  )
}

export default function Dashboard() {
  const { branchId, month, branches } = useApp()
  const { data, loading, error, reload } = useAsync(
    () => db.getDashboard(branchId, month),
    [branchId, month],
  )

  if (loading && !data) return <Loading />
  if (error) return <ErrorBox error={error} onRetry={reload} />
  if (!data) return null

  const scope = branchId ? (branches.find((b) => b.id === branchId)?.name ?? '') : '전 지점'

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="매출" value={data.revenue.value} unit="won" prev={data.revenue.prev} />
        <StatCard label="신규 등록" value={data.newMembers.value} unit="count" prev={data.newMembers.prev} />
        <StatCard
          label="만료 임박"
          value={data.expiringSoon}
          unit="count"
          hint="30일 이내"
          invert
        />
        <StatCard
          label="상담 전환율"
          value={data.conversionRate.value}
          unit="percent"
          prev={data.conversionRate.prev}
        />
      </div>

      {/*
        진행 중인 달을 지난달 "전체"와 비교하면 월말까지 늘 마이너스로 보인다.
        같은 기간끼리 비교하고, 그 사실을 화면에 밝힌다.
      */}
      {data.partial && data.asOf && (
        <p className="text-xs text-ink-3">
          {monthLabel(month)}은 진행 중입니다 — <span className="tnum">{data.asOf}</span>까지
          집계했고, 전월 대비는 <span className="tnum">{prevComparableRange(month).to}</span>까지의
          같은 기간과 비교한 값입니다.
        </p>
      )}

      <Card>
        <CardHead title="오늘의 할 일" />
        <ul>
          <TodoRow
            count={data.todo.expiringIn7}
            text="7일 내 만료 회원 — 재등록 연락"
            to="/retention"
            cta="명단 보기"
          />
          <TodoRow
            count={data.todo.lowSession}
            text="PT 잔여 2회 이하 — 재결제 상담"
            to="/retention?tab=pt"
            cta="명단 보기"
          />
          <TodoRow
            count={data.todo.holdConsultDue}
            text="보류 상담 — 재연락일이 지났습니다"
            to="/consultations"
            cta="상담 보기"
          />
        </ul>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHead title={`지점별 매출 · ${scope}`} />
          {data.byBranch.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-ink-3">이 달 매출이 없습니다</p>
          ) : (
            <BranchRevenueBars rows={data.byBranch} />
          )}
        </Card>

        <Card>
          <CardHead
            title="최근 12개월 매출 추이"
            right={<span className="text-xs text-ink-3">{scope}</span>}
          />
          <RevenueTrend rows={data.trend} />
          {data.partial && (
            <p className="px-4 pb-3 text-xs text-ink-3">
              마지막 지점({monthLabel(month)})은 진행 중이라 낮게 보입니다
            </p>
          )}
        </Card>
      </div>
    </div>
  )
}
