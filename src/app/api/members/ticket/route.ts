import { NextResponse } from "next/server";
import { readSession } from "@/lib/session";
import { scopeOf } from "@/lib/scope";
import { abilitiesFor } from "@/lib/menu";
import { patchTicket, softDeleteTicket, listTickets, listMembers } from "@/lib/members";

export const dynamic = "force-dynamic";

/** 고칠 수 있는 칸만 허용한다 */
const ALLOWED = new Set([
  "시작일", "종료일", "총횟수", "잔여횟수", "정지일수",
  "담당트레이너사번", "상태",
]);

export async function POST(req: Request) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const reach = await scopeOf(session);

  const ab = (await abilitiesFor(session.roleCode)).get("회원");
  if (!ab?.update) {
    return NextResponse.json({ error: "이용권을 고칠 권한이 없습니다." }, { status: 403 });
  }

  try {
    const { id, changes, remove } = await req.json();
    if (!id) return NextResponse.json({ error: "대상을 찾지 못했습니다." }, { status: 400 });

    const [tickets, { items }] = await Promise.all([listTickets(), listMembers()]);
    const target = tickets.find((t) => t.id === String(id));
    if (!target) return NextResponse.json({ error: "해당 이용권이 없습니다." }, { status: 404 });

    // 이 이용권이 붙은 회원을 볼 수 있는 사람인지 확인한다
    const owner = items.find((m) => m.id === target.회원번호);
    const branch = owner?.지점코드 || target.지점코드;
    if (!reach.all && !reach.codes.includes(branch)) {
      return NextResponse.json({ error: "이 이용권을 고칠 권한이 없습니다." }, { status: 403 });
    }

    if (remove) {
      if (!ab.remove) {
        return NextResponse.json({ error: "이용권을 지울 권한이 없습니다." }, { status: 403 });
      }
      await softDeleteTicket(target.id, session.staffId);
      return NextResponse.json({ ok: true });
    }

    const safe: Record<string, string> = {};
    Object.entries(changes ?? {}).forEach(([k, v]) => {
      if (ALLOWED.has(k)) safe[k] = String(v ?? "");
    });

    await patchTicket(target.id, safe, session.staffId);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "저장하지 못했습니다." }, { status: 500 });
  }
}
