/**
 * 클로드에게 시키기 (서버 전용)
 *
 * 열쇠(API key)는 코드에 절대 적지 않는다. Vercel 환경변수 ANTHROPIC_API_KEY 에
 * 대표님이 직접 넣으시고, 여기서는 이름만 읽는다. 브라우저로는 내려가지 않는다.
 *
 * 이 파일은 "부르는 법"만 안다. 무엇을 시킬지는 부르는 쪽이 정한다.
 */

const API = "https://api.anthropic.com/v1/messages";

export type AskResult = { text: string; inTokens: number; outTokens: number };

export async function ask(opts: {
  model: string;
  system: string;
  user: string;
  maxTokens?: number;
  /** 답의 첫 글자를 미리 넣어 준다 — JSON 만 받고 싶을 때 "{" 를 준다 */
  prefill?: string;
}): Promise<AskResult> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    throw new Error(
      "환경변수 ANTHROPIC_API_KEY 가 없습니다. Vercel → Settings → Environment Variables 에 넣어주세요."
    );
  }

  const messages: any[] = [{ role: "user", content: opts.user }];
  if (opts.prefill) messages.push({ role: "assistant", content: opts.prefill });

  let res: Response;
  try {
    res = await fetch(API, {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: opts.model,
        max_tokens: opts.maxTokens ?? 1200,
        system: opts.system,
        messages,
      }),
      cache: "no-store",
    });
  } catch (e: any) {
    throw new Error(`AI 서버에 닿지 못했습니다. (${e?.message ?? e})`);
  }

  if (!res.ok) {
    const body = await res.text();
    // 이유를 감추지 않는다 — 로그인한 사람만 보는 화면이고, 이유가 곧 해결 방법이다
    if (res.status === 401) throw new Error("AI 열쇠가 잘못됐습니다. ANTHROPIC_API_KEY 를 확인해주세요.");
    if (res.status === 429) throw new Error("AI 가 지금 바쁩니다. 잠시 뒤 다시 눌러주세요.");
    throw new Error(`AI 호출이 막혔습니다. (${res.status}) ${body.slice(0, 300)}`);
  }

  const json: any = await res.json();
  const text = (json?.content ?? [])
    .filter((b: any) => b?.type === "text")
    .map((b: any) => b.text)
    .join("");

  return {
    text: (opts.prefill ?? "") + text,
    inTokens: Number(json?.usage?.input_tokens) || 0,
    outTokens: Number(json?.usage?.output_tokens) || 0,
  };
}

/**
 * 답에서 JSON 만 골라낸다
 *
 * "JSON 으로만 답하라" 고 시켜도 앞뒤에 설명이 붙어 올 때가 있다.
 * 그때마다 실패로 처리하면 쓰는 분은 이유를 모른 채 다시 누르게 된다.
 */
export function parseJson(text: string): any {
  const t = (text ?? "").trim();
  try {
    return JSON.parse(t);
  } catch {
    /* 아래에서 다시 시도한다 */
  }
  const s = t.indexOf("{");
  const e = t.lastIndexOf("}");
  if (s >= 0 && e > s) {
    try {
      return JSON.parse(t.slice(s, e + 1));
    } catch {
      /* 아래에서 실패로 넘긴다 */
    }
  }
  throw new Error("AI 답을 읽지 못했습니다. 다시 한 번 눌러주세요.");
}
