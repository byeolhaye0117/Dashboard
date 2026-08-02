import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { readSheet, updateCell } from "@/lib/sheets";
import { SHEET, getStaffAll } from "@/lib/data";
import { readSession, createSession } from "@/lib/session";
import { PW_COLUMN, TEMP_COLUMN } from "@/lib/staffAdmin";

export const dynamic = "force-dynamic";

/** 본인 비밀번호 변경 */
export async function POST(req: Request) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  try {
    const { newPassword } = await req.json();
    if (!newPassword || String(newPassword).length < 4) {
      return NextResponse.json({ error: "비밀번호는 4자 이상으로 정해주세요." }, { status: 400 });
    }

    const { headers } = await readSheet(SHEET.직원);
    const col = headers.indexOf(PW_COLUMN);
    if (col < 0) {
      return NextResponse.json(
        { error: `직원 시트에 "${PW_COLUMN}" 칸이 없습니다. 시트 제목 줄을 확인해주세요.` },
        { status: 500 }
      );
    }

    const staff = (await getStaffAll()).find((s) => s.id === session.staffId);
    if (!staff) return NextResponse.json({ error: "직원 정보를 찾지 못했습니다." }, { status: 404 });

    const hash = await bcrypt.hash(String(newPassword), 10);
    await updateCell(SHEET.직원, staff.rowNumber, col, hash);

    // 본인이 정한 비밀번호이므로 임시 표시를 지운다
    const tempCol = headers.indexOf(TEMP_COLUMN);
    if (tempCol >= 0) await updateCell(SHEET.직원, staff.rowNumber, tempCol, "");

    await createSession({ ...session, mustChangePassword: false });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "비밀번호를 바꾸지 못했습니다." }, { status: 500 });
  }
}
