/**
 * 회원 화면
 *
 * 시트 탭이나 칸이 아직 준비 안 됐을 수 있으므로, 실패해도 화면 전체가
 * 깨지지 않고 무엇이 문제인지 한국어로 보이게 한다.
 */
import { redirect } from "next/navigation";
import { readSession } from "@/lib/session";
import { myBranchesOf } from "@/lib/scope";
import { visibleMenus, abilitiesFor } from "@/lib/menu";
import {
  getBranches, getAllOptions, getStaffNames, getStaffAll, getProducts, getProductBranches,
} from "@/lib/data";
import { listMembers, listTickets, listPayments, listTicketServices } from "@/lib/members";
import { readProduct } from "@/lib/productMeta";
import { listConsultations } from "@/lib/consultations";
import { stageNow } from "@/lib/stage";
import { today } from "@/lib/time";
import { listTransfers } from "@/lib/members";
import Shell from "../Shell";
import Client from "./Client";
import { guard } from "../guard";

export const dynamic = "force-dynamic";

export default async function MembersPage() {
  return guard("회원", body);
}

async function body() {
  const session = await readSession();
  if (!session) redirect("/");

  const ab = await abilitiesFor(session.roleCode);
  const mine = ab.get("회원");
  if (!mine?.view) redirect("/dashboard");

  const [menus, branches, options, staffNames, staff, products, productBranches] =
    await Promise.all([
      visibleMenus(session),
      getBranches(),
      getAllOptions(),
      getStaffNames(),
      getStaffAll(),
      getProducts(),
      getProductBranches(),
    ]);

  /* 지점 범위는 화면을 열 때마다 다시 잰다 — 권한과 같은 규칙이다.
     로그인할 때 굳혀 둔 쿠키만 믿으면, 범위를 좁혀도 다시 로그인할 때까지 넓다 */
  const myBranches = await myBranchesOf(session, branches);
  const allowed = new Set(myBranches.map((b) => b.code));

  let members: any[] = [];
  let tickets: any[] = [];
  let payments: any[] = [];
  let waiting: { id: string; 이름: string; 전화번호: string; 지점코드: string }[] = [];
  let problem = "";

  try {
    const [m, t, pay] = await Promise.all([listMembers(), listTickets(), listPayments()]);
    members = m.items.filter((x) => allowed.has(x.지점코드));
    const ids = new Set(members.map((x) => x.id));
    tickets = t.filter((x) => ids.has(x.회원번호));
    payments = pay.filter((x) => ids.has(x.회원번호));
  } catch (e: any) {
    problem = String(e?.message ?? e);
  }

  // 이용권에 얹어준 서비스·옵션 — 탭이 없어도 나머지 화면은 그대로 보이게 한다
  let extras: any[] = [];
  try {
    const tids = new Set(tickets.map((t) => t.id));
    extras = (await listTicketServices()).filter((s) => tids.has(s.이용권번호));
  } catch {
    extras = [];
  }

  // 이용권이 누구에게서 넘어왔는지 — 탭이 없으면 그냥 빈 손이다
  let transfers: any[] = [];
  try {
    transfers = await listTransfers();
  } catch {
    transfers = [];
  }

  /*
   * 상담이 등록이 아닌 사람은 회원 목록에 두지 않는다
   *
   * ── 세 번 못 고친 자리다 ─────────────────────────────────────
   * 상담을 「등록」에서 되돌리면 회원 줄을 지우는 코드를 넣었는데, 시트에
   * 이어 둔 자국을 적을 칸이 없어 지울 대상을 못 찾았다. 칸을 만들고 찾는
   * 길을 넓혀도 그때그때 저장이 성공해야만 맞아떨어졌다.
   *
   * 그래서 지우는 데 기대지 않는다. 화면을 열 때마다 상담을 보고 판단한다.
   * 상담이 등록이 아니면 회원 목록에 안 보인다 — 지우기가 한 번 실패해도,
   * 옛날에 자국 없이 만들어진 줄이 남아 있어도 결과는 늘 같다.
   *
   * 돈이 얽힌 줄은 건드리지 않는다. 이용권이나 결제가 하나라도 있으면
   * 그건 실제로 등록하신 분이고, 상담 상태가 어떻든 회원이다.
   *
   * 숨긴 사람은 숨겼다고 화면에 적는다. 소리 없이 사라지면 그게 더 무섭다.
   */
  let hidden: { 이름: string; 상태: string }[] = [];

  // 상담에서 약속까지 잡혔는데 아직 등록 처리가 안 된 사람 — 바로 회원으로 만들 수 있게
  try {
    const { items } = await listConsultations();

    const phone = (v: string) => (v ?? "").replace(/\D/g, "");
    const byId = new Map(items.map((c) => [c.id, c]));
    const byPhone = new Map<string, any>();
    items.forEach((c) => {
      const k = phone(c["전화번호"]);
      /* 같은 번호로 상담이 여러 번 있으면 최근 것이 기준이다 */
      if (k && !byPhone.has(k)) byPhone.set(k, c);
    });

    const hasMoney = new Set<string>([
      ...tickets.map((t) => t.회원번호),
      ...payments.map((x) => x.회원번호),
    ]);

    const keep: any[] = [];
    members.forEach((m) => {
      if (hasMoney.has(m.id)) return keep.push(m);
      const c = (m.상담번호 && byId.get(m.상담번호)) || byPhone.get(phone(m.전화번호));
      if (!c) return keep.push(m);
      const st = stageNow(c, today());
      if (st === "등록") return keep.push(m);
      hidden.push({ 이름: m.이름, 상태: st });
    });
    if (hidden.length > 0) {
      members = keep;
      const ids = new Set(members.map((x) => x.id));
      tickets = tickets.filter((x) => ids.has(x.회원번호));
      payments = payments.filter((x) => ids.has(x.회원번호));
    }

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
        payments={payments}
        extras={extras}
        products={products.map(readProduct)}
        productBranches={productBranches}
        waiting={waiting}
        hidden={hidden}
        transfers={transfers}
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
