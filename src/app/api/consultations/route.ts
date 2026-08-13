import { NextResponse } from "next/server";
import { readSession } from "@/lib/session";
import { scopeOf } from "@/lib/scope";
import { abilitiesFor } from "@/lib/menu";
import { createConsultation } from "@/lib/consultations";

export const dynamic = "force-dynamic";

/** 상담 접수 */
export async function POST(req: Request) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const reach = await scopeOf(session);

  const ab = (await abilitiesFor(session.roleCode)).get("상담");
  if (!ab?.create) {
    return NextResponse.json({ error: "상담을 등록할 권한이 없습니다." }, { status: 403 });
  }

  try {
    const body = await req.json();
    if (!body.이름?.trim()) return NextResponse.json({ error: "이름을 입력해주세요." }, { status: 400 });
    if (!body.전화번호?.trim()) return NextResponse.json({ error: "연락처를 입력해주세요." }, { status: 400 });

    const branch = body.지점코드;
    const allowed = reach.all || reach.codes.includes(branch);
    if (!allowed) return NextResponse.json({ error: "이 지점에 등록할 권한이 없습니다." }, { status: 403 });

    const id = await createConsultation(body, session.staffId);
    return NextResponse.json({ ok: true, id });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "저장하지 못했습니다." }, { status: 500 });
  }
}
