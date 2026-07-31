import { NextResponse } from "next/server";
import { readSession } from "@/lib/session";
import { abilitiesFor } from "@/lib/menu";
import { addActivity, listConsultations } from "@/lib/consultations";

export const dynamic = "force-dynamic";

/** 연락 이력 한 줄 추가 */
export async function POST(req: Request) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const ab = (await abilitiesFor(session.roleCode)).get("상담");
  if (!ab?.update) {
    return NextResponse.json({ error: "기록할 권한이 없습니다." }, { status: 403 });
  }

  try {
    const { id, kind, content } = await req.json();
    if (!id || !content?.trim()) {
      return NextResponse.json({ error: "내용을 적어주세요." }, { status: 400 });
    }

    const { items } = await listConsultations();
    const target = items.find((i) => i.id === id);
    if (!target) return NextResponse.json({ error: "해당 상담이 없습니다." }, { status: 404 });

    const branchOk = session.scope === "전체" || session.branches.includes(target["지점코드"]);
    if (!branchOk) return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });

    await addActivity(id, kind || "메모", content.trim(), session.staffId);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "저장하지 못했습니다." }, { status: 500 });
  }
}
