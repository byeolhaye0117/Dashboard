/**
 * 권한 설정
 *
 * 직급마다 어떤 메뉴를 보고, 등록·수정·삭제할 수 있는지 정한다.
 * 지금까지는 이걸 바꾸려면 구글 시트를 직접 열어야 했다.
 */
import { redirect } from "next/navigation";
import { readSession } from "@/lib/session";
import { myBranchesOf } from "@/lib/scope";
import { visibleMenus, abilitiesFor, MENUS } from "@/lib/menu";
import { getBranches, getRoles, getAllRoles, getPermissions, getStaffAll } from "@/lib/data";
import Shell from "../Shell";
import Client from "./Client";
import { guard } from "../guard";

export const dynamic = "force-dynamic";

export default async function PermissionsPage() {
  return guard("권한 설정", body);
}

async function body() {
  const session = await readSession();
  if (!session) redirect("/");

  const ab = await abilitiesFor(session.roleCode);
  if (!ab.get("권한설정")?.view) redirect("/dashboard");

  const [menus, branches, roles, allRoles, perms, staff] = await Promise.all([
    visibleMenus(session),
    getBranches(),
    getRoles(),
    /* 감춰 둔 직급까지 — 다시 꺼내려면 목록에 보여야 한다 */
    getAllRoles(),
    getPermissions(),
    getStaffAll(),
  ]);

  /* 지점 범위는 화면을 열 때마다 다시 잰다 — 권한과 같은 규칙이다.
     로그인할 때 굳혀 둔 쿠키만 믿으면, 범위를 좁혀도 다시 로그인할 때까지 넓다 */
  const myBranches = await myBranchesOf(session, branches);

  /** 직급마다 몇 명이 쓰고 있는지 — 권한을 바꿀 때 영향 범위를 알아야 한다 */
  const headcount: Record<string, number> = {};
  staff.filter((s) => s.active).forEach((s) => {
    headcount[s.roleCode] = (headcount[s.roleCode] ?? 0) + 1;
  });

  return (
    <Shell session={session} menus={menus} branches={myBranches} active="권한설정" crumb="권한 설정"
           canChangePassword={Boolean(ab.get("직원관리")?.update)}>
      <Client
        myRole={session.roleCode}
        roles={roles.map((r) => ({ code: r.code, name: r.name, scope: r.scope }))}
        allRoles={allRoles.map((r) => ({ code: r.code, name: r.name, scope: r.scope, use: r.use }))}
        menus={MENUS.map((m) => ({ key: m.key, label: m.label, group: m.group }))}
        perms={perms.map((p) => ({
          roleCode: p.roleCode, menu: p.menu,
          view: p.view, create: p.create, update: p.update, remove: p.remove,
        }))}
        headcount={headcount}
        canEdit={Boolean(ab.get("권한설정")?.update)}
      />
    </Shell>
  );
}
