import { NextResponse } from "next/server";
import { readSession } from "@/lib/session";
import { scopeOf } from "@/lib/scope";
import { abilitiesFor } from "@/lib/menu";
import { addPurchase, listMembers, type NewTicket } from "@/lib/members";

export const dynamic = "force-dynamic";

/** 이미 있는 회원에게 상품 더하기 (재등록 · PT 추가 · 사물함 등) */
export async function POST(req: Request) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const reach = await scopeOf(session);

  const ab = (await abilitiesFor(session.roleCode)).get("회원");
  if (!ab?.update) {
    return NextResponse.json({ error: "상품을 더할 권한이 없습니다." }, { status: 403 });
  }

  try {
    const b = await req.json();
    const { items } = await listMembers();
    const target = items.find((m) => m.id === String(b.회원번호 ?? ""));
    if (!target) return NextResponse.json({ error: "해당 회원이 없습니다." }, { status: 404 });

    if (!reach.all && !reach.codes.includes(target.지점코드)) {
      return NextResponse.json({ error: "이 회원을 고칠 권한이 없습니다." }, { status: 403 });
    }

    const 이용권: NewTicket[] = Array.isArray(b.이용권)
      ? b.이용권
          .filter((t: any) => t && t.상품코드)
          .map((t: any) => ({
            상품코드: String(t.상품코드),
            시작일: String(t.시작일 ?? ""),
            종료일: String(t.종료일 ?? ""),
            총횟수: t.총횟수 ? String(t.총횟수) : "",
            담당트레이너사번: t.담당트레이너사번 ? String(t.담당트레이너사번) : "",
            금액: t.금액 ? String(t.금액) : "",
            /* 상품마다 얼마를 깎았고 얼마를 못 받았는지. 결제 줄에는 합계만
               남아서, 여기 안 적으면 상품별로 되짚을 수가 없다 */
            할인: t.할인 ? String(t.할인) : "",
            미수금: t.미수금 ? String(t.미수금) : "",
          }))
      : [];

    const 부가서비스 = Array.isArray(b.부가서비스)
      ? b.부가서비스
          .filter((s: any) => s && s.상품코드)
          .map((s: any) => ({ 상품코드: String(s.상품코드), 추가금액: String(s.추가금액 ?? "") }))
      : [];

    await addPurchase(
      target.id,
      target.지점코드,
      {
        이용권,
        부가서비스,
        결제수단: String(b.결제수단 ?? ""),
        결제금액: String(b.결제금액 ?? ""),
        카드액: String(b.카드액 ?? ""),
        현금액: String(b.현금액 ?? ""),
        계좌액: String(b.계좌액 ?? ""),
        미수금액: String(b.미수금액 ?? ""),
        미수금결제예정일: String(b.미수금결제예정일 ?? ""),
        매출유형: String(b.매출유형 ?? ""),
        담당직원사번: target.담당직원사번,
        메모: String(b.메모 ?? ""),
      },
      session.staffId
    );

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "저장하지 못했습니다." }, { status: 500 });
  }
}
