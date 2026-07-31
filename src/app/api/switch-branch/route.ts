import { NextResponse } from "next/server";
import { readSession, createSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/** 상단 지점 선택 — 볼 수 있는 지점인지 서버에서 다시 확인한다 */
export async function POST(req: Request) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { branch } = await req.json();
  if (!branch) return NextResponse.json({ error: "지점을 선택해주세요." }, { status: 400 });

  const allowed = session.scope === "전체" || session.branches.includes(branch);
  if (!allowed) {
    return NextResponse.json({ error: "이 지점을 볼 권한이 없습니다." }, { status: 403 });
  }

  await createSession({ ...session, currentBranch: branch });
  return NextResponse.json({ ok: true });
}
