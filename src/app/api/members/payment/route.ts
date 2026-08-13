import { NextResponse } from "next/server";
import { readSession } from "@/lib/session";
import { scopeOf } from "@/lib/scope";
import { abilitiesFor } from "@/lib/menu";
import { patchPayment, softDeletePayment, listPayments, listMembers } from "@/lib/members";

export const dynamic = "force-dynamic";

/** 고칠 수 있는 칸만 허용한다 */
const ALLOWED = new Set([
  "결제일시", "결제금액", "결제수단", "현금액", "카드액", "계좌액",
  "미수금액", "미수금결제예정일", "환불여부", "환불액", "매출유형", "메모",
]);

export async function POST(req: Request) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const reach = await scopeOf(session);

  const ab = (await abilitiesFor(session.roleCode)).get("회원");
  if (!ab?.update && !ab?.remove) {
    return NextResponse.json({ error: "결제를 고칠 권한이 없습니다." }, { status: 403 });
  }

  try {
    const { id, changes, action } = await req.json();
    if (!id) return NextResponse.json({ error: "대상을 찾지 못했습니다." }, { status: 400 });

    const [payments, { items }] = await Promise.all([listPayments(), listMembers()]);
    const target = payments.find((x) => x.id === String(id));
    if (!target) return NextResponse.json({ error: "해당 결제가 없습니다." }, { status: 404 });

    const owner = items.find((m) => m.id === target.회원번호);
    const branch = owner?.지점코드 || target.지점코드;
    if (!reach.all && !reach.codes.includes(branch)) {
      return NextResponse.json({ error: "이 결제를 고칠 권한이 없습니다." }, { status: 403 });
    }

    /* 지우기는 고치기보다 무겁다 — 권한을 따로 본다 */
    if (action === "del") {
      if (!ab?.remove) {
        return NextResponse.json({ error: "결제를 지울 권한이 없습니다." }, { status: 403 });
      }
      await softDeletePayment(target.id, session.staffId);
      return NextResponse.json({ ok: true });
    }

    if (!ab?.update) {
      return NextResponse.json({ error: "결제를 고칠 권한이 없습니다." }, { status: 403 });
    }

    const safe: Record<string, string> = {};
    Object.entries(changes ?? {}).forEach(([k, v]) => {
      if (ALLOWED.has(k)) safe[k] = String(v ?? "");
    });

    await patchPayment(target.id, safe, session.staffId);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "저장하지 못했습니다." }, { status: 500 });
  }
}
