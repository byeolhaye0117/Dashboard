/**
 * 직원 관리 화면
 *
 * 비밀번호는 시트에 암호화된 형태로만 있고, 이 화면으로 내려오지 않는다.
 * 내려오는 것은 "정해져 있는가" 뿐이다.
 */
import { redirect } from "next/navigation";
import { readSession } from "@/lib/session";
import { myBranchesOf, scopeOf, viewBranches } from "@/lib/scope";
import { visibleMenus, abilitiesFor } from "@/lib/menu";
import { getBranches, getRoles, getAllRoles } from "@/lib/data";
import { listStaffAdmin } from "@/lib/staffAdmin";
import Shell from "../Shell";
import Client from "./Client";
import { guard } from "../guard";

export const dynamic = "force-dynamic";

export default async function StaffPage() {
  return guard("직원 관리", body);
}

async function body() {
  const session = await readSession();
  if (!session) redirect("/");

  const ab = await abilitiesFor(session.roleCode);
  const mine = ab.get("직원관리");
  if (!mine?.view) redirect("/dashboard");

  const [menus, branches, roles, allRoles, { items }] = await Promise.all([
    visibleMenus(session),
    getBranches(),
    getRoles(),
    /* 감춰 둔 직급까지 — 직급을 고치는 창에서 다시 꺼낼 수 있어야 한다 */
    getAllRoles(),
    listStaffAdmin(),
  ]);

  /* 지점 범위는 화면을 열 때마다 다시 잰다 — 권한과 같은 규칙이다.
     로그인할 때 굳혀 둔 쿠키만 믿으면, 범위를 좁혀도 다시 로그인할 때까지 넓다 */
  const myBranches = await myBranchesOf(session, branches);

  // 담당 지점만 보는 직급이면 그 지점 사람만 보인다
  const reach = await scopeOf(session);
  /* 머리 위에서 고른 지점만 본다. 「전 지점」을 고르시면 볼 수 있는 곳 전부다 —
     지점을 골라 놓고도 다른 지점 것이 같이 뜨면 화면이 두 가지로 말하게 된다 */
  const allowed = await viewBranches(session, new Set(myBranches.map((b) => b.code)));
  const visible = reach.all
    ? items
    : items.filter(
        (s) => allowed.has(s.mainBranch) || s.branches.some((c) => allowed.has(c))
      );

  return (
    <Shell session={session} menus={menus} branches={myBranches} active="직원관리" crumb="직원 관리"
           canChangePassword={Boolean(mine.update)}>
      <Client
        items={visible}
        roles={roles.map((r) => ({ code: r.code, name: r.name }))}
        allRoles={allRoles.map((r) => ({ code: r.code, name: r.name, use: r.use }))}
        /* 직급을 고치는 것은 곧 권한을 나누는 일이라 같은 자격을 본다 */
        canEditRoles={Boolean(ab.get("권한설정")?.update)}
        branches={branches.map((b) => ({ code: b.code, name: b.name }))}
        me={session.staffId}
        myRole={session.roleCode}
        can={{ create: mine.create, update: mine.update, remove: mine.remove }}
      />
    </Shell>
  );
}
