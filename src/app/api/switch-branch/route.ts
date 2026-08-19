import { NextResponse } from "next/server";
import { readSession, createSession } from "@/lib/session";
import { scopeOf } from "@/lib/scope";

export const dynamic = "force-dynamic";

/** 상단 지점 선택 — 볼 수 있는 지점인지 서버에서 다시 확인한다 */
export async function POST(req: Request) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const reach = await scopeOf(session);

  const { branch } = await req.json();

  /* 빈 값은 「전 지점」이다. 여러 지점을 보는 사람만 고를 수 있다 —
     한 지점만 보는 사람에게 전 지점은 제 지점과 같은 말이라 둘 이유가 없다 */
  if (branch) {
    const allowed = reach.all || reach.codes.includes(branch);
    if (!allowed) {
      return NextResponse.json({ error: "이 지점을 볼 권한이 없습니다." }, { status: 403 });
    }
  } else if (!reach.all && reach.codes.length < 2) {
    return NextResponse.json({ error: "지점을 선택해주세요." }, { status: 400 });
  }

  await createSession({ ...session, currentBranch: branch });
  return NextResponse.json({ ok: true });
}
