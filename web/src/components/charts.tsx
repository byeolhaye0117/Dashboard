import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useApp } from '../app/state'
import { chartColors } from '../lib/chartTheme'
import { money, monthLabel, shortMonth, wonExact } from '../lib/format'

/**
 * 지점별 매출 — 막대 5개짜리 비교.
 *
 * 차트 라이브러리를 쓰지 않고 HTML로 그린다. 항목이 적고 값을 바로 옆에
 * 붙여야 하는 형태라, 직접 그리는 편이 읽기도 낫고 확대/축소에도 강하다.
 * 색은 하나만 쓴다. 여기서 비교하는 건 "누구냐"가 아니라 "얼마냐"이기 때문에
 * 지점마다 색을 나눌 이유가 없다.
 */
export function BranchRevenueBars({
  rows,
}: {
  rows: { branchId: string; branchName: string; revenue: number }[]
}) {
  const max = Math.max(1, ...rows.map((r) => r.revenue))
  return (
    <ul className="space-y-2.5 p-4">
      {rows.map((r) => (
        <li key={r.branchId} className="grid grid-cols-[4.5rem_1fr_auto] items-center gap-3">
          <span className="truncate text-sm text-ink-2">{r.branchName}</span>
          <span className="h-5 rounded bg-surface-2" title={wonExact(r.revenue)}>
            <span
              className="block h-5 rounded-r bg-series"
              style={{ width: `${Math.max(2, (r.revenue / max) * 100)}%` }}
            />
          </span>
          <span className="tnum text-sm font-medium text-ink">{money(r.revenue)}</span>
        </li>
      ))}
    </ul>
  )
}

function TrendTooltip({
  active, payload, label,
}: {
  active?: boolean
  payload?: { value: number }[]
  label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs shadow-sm">
      <div className="text-ink-2">{label ? monthLabel(label) : ''}</div>
      <div className="tnum mt-0.5 font-semibold text-ink">
        {wonExact(payload[0]?.value ?? 0)}
      </div>
    </div>
  )
}

/** 최근 12개월 매출 추이 — 계열이 하나뿐이라 범례를 두지 않는다. */
export function RevenueTrend({ rows }: { rows: { month: string; revenue: number }[] }) {
  const { theme } = useApp()
  const c = chartColors(theme)
  return (
    <div className="p-2 pt-4">
      <ResponsiveContainer width="100%" height={230}>
        <LineChart data={rows} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke={c.grid} />
          <XAxis
            dataKey="month"
            tickFormatter={shortMonth}
            tickLine={false}
            axisLine={{ stroke: c.axis }}
            tick={{ fill: c.muted, fontSize: 11 }}
            interval="preserveStartEnd"
            minTickGap={12}
          />
          <YAxis
            tickFormatter={(v: number) => money(v)}
            tickLine={false}
            axisLine={false}
            width={54}
            tick={{ fill: c.muted, fontSize: 11 }}
          />
          <Tooltip
            content={<TrendTooltip />}
            cursor={{ stroke: c.axis, strokeWidth: 1 }}
          />
          <Line
            type="monotone"
            dataKey="revenue"
            stroke={c.series}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4.5, fill: c.series, stroke: c.surface, strokeWidth: 2 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
