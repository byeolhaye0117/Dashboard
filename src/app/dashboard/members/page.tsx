/**
 * 회원 화면
 *
 * 시트 탭이나 칸이 아직 준비 안 됐을 수 있으므로, 실패해도 화면 전체가
 * 깨지지 않고 무엇이 문제인지 한국어로 보이게 한다.
 */
import { redirect } from "next/navigation";
import { readSession } from "@/lib/session";
import { myBranchesOf, viewBranches } from "@/lib/scope";
import { visibleMenus, abilitiesFor } from "@/lib/menu";
import {
  getBranches, getAllOptions, getStaffNames, getStaffAll, getProducts, getProductBranches,
  getStaffBranches,
} from "@/lib/data";
import { listMembers, listTickets, listPayments, listTicketServices } from "@/lib/members";
import { readProduct } from "@/lib/productMeta";
import { listConsultations } from "@/lib/consultations";
import { listLessons } from "@/lib/lessons";
import { withSaleTypes } from "@/lib/options";
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
  /* 머리 위에서 고른 지점만 본다. 「전 지점」을 고르시면 볼 수 있는 곳 전부다 —
     지점을 골라 놓고도 다른 지점 것이 같이 뜨면 화면이 두 가지로 말하게 된다 */
  const allowed = await viewBranches(session, new Set(myBranches.map((b) => b.code)));

  let members: any[] = [];
  let tickets: any[] = [];
  let payments: any[] = [];
  let waiting: {
    id: string; 이름: string; 전화번호: string; 지점코드: string; 등록됨: boolean;
  }[] = [];
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

    /*
     * 상담에서 넘어올 사람 — 회원 줄이 없는 상담을 다 보여준다
     *
     * ── 소리 없이 사라지던 자리 ─────────────────────────────
     * 예전에는 진행상태가 「등록」인 상담을 이 목록에서 뺐다. 이미 회원이
     * 됐을 테니 뺀 것인데, 회원 만들기가 한 번 실패하면 그 사람은 어디에도
     * 안 남는다 — 회원 목록에는 줄이 없고, 여기서는 「등록이니까」 빠진다.
     * 두정점에서 접수하고 등록을 눌렀는데 회원 탭에 안 뜬 것이 그것이다.
     *
     * 그래서 상태로 거르지 않는다. 「회원 줄이 있는가」만 본다. 상담번호로
     * 잇고, 옛 줄은 전화번호로도 본다. 등록인데 줄이 없으면 그것이야말로
     * 제일 먼저 보여야 할 사람이다.
     */
    const done = new Set(members.map((m) => m.상담번호).filter(Boolean));
    const donePhone = new Set(members.map((m) => phone(m.전화번호)).filter(Boolean));
    waiting = items
      .filter((c) => allowed.has(c["지점코드"]))
      .filter((c) => !done.has(c.id) && !donePhone.has(phone(c["전화번호"])))
      /* 약속도 없고 결론도 안 난 건은 아직 회원 이야기가 아니다 */
      .filter((c) => (c["약속일시"] ?? "").trim() || stageNow(c, today()) === "등록")
      .slice(0, 40)
      .map((c) => ({
        id: c.id,
        이름: c["이름"] ?? "",
        전화번호: c["전화번호"] ?? "",
        지점코드: c["지점코드"] ?? "",
        /* 등록으로 눌렀는데 회원 줄이 없다 — 뭔가 잘못된 것이라 따로 알린다 */
        등록됨: stageNow(c, today()) === "등록",
      }));
  } catch {
    waiting = [];
  }

  /*
   * 회원별 담당 트레이너를 수업에서 되짚는다
   *
   * PT 를 팔 때 트레이너를 안 고르고 나중에 정하는 일이 흔하다. 수업을 잡을
   * 때 이용권에 채워 넣게 해 뒀지만 그것은 앞으로 잡는 수업 얘기고, 이미
   * 잡아 둔 수업은 그대로다 — 매주 PT 를 하고 있는데도 목록에는 「-」였다.
   *
   * 저장이 한 번 성공했는지에 기대지 않는다. 화면을 열 때마다 수업을 보고
   * 판단하면 언제 잡은 수업이든 결과가 늘 같다. 「상담이 등록이 아닌 사람은
   * 회원 목록에 두지 않는다」를 세 번 헛짚고 배운 것과 같은 규칙이다.
   *
   * 수업 탭이 아직 없을 수 있다. 없으면 그냥 빈 손이다.
   */
  let lessonTrainer: Record<string, string> = {};
  try {
    const { lessons, joins } = await listLessons();
    const byId = new Map(lessons.map((l) => [l.id, l]));
    const when = (수업번호: string) => {
      const l = byId.get(수업번호);
      return (l?.날짜 ?? "") + (l?.시작시각 ?? "");
    };
    /* 늦은 수업이 먼저 오게 — 가장 최근에 맡은 사람이 지금 담당이다 */
    joins
      .slice()
      .sort((a, b) => when(b.수업번호).localeCompare(when(a.수업번호)))
      .forEach((j) => {
        if (!j.회원번호 || lessonTrainer[j.회원번호]) return;
        const l = byId.get(j.수업번호);
        if (!l || l.진행상태 === "취소" || !l.트레이너사번) return;
        lessonTrainer[j.회원번호] = l.트레이너사번;
      });
  } catch {
    lessonTrainer = {};
  }

  /* 시트가 한 번도 본 적 없는 매출 유형(「PT」 같은 것)을 뒤에 붙인다 */
  const options2 = await withSaleTypes(options);

  /*
   * 지금 보고 있는 지점 사람만 고른다
   *
   * 전 지점을 보는 계정이면 목록에 스무 명이 넘게 뜬다. 쌍용점에서 파는데
   * 두정점 트레이너가 같이 뜨면 잘못 고르기 쉽고, 실제로 고를 일도 없다.
   * 소속 지점이거나 담당 지점에 그 지점이 들어 있으면 이 지점 사람이다.
   *
   * pt 를 같이 보내는 까닭 — 「결제 담당」은 데스크에서 대신 넣어 주는 일이
   * 흔해 전 직원이 후보다.
   * 「담당 트레이너」는 실제로 PT 를 하는 사람만이어야 한다 — 직원 관리에서
   * 「트레이너」로 체크한 사람. 두 칸에 같은 목록을 넣었더니 수업을 안 하는
   * 데스크 직원까지 트레이너 후보로 떴다. 목록은 한 벌만 보내고, 화면에서
   * 트레이너 칸만 걸러 쓴다.
   */
  const branchMap = await getStaffBranches();
  /* 「전 지점」을 보고 계시면 볼 수 있는 지점 사람을 다 띄운다 */
  const here = session.currentBranch;
  const 이지점 = (id: string, main: string) =>
    here
      ? (branchMap.get(id) ?? []).includes(here) || main === here
      : [...(branchMap.get(id) ?? []), main].some((b) => b && allowed.has(b));
  const trainers = staff
    .filter((s) => s.active)
    .filter((s) => 이지점(s.id, s.mainBranch))
    .map((s) => ({ id: s.id, name: s.name, pt: Boolean(s.trainer) }))
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
        options={options2}
        branches={myBranches}
        staffNames={staffNames}
        lessonTrainer={lessonTrainer}
        trainers={trainers}
        currentBranch={session.currentBranch}
        problem={problem}
        can={{ create: mine.create, update: mine.update, remove: mine.remove }}
      />
    </Shell>
  );
}
