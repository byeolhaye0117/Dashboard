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

/* ── 직급 자체를 만들고 고치기 ─────────────────────────────
 *
 * 지금까지 직급은 구글 시트의 「직급」 탭을 직접 열어야 만들 수 있었다.
 * 화면에서는 고를 수만 있었다. 그래서 「팀장」 한 자리를 새로 두는 데도
 * 시트를 열 줄 아는 사람을 기다려야 했다.
 *
 * 줄은 지우지 않는다. 안 쓰게 된 직급은 사용여부를 N 으로 내려 감춘다 —
 * 지난 기록에 그 직급코드가 남아 있어서, 줄을 지우면 옛 기록의 직급명이
 * 사라진다.
 * ──────────────────────────────────────────────────── */

/** 직급 탭에 있어야 하는 칸 */
const ROLE_COLS = ["직급코드", "직급명", "지점범위", "정렬순서", "사용여부"];

/** 시트를 읽어 살아 있는 직급 줄만 준다 */
async function roleSheet() {
  await addColumns(SHEET.직급, ROLE_COLS);
  const { headers, rows, rowNumbers } = await readSheet(SHEET.직급);
  const live = rows
    .map((r, i) => ({ r, no: rowNumbers[i] }))
    .filter((x) => (x.r["삭제여부"] ?? "").toUpperCase() !== "Y");
  return { headers, live };
}

const roleOrder = (r: Row) => {
  const n = Number(String(r["정렬순서"] ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 99;
};

/**
 * 새 직급
 *
 * 직급코드는 화면이 발급한다. R1·R2… 를 쓰고 있으므로 뒤에 이어 붙인다.
 * 사람이 코드를 정하게 하면 이미 쓰던 코드를 다시 넣어 두 직급이 한 줄로
 * 겹치는 일이 난다 — 그러면 권한이 서로 섞인다.
 */
export async function createRole(name: string, byId: string): Promise<string> {
  const 이름 = name.trim();
  if (!이름) throw new Error("직급 이름을 적어주세요.");
  if (이름.length > 20) throw new Error("직급 이름이 너무 깁니다.");

  const { headers, live } = await roleSheet();
  if (live.some((x) => (x.r["직급명"] ?? "").trim() === 이름)) {
    throw new Error(`「${이름}」 직급이 이미 있습니다.`);
  }

  const used = new Set(live.map((x) => (x.r["직급코드"] ?? "").trim()));
  let n = 1;
  while (used.has(`R${n}`)) n += 1;
  const code = `R${n}`;

  const last = live.reduce((m, x) => Math.max(m, roleOrder(x.r)), 0);
  const stamp = now();

  await appendRow(SHEET.직급, headers, {
    직급코드: code,
    직급명: 이름,
    /* 새 직급은 자기 담당 지점만 본다. 전 지점은 일부러 골라야 열린다 */
    지점범위: "담당지점",
    정렬순서: String(last + 1),
    사용여부: "Y",
    등록일시: stamp,
    등록자: byId,
    수정일시: stamp,
    수정자: byId,
  });

  return code;
}

/** 직급 이름 바꾸기 — 코드는 그대로라 그 직급을 쓰는 직원은 따라온다 */
export async function renameRole(code: string, name: string, byId: string): Promise<void> {
  const 이름 = name.trim();
  if (!이름) throw new Error("직급 이름을 적어주세요.");
  if (이름.length > 20) throw new Error("직급 이름이 너무 깁니다.");

  const { headers, live } = await roleSheet();
  const me = live.find((x) => x.r["직급코드"] === code);
  if (!me) throw new Error("해당 직급을 찾지 못했습니다.");
  if (live.some((x) => x.r["직급코드"] !== code && (x.r["직급명"] ?? "").trim() === 이름)) {
    throw new Error(`「${이름}」 직급이 이미 있습니다.`);
  }

  await updateRow(SHEET.직급, me.no, headers, {
    ...me.r, 직급명: 이름, 수정일시: now(), 수정자: byId,
  });
}

/**
 * 차례 바꾸기 — 바로 위(아래) 직급과 정렬순서를 맞바꾼다
 *
 * 번호를 다시 매기지 않는 이유: 시트를 손으로 만져 10·20·30 처럼 띄워 둔
 * 경우가 있다. 통째로 다시 매기면 그 뜻이 사라진다.
 */
export async function moveRole(code: string, dir: "up" | "down", byId: string): Promise<void> {
  const { headers, live } = await roleSheet();
  const sorted = [...live].sort((a, b) => roleOrder(a.r) - roleOrder(b.r));
  const i = sorted.findIndex((x) => x.r["직급코드"] === code);
  if (i < 0) throw new Error("해당 직급을 찾지 못했습니다.");

  const j = dir === "up" ? i - 1 : i + 1;
  if (j < 0 || j >= sorted.length) return;

  const a = sorted[i], b = sorted[j];
  /* 두 줄의 순서가 같으면 맞바꿔도 그대로다. 그럴 때는 한 칸 벌려 준다 */
  const oa = roleOrder(a.r), ob = roleOrder(b.r);
  const stamp = now();
  const na = oa === ob ? (dir === "up" ? ob - 1 : ob + 1) : ob;

  await updateRow(SHEET.직급, a.no, headers, {
    ...a.r, 정렬순서: String(na), 수정일시: stamp, 수정자: byId,
  });
  if (oa !== ob) {
    await updateRow(SHEET.직급, b.no, headers, {
      ...b.r, 정렬순서: String(oa), 수정일시: stamp, 수정자: byId,
    });
  }
}

/**
 * 안 쓰는 직급 감추기 · 다시 꺼내기
 *
 * 줄을 지우지 않는다. 옛 기록이 이 직급코드를 가리키고 있어서, 지우면
 * 지난 명단의 직급이 빈칸이 된다.
 */
export async function useRole(code: string, on: boolean, byId: string): Promise<void> {
  const { headers, live } = await roleSheet();
  const me = live.find((x) => x.r["직급코드"] === code);
  if (!me) throw new Error("해당 직급을 찾지 못했습니다.");

  await updateRow(SHEET.직급, me.no, headers, {
    ...me.r, 사용여부: on ? "Y" : "N", 수정일시: now(), 수정자: byId,
  });
}
