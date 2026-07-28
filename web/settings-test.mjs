/**
 * 설정 화면 — 관장이 직접 고칠 수 있는지 실제로 클릭해서 확인한다.
 * "가격을 고쳤는데 등록 화면에는 예전 가격이 뜬다"가 가장 흔한 사고다.
 */
import { chromium } from 'playwright'

const OUT = '/tmp/claude-0/-home-user-Dashboard/39e230d2-a408-51fe-a406-1d49008ba278/scratchpad'
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
})
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e.message)))

let failed = 0
const assert = (ok, label, extra = '') => {
  if (!ok) failed++
  console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${label}${extra ? ' — ' + extra : ''}`)
}

await page.goto('http://localhost:5173/settings?tab=products', { waitUntil: 'networkidle' })
await page.waitForTimeout(900)

// 가격을 그 자리에서 고친다
await page.getByLabel('헬스 3개월 가격').fill('265000')
await page.waitForTimeout(250)
assert(
  await page.getByRole('button', { name: '저장' }).first().isVisible(),
  '값을 바꾸면 그 줄에만 저장 버튼이 나타남',
)
await page.screenshot({ path: `${OUT}/10-settings-products.png`, fullPage: true })

await page.getByRole('button', { name: '저장' }).first().click()
await page.waitForTimeout(900)
const after = await page.getByLabel('헬스 3개월 가격').inputValue()
assert(after === '265,000', '가격 변경이 저장됨', after)

// 되돌리기
await page.getByLabel('헬스 1개월 가격').fill('999999')
await page.waitForTimeout(200)
await page.getByRole('button', { name: '되돌리기' }).first().click()
await page.waitForTimeout(300)
assert(
  (await page.getByLabel('헬스 1개월 가격').inputValue()) === '90,000',
  '되돌리기가 원래 값으로 복구함',
)

// 바뀐 가격이 등록 화면에 반영되는가 — 여기가 실제 사고 지점.
// page.goto는 새로고침이라 데모 데이터가 초기화된다. 실제 사용자처럼
// 화면 안에서 이동해야 "설정 변경이 다른 화면에 전달되는가"를 볼 수 있다.
await page.getByRole('link', { name: '신규 등록' }).click()
await page.waitForTimeout(900)
const opts = await page.getByLabel('상품', { exact: false }).innerText()
assert(opts.includes('265,000'), '등록 화면 상품 목록에 바뀐 가격이 반영됨')

// 중복 상품을 한국어로 막는가
await page.getByRole('link', { name: '설정' }).click()
await page.waitForTimeout(500)
await page.getByRole('button', { name: '상품·가격' }).click()
await page.waitForTimeout(700)
await page.getByLabel('새 상품 이름').fill('PT 20회')
await page.getByLabel('새 상품 기간 또는 횟수').fill('20')
await page.getByRole('button', { name: '추가' }).click()
await page.waitForTimeout(900)
const toast = await page.locator('[role=status]').innerText().catch(() => '')
assert(toast.includes('이미'), '중복 상품을 한국어 메시지로 막음', toast)

// 지점 추가
await page.getByRole('button', { name: '지점' }).click()
await page.waitForTimeout(700)
await page.getByLabel('새 지점 코드').fill('JS')
await page.getByLabel('새 지점 이름').fill('잠실점')
await page.getByRole('button', { name: '추가' }).click()
await page.waitForTimeout(900)
// 지점 이름은 input 값이라 innerText로는 안 잡힌다
const branchNames = await page.locator('tbody input[aria-label$="이름"]').evaluateAll(
  (els) => els.map((e) => e.value),
)
assert(branchNames.includes('잠실점'), '지점을 추가하면 목록에 나타남', branchNames.join(', '))
await page.screenshot({ path: `${OUT}/12-settings-branches.png`, fullPage: true })

// 추가한 지점이 상단 지점 선택에도 즉시 뜨는가 (새로고침 없이)
const branchOptions = await page.locator('select[aria-label="지점 선택"] option').allTextContents()
assert(
  branchOptions.includes('잠실점'),
  '추가한 지점이 상단 선택 목록에 즉시 반영됨',
  branchOptions.join(', '),
)

await page.getByRole('button', { name: '직원' }).click()
await page.waitForTimeout(700)
await page.screenshot({ path: `${OUT}/11-settings-staff.png`, fullPage: true })

// 모바일
const ctxM = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
const pm = await ctxM.newPage()
await pm.goto('http://localhost:5173/settings?tab=products', { waitUntil: 'networkidle' })
await pm.waitForTimeout(900)
await pm.screenshot({ path: `${OUT}/13-settings-mobile.png`, fullPage: true })
const ov = await pm.evaluate(
  () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
)
assert(ov === 0, '모바일에서 페이지 가로 스크롤이 생기지 않음', `${ov}px`)

console.log(errors.length ? `\n페이지 오류:\n${errors.join('\n')}` : '\n페이지 오류 없음')
console.log(failed === 0 ? '\n=== 전체 통과 ===' : `\n=== ${failed}건 실패 ===`)
await browser.close()
process.exit(failed === 0 ? 0 : 1)
