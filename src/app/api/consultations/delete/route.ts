import { NextResponse } from "next/server";
import { readSession } from "@/lib/session";
import { scopeOf } from "@/lib/scope";
import { abilitiesFor } from "@/lib/menu";
import { softDeleteConsultation, listConsultations } from "@/lib/consultations";

export const dynamic = "force-dynamic";

/** 상담 삭제 (실제로 지우지 않고 삭제 표시만 한다) */
export async function POST(req: Request) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const reach = await scopeOf(session);

  const ab = (await abilitiesFor(session.roleCode)).get("상담");
  if (!ab?.remove) {
    return NextResponse.json({ error: "상담을 삭제할 권한이 없습니다." }, { status: 403 });
  }

  try {
    const { id } = await req.json();
    if (!id) return NextResponse.json({ error: "대상을 찾지 못했습니다." }, { status: 400 });

    const { items } = await listConsultations();
    const target = items.find((i) => i.id === id);
    if (!target) return NextResponse.json({ error: "해당 상담이 없습니다." }, { status: 404 });

    const branchOk = reach.all || reach.codes.includes(target["지점코드"]);
    const mineOk =
      !(ab.condition ?? "").includes("담당") ||
      target["상담자사번"] === session.staffId ||
      target["접수자사번"] === session.staffId;
    if (!branchOk || !mineOk) {
      return NextResponse.json({ error: "이 상담을 삭제할 권한이 없습니다." }, { status: 403 });
    }

    await softDeleteConsultation(id, session.staffId);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "삭제하지 못했습니다." }, { status: 500 });
  }
}
