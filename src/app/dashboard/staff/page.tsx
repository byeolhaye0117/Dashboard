/**
 * 직원 관리 화면
 *
 * 비밀번호는 시트에 암호화된 형태로만 있고, 이 화면으로 내려오지 않는다.
 * 내려오는 것은 "정해져 있는가" 뿐이다.
 */
import { redirect } from "next/navigation";
import { readSession } from "@/lib/session";
import { visibleMenus, abilitiesFor } from "@/lib/menu";
import { getBranches, getRoles } from "@/lib/data";
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

  const [menus, branches, roles, { items }] = await Promise.all([
    visibleMenus(session),
    getBranches(),
    getRoles(),
    listStaffAdmin(),
  ]);

  const myBranches =
    session.scope === "전체" ? branches : branches.filter((b) => session.branches.includes(b.code));

  // 담당 지점만 보는 직급이면 그 지점 사람만 보인다
  const allowed = new Set(myBranches.map((b) => b.code));
  const visible =
    session.scope === "전체"
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
        branches={branches.map((b) => ({ code: b.code, name: b.name }))}
        me={session.staffId}
        myRole={session.roleCode}
        can={{ create: mine.create, update: mine.update, remove: mine.remove }}
      />
    </Shell>
  );
}
