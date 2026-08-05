import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { checkPassword } from "@/lib/password";
import { readSheet, updateCell } from "@/lib/sheets";
import { SHEET, getStaffAll } from "@/lib/data";
import { readSession, createSession } from "@/lib/session";
import { PW_COLUMN, TEMP_COLUMN } from "@/lib/staffAdmin";
import { abilitiesFor } from "@/lib/menu";

export const dynamic = "force-dynamic";

/**
 * 본인 비밀번호 변경
 *
 * 비밀번호는 대표님이 직원 관리 화면에서 발급하는 방식이므로, 직원은 스스로 바꾸지 못한다.
 * 화면에서 단추를 숨기는 것만으로는 부족하다 — 주소를 직접 찔러도 막히게 여기서 확인한다.
 */
export async function POST(req: Request) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const ab = (await abilitiesFor(session.roleCode)).get("직원관리");
  if (!ab?.update) {
    return NextResponse.json(
      { error: "비밀번호는 대표님이 발급합니다. 바꾸시려면 대표님께 요청해주세요." },
      { status: 403 }
    );
  }

  try {
    const { newPassword } = await req.json();

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

    // 규칙은 화면과 서버 양쪽에서 본다. 화면만 보면 우회할 수 있다
    const bad = checkPassword(String(newPassword ?? ""), { phone: staff.phone, name: staff.name });
    if (bad) return NextResponse.json({ error: bad }, { status: 400 });

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
