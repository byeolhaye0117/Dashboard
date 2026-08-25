import { NextResponse } from "next/server";
import { readSession } from "@/lib/session";
import { abilitiesFor } from "@/lib/menu";
import { readSheet, updateRow, addColumns } from "@/lib/sheets";
import { resolve, get } from "@/lib/columns";
import { SHEET_P, P_COLS } from "@/lib/members";
import { now } from "@/lib/time";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const won = (v?: string) => Number(String(v ?? "").replace(/[^0-9-]/g, "")) || 0;

/**
 * 옛 결제 줄의 결제금액을 「실제로 받은 돈」으로 고친다
 *
 * ── 왜 필요한가 ─────────────────────────────────────────────
 * 예전에는 결제금액에 미수금까지 합친 「받기로 한 전부」를 적었다. 지금은
 * 실제로 받은 돈만 적는다. 두 잣대가 한 시트에 섞여 있으면 화면이 미수금을
 * 두 번 빼거나 아예 안 뺀다.
 *
 * 미수금이 있는 옛 줄만 손댄다 — 미수금이 없으면 두 잣대의 값이 같다.
 * 한 번 고친 줄에는 금액기준 「실입금」을 남겨서, 다시 돌려도 또 빼지 않는다.
 * 돈 기록이라 되돌리기가 번거로워서, 먼저 무엇이 바뀌는지 보여 주고 나서 한다.
 */
async function 훑기() {
  await addColumns(SHEET_P, ["미수금액", "금액기준"]);
  const { headers, rows, rowNumbers } = await readSheet(SHEET_P);
  const cols = resolve(SHEET_P, headers, P_COLS);

  const 고칠것 = rows
    .map((r, i) => ({ r, no: rowNumbers[i] }))
    .filter((x) => (x.r["삭제여부"] ?? "").toUpperCase() !== "Y")
    /* 이미 새 잣대로 적힌 줄은 건드리지 않는다 */
    .filter((x) => (get(x.r, cols, "금액기준") ?? "").trim() !== "실입금")
    .map((x) => ({
      ...x,
      id: get(x.r, cols, "결제번호"),
      날짜: (get(x.r, cols, "결제일시") ?? "").slice(0, 10),
      전: won(get(x.r, cols, "결제금액")),
      미수: won(get(x.r, cols, "미수금액")),
    }))
    /* 미수금이 없으면 두 잣대의 값이 같다 — 자국만 남기면 된다 */
    .map((x) => ({ ...x, 후: Math.max(0, x.전 - x.미수) }));

  return { headers, cols, 고칠것 };
}

export async function POST(req: Request) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const ab = await abilitiesFor(session.roleCode);
  /* 지난 매출 기록에 손대는 일이라, 권한을 나누는 사람만 할 수 있게 한다 */
  if (!ab.get("권한설정")?.update) {
    return NextResponse.json({ error: "이 정리를 할 수 없는 계정입니다." }, { status: 403 });
  }

  try {
    const b = await req.json().catch(() => ({}));
    const 진짜로 = b?.action === "run";
    const { headers, 고칠것 } = await 훑기();

    const 바뀔것 = 고칠것.filter((x) => x.미수 > 0);
    const 자국만 = 고칠것.filter((x) => x.미수 <= 0);

    if (!진짜로) {
      return NextResponse.json({
        ok: true,
        미리보기: true,
        바뀜: 바뀔것.length,
        자국만: 자국만.length,
        줄인돈: 바뀔것.reduce((s, x) => s + x.미수, 0),
        보기: 바뀔것.slice(0, 12).map((x) => ({
          id: x.id, 날짜: x.날짜, 전: x.전, 후: x.후, 미수: x.미수,
        })),
      });
    }

    const stamp = now();
    for (const x of 고칠것) {
      await updateRow(SHEET_P, x.no, headers, {
        ...x.r,
        결제금액: String(x.후),
        금액기준: "실입금",
        수정일시: stamp,
        수정자: session.staffId,
      });
    }

    return NextResponse.json({
      ok: true,
      바뀜: 바뀔것.length,
      자국만: 자국만.length,
      줄인돈: 바뀔것.reduce((s, x) => s + x.미수, 0),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "정리하지 못했습니다." }, { status: 500 });
  }
}
