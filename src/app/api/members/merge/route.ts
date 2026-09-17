import { NextResponse } from "next/server";
import { readSession } from "@/lib/session";
import { scopeOf } from "@/lib/scope";
import { abilitiesFor } from "@/lib/menu";
import { mergeMembers, listMembers } from "@/lib/members";

export const dynamic = "force-dynamic";

/**
 * 두 줄로 나뉜 한 분을 합친다
 *
 * 지우기와 달리 아무것도 잃지 않는다 — 이용권과 결제를 남길 줄로 옮기고,
 * 비어 있던 칸을 채운 다음, 껍데기만 내린다.
 *
 * 되돌리기 어려운 일이라 권한을 둘 다 본다. 고칠 수만 있고 지울 수 없는
 * 사람이 합치면, 지우기를 못 하게 막아 둔 뜻이 없어진다.
 */
export async function POST(req: Request) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const reach = await scopeOf(session);

  const ab = (await abilitiesFor(session.roleCode)).get("회원");
  if (!ab?.update || !ab?.remove) {
    return NextResponse.json({ error: "회원을 합칠 권한이 없습니다." }, { status: 403 });
  }

  try {
    const { keep, drop } = await req.json();
    const keepId = String(keep ?? "").trim();
    const dropId = String(drop ?? "").trim();
    if (!keepId || !dropId) {
      return NextResponse.json({ error: "합칠 두 회원을 골라주세요." }, { status: 400 });
    }

    /* 볼 수 없는 지점의 회원을 합치지 못하게 막는다 */
    const { items } = await listMembers();
    const a = items.find((m) => m.id === keepId);
    const b = items.find((m) => m.id === dropId);
    if (!a || !b) return NextResponse.json({ error: "합칠 회원을 찾지 못했습니다." }, { status: 404 });
    for (const m of [a, b]) {
      if (!reach.all && !reach.codes.includes(m.지점코드)) {
        return NextResponse.json({ error: "이 회원을 합칠 권한이 없습니다." }, { status: 403 });
      }
    }

    const 결과 = await mergeMembers(keepId, dropId, session.staffId);
    return NextResponse.json({ ok: true, ...결과, 남긴이름: a.이름, 내린번호: dropId });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "합치지 못했습니다." }, { status: 500 });
  }
}
