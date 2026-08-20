/**
 * 매출 화면
 *
 * 결제 탭에 들어 있는 값만 보여준다. 없는 숫자는 만들어내지 않는다.
 */
import { redirect } from "next/navigation";
import { readSession } from "@/lib/session";
import { myBranchesOf, viewBranches } from "@/lib/scope";
import { visibleMenus, abilitiesFor } from "@/lib/menu";
import { getBranches, getStaffNames, getProducts, getAllOptions } from "@/lib/data";
import { listPayments, listTickets, listMembers, SHEET_P } from "@/lib/members";
import { REFUND_COLUMNS } from "@/lib/refund";
import { readSheet } from "@/lib/sheets";
import { withSaleTypes } from "@/lib/options";
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
  /* 머리 위에서 고른 지점만 본다. 「전 지점」을 고르시면 볼 수 있는 곳 전부다 —
     지점을 골라 놓고도 다른 지점 것이 같이 뜨면 화면이 두 가지로 말하게 된다 */
  const allowed = await viewBranches(session, new Set(myBranches.map((b) => b.code)));

  let payments: any[] = [];
  let tickets: any[] = [];
  let problem = "";
  try {
    const [pay, tick] = await Promise.all([listPayments(), listTickets()]);
    payments = pay.filter((x) => allowed.has(x.지점코드));
    /*
     * 이용권을 결제번호로만 걸러내던 것을 그만둔다
     *
     * 이용권 시트에 「결제번호」 칸이 없던 동안 판 줄은 자국이 없다. 그것만
     * 보고 걸러내면 그 결제는 딸린 상품이 하나도 없는 것이 되어 「기타」로
     * 몰린다 — 실제로 회원권 13만원이 통째로 기타로 잡혔다.
     *
     * 지점 안의 이용권을 다 넘긴다. 어느 결제에 붙는지는 화면에서 잇는다.
     * 이 회원이 전에 무엇을 끊었는지도 봐야 신규와 재등록을 가를 수 있다.
     */
    tickets = tick.filter((t) => allowed.has(t.지점코드));
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
  /*
   * 어떤 분들이 등록하셨나
   *
   * 매출은 「얼마」만 말한다. 「누가」를 같이 봐야 다음 달에 어디에 힘을 쓸지
   * 정할 수 있다 — 20대 여성이 몰리는데 광고는 40대 남성에게 나가고 있으면
   * 그건 숫자를 보고도 모르는 일이다.
   */
  /*
   * 고를 수 있게 정해 둔 값은 아무도 안 고른 것까지 다 세운다
   *
   * 이 달에 20대만 오셨다고 30대 줄이 사라지면, 다음 달에 30대가 한 분
   * 오셨을 때 줄이 새로 생긴다. 줄이 늘었다 줄었다 하면 달끼리 견줄 수가
   * 없다 — 0명도 0명이라고 적혀 있어야 비교가 된다.
   */
  let options: Record<string, string[]> = {};
  try {
    /* 시트가 한 번도 본 적 없는 매출 유형(「PT」 같은 것)을 뒤에 붙인다.
       안 붙이면 결제 고치기의 매출 유형에서 그 값을 고를 수가 없다 */
    options = await withSaleTypes(await getAllOptions());
  } catch {
    options = {};
  }

  let people: any[] = [];
  try {
    const { items } = await listMembers();
    items.forEach((m) => (memberNames[m.id] = m.이름));
    people = items
      .filter((m) => allowed.has(m.지점코드))
      .filter((m) => (m.회원상태 || "유효") !== "탈퇴")
      .map((m) => ({
        지점코드: m.지점코드,
        가입일: (m.가입일 ?? "").slice(0, 10),
        성별: (m.성별 ?? "").trim(),
        나이대: (m.나이대 ?? "").trim(),
        거주동네: (m.거주동네 ?? "").trim(),
        직업: (m.직업 ?? "").trim(),
        방문경로: (m.방문경로 ?? "").trim(),
      }));
  } catch {
    memberNames = {};
    people = [];
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
        currentBranch={session.currentBranch}
        staffNames={staffNames}
        memberNames={memberNames}
        people={people}
        options={options}
        missingRefund={missingRefund}
        canSetup={Boolean(ab.get("직원관리")?.update)}
        canWipePay={Boolean(ab.get("회원")?.remove)}
        canEditPay={Boolean(ab.get("회원")?.update)}
        problem={problem}
      />
    </Shell>
  );
}
