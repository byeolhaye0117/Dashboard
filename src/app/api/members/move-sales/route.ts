import { NextResponse } from "next/server";
import { readSession } from "@/lib/session";
import { scopeOf } from "@/lib/scope";
import { abilitiesFor } from "@/lib/menu";
import { moveSalesTo, listMembers } from "@/lib/members";

export const dynamic = "force-dynamic";

/**
 * 고른 분들의 결제를 한 회원(일일권)으로 몰아 넣는다
 *
 * 하루 쓰고 가시는 분을 그때그때 회원으로 넣어 두면 명단이 「이용권 없음」인
 * 분들로 가득 찬다. 그렇다고 지우면 그날 판 일일권 매출이 같이 사라진다.
 * 결제를 일일권 한 분에게 옮기고 회원 줄만 내린다 — 매출은 안 움직인다.
 *
 * 되돌리기 어려운 일이라 권한을 둘 다 본다. 회원 줄이 내려가는 일이라
 * 「지우기」를 못 하게 막아 둔 사람이 이것으로 우회하면 안 된다.
 */
export async function POST(req: Request) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const reach = await scopeOf(session);

  const ab = (await abilitiesFor(session.roleCode)).get("회원");
  if (!ab?.update || !ab?.remove) {
    return NextResponse.json({ error: "결제를 옮길 권한이 없습니다." }, { status: 403 });
  }

  try {
    const body = await req.json();
    const to = String(body.to ?? "").trim();
    const ids: string[] = Array.isArray(body.ids)
      ? body.ids.map((x: any) => String(x ?? "").trim()).filter(Boolean)
      : [];
    if (!to) return NextResponse.json({ error: "받을 회원을 골라주세요." }, { status: 400 });
    if (ids.length === 0) return NextResponse.json({ error: "옮길 분을 골라주세요." }, { status: 400 });

    /* 볼 수 없는 지점의 회원을 건드리지 못하게 막는다 */
    const { items } = await listMembers();
    const 받을분 = items.find((m) => m.id === to);
    if (!받을분) return NextResponse.json({ error: "받을 회원을 찾지 못했습니다." }, { status: 404 });
    for (const id of [to, ...ids]) {
      const m = items.find((x) => x.id === id);
      if (!m) return NextResponse.json({ error: `${id} 회원을 찾지 못했습니다.` }, { status: 404 });
      if (!reach.all && !reach.codes.includes(m.지점코드)) {
        return NextResponse.json({ error: "이 회원을 건드릴 권한이 없습니다." }, { status: 403 });
      }
    }

    const 결과 = await moveSalesTo(to, ids, session.staffId);
    return NextResponse.json({ ok: true, ...결과, 받은이름: 받을분.이름 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "옮기지 못했습니다." }, { status: 500 });
  }
}
