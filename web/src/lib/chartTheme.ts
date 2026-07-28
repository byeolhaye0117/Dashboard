/**
 * SVG 프레젠테이션 속성에는 CSS 변수(var())가 적용되지 않는다.
 * 그래서 차트 색만 별도로 값으로 들고 있는다.
 * 값 자체는 index.css 의 토큰과 동일하다.
 */
export interface ChartColors {
  series: string
  grid: string
  axis: string
  muted: string
  surface: string
  ink: string
}

const LIGHT: ChartColors = {
  series: '#2a78d6',
  grid: '#e1e0d9',
  axis: '#c3c2b7',
  muted: '#898781',
  surface: '#fcfcfb',
  ink: '#0b0b0b',
}

const DARK: ChartColors = {
  series: '#3987e5',
  grid: '#2c2c2a',
  axis: '#383835',
  muted: '#898781',
  surface: '#1a1a19',
  ink: '#ffffff',
}

export const chartColors = (theme: 'light' | 'dark'): ChartColors =>
  theme === 'dark' ? DARK : LIGHT
