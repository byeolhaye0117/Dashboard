/**
 * 권한 저장
 *
 * 권한 탭은 "직급 × 메뉴" 한 줄씩이다. 화면에서 체크한 대로 그 줄을 고치거나 만든다.
 * 줄을 지우지 않는 이유는 회원·상담과 같다 — 누가 언제 무엇을 바꿨는지 남겨야 한다.
 *
 * 대표(R1)가 스스로를 잠그는 것만은 막는다. 잠기면 되돌릴 화면 자체에 못 들어간다.
 */
import { readSheet, appendRow, updateRow, addColumns, type Row } from "./sheets";
import { SHEET } from "./data";
import { now } from "./time";

export type PermRow = {
  menu: string;
  view: boolean;
  create: boolean;
  update: boolean;
  remove: boolean;
};

const yn = (b: boolean) => (b ? "Y" : "N");

/** 대표가 잠기면 안 되는 메뉴 — 이 둘을 잃으면 되돌릴 방법이 없다 */
const OWNER_LOCK = ["직원관리", "권한설정"];

/**
 * 한 직급의 권한을 통째로 맞춘다
 *
 * 보낸 메뉴만 손댄다. 화면에 없던 메뉴 줄은 그대로 둔다.
 */
export async function saveRolePermissions(
  roleCode: string,
  rows: PermRow[],
  byId: string
): Promise<void> {
  if (!roleCode) throw new Error("직급을 고르지 않았습니다.");

  if (roleCode === "R1") {
    const lost = rows.filter((r) => OWNER_LOCK.includes(r.menu) && !(r.view && r.update));
    if (lost.length > 0) {
      throw new Error(
        `대표에게서 ${lost.map((r) => r.menu).join(" · ")} 권한을 뺄 수 없습니다. ` +
          `이 권한이 없으면 권한을 되돌릴 화면에 들어갈 수 없습니다.`
      );
    }
  }

  const { headers, rows: sheetRows, rowNumbers } = await readSheet(SHEET.권한);
  const stamp = now();

  // 시트에 없는 칸에 적으면 조용히 사라진다. 최소한 이 넷은 있어야 한다
  const need = ["직급코드", "메뉴", "보기", "등록", "수정", "삭제"];
  const missing = need.filter((c) => !headers.includes(c));
  if (missing.length > 0) {
    throw new Error(`권한 탭에 ${missing.join(" · ")} 칸이 없습니다. 시트 제목 줄을 확인해주세요.`);
  }

  for (const r of rows) {
    const i = sheetRows.findIndex(
      (x) =>
        x["직급코드"] === roleCode &&
        x["메뉴"] === r.menu &&
        (x["삭제여부"] ?? "").toUpperCase() !== "Y"
    );

    const values: Row = {
      직급코드: roleCode,
      메뉴: r.menu,
      보기: yn(r.view),
      등록: yn(r.create),
      수정: yn(r.update),
      삭제: yn(r.remove),
      수정일시: stamp,
      수정자: byId,
    };

    if (i >= 0) {
      // 모르는 칸(범위조건 등)은 건드리지 않는다
      await updateRow(SHEET.권한, rowNumbers[i], headers, { ...sheetRows[i], ...values });
    } else {
      await appendRow(SHEET.권한, headers, { ...values, 등록일시: stamp, 등록자: byId });
    }
  }
}

/* ── 이 직급이 어느 지점을 보는가 ─────────────────────────
 *
 * 직급 탭의 「지점범위」 칸이다. 지금까지는 시트를 직접 열어야 바꿀 수
 * 있었고, 화면 어디에도 안 보여서 누가 전 지점을 보고 있는지 알 수가 없었다.
 * 권한과 같은 자리에서 같이 정하게 한다 — 어차피 같은 질문이다.
 * ──────────────────────────────────────────────────── */

export const SCOPES = ["전체", "담당지점"] as const;

export async function saveRoleScope(
  roleCode: string,
  scope: string,
  byId: string
): Promise<void> {
  if (!roleCode) throw new Error("직급을 고르지 않았습니다.");
  if (!(SCOPES as readonly string[]).includes(scope)) {
    throw new Error("지점 범위는 「전체」나 「담당지점」만 넣을 수 있습니다.");
  }

  /* 대표가 전 지점을 못 보게 되면 지점별 숫자를 확인할 사람이 없어진다.
     권한과 같은 이유로 이 하나는 막는다. */
  if (roleCode === "R1" && scope !== "전체") {
    throw new Error("대표는 전 지점을 보는 직급입니다. 이 값은 바꿀 수 없습니다.");
  }

  /* 칸이 없으면 만들어 준다. 없는 칸에 적으면 조용히 사라진다 */
  await addColumns(SHEET.직급, ["지점범위"]);

  const { headers, rows, rowNumbers } = await readSheet(SHEET.직급);
  const i = rows.findIndex(
    (r) => r["직급코드"] === roleCode && (r["삭제여부"] ?? "").toUpperCase() !== "Y"
  );
  if (i < 0) throw new Error("해당 직급을 찾지 못했습니다.");

  await updateRow(SHEET.직급, rowNumbers[i], headers, {
    ...rows[i],
    지점범위: scope,
    수정일시: now(),
    수정자: byId,
  });
}
