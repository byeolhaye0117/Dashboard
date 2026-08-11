/**
 * 공지 · 업무
 *
 * 공지는 카톡방을 대신한다. 카톡은 스크롤에 묻히고 누가 읽었는지 알 수 없다.
 * 업무는 매일 반복되는 일이다 — 지점마다 목록이 다르고 담당자가 정해져 있다.
 */
import { redirect } from "next/navigation";
import { readSession } from "@/lib/session";
import { visibleMenus, abilitiesFor } from "@/lib/menu";
import { getBranches, getStaffAll, getStaffBranches } from "@/lib/data";
import { loadAll, listPlans, SHEET_N, SHEET_NR, SHEET_TASK, SHEET_TASKLOG } from "@/lib/notices";
import { listSheetNames } from "@/lib/sheets";
import Shell from "../Shell";
import Client from "./Client";
import { guard } from "../guard";

export const dynamic = "force-dynamic";

export default async function NoticesPage() {
  return guard("공지 · 업무", body);
}

async function body() {
  const session = await readSession();
  if (!session) redirect("/");

  const ab = await abilitiesFor(session.roleCode);
  const mine = ab.get("공지");
  if (!mine?.view) redirect("/dashboard");

  const [menus, branches, staff, branchMap] = await Promise.all([
    visibleMenus(session),
    getBranches(),
    getStaffAll(),
    getStaffBranches(),
  ]);

  const myBranches =
    session.scope === "전체" ? branches : branches.filter((b) => session.branches.includes(b.code));
  const allowed = new Set(myBranches.map((b) => b.code));

  /** 업무를 맡길 수 있는 사람 — 담당 지점 재직자 */
  const people = staff
    .filter((s) => s.active)
    .filter((s) => {
      if (s.id === session.staffId) return true;
      const where = [...(branchMap.get(s.id) ?? []), s.mainBranch].filter(Boolean);
      return where.some((b) => allowed.has(b));
    })
    .map((s) => ({ id: s.id, name: s.name }));

  // 탭이 아직 없을 수 있다. 없으면 화면에서 만들 수 있게 알려준다
  let notices: any[] = [];
  let reads: any[] = [];
  let tasks: any[] = [];
  let logs: any[] = [];
  let plans: any[] = [];
  let ready = true;
  let missing: string[] = [];
  let problem = "";
  try {
    /*
      탭 하나만 보고 판단하면 안 된다. 넷 중 하나라도 없으면 읽다가 멈춘다.
      「공지」는 예전 시트에 이미 있을 수도 있어서, 그것만 보고 준비됐다고
      넘어가면 나머지를 읽는 순간 오류가 난다.
    */
    const names = await listSheetNames();
    missing = [SHEET_N, SHEET_NR, SHEET_TASK, SHEET_TASKLOG].filter((t) => !names.includes(t));
    ready = missing.length === 0;
    if (ready) {
      const got = await loadAll();
      // 전체 공지(지점 비어 있음)와 내 지점 것만
      notices = got.notices.filter((n) => !n.지점코드 || allowed.has(n.지점코드));
      const seen = new Set(notices.map((n) => n.id));
      reads = got.reads.filter((r) => seen.has(r.공지번호));

      tasks = got.tasks.filter((t) => allowed.has(t.지점코드));
      const tids = new Set(tasks.map((t) => t.id));
      logs = got.logs.filter((l) => tids.has(l.업무번호));

      // 본보기 목록은 있으면 좋은 것이다. 없다고 화면이 안 열려서는 안 된다
      plans = await listPlans().catch(() => []);
    }
  } catch (e: any) {
    problem = String(e?.message ?? e);
  }

  return (
    <Shell session={session} menus={menus} branches={myBranches} active="공지" crumb="공지 · 업무"
           canChangePassword={Boolean(ab.get("직원관리")?.update)}>
      <Client
        me={session.staffId}
        myBranch={session.currentBranch}
        branches={myBranches.map((b) => ({ code: b.code, name: b.name }))}
        people={people}
        notices={notices}
        reads={reads}
        tasks={tasks}
        logs={logs}
        plans={plans}
        can={{ create: Boolean(mine.create), update: Boolean(mine.update), remove: Boolean(mine.remove) }}
        canSetup={Boolean(ab.get("직원관리")?.update)}
        missing={missing}
        ready={ready}
        problem={problem}
      />
    </Shell>
  );
}
