import { chromium } from 'playwright'

const OUT = '/tmp/claude-0/-home-user-Dashboard/39e230d2-a408-51fe-a406-1d49008ba278/scratchpad'
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })

const errors = []
async function shot(name, path, { width = 1440, height = 1000, theme = 'light', wait = 900 } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2 })
  const page = await ctx.newPage()
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${name}] ${m.text()}`) })
  page.on('pageerror', (e) => errors.push(`[${name}] PAGEERROR ${e.message}`))
  await page.addInitScript((t) => localStorage.setItem('gym-dash-theme', t), theme)
  await page.goto(`http://localhost:5173${path}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(wait)
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true })
  // 가로 스크롤 발생 여부 — 모바일에서 표가 페이지를 밀어내면 안 된다
  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth)
  await ctx.close()
  return overflow
}

const results = []
results.push(['홈(라이트)', await shot('01-home-light', '/')])
results.push(['홈(다크)', await shot('02-home-dark', '/', { theme: 'dark' })])
results.push(['회원', await shot('03-members', '/members')])
results.push(['재등록', await shot('04-retention', '/retention')])
results.push(['상담', await shot('05-consult', '/consultations')])
results.push(['신규등록', await shot('06-register', '/register')])
results.push(['홈(모바일)', await shot('07-home-mobile', '/', { width: 390, height: 844 })])
results.push(['회원(모바일)', await shot('08-members-mobile', '/members', { width: 390, height: 844 })])
results.push(['재등록(모바일)', await shot('09-retention-mobile', '/retention', { width: 390, height: 844 })])

console.log('\n가로 오버플로 검사 (0이어야 정상):')
for (const [n, o] of results) console.log(`  ${o === 0 ? 'OK  ' : 'NG  '} ${n}: ${o}px`)
console.log(errors.length ? `\n콘솔 오류 ${errors.length}건:\n` + errors.join('\n') : '\n콘솔 오류 없음')
await browser.close()
