/**
 * 매출 화면
 *
 * 결제 탭에 들어 있는 값만 보여준다. 없는 숫자는 만들어내지 않는다.
 */
import { redirect } from "next/navigation";
import { readSession } from "@/lib/session";
import { visibleMenus, abilitiesFor } from "@/lib/menu";
import { getBranches, getStaffNames, getProducts } from "@/lib/data";
import { listPayments, listTickets } from "@/lib/members";
import { getGoals } from "@/lib/sales";
import { listConsultations } from "@/lib/consultations";
import { readProduct } from "@/lib/productMeta";
import Shell from "../Shell";
import Client from "./Client";

export const dynamic = "force-dynamic";

export default async function SalesPage() {
  const session = await readSession();
  if (!session) redirect("/");

  const ab = await abilitiesFor(session.roleCode);
  const mine = ab.get("매출");
  if (!mine?.view) redirect("/dashboard");

  const [menus, branches, staffNames, products, goals] = await Promise.all([
    visibleMenus(session),
    getBranches(),
    getStaffNames(),
    getProducts(),
    getGoals(),
  ]);

  const myBranches =
    session.scope === "전체" ? branches : branches.filter((b) => session.branches.includes(b.code));
  const allowed = new Set(myBranches.map((b) => b.code));

  let payments: any[] = [];
  let tickets: any[] = [];
  let problem = "";
  try {
    const [pay, tick] = await Promise.all([listPayments(), listTickets()]);
    payments = pay.filter((x) => allowed.has(x.지점코드));
    const ids = new Set(payments.map((x) => x.id));
    tickets = tick.filter((t) => ids.has(t.결제번호));
  } catch (e: any) {
    problem = String(e?.message ?? e);
  }

  // 등록실패율은 상담 자료에서 나온다. 못 읽어도 매출 화면은 그대로 보이게 한다
  let leads: any[] = [];
  try {
    const { items } = await listConsultations();
    leads = items
      .filter((c) => allowed.has(c["지점코드"]))
      .map((c) => ({
        지점코드: c["지점코드"] ?? "",
        상담날짜: c["상담날짜"] ?? "",
        약속일시: c["약속일시"] ?? "",
        진행상태: c["진행상태"] ?? "",
      }));
  } catch {
    leads = [];
  }

  return (
    <Shell session={session} menus={menus} branches={myBranches} active="매출" crumb="매출"
           canChangePassword={Boolean(ab.get("직원관리")?.update)}>
      <Client
        payments={payments}
        tickets={tickets}
        products={products.map(readProduct)}
        goals={goals.filter((g) => allowed.has(g.지점코드))}
        leads={leads}
        branches={myBranches.map((b) => ({ code: b.code, name: b.name }))}
        staffNames={staffNames}
        problem={problem}
      />
    </Shell>
  );
}
