import { NextResponse } from "next/server";
import { readSession } from "@/lib/session";
import { abilitiesFor } from "@/lib/menu";
import { getStaffAll, getStaffBranches } from "@/lib/data";
import { punchIn, punchOut, patchAttendance } from "@/lib/attendance";

export const dynamic = "force-dynamic";

/**
 * 근태 찍기·고치기
 *
 * 찍는 것 : 본인만. 시각은 서버가 정한다.
 * 고치는 것 : 근태 수정 권한이 있는 사람만. 남의 것을 대신 적는 자리다.
 */
export async function POST(req: Request) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  try {
    const body = await req.json();
    const action = body.action as string;

    if (action === "in" || action === "out") {
      const ab = await abilitiesFor(session.roleCode);
      if (!ab.get("근태")?.view) {
        return NextResponse.json({ error: "근태를 쓸 수 없는 계정입니다." }, { status: 403 });
      }

      const staff = await getStaffAll();
      const me = staff.find((s) => s.id === session.staffId);

      if (action === "out") {
        const r = await punchOut(session.staffId, me?.outTime ?? "");
        return NextResponse.json({ ok: true, ...r });
      }

      const branch = session.branches[0] || me?.mainBranch || "";
      const r = await punchIn(session.staffId, branch, me?.baseTime ?? "");
      return NextResponse.json({ ok: true, ...r });
    }

    if (action === "patch") {
      const ab = await abilitiesFor(session.roleCode);
      if (!ab.get("근태")?.update) {
        return NextResponse.json({ error: "근태를 고칠 권한이 없습니다." }, { status: 403 });
      }

      const { 사번, 날짜, changes } = body;
      if (!사번 || !날짜) {
        return NextResponse.json({ error: "직원과 날짜가 필요합니다." }, { status: 400 });
      }

      // 자기 지점 직원만 고칠 수 있게 막는다
      const [staff, branchMap] = await Promise.all([getStaffAll(), getStaffBranches()]);
      const target = staff.find((s) => s.id === 사번);
      if (!target) return NextResponse.json({ error: "없는 직원입니다." }, { status: 400 });

      const list = branchMap.get(사번) ?? [];
      const where = [...list, target.mainBranch].filter(Boolean);
      if (session.scope !== "전체" && !where.some((b) => session.branches.includes(b))) {
        return NextResponse.json({ error: "담당 지점 직원만 고칠 수 있습니다." }, { status: 403 });
      }

      await patchAttendance(
        { 사번, 날짜, 지점코드: where[0] ?? "" },
        changes ?? {},
        session.staffId
      );
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "알 수 없는 요청입니다." }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "처리하지 못했습니다." }, { status: 500 });
  }
}
