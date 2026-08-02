import { NextResponse } from "next/server";
import { createStaff } from "@/lib/staffAdmin";
import { guard, blockOwnerCreation } from "@/lib/staffGuard";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const g = await guard("create");
  if (g.error) return NextResponse.json({ error: g.error }, { status: g.status });

  try {
    const b = await req.json();
    const 이름 = String(b.이름 ?? "").trim();
    const 휴대폰 = String(b.휴대폰 ?? "").trim();
    const 직급코드 = String(b.직급코드 ?? "").trim();
    const 주소속지점 = String(b.주소속지점 ?? "").trim();
    const 담당지점: string[] = Array.isArray(b.담당지점) ? b.담당지점.map(String) : [];

    if (!이름) return NextResponse.json({ error: "이름을 입력해주세요." }, { status: 400 });
    if (!휴대폰) return NextResponse.json({ error: "휴대폰 번호를 입력해주세요." }, { status: 400 });
    if (!직급코드) return NextResponse.json({ error: "직급을 골라주세요." }, { status: 400 });
    if (!주소속지점) return NextResponse.json({ error: "소속 지점을 골라주세요." }, { status: 400 });

    const bad = blockOwnerCreation(g.session, 직급코드);
    if (bad) return NextResponse.json({ error: bad }, { status: 403 });

    // 같은 번호로 두 계정이 생기면 로그인할 때 누가 누구인지 알 수 없다
    const digits = 휴대폰.replace(/[^0-9]/g, "");
    const dup = g.staff.find((s) => s.phone.replace(/[^0-9]/g, "") === digits);
    if (dup) {
      return NextResponse.json(
        { error: `이미 같은 번호로 등록된 직원이 있습니다 (${dup.name}).` },
        { status: 409 }
      );
    }

    const id = await createStaff(
      { 이름, 휴대폰, 직급코드, 주소속지점, 담당지점: 담당지점.length ? 담당지점 : [주소속지점] },
      g.session.staffId
    );
    return NextResponse.json({ ok: true, id });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "저장하지 못했습니다." }, { status: 500 });
  }
}
