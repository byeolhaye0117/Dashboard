import { NextResponse } from "next/server";
import { readSession } from "@/lib/session";
import { abilitiesFor } from "@/lib/menu";
import { removeSampleData } from "@/lib/members";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * 예전에 넣었던 화면 확인용 가짜 자료 지우기
 *
 * 메모에 [샘플] 표시가 붙은 줄만 지운다. 그 표시가 진짜 자료를 안 건드리는
 * 유일한 기준이라, 다른 조건으로는 지우지 않는다.
 */
export async function POST() {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const ab = await abilitiesFor(session.roleCode);
  if (!ab.get("직원관리")?.update) {
    return NextResponse.json({ error: "이 일은 대표·관리자만 할 수 있습니다." }, { status: 403 });
  }

  try {
    const n = await removeSampleData(session.staffId);
    return NextResponse.json({ ok: true, count: n });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "지우지 못했습니다." }, { status: 500 });
  }
}
