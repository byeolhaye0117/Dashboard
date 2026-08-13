/**
 * 근태 화면
 *
 * 직원은 자기 것을 찍고 자기 달치를 본다.
 * 점장·대표는 담당 지점 사람들 것을 같이 보고 고친다.
 */
import { redirect } from "next/navigation";
import { readSession } from "@/lib/session";
import { visibleMenus, abilitiesFor } from "@/lib/menu";
import { getBranches, getStaffAll, getStaffBranches } from "@/lib/data";
import { listAttendance, SHEET_T } from "@/lib/attendance";
import { listSheetNames } from "@/lib/sheets";
import Shell from "../Shell";
import Client from "./Client";
import { guard } from "../guard";

export const dynamic = "force-dynamic";

export default async function AttendancePage() {
  return guard("근태", body);
}

async function body() {
  const session = await readSession();
  if (!session) redirect("/");

  const ab = await abilitiesFor(session.roleCode);
  if (!ab.get("근태")?.view) redirect("/dashboard");

  const [menus, branches, staff, branchMap] = await Promise.all([
    visibleMenus(session),
    getBranches(),
    getStaffAll(),
    getStaffBranches(),
  ]);

  const myBranches =
    session.scope === "전체" ? branches : branches.filter((b) => session.branches.includes(b.code));
  const allowed = new Set(myBranches.map((b) => b.code));

  /**
   * 남의 근태는 고칠 수 있는 사람에게만 보낸다
   *
   * 화면에서 감추는 것만으로는 부족하다. 브라우저로 내려간 값은 개발자도구로
   * 그대로 보인다. 직원 계정에는 자기 것만 실어 보낸다.
   */
  const canEdit = Boolean(ab.get("근태")?.update);

  /** 이 화면에서 볼 수 있는 직원 — 담당 지점 사람만 */
  const people = staff
    .filter((s) => s.active)
    .filter((s) => {
      if (s.id === session.staffId) return true;
      const where = [...(branchMap.get(s.id) ?? []), s.mainBranch].filter(Boolean);
      return where.some((b) => allowed.has(b));
    })
    .filter((s) => canEdit || s.id === session.staffId)
    .map((s) => ({
      id: s.id,
      name: s.name,
      branch: (branchMap.get(s.id) ?? [])[0] || s.mainBranch || "",
      baseTime: s.baseTime,
      outTime: s.outTime,
      restMin: s.restMin,
      restVary: s.restVary,
      workDays: s.workDays,
    }));

  // 근태 탭이 아직 없을 수 있다. 없으면 화면에서 만들 수 있게 알려준다
  let rows: any[] = [];
  let ready = true;
  let problem = "";
  try {
    const names = await listSheetNames();
    ready = names.includes(SHEET_T);
    if (ready) {
      const all = await listAttendance();
      const ids = new Set(people.map((p) => p.id));
      rows = all.filter((r) => ids.has(r.사번));
    }
  } catch (e: any) {
    problem = String(e?.message ?? e);
  }

  return (
    <Shell session={session} menus={menus} branches={myBranches} active="근태" crumb="근태"
           canChangePassword={Boolean(ab.get("직원관리")?.update)}>
      <Client
        me={session.staffId}
        rows={rows}
        people={people}
        branches={myBranches.map((b) => ({ code: b.code, name: b.name }))}
        canEdit={canEdit}
        canSetup={Boolean(ab.get("직원관리")?.update)}
        ready={ready}
        problem={problem}
      />
    </Shell>
  );
}
