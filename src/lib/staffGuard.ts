/**
 * 직원 관리 화면의 안전장치 (서버 전용)
 *
 * 권한이 있다는 것만으로 전부 허용하면 두 가지 사고가 난다.
 *   1) 자기 계정을 잠가버려 아무도 못 들어오는 상태
 *   2) 매니저가 대표 비밀번호를 새로 발급해 대표 행세를 하는 상태
 * 그래서 권한 확인과 별개로 여기서 한 번 더 막는다.
 */
import { readSession, type Session } from "./session";
import { abilitiesFor } from "./menu";
import { listStaffAdmin, type AdminStaff } from "./staffAdmin";

export const OWNER_ROLE = "R1";

/** error 가 채워져 있으면 거절, 비어 있으면 통과 */
export type Guard = {
  error?: string;
  status?: number;
  session?: Session;
  staff?: AdminStaff[];
};

/** 로그인·권한을 확인하고 직원 목록까지 함께 돌려준다 */
export async function guard(action: "create" | "update" | "remove"): Promise<Guard> {
  const session = await readSession();
  if (!session) return { error: "로그인이 필요합니다.", status: 401 };

  const ab = (await abilitiesFor(session.roleCode)).get("직원관리");
  if (!ab?.[action]) {
    return { error: "직원 정보를 다룰 권한이 없습니다.", status: 403 };
  }

  const { items } = await listStaffAdmin();
  return { session, staff: items };
}

/** 대표 계정은 대표만 건드릴 수 있다 */
export function blockOwnerEscalation(session: Session, target: AdminStaff): string | null {
  if (target.roleCode === OWNER_ROLE && session.roleCode !== OWNER_ROLE) {
    return "대표 계정은 대표만 바꿀 수 있습니다.";
  }
  return null;
}

/** 대표를 만들 수 있는 사람은 대표뿐이다 */
export function blockOwnerCreation(session: Session, roleCode: string): string | null {
  if (roleCode === OWNER_ROLE && session.roleCode !== OWNER_ROLE) {
    return "대표 직급은 대표만 지정할 수 있습니다.";
  }
  return null;
}

/**
 * 들어올 수 있는 대표가 한 명도 없게 되는 변경은 막는다
 *
 * offId 를 끄거나 지웠을 때 남는 대표가 있는지 본다.
 */
export function keepOneOwner(staff: AdminStaff[], offId: string): string | null {
  const left = staff.filter(
    (s) => s.roleCode === OWNER_ROLE && s.id !== offId && s.accountOn && s.status === "재직중"
  );
  if (left.length === 0) {
    return "마지막 대표 계정입니다. 이 계정을 끄면 아무도 관리 화면에 들어올 수 없습니다.";
  }
  return null;
}
