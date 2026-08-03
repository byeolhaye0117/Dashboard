/**
 * 회원 화면
 *
 * 시트 탭이나 칸이 아직 준비 안 됐을 수 있으므로, 실패해도 화면 전체가
 * 깨지지 않고 무엇이 문제인지 한국어로 보이게 한다.
 */
import { redirect } from "next/navigation";
import { readSession } from "@/lib/session";
import { visibleMenus, abilitiesFor } from "@/lib/menu";
import { getBranches, getAllOptions, getStaffNames, getStaffAll, getProducts } from "@/lib/data";
import { listMembers, listTickets } from "@/lib/members";
import { readProduct } from "@/lib/productMeta";
import { listConsultations } from "@/lib/consultations";
import Shell from "../Shell";
import Client from "./Client";

export const dynamic = "force-dynamic";

export default async function MembersPage() {
  const session = await readSession();
  if (!session) redirect("/");

  const ab = await abilitiesFor(session.roleCode);
  const mine = ab.get("회원");
  if (!mine?.view) redirect("/dashboard");

  const [menus, branches, options, staffNames, staff, products] = await Promise.all([
    visibleMenus(session),
    getBranches(),
    getAllOptions(),
    getStaffNames(),
    getStaffAll(),
    getProducts(),
  ]);

  const myBranches =
    session.scope === "전체" ? branches : branches.filter((b) => session.branches.includes(b.code));
  const allowed = new Set(myBranches.map((b) => b.code));

  let members: any[] = [];
  let tickets: any[] = [];
  let waiting: { id: string; 이름: string; 전화번호: string; 지점코드: string }[] = [];
  let problem = "";

  try {
    const [m, t] = await Promise.all([listMembers(), listTickets()]);
    members = m.items.filter((x) => allowed.has(x.지점코드));
    const ids = new Set(members.map((x) => x.id));
    tickets = t.filter((x) => ids.has(x.회원번호));
  } catch (e: any) {
    problem = String(e?.message ?? e);
  }

  // 상담에서 약속까지 잡혔는데 아직 등록 처리가 안 된 사람 — 바로 회원으로 만들 수 있게
  try {
    const { items } = await listConsultations();
    const done = new Set(members.map((m) => m.상담번호).filter(Boolean));
    waiting = items
      .filter((c) => allowed.has(c["지점코드"]))
      .filter((c) => !done.has(c.id))
      .filter((c) => !["등록", "등록완료"].includes((c["진행상태"] ?? "").trim()))
      .filter((c) => (c["약속일시"] ?? "").trim())
      .slice(0, 40)
      .map((c) => ({
        id: c.id,
        이름: c["이름"] ?? "",
        전화번호: c["전화번호"] ?? "",
        지점코드: c["지점코드"] ?? "",
      }));
  } catch {
    waiting = [];
  }

  const trainers = staff
    .filter((s) => s.active)
    .map((s) => ({ id: s.id, name: s.name }))
    .sort((a, b) => a.name.localeCompare(b.name, "ko"));

  return (
    <Shell session={session} menus={menus} branches={myBranches} active="회원" crumb="회원"
           canChangePassword={Boolean(ab.get("직원관리")?.update)}>
      <Client
        items={members}
        tickets={tickets}
        products={products.map(readProduct)}
        waiting={waiting}
        options={options}
        branches={myBranches}
        staffNames={staffNames}
        trainers={trainers}
        currentBranch={session.currentBranch}
        problem={problem}
        can={{ create: mine.create, update: mine.update, remove: mine.remove }}
      />
    </Shell>
  );
}
