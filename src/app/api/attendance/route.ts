import { NextResponse } from "next/server";
import { readSession } from "@/lib/session";
import { scopeOf } from "@/lib/scope";
import { abilitiesFor } from "@/lib/menu";
import { getStaffAll, getStaffBranches } from "@/lib/data";
import {
  punchIn, punchOut, breakToggle, patchAttendance, removeAttendance,
} from "@/lib/attendance";

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

  /* 지점 범위도 권한처럼 그때그때 다시 잰다 (lib/scope.ts) */
  const reach = await scopeOf(session);

  try {
    const body = await req.json();
    const action = body.action as string;

    if (action === "in" || action === "out" || action === "break-in" || action === "break-out") {
      const ab = await abilitiesFor(session.roleCode);
      /* 지점 범위도 권한처럼 그때그때 다시 잰다 (lib/scope.ts) */
      const reach = await scopeOf(session);
      if (!ab.get("근태")?.view) {
        return NextResponse.json({ error: "근태를 쓸 수 없는 계정입니다." }, { status: 403 });
      }

      const staff = await getStaffAll();
      const me = staff.find((s) => s.id === session.staffId);

      if (action === "break-in" || action === "break-out") {
        const r = await breakToggle(session.staffId, action === "break-in");
        return NextResponse.json({ ok: true, ...r });
      }

      if (action === "out") {
        const r = await punchOut(session.staffId, me?.outTime ?? "", Number(body.rest) || 0);
        return NextResponse.json({ ok: true, ...r });
      }

      const branch = reach.codes[0] || me?.mainBranch || "";
      const r = await punchIn(session.staffId, branch, me?.baseTime ?? "");
      return NextResponse.json({ ok: true, ...r });
    }

    /* 그날 기록 지우기 — 고치는 것보다 무거운 일이라 권한을 따로 본다 */
    if (action === "del") {
      const ab = await abilitiesFor(session.roleCode);
      if (!ab.get("근태")?.remove) {
        return NextResponse.json({ error: "근태를 지울 권한이 없습니다." }, { status: 403 });
      }

      const { 사번, 날짜, 회차 } = body;
      if (!사번 || !날짜) {
        return NextResponse.json({ error: "직원과 날짜가 필요합니다." }, { status: 400 });
      }

      /* 남의 지점 사람은 못 지운다 — 고치기와 같은 잣대다 */
      const [staff, branchMap] = await Promise.all([getStaffAll(), getStaffBranches()]);
      const target = staff.find((s) => s.id === 사번);
      if (!target) return NextResponse.json({ error: "직원을 찾지 못했습니다." }, { status: 404 });
      if (!reach.all) {
        const where = [...(branchMap.get(사번) ?? []), target.mainBranch].filter(Boolean);
        if (!where.some((b) => reach.codes.includes(b))) {
          return NextResponse.json({ error: "담당 지점 직원만 지울 수 있습니다." }, { status: 403 });
        }
      }

      const n = await removeAttendance(
        { 사번, 날짜, 회차: 회차 === undefined || 회차 === null ? undefined : Number(회차) },
        session.staffId
      );
      return NextResponse.json({ ok: true, count: n });
    }

    if (action === "patch") {
      const ab = await abilitiesFor(session.roleCode);
      if (!ab.get("근태")?.update) {
        return NextResponse.json({ error: "근태를 고칠 권한이 없습니다." }, { status: 403 });
      }

      const { 사번, 날짜, 회차, changes } = body;
      if (!사번 || !날짜) {
        return NextResponse.json({ error: "직원과 날짜가 필요합니다." }, { status: 400 });
      }

      // 자기 지점 직원만 고칠 수 있게 막는다
      const [staff, branchMap] = await Promise.all([getStaffAll(), getStaffBranches()]);
      const target = staff.find((s) => s.id === 사번);
      if (!target) return NextResponse.json({ error: "없는 직원입니다." }, { status: 400 });

      const list = branchMap.get(사번) ?? [];
      const where = [...list, target.mainBranch].filter(Boolean);
      if (!reach.all && !where.some((b) => reach.codes.includes(b))) {
        return NextResponse.json({ error: "담당 지점 직원만 고칠 수 있습니다." }, { status: 403 });
      }

      await patchAttendance(
        { 사번, 날짜, 지점코드: where[0] ?? "", 회차: Number(회차) || 1 },
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
