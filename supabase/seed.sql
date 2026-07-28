-- =====================================================================
-- 초기 데이터 (지점 · 유입경로 · 상품)
--
-- 실제 지점 이름과 상품·가격으로 바꿔서 실행하세요.
-- 여러 번 실행해도 중복되지 않습니다.
-- =====================================================================

-- ── 지점 ─────────────────────────────────────────────────────────────
insert into public.branches (code, name, sort_order) values
  ('GN', '강남점', 1),
  ('SW', '수원점', 2),
  ('BC', '부천점', 3),
  ('IS', '일산점', 4),
  ('SD', '송도점', 5)
on conflict (code) do nothing;

-- ── 유입경로 ─────────────────────────────────────────────────────────
-- "어디 보고 왔는지". 광고비를 어디에 쓸지 판단하는 근거가 됩니다.
insert into public.acquisition_channels (name, sort_order) values
  ('네이버 블로그', 1),
  ('당근', 2),
  ('지인 소개', 3),
  ('간판 보고', 4),
  ('인스타그램', 5),
  ('재등록', 6),
  ('기타', 99)
on conflict (name) do nothing;

-- ── 상품 ─────────────────────────────────────────────────────────────
-- branch_id 가 null 이면 전 지점 공통 상품입니다.
-- 지점마다 가격이 다르면 branch_id 를 지정해 따로 넣으세요.
insert into public.products (name, kind, duration_days, session_count, list_price, sort_order)
values
  ('헬스 1개월',   'membership',  30, null,   90000, 1),
  ('헬스 3개월',   'membership',  90, null,  240000, 2),
  ('헬스 6개월',   'membership', 180, null,  420000, 3),
  ('헬스 12개월',  'membership', 365, null,  690000, 4),
  ('PT 10회',      'pt',        null,   10,  750000, 11),
  ('PT 20회',      'pt',        null,   20, 1400000, 12),
  ('PT 30회',      'pt',        null,   30, 1950000, 13),
  ('필라테스 8회', 'group',     null,    8,  320000, 21),
  ('락커 3개월',   'addon',       90, null,   60000, 31),
  ('운동복 3개월', 'addon',       90, null,   45000, 32)
on conflict do nothing;


-- =====================================================================
-- 직원 계정 연결
--
-- 순서:
--   1) Supabase 대시보드 → Authentication → Users → Add user 로
--      직원 이메일/비밀번호 계정을 먼저 만듭니다.
--   2) 만들어진 계정의 UUID를 복사해서 아래를 실행합니다.
--
-- 역할(role)
--   owner   관장  — 전 지점 조회, 모든 권한
--   manager 매니저 — 자기 지점, 상품 관리 가능
--   desk    데스크 — 자기 지점, 회원·결제·상담 입력
--   trainer 트레이너 — 자기 지점, PT 세션만 입력
--
-- branch_id 를 null 로 두면 전 지점을 볼 수 있습니다(본사·관장).
-- =====================================================================

-- 예시 — 실제 UUID와 이름으로 바꿔서 실행하세요.
--
-- insert into public.staff (id, branch_id, name, role) values
--   ('여기에-관장-계정-UUID', null, '관장님', 'owner');
--
-- insert into public.staff (id, branch_id, name, role) values
--   ('여기에-직원-계정-UUID',
--    (select id from public.branches where code = 'GN'),
--    '김데스크', 'desk');
