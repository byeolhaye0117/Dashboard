import { NextResponse } from "next/server";
import { readSession } from "@/lib/session";
import { scopeOf } from "@/lib/scope";
import { abilitiesFor } from "@/lib/menu";
import { patchMember, listMembers } from "@/lib/members";

export const dynamic = "force-dynamic";

/** 고칠 수 있는 칸만 허용한다 */
const ALLOWED = new Set([
  "이름", "전화번호", "성별", "나이대", "거주동네",
  "담당직원사번", "회원상태", "메모", "가입일",
]);

export async function POST(req: Request) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const reach = await scopeOf(session);

  const ab = (await abilitiesFor(session.roleCode)).get("회원");
  if (!ab?.update) {
    return NextResponse.json({ error: "회원 정보를 고칠 권한이 없습니다." }, { status: 403 });
  }

  try {
    const { id, changes } = await req.json();
    if (!id) return NextResponse.json({ error: "대상을 찾지 못했습니다." }, { status: 400 });

    const { items } = await listMembers();
    const target = items.find((m) => m.id === id);
    if (!target) return NextResponse.json({ error: "해당 회원이 없습니다." }, { status: 404 });

    const branchOk = reach.all || reach.codes.includes(target.지점코드);
    const mineOk =
      !(ab.condition ?? "").includes("담당") || target.담당직원사번 === session.staffId;
    if (!branchOk || !mineOk) {
      return NextResponse.json({ error: "이 회원을 고칠 권한이 없습니다." }, { status: 403 });
    }

    const safe: Record<string, string> = {};
    Object.entries(changes ?? {}).forEach(([k, v]) => {
      if (ALLOWED.has(k)) safe[k] = String(v ?? "");
    });

    await patchMember(id, safe, session.staffId);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "저장하지 못했습니다." }, { status: 500 });
  }
}
