import { NextResponse } from "next/server";
import { readSession } from "@/lib/session";
import { scopeOf } from "@/lib/scope";
import { abilitiesFor } from "@/lib/menu";
import { patchConsultation, listConsultations, ensureLinkColumns } from "@/lib/consultations";
import { stageOf } from "@/lib/stage";
import { enrollFromConsultation, unenrollFromConsultation } from "@/lib/members";

export const dynamic = "force-dynamic";

/** 고칠 수 있는 칸만 허용한다 */
const ALLOWED = new Set([
  "이름", "전화번호", "상담날짜", "성별", "나이대",
  "문의유형", "문의내용", "문의채널", "방문경로",
  "진행상태", "다음연락예정일", "미등록사유", "약속일시",
  "상담자사번", "메모", "전환회원번호",
]);

export async function POST(req: Request) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const reach = await scopeOf(session);

  const ab = (await abilitiesFor(session.roleCode)).get("상담");
  if (!ab?.update) {
    return NextResponse.json({ error: "상담을 고칠 권한이 없습니다." }, { status: 403 });
  }

  try {
    const { id, changes } = await req.json();
    if (!id) return NextResponse.json({ error: "대상을 찾지 못했습니다." }, { status: 400 });

    const { items } = await listConsultations();
    const target = items.find((i) => i.id === id);
    if (!target) return NextResponse.json({ error: "해당 상담이 없습니다." }, { status: 404 });

    // 볼 수 있는 지점인지, 담당건만 보는 직급이면 내 건인지 다시 확인한다
    const branchOk = reach.all || reach.codes.includes(target["지점코드"]);
    const mineOk =
      !(ab.condition ?? "").includes("담당") ||
      target["상담자사번"] === session.staffId ||
      target["접수자사번"] === session.staffId;
    if (!branchOk || !mineOk) {
      return NextResponse.json({ error: "이 상담을 고칠 권한이 없습니다." }, { status: 403 });
    }

    const safe: Record<string, string> = {};
    Object.entries(changes ?? {}).forEach(([k, v]) => {
      if (ALLOWED.has(k)) safe[k] = String(v ?? "");
    });

    /*
     * 등록으로 바뀌면 회원 목록에 올린다
     *
     * 지금까지는 상담에서 「등록」으로 바꿔도 회원 화면에는 아무 일도 없어서,
     * 같은 사람을 한 번 더 손으로 넣어야 했다. 그러다 빠뜨리면 등록으로 잡힌
     * 상담 수와 회원 수가 어긋난다.
     *
     * 같은 사람인지는 전화번호로 본다. 이미 있으면 새로 만들지 않고 잇는다.
     * 이미 이어 둔 회원번호가 있으면 아무것도 하지 않는다 —
     * 등록을 껐다 켰다 해도 회원이 늘어나면 안 된다.
     */
    let 회원: { 회원번호: string; 새로: boolean; 이름: string } | null = null;
    const 전 = stageOf(target);
    const 후 = safe["진행상태"] ? stageOf({ ...target, ...safe }) : 전;
    /* 이어 둔 자국을 남길 칸이 시트에 있는지 먼저 본다. 없으면 만든다 —
       없는 칸에 적으면 조용히 사라지고, 나중에 되돌릴 때 아무 일도 안 일어난다 */
    if (safe["진행상태"]) await ensureLinkColumns();

    if (후 === "등록" && !(target["전환회원번호"] ?? "").trim()) {
      const merged = { ...target, ...safe };
      회원 = await enrollFromConsultation(
        {
          상담번호: id,
          이름: merged["이름"] ?? "",
          전화번호: merged["전화번호"] ?? "",
          지점코드: merged["지점코드"] ?? "",
          성별: merged["성별"],
          나이대: merged["나이대"],
          담당직원사번: merged["상담자사번"],
          문의채널: merged["문의채널"] || merged["방문경로"],
        },
        session.staffId
      );
      safe["전환회원번호"] = 회원.회원번호;
    }

    /*
     * 등록이 아닌 상태면 회원 목록에서 내린다
     *
     * 처음에는 「한때 등록이었던 흔적」이 있을 때만 내렸다. 그런데 그 흔적을
     * 적는 칸(전환회원번호 · 등록여부)이 시트에 아예 없었다. 없는 칸에 적으면
     * 조용히 사라지니 흔적이 하나도 안 남았고, 그래서 영영 안 걸렸다.
     *
     * 흔적을 조건으로 걸지 않는다. 등록이 아니면 내리는 쪽을 본다.
     * 무엇을 내릴지 고르는 판단과 지켜야 할 선은 전부 members.ts 에 있다 —
     * 짐작으로 찾은 것은 이용권도 결제도 없을 때만 실제로 내린다.
     */
    let 내림: Awaited<ReturnType<typeof unenrollFromConsultation>> = null;
    /* 진행 상태를 실제로 저장할 때만 본다. 이름이나 메모만 고칠 때까지
       회원 목록을 뒤지면, 손댈 생각도 없던 회원이 내려갈 수 있다 */
    if (후 !== "등록" && safe["진행상태"]) {
      내림 = await unenrollFromConsultation(
        id,
        (target["전환회원번호"] ?? "").trim(),
        (target["전화번호"] ?? "").trim(),
        session.staffId
      );
      /* 정말로 내렸을 때만 이어 둔 자국을 지운다. 남겨 뒀으면 자국도 남겨야
         다시 등록으로 바꿀 때 같은 사람을 또 만들지 않는다 */
      if (내림?.지움) safe["전환회원번호"] = "";
    }

    await patchConsultation(id, safe, session.staffId);
    return NextResponse.json({ ok: true, 회원, 내림 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "저장하지 못했습니다." }, { status: 500 });
  }
}
