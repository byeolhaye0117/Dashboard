/**
 * 상담 화면
 *
 * 볼 수 있는 범위는 서버에서 걸러서 내려보낸다.
 * 브라우저에서 숨기는 방식이 아니라, 아예 보내지 않는 방식이다.
 */
import { redirect } from "next/navigation";
import { readSession } from "@/lib/session";
import { myBranchesOf } from "@/lib/scope";
import { visibleMenus, abilitiesFor } from "@/lib/menu";
import { getBranches, getAllOptions, getStaffNames, getStaffAll } from "@/lib/data";
import { listConsultations, listActivities } from "@/lib/consultations";
import Shell from "../Shell";
import Client from "./Client";
import { guard } from "../guard";

export const dynamic = "force-dynamic";

export default async function ConsultationsPage() {
  return guard("상담", body);
}

async function body() {
  const session = await readSession();
  if (!session) redirect("/");

  const ab = await abilitiesFor(session.roleCode);
  const mine = ab.get("상담");
  if (!mine?.view) redirect("/dashboard");

  const [menus, branches, options, staffNames, staff, { items }, activities] =
    await Promise.all([
      visibleMenus(session),
      getBranches(),
      getAllOptions(),
      getStaffNames(),
      getStaffAll(),
      listConsultations(),
      listActivities(),
    ]);

  /* 지점 범위는 화면을 열 때마다 다시 잰다 — 권한과 같은 규칙이다.
     로그인할 때 굳혀 둔 쿠키만 믿으면, 범위를 좁혀도 다시 로그인할 때까지 넓다 */
  const myBranches = await myBranchesOf(session, branches);
  const allowed = new Set(myBranches.map((b) => b.code));

  // 1) 볼 수 있는 지점만
  let visible = items.filter((c) => allowed.has(c["지점코드"]));
  // 2) 담당건만 볼 수 있는 직급이면 한 번 더 거른다
  const onlyMine = (mine.condition ?? "").includes("담당");
  if (onlyMine) {
    visible = visible.filter(
      (c) => c["상담자사번"] === session.staffId || c["접수자사번"] === session.staffId
    );
  }

  const ids = new Set(visible.map((c) => c.id));
  const acts = activities.filter((a) => ids.has(a["상담번호"]));

  const counselors = staff
    .filter((s) => s.active)
    .map((s) => ({ id: s.id, name: s.name }))
    .sort((a, b) => a.name.localeCompare(b.name, "ko"));

  return (
    <Shell session={session} menus={menus} branches={myBranches} active="상담" crumb="상담"
           canChangePassword={Boolean(ab.get("직원관리")?.update)}>
      <Client
        items={visible}
        activities={acts}
        options={options}
        branches={myBranches}
        staffNames={staffNames}
        counselors={counselors}
        currentBranch={session.currentBranch}
        me={session.staffId}
        onlyMine={onlyMine}
        can={{ create: mine.create, update: mine.update, remove: mine.remove }}
      />
    </Shell>
  );
}
