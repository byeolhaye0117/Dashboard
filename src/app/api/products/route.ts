import { NextResponse } from "next/server";
import { readSession } from "@/lib/session";
import { abilitiesFor } from "@/lib/menu";
import { setProductKind } from "@/lib/members";

export const dynamic = "force-dynamic";

/** 갈래로 쓸 수 있는 이름 — 화면이 보낸 글자를 그대로 시트에 넣지 않는다 */
const KINDS = ["회원권", "수강권", "케어권", "부가상품권"];

/**
 * 상품 갈래 바꾸기
 *
 * 상품 원장을 고치는 일이라 회원 한 명을 고치는 것보다 무겁다.
 * 이 상품으로 판 이용권 전부의 갈래가 같이 바뀐다.
 */
export async function POST(req: Request) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const ab = await abilitiesFor(session.roleCode);
  if (!ab.get("회원")?.update) {
    return NextResponse.json({ error: "상품을 고칠 권한이 없습니다." }, { status: 403 });
  }

  try {
    const b = await req.json();
    const kind = String(b.상품분류 ?? "");
    if (!KINDS.includes(kind)) {
      return NextResponse.json({ error: "쓸 수 없는 갈래입니다." }, { status: 400 });
    }
    await setProductKind(String(b.상품코드 ?? ""), kind, session.staffId);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "저장하지 못했습니다." }, { status: 500 });
  }
}
