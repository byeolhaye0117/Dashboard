/**
 * 매출 화면
 *
 * 결제 탭에 들어 있는 값만 보여준다. 없는 숫자는 만들어내지 않는다.
 */
import { redirect } from "next/navigation";
import { readSession } from "@/lib/session";
import { myBranchesOf } from "@/lib/scope";
import { visibleMenus, abilitiesFor } from "@/lib/menu";
import { getBranches, getStaffNames, getProducts } from "@/lib/data";
import { listPayments, listTickets, listMembers, SHEET_P } from "@/lib/members";
import { REFUND_COLUMNS } from "@/lib/refund";
import { readSheet } from "@/lib/sheets";
import { getGoals } from "@/lib/sales";
import { listConsultations } from "@/lib/consultations";
import { readProduct } from "@/lib/productMeta";
import Shell from "../Shell";
import Client from "./Client";
import { guard } from "../guard";

export const dynamic = "force-dynamic";

export default async function SalesPage() {
  return guard("매출", body);
}

async function body() {
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

  /* 지점 범위는 화면을 열 때마다 다시 잰다 — 권한과 같은 규칙이다.
     로그인할 때 굳혀 둔 쿠키만 믿으면, 범위를 좁혀도 다시 로그인할 때까지 넓다 */
  const myBranches = await myBranchesOf(session, branches);
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

  // 환불 칸이 시트에 있는지 본다. 없으면 화면에서 만들 수 있게 알려준다
  let missingRefund: string[] = [];
  try {
    const { headers } = await readSheet(SHEET_P);
    const have = new Set(headers.map((h) => h.replace(/\s/g, "")));
    missingRefund = REFUND_COLUMNS.filter((c) => !have.has(c));
  } catch {
    missingRefund = [];
  }

  // 미수금 명단에 "누가"를 적으려면 회원 이름이 있어야 한다.
  // 이름을 못 읽어도 금액은 보여야 하므로 실패해도 넘어간다.
  let memberNames: Record<string, string> = {};
  try {
    const { items } = await listMembers();
    items.forEach((m) => (memberNames[m.id] = m.이름));
  } catch {
    memberNames = {};
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
        상담자사번: c["상담자사번"] ?? "",
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
        memberNames={memberNames}
        missingRefund={missingRefund}
        canSetup={Boolean(ab.get("직원관리")?.update)}
        canWipePay={Boolean(ab.get("회원")?.remove)}
        problem={problem}
      />
    </Shell>
  );
}
