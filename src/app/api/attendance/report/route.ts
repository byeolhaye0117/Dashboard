import { NextResponse } from "next/server";
import { readSession } from "@/lib/session";
import { saveShiftReport } from "@/lib/reports";

export const dynamic = "force-dynamic";

/**
 * 퇴근 보고 올리기
 *
 * 권한을 따로 보지 않는다 — 제 하루를 제가 적는 일이라, 로그인한 사람이면
 * 누구나 남길 수 있어야 한다. 대신 사번과 지점은 서버가 쥐고 있는 값을 쓴다.
 */
export async function POST(req: Request) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  try {
    const b = await req.json();
    const 실패 = Array.isArray(b.실패)
      ? b.실패.slice(0, 50).map((x: any) => ({
          이름: String(x?.이름 ?? "").slice(0, 40),
          전화번호: String(x?.전화번호 ?? "").slice(0, 30),
          사유: String(x?.사유 ?? "").slice(0, 200),
        }))
      : [];

    const id = await saveShiftReport(
      {
        /* 지점은 화면이 보낸 값이 아니라 지금 보고 있는 지점을 쓴다 */
        지점코드: session.currentBranch || String(b.지점코드 ?? ""),
        상담수: String(b.상담수 ?? ""),
        성공수: String(b.성공수 ?? ""),
        문제사항: String(b.문제사항 ?? "").slice(0, 2000),
        실패,
      },
      session.staffId
    );
    return NextResponse.json({ ok: true, id });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "보고를 올리지 못했습니다." }, { status: 500 });
  }
}
