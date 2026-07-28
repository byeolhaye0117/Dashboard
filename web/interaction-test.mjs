/**
 * 신규 등록 흐름을 실제로 클릭해서 확인한다.
 * 폼이 그려지는 것과 저장이 되는 것은 다른 문제다.
 */
import { chromium } from 'playwright'

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
})
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e.message)))

const check = (ok, label, extra = '') =>
  console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${label}${extra ? ' — ' + extra : ''}`)
let failed = 0
const assert = (ok, label, extra) => { if (!ok) failed++; check(ok, label, extra) }

// ── 등록 폼 ──────────────────────────────────────────────────────────
await page.goto('http://localhost:5173/register', { waitUntil: 'networkidle' })
await page.waitForTimeout(600)

await page.getByLabel('이름', { exact: false }).first().fill('테스트회원')
await page.getByPlaceholder('010-1234-5678').fill('010-9999-1234')

// PT 20회(140만) 선택 → 담당 트레이너 항목이 나타나야 한다
await page.getByLabel('상품', { exact: false }).selectOption({ label: 'PT 20회 — 1,400,000원' })
await page.waitForTimeout(300)

const summary = await page.locator('text=저장될 내용').locator('..').innerText()
assert(summary.includes('PT 20회'), '상품 선택이 요약에 반영됨')
assert(summary.includes('1,400,000원'), '계약 금액이 정가로 채워짐', summary.match(/계약 금액\s*(\S+)/)?.[1])
assert(summary.includes('20회'), '횟수제 상품은 기간 대신 횟수로 표기')
assert(
  await page.getByText('담당 트레이너').isVisible(),
  'PT 상품일 때만 담당 트레이너 항목이 나타남',
)

// 할인 10만 → 계약금액 130만
await page.getByLabel('할인 금액').fill('100000')
await page.waitForTimeout(300)
const s2 = await page.locator('text=저장될 내용').locator('..').innerText()
assert(s2.includes('1,300,000원'), '할인이 계약 금액에 반영됨')

// 부분 결제 50만 → 미수금 80만이 떠야 한다
await page.getByLabel('받은 금액', { exact: false }).fill('500000')
await page.waitForTimeout(300)
const s3 = await page.locator('text=저장될 내용').locator('..').innerText()
assert(s3.includes('미수금'), '부분 결제 시 미수금이 표시됨')
assert(s3.includes('800,000원'), '미수금 금액이 정확함', s3.match(/미수금\s*(\S+)/)?.[1])

// 저장
await page.getByRole('button', { name: '등록하기' }).click()
await page.waitForURL(/\/members\/.+/, { timeout: 5000 })
await page.waitForTimeout(600)

const detail = await page.locator('main').innerText()
assert(detail.includes('테스트회원'), '저장 후 회원 상세로 이동함')
assert(detail.includes('PT 20회'), '계약이 함께 저장됨')
assert(detail.includes('미수금'), '미수금이 회원 상세에 표시됨')
assert(detail.includes('500,000원'), '결제 내역이 저장됨')

// ── 상담 → 등록 전환 ─────────────────────────────────────────────────
await page.goto('http://localhost:5173/consultations', { waitUntil: 'networkidle' })
await page.waitForTimeout(700)
await page.getByRole('button', { name: '등록 처리' }).first().click()
await page.waitForURL(/\/register\?/, { timeout: 5000 })
await page.waitForTimeout(500)
const nameVal = await page.getByLabel('이름', { exact: false }).first().inputValue()
assert(nameVal.length > 0, '상담에서 넘어오면 이름이 미리 채워짐', nameVal)

// ── 만료 임박 목록이 D-일 순으로 정렬되는가 ─────────────────────────
await page.goto('http://localhost:5173/retention', { waitUntil: 'networkidle' })
await page.waitForTimeout(700)
const dCells = await page.locator('tbody tr td:last-child').allInnerTexts()
const nums = dCells.map((t) => Number(t.replace(/[^0-9]/g, ''))).filter((n) => !Number.isNaN(n))
const sorted = nums.every((n, i) => i === 0 || nums[i - 1] <= n)
assert(sorted, '만료 임박이 급한 순으로 정렬됨', `${nums.slice(0, 6).join(', ')} …`)

// ── 지점 필터가 실제로 걸리는가 ─────────────────────────────────────
await page.goto('http://localhost:5173/members', { waitUntil: 'networkidle' })
await page.waitForTimeout(700)
await page.getByLabel('지점 선택').selectOption({ label: '수원점' })
await page.waitForTimeout(700)
const branches = await page.locator('tbody tr td:nth-child(3)').allInnerTexts()
assert(
  branches.length > 0 && branches.every((b) => b.trim() === '수원점'),
  '지점을 고르면 그 지점 회원만 나옴',
  `${branches.length}행 중 ${new Set(branches.map((b) => b.trim())).size}개 지점`,
)

console.log(errors.length ? `\n페이지 오류:\n${errors.join('\n')}` : '\n페이지 오류 없음')
console.log(failed === 0 ? '\n=== 전체 통과 ===' : `\n=== ${failed}건 실패 ===`)
await browser.close()
process.exit(failed === 0 ? 0 : 1)
