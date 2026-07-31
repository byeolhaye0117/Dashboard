/**
 * 권한 판정 (서버 전용)
 *
 * 권한은 시트의 `권한` 탭에서 읽는다. 코드에 박아넣지 않는다.
 * 대표님이 시트나 권한 설정 화면에서 바꾸면 즉시 반영된다.
 */
import { getPermissions } from "./data";
import type { Session } from "./session";
import { MENUS, type MenuItem } from "./menuItems";

export { MENUS, GROUP_ORDER } from "./menuItems";
export type { MenuItem, MenuGroup } from "./menuItems";

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
