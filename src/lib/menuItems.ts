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

/**
 * 체크 하나하나가 실제로 무엇을 막는지
 *
 * 「보기·등록·수정·삭제」는 네 글자로 같아 보여도 화면마다 뜻이 다르다.
 * 리뷰 답글의 「수정」은 답글을 고치는 것이 아니라 플레이스 주소를 저장하는 것이고,
 * 근태의 「수정」은 남의 출퇴근을 고치는 것이다. 적어두지 않으면 정하는 사람이
 * 무엇을 여는지 모르고 체크하게 된다.
 *
 * 빈 칸은 그 자리를 아직 아무 데서도 안 쓴다는 뜻이다 — 체크해도 달라지는 게 없다.
 * 없는 것을 있는 척하지 않는다.
 */
export type ActionHint = { create?: string; update?: string; remove?: string; note?: string };

export const ACTION_HINTS: Record<string, ActionHint> = {
  홈: { note: "누구나 볼 수 있습니다" },
  회원: {
    create: "회원 등록",
    update: "회원 정보 고치기 · 이용권 판매 · 결제 넣기 · 정지 · 양도",
    remove: "회원 지우기 · 이용권 지우기",
  },
  매출: { note: "지금은 보기만 씁니다 — 매출은 회원 결제에서 자동으로 쌓입니다" },
  상담: { create: "상담 남기기", update: "상담 고치기", remove: "상담 지우기" },
  "PT·수업": {
    create: "수업 잡기 · 수업 사진 올리기",
    update: "남의 수업까지 고치기 (내 수업은 등록만 있어도 됩니다)",
    remove: "수업 지우기",
  },
  근태: {
    update: "남의 출퇴근 고치기 · 대신 적어주기 (내 출퇴근 찍기는 권한 없이 됩니다)",
    remove: "그날 기록 통째로 지우기",
  },
  공지: {
    create: "공지 쓰기 · 업무 만들기 · 업무 완료 체크",
    update: "공지 고치기·지우기 · 업무 고치기",
  },
  "시설·재고": { note: "아직 준비 중인 화면입니다" },
  리뷰: {
    create: "답글 만들기 (AI 부르기)",
    update: "플레이스 주소 · 키워드 · 끝인사 저장",
    remove: "만들어 둔 답글 지우기",
  },
  상품: {
    create: "상품 만들기",
    update: "상품 고치기 · 차례 바꾸기 · 파는 지점 정하기",
    remove: "상품 지우기",
  },
  직원관리: {
    create: "직원 추가",
    update: "직원 정보 · 비밀번호 고치기",
    remove: "직원 지우기",
  },
  권한설정: { update: "권한 바꾸기" },
};

/** 「보기」는 어디서나 같은 뜻이라 따로 적지 않는다 */
export const VIEW_MEANS = "메뉴에 나타나고 화면이 열립니다";
