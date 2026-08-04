/**
 * 시트 → 대시보드가 쓰는 형태로 바꾸는 곳
 *
 * 화면 코드는 시트 구조를 몰라도 되도록, 여기서만 시트 이름과 칸 이름을 다룬다.
 */
import { cache } from "react";
import { readSheet, alive, Row } from "./sheets";
import { normalizeTime } from "./attendanceMeta";

export const SHEET = {
  지점: "지점",
  직급: "직급",
  권한: "권한",
  직원: "직원",
  직원담당지점: "직원담당지점",
  상품: "상품",
  상품판매지점: "상품판매지점",
  선택목록: "선택목록",
} as const;

export type Branch = {
  code: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  radius: number;
};

export type Staff = {
  id: string;
  name: string;
  phone: string;
  roleCode: string;
  mainBranch: string;
  passwordHash: string;
  status: string;
  active: boolean;
  /** 임시 비밀번호 상태 — 처음 로그인할 때 새로 정하게 한다 */
  temp: boolean;
  /** 출근 기준 시각 "09:00" — 비어 있으면 지각 판정을 하지 않는다 */
  baseTime: string;
  /** 퇴근 기준 시각 "18:00" — 비어 있으면 조퇴 판정을 하지 않는다 */
  outTime: string;
  /** 고정 휴게 분 — 그날 찍은 휴게가 없을 때만 이 값을 뺀다 */
  restMin: string;
  /** 휴게가 날마다 다른 사람인가 — 찍어서 남기는 쪽 */
  restVary: boolean;
  /** 근무하는 요일 "월화수목금" — 비어 있으면 정하지 않은 것 */
  workDays: string;
  /** 수업을 맡는 사람인가 — 직급과 별개로 사람마다 정한다 */
  trainer: boolean;
  /** 맡은 그룹수업 시간대 "06:00,10:00,19:00" */
  groupSlots: string;
  /** 시트에서 이 직원이 몇 번째 줄인지 (비밀번호를 고칠 때 쓴다) */
  rowNumber: number;
};

export type Role = {
  code: string;
  name: string;
  scope: string;
  order: number;
};

export type Permission = {
  roleCode: string;
  menu: string;
  view: boolean;
  create: boolean;
  update: boolean;
  remove: boolean;
  condition: string;
};

const yes = (v: string) => (v ?? "").trim().toUpperCase() === "Y";
const num = (v: string, d = 0) => {
  const n = Number((v ?? "").toString().replace(/,/g, ""));
  return Number.isFinite(n) ? n : d;
};

export async function getBranches(): Promise<Branch[]> {
  const { rows } = await readSheet(SHEET.지점);
  return alive(rows)
    .filter((r) => (r["운영상태"] ?? "운영중") === "운영중")
    .map((r) => ({
      code: r["지점코드"],
      name: r["지점명"],
      address: r["주소"] ?? "",
      lat: num(r["위도"]),
      lng: num(r["경도"]),
      radius: num(r["허용반경(m)"], 200),
    }));
}

export async function getRoles(): Promise<Role[]> {
  const { rows } = await readSheet(SHEET.직급);
  return alive(rows)
    .filter((r) => yes(r["사용여부"] || "Y"))
    .map((r) => ({
      code: r["직급코드"],
      name: r["직급명"],
      scope: r["지점범위"] ?? "담당지점",
      order: num(r["정렬순서"], 99),
    }))
    .sort((a, b) => a.order - b.order);
}

/*
 * 한 번의 화면 요청 안에서는 같은 탭을 두 번 읽지 않는다
 *
 * 권한 판정과 화면 본문이 같은 탭을 각각 읽는다. 그대로 두면 화면 하나에
 * 구글 시트 요청이 두 배로 나가고, 그만큼 화면이 늦게 뜬다.
 * cache() 는 요청 하나 안에서만 기억하므로, 다음 새로고침에는 새로 읽는다.
 */
export const getStaffAll = cache(_getStaffAll);

