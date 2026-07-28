import { useCallback, useEffect, useRef, useState } from 'react'

interface State<T> {
  data: T | null
  loading: boolean
  error: string | null
}

/**
 * 비동기 조회 공통 훅.
 *
 * 늦게 도착한 이전 요청이 최신 결과를 덮어쓰지 않도록 순번을 검사한다.
 * 지점을 빠르게 바꿀 때 엉뚱한 지점 숫자가 남는 걸 막는다.
 */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): State<T> & { reload: () => void } {
  const [state, setState] = useState<State<T>>({ data: null, loading: true, error: null })
  const [nonce, setNonce] = useState(0)
  const seq = useRef(0)
  // deps 배열을 그대로 useEffect에 넘기기 위해 함수는 ref로 고정한다
  const fnRef = useRef(fn)
  fnRef.current = fn

  useEffect(() => {
    const my = ++seq.current
    setState((s) => ({ ...s, loading: true, error: null }))
    fnRef
      .current()
      .then((data) => {
        if (my === seq.current) setState({ data, loading: false, error: null })
      })
      .catch((e: unknown) => {
        if (my === seq.current) {
          setState({
            data: null,
            loading: false,
            error: e instanceof Error ? e.message : String(e),
          })
        }
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce])

  const reload = useCallback(() => setNonce((n) => n + 1), [])
  return { ...state, reload }
}
