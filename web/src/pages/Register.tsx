import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { useApp } from '../app/state'
import { db } from '../data'
import { useAsync } from '../lib/useAsync'
import { Button, Card, CardHead, Field, Input, Loading, Select, Textarea } from '../components/ui'
import { addDays, ymd, wonExact } from '../lib/format'
import type { PayMethod } from '../lib/types'

/**
 * 신규 등록 — 회원 + 상품 + 결제를 한 화면에서 끝낸다.
 *
 * 데스크는 회원이 눈앞에 서 있는 동안 입력한다. 화면을 세 번 옮기게 하면
 * "나중에 몰아서" 하게 되고, 몰아서 하면 반드시 빠진다.
 */
export default function Register() {
  const nav = useNavigate()
  const { branches, branchId } = useApp()
  const [params] = useSearchParams()
  const fromConsultationId = params.get('consultation')

  const [form, setForm] = useState({
    branchId: branchId ?? '',
    name: params.get('name') ?? '',
    phone: params.get('phone') ?? '',
    gender: '' as '' | 'M' | 'F',
    birthYear: '',
    channelId: params.get('channel') ?? '',
    memo: '',
    productId: '',
    startedOn: ymd(new Date()),
    discount: '0',
    paidAmount: '',
    method: 'card' as PayMethod,
    trainerId: '',
  })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }))

  const meta = useAsync(
    async () => ({
      products: await db.listProducts(form.branchId || null),
      channels: await db.listChannels(),
      trainers: await db.listTrainers(form.branchId || null),
    }),
    [form.branchId],
  )

  useEffect(() => {
    if (!form.branchId && branches.length > 0) set('branchId', branches[0]!.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branches])

  const product = useMemo(
    () => meta.data?.products.find((p) => p.id === form.productId) ?? null,
    [meta.data, form.productId],
  )

  const discount = Number(form.discount || 0)
  const price = Math.max(0, (product?.listPrice ?? 0) - discount)
  const paid = form.paidAmount === '' ? price : Number(form.paidAmount)
  const unpaid = price - paid

  // 상품을 고르면 결제액을 계약금액으로 미리 채운다 (전액 결제가 대부분)
  useEffect(() => {
    setForm((f) => ({ ...f, paidAmount: '' }))
  }, [form.productId, form.discount])

  const endsOn =
    product?.durationDays != null ? addDays(form.startedOn, product.durationDays) : null

  const valid =
    form.branchId && form.name.trim() && form.productId && paid >= 0 && paid <= price

  async function submit() {
    if (!valid || saving) return
    setSaving(true)
    setErr(null)
    try {
      const { memberId } = await db.createMemberWithContract({
        branchId: form.branchId,
        name: form.name.trim(),
        phone: form.phone.trim(),
        gender: form.gender || null,
        birthYear: form.birthYear ? Number(form.birthYear) : null,
        channelId: form.channelId || null,
        memo: form.memo,
        productId: form.productId,
        startedOn: form.startedOn,
        contractPrice: price,
        paidAmount: paid,
        method: form.method,
        trainerId: form.trainerId || null,
        fromConsultationId,
      })
      nav(`/members/${memberId}`)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
      setSaving(false)
    }
  }

  if (meta.loading && !meta.data) return <Loading />

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Card>
        <CardHead
          title="신규 등록"
          right={
            fromConsultationId ? (
              <span className="text-xs text-ink-3">상담에서 전환</span>
            ) : undefined
          }
        />
        <div className="space-y-5 p-4">
          <section className="grid gap-3 sm:grid-cols-2">
            <Field label="지점" required>
              <Select value={form.branchId} onChange={(e) => set('branchId', e.target.value)}>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="이름" required>
              <Input
                value={form.name}
                onChange={(e) => set('name', e.target.value)}
                placeholder="홍길동"
              />
            </Field>
            <Field label="연락처" hint="동명이인 구분에 쓰입니다">
              <Input
                value={form.phone}
                onChange={(e) => set('phone', e.target.value)}
                placeholder="010-1234-5678"
                inputMode="tel"
              />
            </Field>
            <Field label="유입경로" hint="어디 보고 왔는지 — 광고비 판단의 근거가 됩니다">
              <Select value={form.channelId} onChange={(e) => set('channelId', e.target.value)}>
                <option value="">선택 안 함</option>
                {meta.data?.channels.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="성별">
              <Select
                value={form.gender}
                onChange={(e) => set('gender', e.target.value as 'M' | 'F' | '')}
              >
                <option value="">선택 안 함</option>
                <option value="M">남</option>
                <option value="F">여</option>
              </Select>
            </Field>
            <Field label="출생연도">
              <Input
                value={form.birthYear}
                onChange={(e) => set('birthYear', e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="1990"
                inputMode="numeric"
              />
            </Field>
          </section>

          <section className="grid gap-3 border-t border-line pt-4 sm:grid-cols-2">
            <Field label="상품" required>
              <Select value={form.productId} onChange={(e) => set('productId', e.target.value)}>
                <option value="">선택하세요</option>
                {meta.data?.products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {p.listPrice.toLocaleString()}원
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="시작일" required>
              <Input
                type="date"
                value={form.startedOn}
                onChange={(e) => set('startedOn', e.target.value)}
              />
            </Field>
            <Field label="할인 금액">
              <Input
                value={form.discount}
                onChange={(e) => set('discount', e.target.value.replace(/\D/g, ''))}
                inputMode="numeric"
              />
            </Field>
            {product?.kind === 'pt' && (
              <Field label="담당 트레이너">
                <Select value={form.trainerId} onChange={(e) => set('trainerId', e.target.value)}>
                  <option value="">선택 안 함</option>
                  {meta.data?.trainers.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </Select>
              </Field>
            )}
          </section>

          <section className="grid gap-3 border-t border-line pt-4 sm:grid-cols-2">
            <Field
              label="받은 금액"
              hint="비워두면 전액 결제로 처리합니다. 일부만 받았으면 그 금액을 넣으세요"
            >
              <Input
                value={form.paidAmount}
                onChange={(e) => set('paidAmount', e.target.value.replace(/\D/g, ''))}
                placeholder={String(price)}
                inputMode="numeric"
              />
            </Field>
            <Field label="결제 수단">
              <Select
                value={form.method}
                onChange={(e) => set('method', e.target.value as PayMethod)}
              >
                <option value="card">카드</option>
                <option value="cash">현금</option>
                <option value="transfer">계좌이체</option>
                <option value="other">기타</option>
              </Select>
            </Field>
            <div className="sm:col-span-2">
              <Field label="메모">
                <Textarea
                  rows={2}
                  value={form.memo}
                  onChange={(e) => set('memo', e.target.value)}
                  placeholder="특이사항"
                />
              </Field>
            </div>
          </section>
        </div>
      </Card>

      {/* 저장 전에 무엇이 기록될지 그대로 보여준다. 되돌리는 것보다 싸다. */}
      <Card className="p-4">
        <h3 className="text-sm font-semibold">저장될 내용</h3>
        <dl className="mt-2 space-y-1.5 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-ink-2">상품</dt>
            <dd className="text-right">{product?.name ?? '미선택'}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-ink-2">기간</dt>
            <dd className="tnum text-right">
              {endsOn
                ? `${form.startedOn} ~ ${endsOn}`
                : product?.sessionCount
                  ? `${product.sessionCount}회`
                  : '-'}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-ink-2">계약 금액</dt>
            <dd className="tnum text-right">{wonExact(price)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-ink-2">받은 금액</dt>
            <dd className="tnum text-right">{wonExact(paid)}</dd>
          </div>
          {unpaid > 0 && (
            <div className="flex justify-between gap-3 border-t border-line pt-1.5">
              <dt className="font-medium text-critical">미수금</dt>
              <dd className="tnum text-right font-medium text-critical">{wonExact(unpaid)}</dd>
            </div>
          )}
        </dl>

        {err && (
          <p className="mt-3 rounded-lg border border-critical/40 px-3 py-2 text-sm text-critical">
            {err}
          </p>
        )}

        <div className="mt-4 flex gap-2">
          <Button variant="primary" onClick={submit} disabled={!valid || saving}>
            {saving ? '저장 중…' : '등록하기'}
          </Button>
          <Button variant="ghost" onClick={() => nav(-1)}>취소</Button>
        </div>
        {!valid && (
          <p className="mt-2 text-xs text-ink-3">
            지점 · 이름 · 상품을 채우면 저장할 수 있습니다
          </p>
        )}
      </Card>
    </div>
  )
}
