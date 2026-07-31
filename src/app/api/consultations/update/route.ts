import { NextResponse } from "next/server";
import { readSession } from "@/lib/session";
import { abilitiesFor } from "@/lib/menu";
import { patchConsultation, listConsultations } from "@/lib/consultations";

export const dynamic = "force-dynamic";

/** 고칠 수 있는 칸만 허용한다 */
const ALLOWED = new Set([
  "진행상태", "다음연락예정일", "미등록사유", "약속일시",
  "상담자사번", "메모", "전환회원번호",
]);

export async function POST(req: Request) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

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
    const branchOk = session.scope === "전체" || session.branches.includes(target["지점코드"]);
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

    await patchConsultation(id, safe, session.staffId);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "저장하지 못했습니다." }, { status: 500 });
  }
}
