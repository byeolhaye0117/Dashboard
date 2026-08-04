/**
 * 메뉴 목록
 *
 * 브라우저 쪽 화면에서도 쓰이므로, 서버 전용 코드(구글 시트 등)를 절대 불러오지 않는다.
 * 권한 판정은 서버 전용인 menu.ts 에서 한다.
 */
import type { IconName } from "@/components/Icon";

export type MenuGroup = "기본" | "운영" | "관리";

export type MenuItem = {
  key: string;
  label: string;
  short: string;
  href: string;
  icon: IconName;
  group: MenuGroup;
  /**
   * 화면이 실제로 만들어져 있는가.
   *
   * false 면 메뉴에는 「준비중」으로 남겨두되 누를 수 없게 한다. 없는 주소로
   * 보내면 직원은 오류 화면을 만나고, 그 순간 프로그램이 고장난 것으로 읽힌다.
   * 아직 안 만든 것과 고장난 것은 다르고, 화면은 그 둘을 구분해서 말해야 한다.
   *
   * 화면을 만들면 이 값을 지우기만 하면 된다 (기본이 "있음").
   */
  soon?: boolean;
};

export const GROUP_ORDER: MenuGroup[] = ["기본", "운영", "관리"];

/** key 는 시트 `권한` 탭의 "메뉴" 칸 값과 반드시 일치해야 한다 */
export const MENUS: MenuItem[] = [
  { key: "홈", label: "홈", short: "홈", href: "/dashboard", icon: "home", group: "기본" },
  { key: "회원", label: "회원", short: "회원", href: "/dashboard/members", icon: "users", group: "기본" },
  { key: "매출", label: "매출", short: "매출", href: "/dashboard/sales", icon: "card", group: "기본" },
  { key: "상담", label: "상담", short: "상담", href: "/dashboard/consultations", icon: "phone", group: "기본" },
  { key: "PT·수업", label: "PT·수업", short: "PT", href: "/dashboard/lessons", icon: "dumbbell", group: "기본", soon: true },
  { key: "근태", label: "근태", short: "근태", href: "/dashboard/attendance", icon: "clock", group: "운영", soon: true },
  { key: "공지", label: "공지·업무", short: "업무", href: "/dashboard/notices", icon: "clipboard", group: "운영", soon: true },
  { key: "시설·재고", label: "시설·재고", short: "재고", href: "/dashboard/facility", icon: "box", group: "운영", soon: true },
  { key: "직원관리", label: "직원 관리", short: "직원", href: "/dashboard/staff", icon: "badge", group: "관리" },
  { key: "권한설정", label: "권한 설정", short: "권한", href: "/dashboard/permissions", icon: "lock", group: "관리", soon: true },
];

/**
 * 휴대폰 하단 탭에 올릴 후보 — **자주 쓰는 순서**다.
 *
 * 예전에는 `menus.slice(0, 4)` 로 앞에서 그냥 잘랐다. 그런데 그 목록은 서버에서
 * 권한별로 걸러진 뒤라, 회원 권한이 없는 트레이너에게는 탭 구성이 통째로 밀려서
 * 아직 만들지도 않은 화면이 탭에 올라오기까지 했다. 사람마다 다른 자리에 있는
 * 탭은 손이 기억하지 못한다.
 *
 * 그래서 순서를 여기에 못 박고, 권한이 없거나 아직 없는 화면만 조용히 빠지게 한다.
 */
const TAB_PRIORITY = ["홈", "회원", "매출", "상담", "PT·수업", "근태"];

/** 하단 탭 4개 — 권한 있고, 실제로 만들어져 있는 화면만 */
export function tabMenus(menus: MenuItem[]): MenuItem[] {
  const usable = new Map(menus.filter((m) => !m.soon).map((m) => [m.key, m]));
  const picked = TAB_PRIORITY.map((k) => usable.get(k)).filter((m): m is MenuItem => !!m);
  // 우선순위 목록에 없는 화면만 권한으로 열린 경우에도 탭이 비지 않게 뒤를 채운다
  const rest = [...usable.values()].filter((m) => !picked.includes(m));
  return [...picked, ...rest].slice(0, 4);
}
