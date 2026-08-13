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
};

export const GROUP_ORDER: MenuGroup[] = ["기본", "운영", "관리"];

/**
 * 휴대폰 아래 막대에 올릴 메뉴 — 자주 누르는 순서
 *
 * 왼쪽 차례대로 앞에서 넷을 잘라 쓰다 보니, 아홉 번째인 리뷰 답글은
 * 「전체」를 눌러야만 나왔다. 자주 쓰는 것과 목록 순서는 다르다.
 * 여기 적힌 순서대로 올리고, 권한 때문에 빈 자리는 남은 메뉴로 채운다.
 */
export const PHONE_TABS = ["홈", "회원", "매출", "상담", "리뷰"];

/** key 는 시트 `권한` 탭의 "메뉴" 칸 값과 반드시 일치해야 한다 */
export const MENUS: MenuItem[] = [
  { key: "홈", label: "홈", short: "홈", href: "/dashboard", icon: "home", group: "기본" },
  { key: "회원", label: "회원", short: "회원", href: "/dashboard/members", icon: "users", group: "기본" },
  { key: "매출", label: "매출", short: "매출", href: "/dashboard/sales", icon: "card", group: "기본" },
  { key: "상담", label: "상담", short: "상담", href: "/dashboard/consultations", icon: "phone", group: "기본" },
  { key: "PT·수업", label: "PT·수업", short: "PT", href: "/dashboard/lessons", icon: "dumbbell", group: "기본" },
  { key: "근태", label: "근태", short: "근태", href: "/dashboard/attendance", icon: "clock", group: "운영" },
  { key: "공지", label: "공지·업무", short: "업무", href: "/dashboard/notices", icon: "clipboard", group: "운영" },
  { key: "시설·재고", label: "시설·재고", short: "재고", href: "/dashboard/facility", icon: "box", group: "운영" },
  { key: "리뷰", label: "리뷰 답글", short: "리뷰", href: "/dashboard/reviews", icon: "chat", group: "운영" },
  { key: "상품", label: "상품 관리", short: "상품", href: "/dashboard/products", icon: "tag", group: "관리" },
  { key: "직원관리", label: "직원 관리", short: "직원", href: "/dashboard/staff", icon: "badge", group: "관리" },
  { key: "권한설정", label: "권한 설정", short: "권한", href: "/dashboard/permissions", icon: "lock", group: "관리" },
];
