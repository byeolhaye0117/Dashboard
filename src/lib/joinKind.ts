/**
 * 그 달에 신규인가 재등록인가 — 기록으로 센다
 *
 * ── 왜 고르신 값을 안 보나 ──────────────────────────────────
 * 상품을 팔 때 고르는 「매출유형」은 고르개의 처음 값이 「신규」다. 바쁠 때
 * 그대로 두고 넘어가면 재등록이 신규로 남는다. 실제로 9월에 재등록이
 * 1분으로 떴다 — 고른 값을 세면 안 고른 것까지 같이 세게 된다.
 *
 * 그래서 사람 수는 기록으로 센다. 이용권 시작일은 상품을 팔 때 반드시
 * 적히는 값이라 빈칸이 없고, 고르개처럼 처음 값이 따로 없다.
 *
 * 고르신 매출유형은 그대로 쓰인다 — 매출 금액을 「신규 매출 · 재등록 매출」로
 * 나누는 자리다. 돈을 어느 쪽으로 볼지는 파신 분이 정하는 것이 맞고,
 * 사람이 몇 분인지는 기록이 답하는 것이 맞다.
 *
 * ── 세는 법 ────────────────────────────────────────────────
 * 그 달에 시작하는 이용권이 있는 분을 본다. 그분에게 그 달보다 앞서 시작한
 * 이용권이 있으면 재등록, 없으면 신규다.
 *
 * 이용권 갈래만 본다 — 회원권 · 수강권 · 그룹수강권 · 케어권. 사물함을
 * 하나 더 끊은 것을 재등록이라 부르면 「다시 다니기로 하신 분」이 몇 분인지
 * 알 수 없어진다. 회원권에 얹은 24시 옵션도 제 이용권이 아니라 뺀다.
 *
 * 이용권이 하나도 없는데 가입일이 그 달이면 신규로 둔다 — 등록만 해 두고
 * 결제를 나중에 적는 경우다. 이분들을 빼면 그 달의 등록이 실제보다 적어진다.
 *
 * 이 파일은 구글 접속 코드를 안 물고 있어 화면 쪽에서도 그대로 쓸 수 있다.
 * 매출 화면과 회원 화면이 같은 것을 부르므로 두 화면의 수가 어긋날 수 없다.
 */
import { groupOf } from "./productMeta";

export type JoinTicket = {
  회원번호?: string;
  시작일?: string;
  상품코드?: string;
  /** 회원권에 얹은 옵션인가 — 제 이용권이 아니다 */
  얹음?: boolean;
  /** 「환불」이면 없던 일이다 */
  상태?: string;
};

export type JoinMember = { id: string; 가입일?: string };

type Pr = { kind?: string; isService?: boolean; isOption?: boolean };

export function joinKinds(
  members: JoinMember[],
  tickets: JoinTicket[],
  productOf: (code: string) => Pr | undefined,
  month: string
): Record<string, "신규" | "재등록"> {
  /* 회원마다 본 이용권의 시작일만 모은다 */
  const 시작일들: Record<string, string[]> = {};
  tickets.forEach((t) => {
    const id = t.회원번호 ?? "";
    const d = (t.시작일 ?? "").slice(0, 10);
    if (!id || !d) return;
    if (t.얹음) return;
    if ((t.상태 ?? "").trim() === "환불") return;
    if (groupOf(productOf(t.상품코드 ?? "")) !== "이용권") return;
    (시작일들[id] ??= []).push(d);
  });

  const out: Record<string, "신규" | "재등록"> = {};
  members.forEach((m) => {
    const list = 시작일들[m.id] ?? [];
    if (list.some((d) => d.startsWith(month))) {
      out[m.id] = list.some((d) => d.slice(0, 7) < month) ? "재등록" : "신규";
      return;
    }
    /* 이용권이 아예 없는 분만 가입일로 메운다. 이용권이 있는데 그 달 것이
       없으면 그 달에는 아무 일도 없었던 것이다 — 메우면 안 된다 */
    if (list.length === 0 && (m.가입일 ?? "").startsWith(month)) out[m.id] = "신규";
  });

  return out;
}
