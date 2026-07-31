/**
 * 메뉴 목록과 권한 판정
 *
 * 권한은 시트의 `권한` 탭에서 읽는다. 코드에 박아넣지 않는다.
 * 대표님이 시트나 권한 설정 화면에서 바꾸면 즉시 반영된다.
 */
import { getPermissions } from "./data";
import type { Session } from "./session";

export type MenuItem = {
  key: string;
  label: string;
  href: string;
  icon: string;
};

/** 시트 `권한` 탭의 "메뉴" 칸 값과 반드시 일치해야 한다 */
export const MENUS: MenuItem[] = [
  { key: "홈", label: "홈", href: "/dashboard", icon: "🏠" },
  { key: "회원", label: "회원", href: "/dashboard/members", icon: "👥" },
  { key: "매출", label: "매출", href: "/dashboard/sales", icon: "💳" },
  { key: "상담", label: "상담", href: "/dashboard/consultations", icon: "📞" },
  { key: "PT·수업", label: "PT·수업", href: "/dashboard/lessons", icon: "🏋️" },
  { key: "근태", label: "근태", href: "/dashboard/attendance", icon: "⏰" },
  { key: "공지", label: "공지·업무", href: "/dashboard/notices", icon: "📋" },
  { key: "시설·재고", label: "시설·재고", href: "/dashboard/facility", icon: "🧰" },
  { key: "직원관리", label: "직원 관리", href: "/dashboard/staff", icon: "🧑‍💼" },
  { key: "권한설정", label: "권한 설정", href: "/dashboard/permissions", icon: "🔐" },
];

export type Ability = {
  view: boolean;
  create: boolean;
  update: boolean;
  remove: boolean;
  condition: string;
};

const NONE: Ability = { view: false, create: false, update: false, remove: false, condition: "" };

/** 이 직급이 각 메뉴에 대해 무엇을 할 수 있는지 */
export async function abilitiesFor(roleCode: string): Promise<Map<string, Ability>> {
  const perms = await getPermissions();
  const map = new Map<string, Ability>();
  perms
    .filter((p) => p.roleCode === roleCode)
    .forEach((p) =>
      map.set(p.menu, {
        view: p.view,
        create: p.create,
        update: p.update,
        remove: p.remove,
        condition: p.condition,
      })
    );
  // 홈은 로그인한 사람 누구나 본다
  map.set("홈", { view: true, create: false, update: false, remove: false, condition: "" });
  return map;
}

export async function visibleMenus(session: Session): Promise<MenuItem[]> {
  const ab = await abilitiesFor(session.roleCode);
  return MENUS.filter((m) => (ab.get(m.key) ?? NONE).view);
}

export async function can(
  session: Session,
  menu: string,
  action: keyof Omit<Ability, "condition">
): Promise<boolean> {
  const ab = await abilitiesFor(session.roleCode);
  return (ab.get(menu) ?? NONE)[action];
}
