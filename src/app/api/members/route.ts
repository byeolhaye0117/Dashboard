import { NextResponse } from "next/server";
import { readSession } from "@/lib/session";
import { scopeOf } from "@/lib/scope";
import { abilitiesFor } from "@/lib/menu";
import { createMember, type NewTicket } from "@/lib/members";

export const dynamic = "force-dynamic";

/** 회원 등록 */
export async function POST(req: Request) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const reach = await scopeOf(session);

  const ab = (await abilitiesFor(session.roleCode)).get("회원");
  if (!ab?.create) {
    return NextResponse.json({ error: "회원을 등록할 권한이 없습니다." }, { status: 403 });
  }

  try {
    const b = await req.json();
    const 이름 = String(b.이름 ?? "").trim();
    const 전화번호 = String(b.전화번호 ?? "").trim();
    const 지점코드 = String(b.지점코드 ?? "").trim();

    if (!이름) return NextResponse.json({ error: "이름을 입력해주세요." }, { status: 400 });
    if (!전화번호) return NextResponse.json({ error: "연락처를 입력해주세요." }, { status: 400 });
    if (!지점코드) return NextResponse.json({ error: "등록 지점을 골라주세요." }, { status: 400 });

    // 볼 수 없는 지점에 회원을 만들어 넣지 못하게 막는다
    if (!reach.all && !reach.codes.includes(지점코드)) {
      return NextResponse.json({ error: "이 지점에 등록할 권한이 없습니다." }, { status: 403 });
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
          }))
      : [];

    const 부가서비스 = Array.isArray(b.부가서비스)
      ? b.부가서비스
          .filter((s: any) => s && s.상품코드)
          .map((s: any) => ({ 상품코드: String(s.상품코드), 추가금액: String(s.추가금액 ?? "") }))
      : [];

    const id = await createMember(
      {
        이름,
        전화번호,
        성별: String(b.성별 ?? ""),
        나이대: String(b.나이대 ?? ""),
        거주동네: String(b.거주동네 ?? ""),
        직업: String(b.직업 ?? "").slice(0, 60),
        지점코드,
        가입일: String(b.가입일 ?? ""),
        담당직원사번: String(b.담당직원사번 ?? ""),
        메모: String(b.메모 ?? ""),
        상담번호: String(b.상담번호 ?? ""),
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
      },
      session.staffId
    );

    return NextResponse.json({ ok: true, id });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "저장하지 못했습니다." }, { status: 500 });
  }
}
