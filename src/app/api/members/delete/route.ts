import { NextResponse } from "next/server";
import { readSession } from "@/lib/session";
import { scopeOf } from "@/lib/scope";
import { abilitiesFor } from "@/lib/menu";
import { softDeleteMember, softDeleteMembers, listMembers } from "@/lib/members";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const reach = await scopeOf(session);

  const ab = (await abilitiesFor(session.roleCode)).get("회원");
  if (!ab?.remove) {
    return NextResponse.json({ error: "회원을 지울 권한이 없습니다." }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { id } = body;
    const { items } = await listMembers();

    const canSee = (branch: string) =>
      reach.all || reach.codes.includes(branch);

    /* 여러 명 한 번에 — 화면이 보낸 번호를 하나하나 담당 범위 안인지 본다 */
    if (Array.isArray(body.ids)) {
      const ids: string[] = body.ids.map(String);
      const targets = items.filter((m) => ids.includes(m.id));
      if (targets.length === 0) {
        return NextResponse.json({ error: "해당 회원이 없습니다." }, { status: 404 });
      }
      if (targets.some((m) => !canSee(m.지점코드))) {
        return NextResponse.json({ error: "담당 지점 회원만 지울 수 있습니다." }, { status: 403 });
      }
      const n = await softDeleteMembers(targets.map((m) => m.id), session.staffId);
      return NextResponse.json({ ok: true, count: n });
    }

    const target = items.find((m) => m.id === String(id ?? ""));
    if (!target) return NextResponse.json({ error: "해당 회원이 없습니다." }, { status: 404 });

    const branchOk = reach.all || reach.codes.includes(target.지점코드);
    if (!branchOk) {
      return NextResponse.json({ error: "이 회원을 지울 권한이 없습니다." }, { status: 403 });
    }

    await softDeleteMember(target.id, session.staffId);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "지우지 못했습니다." }, { status: 500 });
  }
}
