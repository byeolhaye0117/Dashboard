import { NextResponse } from "next/server";
import { readSession } from "@/lib/session";
import { abilitiesFor } from "@/lib/menu";
import { softDeleteMember, listMembers } from "@/lib/members";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const ab = (await abilitiesFor(session.roleCode)).get("회원");
  if (!ab?.remove) {
    return NextResponse.json({ error: "회원을 지울 권한이 없습니다." }, { status: 403 });
  }

  try {
    const { id } = await req.json();
    const { items } = await listMembers();
    const target = items.find((m) => m.id === String(id ?? ""));
    if (!target) return NextResponse.json({ error: "해당 회원이 없습니다." }, { status: 404 });

    const branchOk = session.scope === "전체" || session.branches.includes(target.지점코드);
    if (!branchOk) {
      return NextResponse.json({ error: "이 회원을 지울 권한이 없습니다." }, { status: 403 });
    }

    await softDeleteMember(target.id, session.staffId);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "지우지 못했습니다." }, { status: 500 });
  }
}
