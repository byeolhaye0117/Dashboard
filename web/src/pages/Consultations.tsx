import { useState } from 'react'
import { Link } from 'react-router'
import { useApp } from '../app/state'
import { db } from '../data'
import { useAsync } from '../lib/useAsync'
import { Badge, Button, Card, CardHead, Empty, ErrorBox, Loading, StatCard } from '../components/ui'
import { daysBetween, maskPhone, monthLabel, ymd } from '../lib/format'
import type { ConsultResult } from '../lib/types'

const RESULT: Record<ConsultResult, { label: string; tone: 'ok' | 'warn' | 'neutral' | 'serious' }> = {
  registered: { label: '등록', tone: 'ok' },
  hold: { label: '보류', tone: 'warn' },
  lost: { label: '이탈', tone: 'neutral' },
  pending: { label: '대기', tone: 'serious' },
}

/**
 * 상담 관리.
 *
 * 회원관리 프로그램은 "회원이 된 사람"만 다룬다. 그런데 매출은
 * 문의만 하고 간 사람을 얼마나 잡아오느냐에서 갈린다.
 * 여기가 이 대시보드의 핵심이다.
 */
export default function Consultations() {
  const { branchId, month } = useApp()
  const [filter, setFilter] = useState<ConsultResult | 'all' | 'due'>('all')
  const { data, loading, error, reload } = useAsync(
    () => db.listConsultations(branchId, month),
    [branchId, month],
  )

  const today = ymd(new Date())
  const total = data?.length ?? 0
  const registered = data?.filter((c) => c.result === 'registered').length ?? 0
  const rate = total === 0 ? 0 : (registered / total) * 100
  const due = data?.filter(
    (c) => c.result === 'hold' && c.nextContactOn && daysBetween(c.nextContactOn, today) >= 0,
  ) ?? []

  const dueIds = new Set(due.map((c) => c.id))
  const rows = data?.filter((c) =>
    filter === 'all' ? true : filter === 'due' ? dueIds.has(c.id) : c.result === filter,
  )

  // 유입경로별 전환 — 광고비를 어디에 쓸지 결정하는 숫자
  const byChannel = Object.values(
    (data ?? []).reduce<Record<string, { name: string; total: number; registered: number }>>(
      (acc, c) => {
        const key = c.channelName ?? '미기록'
        acc[key] ??= { name: key, total: 0, registered: 0 }
        acc[key].total += 1
        if (c.result === 'registered') acc[key].registered += 1
        return acc
      },
      {},
    ),
  ).sort((a, b) => b.total - a.total)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={`${monthLabel(month)} 상담`} value={total} unit="count" hint="건" />
        <StatCard label="등록 전환" value={registered} unit="count" hint="건" />
        <StatCard label="전환율" value={rate} unit="percent" />
        <StatCard label="재연락 필요" value={due.length} unit="count" hint="보류 후 기한 도래" invert />
      </div>

      {byChannel.length > 0 && (
        <Card>
          <CardHead title="유입경로별 전환" right={<span className="text-xs text-ink-3">광고비 판단 근거</span>} />
          <div className="scroll-x">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-ink-2">
                  <th className="px-4 py-2 font-medium">유입경로</th>
                  <th className="px-4 py-2 text-right font-medium">상담</th>
                  <th className="px-4 py-2 text-right font-medium">등록</th>
                  <th className="px-4 py-2 text-right font-medium">전환율</th>
                </tr>
              </thead>
              <tbody>
                {byChannel.map((c) => (
                  <tr key={c.name} className="border-b border-line/70 last:border-b-0">
                    <td className="px-4 py-2">{c.name}</td>
                    <td className="tnum px-4 py-2 text-right text-ink-2">{c.total}</td>
                    <td className="tnum px-4 py-2 text-right text-ink-2">{c.registered}</td>
                    <td className="tnum px-4 py-2 text-right font-medium">
                      {((c.registered / c.total) * 100).toFixed(0)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Card>
        <CardHead
          title={`${monthLabel(month)} 상담 내역`}
          right={
            /* 한 달 상담이 백 건을 넘으면 전체 목록은 볼 수 없다.
               실제로 손이 가는 건 "재연락 필요"와 "보류" 뿐이다. */
            <div className="scroll-x flex gap-1">
              {(
                [
                  ['due', `재연락 필요 ${due.length}`],
                  ['all', '전체'],
                  ['pending', '대기'],
                  ['hold', '보류'],
                  ['registered', '등록'],
                  ['lost', '이탈'],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setFilter(key)}
                  className={`rounded-md px-2 py-1 text-xs whitespace-nowrap transition ${
                    filter === key
                      ? 'bg-surface-2 font-semibold text-ink'
                      : 'text-ink-2 hover:text-ink'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          }
        />
        {error && <ErrorBox error={error} onRetry={reload} />}
        {loading && !data && <Loading />}
        {rows && rows.length === 0 && (
          <Empty
            title={filter === 'all' ? '이 달 상담 기록이 없습니다' : '해당하는 상담이 없습니다'}
          />
        )}
        {rows && rows.length > 0 && (
          <div className="scroll-x">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-ink-2">
                  <th className="px-4 py-2 font-medium">상담일</th>
                  <th className="px-4 py-2 font-medium">이름</th>
                  <th className="px-4 py-2 font-medium">연락처</th>
                  <th className="px-4 py-2 font-medium">지점</th>
                  <th className="px-4 py-2 font-medium">유입경로</th>
                  <th className="px-4 py-2 font-medium">결과</th>
                  <th className="px-4 py-2 font-medium">재연락</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => {
                  const overdue =
                    c.result === 'hold' && c.nextContactOn
                      ? daysBetween(c.nextContactOn, today) >= 0
                      : false
                  return (
                    <tr key={c.id} className="border-b border-line/70 last:border-b-0 hover:bg-surface-2">
                      <td className="tnum px-4 py-2 text-ink-2">{c.consultedOn}</td>
                      <td className="px-4 py-2 font-medium">{c.name}</td>
                      <td className="tnum px-4 py-2">
                        {c.phone ? (
                          <a href={`tel:${c.phone}`} className="text-ink-2 hover:text-ink hover:underline">
                            {maskPhone(c.phone)}
                          </a>
                        ) : '-'}
                      </td>
                      <td className="px-4 py-2 text-ink-2">{c.branchName}</td>
                      <td className="px-4 py-2 text-ink-2">{c.channelName ?? '-'}</td>
                      <td className="px-4 py-2">
                        <Badge tone={RESULT[c.result].tone}>{RESULT[c.result].label}</Badge>
                      </td>
                      <td className="tnum px-4 py-2">
                        {c.nextContactOn ? (
                          overdue ? (
                            <Badge tone="critical">{c.nextContactOn} 지남</Badge>
                          ) : (
                            <span className="text-ink-2">{c.nextContactOn}</span>
                          )
                        ) : '-'}
                      </td>
                      <td className="px-4 py-2 text-right">
                        {c.result !== 'registered' && (
                          <Link
                            to={`/register?consultation=${c.id}&name=${encodeURIComponent(c.name)}&phone=${encodeURIComponent(c.phone ?? '')}&channel=${c.channelId ?? ''}`}
                          >
                            <Button>등록 처리</Button>
                          </Link>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
