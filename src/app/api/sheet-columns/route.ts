import { NextResponse } from "next/server";
import { readSession } from "@/lib/session";
import { abilitiesFor } from "@/lib/menu";
import { addColumns, createSheet } from "@/lib/sheets";
import { REFUND_COLUMNS } from "@/lib/refund";
import { SHEET_T, T_HEADERS } from "@/lib/attendanceMeta";
import { SHEET } from "@/lib/data";

export const dynamic = "force-dynamic";

/**
 * 시트에 모자란 칸·탭을 만든다
 *
 * 시트 구조를 바꾸는 일이라 대표(직원 관리 권한)만 쓸 수 있게 한다.
 * 아무 이름이나 만들 수 있게 두면 시트가 엉키므로, 미리 정해둔 묶음만 받는다.
 */
type Job =
  | { kind: "columns"; tab: string; names: string[] }
  | { kind: "tab"; tab: string; headers: string[]; extra?: { tab: string; names: string[] } };

const SETS: Record<string, Job> = {
  환불: { kind: "columns", tab: "결제", names: REFUND_COLUMNS },
  근태: {
    kind: "tab",
    tab: SHEET_T,
    headers: T_HEADERS,
    // 지각을 판정하려면 직원마다 기준 시각이 있어야 한다
    extra: { tab: SHEET.직원, names: ["출근기준시각", "퇴근기준시각", "휴게분"] },
  },
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
    const job = SETS[set];
    if (!job) return NextResponse.json({ error: "만들 수 없는 칸입니다." }, { status: 400 });

    if (job.kind === "columns") {
      const added = await addColumns(job.tab, job.names);
      return NextResponse.json({ ok: true, tab: job.tab, added });
    }

    // 탭이 이미 있으면 모자란 칸만 채운다. 예전에 만든 탭도 이걸로 따라온다
    const made = await createSheet(job.tab, job.headers);
    const grown = made ? [] : await addColumns(job.tab, job.headers);
    const added = job.extra ? await addColumns(job.extra.tab, job.extra.names) : [];
    return NextResponse.json({
      ok: true,
      tab: job.tab,
      added: [...(made ? [`${job.tab} 탭`] : grown), ...added],
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "만들지 못했습니다." }, { status: 500 });
  }
}
