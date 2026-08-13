import { NextResponse } from "next/server";
import { readSession } from "@/lib/session";
import { scopeOf } from "@/lib/scope";
import { abilitiesFor } from "@/lib/menu";
import { createConsultation, patchConsultation } from "@/lib/consultations";
import { stageOf } from "@/lib/stage";
import { enrollFromConsultation } from "@/lib/members";

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

    /* 접수하면서 바로 「등록」으로 넣는 경우도 있다 (그 자리에서 등록하신 분).
       고칠 때와 같은 규칙으로 회원 목록에 올린다 — 들어온 길이 다르다고
       결과가 달라지면 그게 더 헷갈린다. */
    let 회원 = null;
    if (stageOf({ 진행상태: body.진행상태 }) === "등록") {
      try {
        회원 = await enrollFromConsultation(
          {
            상담번호: id,
            이름: body.이름, 전화번호: body.전화번호, 지점코드: branch,
            성별: body.성별, 나이대: body.나이대, 담당직원사번: body.상담자사번,
          },
          session.staffId
        );
        await patchConsultation(id, { 전환회원번호: 회원.회원번호 }, session.staffId);
      } catch (e: any) {
        /* 상담은 이미 접수됐다. 회원까지 못 올렸다고 접수를 되돌리지 않는다 —
           대신 왜 못 올렸는지는 그대로 알려준다 */
        return NextResponse.json({ ok: true, id, 회원경고: String(e?.message ?? e) });
      }
    }

    return NextResponse.json({ ok: true, id, 회원 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "저장하지 못했습니다." }, { status: 500 });
  }
}
