import { NextResponse } from "next/server";
import { readSession } from "@/lib/session";
import { abilitiesFor } from "@/lib/menu";
import { getBranches, getStaffAll, getProducts } from "@/lib/data";
import { readProduct } from "@/lib/productMeta";
import { addSampleData, removeSampleData } from "@/lib/members";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * 화면 확인용 샘플 자료 넣기 · 지우기
 *
 * 시트에 실제로 줄을 쓰는 기능이라 대표(직원 관리 권한)만 쓸 수 있게 한다.
 */
export async function POST(req: Request) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const ab = await abilitiesFor(session.roleCode);
  if (!ab.get("직원관리")?.update) {
    return NextResponse.json({ error: "대표만 쓸 수 있는 기능입니다." }, { status: 403 });
  }

  try {
    const { action } = await req.json();

    if (action === "remove") {
      const n = await removeSampleData(session.staffId);
      return NextResponse.json({ ok: true, count: n });
    }

    const [branches, staff, products] = await Promise.all([
      getBranches(),
      getStaffAll(),
      getProducts(),
    ]);
    const n = await addSampleData(
      branches.map((b) => b.code),
      products.map(readProduct),
      staff.filter((s) => s.active).map((s) => s.id),
      session.staffId
    );
    return NextResponse.json({ ok: true, count: n });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "처리하지 못했습니다." }, { status: 500 });
  }
}
