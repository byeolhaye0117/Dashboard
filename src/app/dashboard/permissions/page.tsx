/**
 * 권한 설정
 *
 * 직급마다 어떤 메뉴를 보고, 등록·수정·삭제할 수 있는지 정한다.
 * 지금까지는 이걸 바꾸려면 구글 시트를 직접 열어야 했다.
 */
import { redirect } from "next/navigation";
import { readSession } from "@/lib/session";
import { visibleMenus, abilitiesFor, MENUS } from "@/lib/menu";
import { getBranches, getRoles, getPermissions, getStaffAll } from "@/lib/data";
import Shell from "../Shell";
import Client from "./Client";

export const dynamic = "force-dynamic";

export default async function PermissionsPage() {
  const session = await readSession();
  if (!session) redirect("/");

  const ab = await abilitiesFor(session.roleCode);
  if (!ab.get("권한설정")?.view) redirect("/dashboard");

  const [menus, branches, roles, perms, staff] = await Promise.all([
    visibleMenus(session),
    getBranches(),
    getRoles(),
    getPermissions(),
    getStaffAll(),
  ]);

  const myBranches =
    session.scope === "전체" ? branches : branches.filter((b) => session.branches.includes(b.code));

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
