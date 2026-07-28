import type { ReactNode } from 'react'
import { delta, money, pct } from '../lib/format'

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-line bg-surface ${className}`}>{children}</div>
  )
}

export function CardHead({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
      <h2 className="text-sm font-semibold text-ink">{title}</h2>
      {right}
    </div>
  )
}

/**
 * 지표 한 칸.
 * 숫자만 크게 띄우지 않고 전월 대비를 함께 보여준다.
 * "이번 달 4,820만"은 그 자체로는 좋은지 나쁜지 알 수 없다.
 */
export function StatCard({
  label, value, unit, prev, invert = false, hint,
}: {
  label: string
  value: number
  unit: 'won' | 'count' | 'percent'
  prev?: number
  /** 늘어나는 게 나쁜 지표(만료 임박 등) */
  invert?: boolean
  hint?: string
}) {
  const shown =
    unit === 'won' ? money(value) : unit === 'percent' ? pct(value, 1) : value.toLocaleString()
  const d = prev === undefined ? null : delta(value, prev)
  const good = d === null ? null : invert ? d < 0 : d > 0

  return (
    <Card className="p-4">
      <div className="text-xs font-medium text-ink-2">{label}</div>
      <div className="mt-1.5 flex items-baseline gap-1">
        <span className="text-2xl font-semibold tracking-tight text-ink">{shown}</span>
        {unit === 'won' && <span className="text-sm text-ink-2">원</span>}
        {unit === 'count' && <span className="text-sm text-ink-2">명</span>}
      </div>
      <div className="mt-1.5 h-4 text-xs">
        {d !== null ? (
          <span className={good ? 'text-up' : 'text-critical'}>
            {/* 색만으로 방향을 전달하지 않는다 — 화살표와 글자를 함께 쓴다 */}
            {d > 0 ? '▲' : d < 0 ? '▼' : '–'} {Math.abs(d).toFixed(1)}%
            <span className="ml-1 text-ink-3">전월 대비</span>
          </span>
        ) : hint ? (
          <span className="text-ink-3">{hint}</span>
        ) : null}
      </div>
    </Card>
  )
}

/** 상태 표시. 색 + 반드시 글자. 색만 쓰지 않는다. */
export function Badge({
  tone = 'neutral', children,
}: {
  tone?: 'neutral' | 'ok' | 'warn' | 'serious' | 'critical'
  children: ReactNode
}) {
  const map: Record<string, string> = {
    neutral: 'border-line text-ink-2',
    ok: 'border-ok/40 text-ok',
    warn: 'border-warn/50 text-ink',
    serious: 'border-serious/50 text-ink',
    critical: 'border-critical/40 text-critical',
  }
  const dot: Record<string, string> = {
    neutral: 'bg-ink-3', ok: 'bg-ok', warn: 'bg-warn',
    serious: 'bg-serious', critical: 'bg-critical',
  }
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-1.5 py-0.5 text-xs whitespace-nowrap ${map[tone]}`}
    >
      <span className={`size-1.5 shrink-0 rounded-full ${dot[tone]}`} aria-hidden />
      {children}
    </span>
  )
}

export function Button({
  children, onClick, variant = 'default', type = 'button', disabled, className = '',
}: {
  children: ReactNode
  onClick?: () => void
  variant?: 'default' | 'primary' | 'ghost'
  type?: 'button' | 'submit'
  disabled?: boolean
  className?: string
}) {
  const v =
    variant === 'primary'
      ? 'bg-series text-white border-series hover:opacity-90'
      : variant === 'ghost'
        ? 'border-transparent text-ink-2 hover:bg-surface-2'
        : 'border-line bg-surface text-ink hover:bg-surface-2'
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-45 ${v} ${className}`}
    >
      {children}
    </button>
  )
}

export function Field({
  label, children, hint, required,
}: {
  label: string
  children: ReactNode
  hint?: string
  required?: boolean
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-ink-2">
        {label}
        {required && <span className="ml-0.5 text-critical">*</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ink-3">{hint}</span>}
    </label>
  )
}

const control =
  'w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-3'

export function Input(p: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...p} className={`${control} ${p.className ?? ''}`} />
}

export function Select(p: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...p} className={`${control} ${p.className ?? ''}`} />
}

export function Textarea(p: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...p} className={`${control} ${p.className ?? ''}`} />
}

export function Empty({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="px-4 py-12 text-center">
      <p className="text-sm text-ink-2">{title}</p>
      {hint && <p className="mt-1 text-xs text-ink-3">{hint}</p>}
    </div>
  )
}

export function Loading({ label = '불러오는 중' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 px-4 py-12 text-sm text-ink-3">
      <span className="size-3 animate-spin rounded-full border-2 border-line border-t-series" />
      {label}
    </div>
  )
}

export function ErrorBox({ error, onRetry }: { error: string; onRetry?: () => void }) {
  return (
    <div className="m-4 rounded-lg border border-critical/40 p-4">
      <p className="text-sm font-medium text-critical">데이터를 불러오지 못했습니다</p>
      <p className="mt-1 text-xs break-words text-ink-2">{error}</p>
      {onRetry && (
        <div className="mt-3">
          <Button onClick={onRetry}>다시 시도</Button>
        </div>
      )}
    </div>
  )
}

/** 남은 일수를 색+글자로 표시한다. 색만으로는 위급함이 전달되지 않는다. */
export function DaysLeft({ days }: { days: number }) {
  const tone = days <= 3 ? 'critical' : days <= 7 ? 'serious' : days <= 14 ? 'warn' : 'neutral'
  return <Badge tone={tone}>{days === 0 ? '오늘 만료' : `D-${days}`}</Badge>
}
