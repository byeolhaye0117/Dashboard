import { NextResponse } from "next/server";
import { readSession } from "@/lib/session";
import { abilitiesFor } from "@/lib/menu";
import { addColumns } from "@/lib/sheets";
import { REFUND_COLUMNS } from "@/lib/refund";

export const dynamic = "force-dynamic";

/**
 * 시트에 모자란 칸을 만든다
 *
 * 시트 구조를 바꾸는 일이라 대표(직원 관리 권한)만 쓸 수 있게 한다.
 * 아무 이름이나 만들 수 있게 두면 시트가 엉키므로, 미리 정해둔 묶음만 받는다.
 */
const SETS: Record<string, { tab: string; names: string[] }> = {
  환불: { tab: "결제", names: REFUND_COLUMNS },
};

export async function POST(req: Request) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const ab = await abilitiesFor(session.roleCode);
  if (!ab.get("직원관리")?.update) {
    return NextResponse.json({ error: "대표만 쓸 수 있는 기능입니다." }, { status: 403 });
  }

  try {
    const { set } = await req.json();
    const target = SETS[set];
    if (!target) {
      return NextResponse.json({ error: "만들 수 없는 칸입니다." }, { status: 400 });
    }
    const added = await addColumns(target.tab, target.names);
    return NextResponse.json({ ok: true, tab: target.tab, added });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "칸을 만들지 못했습니다." }, { status: 500 });
  }
}