async function _getStaffAll(): Promise<Staff[]> {
  const { rows, rowNumbers } = await readSheet(SHEET.직원);
  const out: Staff[] = [];
  rows.forEach((r, i) => {
    if ((r["삭제여부"] ?? "").toUpperCase() === "Y") return;
    out.push({
      id: r["사번"],
      name: r["이름"],
      phone: (r["휴대폰(로그인ID)"] ?? "").replace(/[^0-9]/g, ""),
      roleCode: r["직급코드"],
      mainBranch: r["주소속지점"] ?? "",
      passwordHash: r["비밀번호(자동암호화)"] ?? "",
      temp: yes(r["비밀번호임시"] ?? ""),
      status: r["재직상태"] ?? "재직중",
      active: yes(r["계정사용"] || "Y") && (r["재직상태"] ?? "재직중") === "재직중",
      baseTime: normalizeTime(r["출근기준시각"] ?? ""),
      outTime: normalizeTime(r["퇴근기준시각"] ?? ""),
      restMin: (r["휴게분"] ?? "").trim(),
      restVary: yes(r["휴게변동"] ?? ""),
      workDays: (r["근무요일"] ?? "").replace(/[^월화수목금토일]/g, ""),
      trainer: yes(r["트레이너"] ?? ""),
      groupSlots: (r["그룹수업시간"] ?? "").trim(),
      rowNumber: rowNumbers[i],
    });
  });
  return out;
}

/** 직원이 담당하는 지점 코드 목록 */
export async function getStaffBranches(): Promise<Map<string, string[]>> {
  const { rows } = await readSheet(SHEET.직원담당지점);
  const map = new Map<string, string[]>();
  alive(rows).forEach((r) => {
    const id = r["사번"];
    if (!id) return;
    const list = map.get(id) ?? [];
    list.push(r["지점코드"]);
    map.set(id, list);
  });
  return map;
}

export const getPermissions = cache(_getPermissions);

async function _getPermissions(): Promise<Permission[]> {
  const { rows } = await readSheet(SHEET.권한);
  return alive(rows).map((r) => ({
    roleCode: r["직급코드"],
    menu: r["메뉴"],
    view: yes(r["보기"]),
    create: yes(r["등록"]),
    update: yes(r["수정"]),
    remove: yes(r["삭제"]),
    condition: r["범위조건"] ?? "",
  }));
}

/** 로그인 화면에 뿌릴 목록 — 비밀번호는 절대 포함하지 않는다 */
export type PublicStaff = { id: string; name: string; roleName: string };

export async function getLoginStaffList(branchCode: string): Promise<PublicStaff[]> {
  const [staff, roles, branchMap] = await Promise.all([
    getStaffAll(),
    getRoles(),
    getStaffBranches(),
  ]);
  const roleName = new Map(roles.map((r) => [r.code, r.name]));
  return staff
    .filter((s) => s.active)
    .filter((s) => {
      const list = branchMap.get(s.id) ?? [];
      return list.includes(branchCode) || s.mainBranch === branchCode;
    })
    .map((s) => ({ id: s.id, name: s.name, roleName: roleName.get(s.roleCode) ?? "" }))
    .sort((a, b) => a.name.localeCompare(b.name, "ko"));
}

/** 선택목록 시트의 드롭다운 값 */
export async function getOptions(kind: string): Promise<string[]> {
  const all = await getAllOptions();
  return all[kind] ?? [];
}

/** 선택목록 전체를 한 번에 (구분별로 묶어서) */
export async function getAllOptions(): Promise<Record<string, string[]>> {
  const { rows } = await readSheet(SHEET.선택목록);
  const map: Record<string, { v: string; o: number }[]> = {};
  alive(rows)
    .filter((r) => yes(r["사용여부"] || "Y"))
    .forEach((r) => {
      const k = r["구분"];
      if (!k) return;
      (map[k] ??= []).push({ v: r["값"], o: num(r["정렬순서"], 999) });
    });
  const out: Record<string, string[]> = {};
  Object.entries(map).forEach(([k, list]) => {
    out[k] = list.sort((a, b) => a.o - b.o).map((x) => x.v);
  });
  return out;
}

/** 사번 → 이름 */
export async function getStaffNames(): Promise<Record<string, string>> {
  const staff = await getStaffAll();
  const out: Record<string, string> = {};
  staff.forEach((s) => (out[s.id] = s.name));
  return out;
}

export type Product = Row & { code: string; name: string };

export async function getProducts(branchCode?: string): Promise<Product[]> {
  const [{ rows }, sell] = await Promise.all([
    readSheet(SHEET.상품),
    readSheet(SHEET.상품판매지점),
  ]);
  const allowed = new Set(
    alive(sell.rows)
      .filter((r) => !branchCode || r["지점코드"] === branchCode)
      .map((r) => r["상품코드"])
  );
  return alive(rows)
    .filter((r) => (r["판매상태"] ?? "판매중") === "판매중")
    .filter((r) => !branchCode || allowed.has(r["상품코드"]))
    .map((r) => ({ ...r, code: r["상품코드"], name: r["상품명"] }));
}
