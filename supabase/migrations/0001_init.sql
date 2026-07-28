-- =====================================================================
-- 헬스장 업무 대시보드 — 초기 스키마
--
-- 설계 원칙
--  1. 계약(contracts)과 결제(payments)를 분리한다. 분할결제·미수금 때문.
--  2. 금액은 정수 원 단위로만 저장한다. 실수형은 반올림 오차로 매출이 틀어진다.
--  3. 삭제하지 않는다. 취소/환불은 상태 변경 또는 반대 기록으로 남긴다.
--  4. 모든 업무 테이블은 branch_id를 직접 갖는다. 조인 없이 지점 권한을
--     걸기 위해서다. (RLS 성능과 정확도가 여기서 갈린다)
--  5. source / external_ref 를 미리 둔다. 외부 시스템(브로제이 등)에서
--     데이터를 받아올 때 스키마를 고치지 않기 위해서다.
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- 공통: updated_at 자동 갱신
-- ---------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;


-- =====================================================================
-- 1. 지점
-- =====================================================================
create table public.branches (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,              -- 'GN', 'SW' 같은 짧은 식별자
  name        text not null,                     -- '강남점'
  address     text,
  phone       text,
  opened_on   date,
  is_active   boolean not null default true,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger t_branches_updated before update on public.branches
  for each row execute function public.touch_updated_at();


-- =====================================================================
-- 2. 직원 (Supabase 로그인 계정과 1:1)
-- =====================================================================
create table public.staff (
  id          uuid primary key references auth.users(id) on delete cascade,
  branch_id   uuid references public.branches(id),   -- null = 본사(전 지점)
  name        text not null,
  role        text not null check (role in ('owner','manager','desk','trainer')),
  phone       text,
  hired_on    date,
  resigned_on date,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index on public.staff (branch_id) where is_active;
create trigger t_staff_updated before update on public.staff
  for each row execute function public.touch_updated_at();

comment on column public.staff.branch_id is
  'null이면 전 지점 조회 가능(본사·관장). role=owner도 전 지점.';


-- =====================================================================
-- 3. 유입경로 (마스터)
-- =====================================================================
create table public.acquisition_channels (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,     -- 네이버블로그 / 당근 / 지인소개 / 간판 / 인스타
  sort_order  int not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);


-- =====================================================================
-- 4. 상품
--    상품 종류가 늘어도 이 테이블에 행만 추가하면 된다. 스키마 변경 불필요.
-- =====================================================================
create table public.products (
  id            uuid primary key default gen_random_uuid(),
  branch_id     uuid references public.branches(id),  -- null = 전 지점 공통
  name          text not null,                        -- '3개월 회원권', 'PT 20회'
  kind          text not null check (kind in ('membership','pt','group','addon')),
  duration_days int,        -- 기간제일 때 (3개월 = 90)
  session_count int,        -- 횟수제일 때 (PT 20회 = 20)
  list_price    int not null check (list_price >= 0),
  is_active     boolean not null default true,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- 기간제도 횟수제도 아닌 상품은 있을 수 없다
  constraint products_has_measure
    check (duration_days is not null or session_count is not null)
);
create index on public.products (branch_id, kind) where is_active;
create trigger t_products_updated before update on public.products
  for each row execute function public.touch_updated_at();

comment on column public.products.kind is
  'membership=기간제 회원권, pt=PT 횟수권, group=그룹수업, addon=락커·운동복 등 부가상품';


-- =====================================================================
-- 5. 회원
--    개인정보 최소 수집: 이름/연락처/성별/생년까지만. 주민번호·주소 없음.
-- =====================================================================
create table public.members (
  id                     uuid primary key default gen_random_uuid(),
  branch_id              uuid not null references public.branches(id),
  name                   text not null,
  phone                  text,
  gender                 text check (gender in ('M','F','other')),
  birth_year             int check (birth_year between 1900 and 2100),
  acquisition_channel_id uuid references public.acquisition_channels(id),
  first_registered_on    date not null default current_date,
  memo                   text,

  -- 개인정보
  privacy_consent_at     timestamptz,
  anonymized_at          timestamptz,   -- 파기 요청 처리 시각. 매출 통계는 보존.

  -- 외부 시스템 연동용
  source                 text not null default 'manual'
                           check (source in ('manual','broj','import')),
  external_ref           text,

  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  created_by             uuid references public.staff(id)
);
create index on public.members (branch_id, name);
create index on public.members (phone);
create unique index on public.members (source, external_ref)
  where external_ref is not null;
create trigger t_members_updated before update on public.members
  for each row execute function public.touch_updated_at();

comment on column public.members.anonymized_at is
  '회원이 개인정보 삭제를 요청하면 name/phone만 마스킹하고 이 값을 채운다.
   계약·결제는 그대로 남아 과거 매출 통계가 깨지지 않는다.';


-- =====================================================================
-- 6. 계약 (= 등록 1건)
--
--    만료일이 두 개인 이유:
--      base_ends_on : 정지를 반영하지 않은 원래 종료일
--      ends_on      : 정지 누적일수를 더한 실제 종료일  ← 화면에 보이는 값
--    정지 기록이 바뀌면 ends_on이 자동 재계산된다.
-- =====================================================================
create table public.contracts (
  id            uuid primary key default gen_random_uuid(),
  member_id     uuid not null references public.members(id),
  branch_id     uuid not null references public.branches(id),
  product_id    uuid not null references public.products(id),

  seller_id     uuid references public.staff(id),   -- 판매·등록 담당자
  trainer_id    uuid references public.staff(id),   -- PT 담당 트레이너

  started_on    date not null,
  base_ends_on  date,          -- 기간제만 사용
  ends_on       date,          -- 정지 반영 후 실제 만료일 (자동 계산)

  total_sessions int,          -- 횟수제만 사용
  used_sessions  int not null default 0,   -- pt_sessions 집계 캐시 (자동 갱신)

  list_price     int not null default 0,
  discount       int not null default 0,
  contract_price int not null,             -- 실제 계약 금액

  status        text not null default 'active'
                  check (status in ('active','suspended','completed','expired',
                                    'cancelled','refunded','transferred_out')),
  memo          text,

  source        text not null default 'manual'
                  check (source in ('manual','broj','import')),
  external_ref  text,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid references public.staff(id),

  constraint contracts_price_ok check (contract_price >= 0),
  constraint contracts_sessions_ok
    check (total_sessions is null or used_sessions <= total_sessions)
);
create index on public.contracts (branch_id, status);
create index on public.contracts (member_id);
create index on public.contracts (ends_on) where status in ('active','suspended');
create index on public.contracts (trainer_id) where trainer_id is not null;
create trigger t_contracts_updated before update on public.contracts
  for each row execute function public.touch_updated_at();

-- 잔여 횟수는 저장하지 않고 계산한다. 두 군데 저장하면 반드시 어긋난다.
create or replace function public.contract_remaining_sessions(c public.contracts)
returns int language sql immutable as $$
  select case when c.total_sessions is null then null
              else c.total_sessions - c.used_sessions end
$$;


-- =====================================================================
-- 7. 정지(홀딩)
-- =====================================================================
create table public.contract_holds (
  id          uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts(id) on delete cascade,
  branch_id   uuid not null references public.branches(id),
  starts_on   date not null,
  ends_on     date,          -- null = 정지 진행 중 (아직 복귀 안 함)
  reason      text,
  status      text not null default 'active'
                check (status in ('active','ended','cancelled')),
  created_at  timestamptz not null default now(),
  created_by  uuid references public.staff(id),

  constraint holds_period_ok check (ends_on is null or ends_on >= starts_on)
);
create index on public.contract_holds (contract_id);

-- 정지 일수 합계 → 만료일 재계산
create or replace function public.recalc_contract_end(p_contract_id uuid)
returns void language plpgsql as $$
declare
  v_days int;
begin
  select coalesce(sum(
           case
             -- 종료된 정지: 실제 정지 일수
             when h.ends_on is not null then (h.ends_on - h.starts_on) + 1
             -- 진행 중인 정지: 오늘까지로 계산
             else greatest((current_date - h.starts_on) + 1, 0)
           end
         ), 0)
    into v_days
    from public.contract_holds h
   where h.contract_id = p_contract_id
     and h.status <> 'cancelled';

  update public.contracts
     set ends_on = base_ends_on + v_days
   where id = p_contract_id
     and base_ends_on is not null;
end $$;

create or replace function public.trg_recalc_contract_end()
returns trigger language plpgsql as $$
begin
  perform public.recalc_contract_end(coalesce(new.contract_id, old.contract_id));
  return coalesce(new, old);
end $$;

create trigger t_holds_recalc
  after insert or update or delete on public.contract_holds
  for each row execute function public.trg_recalc_contract_end();


-- =====================================================================
-- 8. 양도
--    원 계약을 transferred_out으로 닫고, 양수인 이름으로 새 계약을 만든다.
--    이 테이블은 그 둘을 잇는 다리다. "누가 누구에게 언제" 가 남는다.
-- =====================================================================
create table public.contract_transfers (
  id                 uuid primary key default gen_random_uuid(),
  from_contract_id   uuid not null references public.contracts(id),
  to_contract_id     uuid not null references public.contracts(id),
  from_member_id     uuid not null references public.members(id),
  to_member_id       uuid not null references public.members(id),
  branch_id          uuid not null references public.branches(id),
  transferred_on     date not null default current_date,
  fee                int not null default 0,     -- 양도 수수료 (매출로 잡힘)
  remaining_days     int,                        -- 양도 시점 잔여 기간
  remaining_sessions int,                        -- 양도 시점 잔여 횟수
  memo               text,
  created_at         timestamptz not null default now(),
  created_by         uuid references public.staff(id),

  constraint transfers_not_self check (from_contract_id <> to_contract_id)
);
create index on public.contract_transfers (from_contract_id);


-- =====================================================================
-- 9. 결제 / 환불
--    환불은 삭제가 아니라 음수 금액의 별도 행이다.
--    → "이번 달 실매출"이 정확해지고, 분쟁 시 근거가 남는다.
-- =====================================================================
create table public.payments (
  id                 uuid primary key default gen_random_uuid(),
  contract_id        uuid not null references public.contracts(id),
  member_id          uuid not null references public.members(id),
  branch_id          uuid not null references public.branches(id),

  kind               text not null default 'payment'
                       check (kind in ('payment','refund')),
  amount             int not null,          -- 환불은 음수
  paid_on            date not null default current_date,
  method             text not null default 'card'
                       check (method in ('card','cash','transfer','other')),

  installment_no     int,      -- 분할결제 회차 (1/3, 2/3 …)
  installment_total  int,
  refund_of_id       uuid references public.payments(id),  -- 어느 결제의 환불인지
  memo               text,

  source             text not null default 'manual'
                       check (source in ('manual','broj','import')),
  external_ref       text,

  created_at         timestamptz not null default now(),
  created_by         uuid references public.staff(id),

  -- 부호 규칙을 DB가 강제한다. 실수로 환불을 양수로 넣으면 매출이 부풀려진다.
  constraint payments_sign_ok check (
    (kind = 'payment' and amount >= 0) or
    (kind = 'refund'  and amount <  0)
  )
);
create index on public.payments (branch_id, paid_on);
create index on public.payments (contract_id);
create index on public.payments (member_id);


-- =====================================================================
-- 10. PT 세션
--     1회 진행 = 1행. 잔여 횟수만 깎으면 트레이너 실적도 노쇼도 못 본다.
-- =====================================================================
create table public.pt_sessions (
  id          uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts(id),
  member_id   uuid not null references public.members(id),
  trainer_id  uuid not null references public.staff(id),
  branch_id   uuid not null references public.branches(id),

  session_at  timestamptz not null default now(),
  status      text not null default 'completed'
                check (status in ('completed','noshow','cancelled')),
  deducted    boolean not null default true,   -- 노쇼 차감 정책에 따라 조정
  memo        text,

  created_at  timestamptz not null default now(),
  created_by  uuid references public.staff(id)
);
create index on public.pt_sessions (contract_id);
create index on public.pt_sessions (trainer_id, session_at);
create index on public.pt_sessions (branch_id, session_at);

-- 세션이 바뀌면 계약의 사용 횟수를 다시 센다
create or replace function public.trg_recount_sessions()
returns trigger language plpgsql as $$
declare
  v_contract uuid := coalesce(new.contract_id, old.contract_id);
begin
  update public.contracts c
     set used_sessions = (
           select count(*) from public.pt_sessions s
            where s.contract_id = v_contract
              and s.deducted
              and s.status <> 'cancelled'
         )
   where c.id = v_contract;
  return coalesce(new, old);
end $$;

create trigger t_sessions_recount
  after insert or update or delete on public.pt_sessions
  for each row execute function public.trg_recount_sessions();


-- =====================================================================
-- 11. 상담
-- =====================================================================
create table public.consultations (
  id                     uuid primary key default gen_random_uuid(),
  branch_id              uuid not null references public.branches(id),
  name                   text not null,
  phone                  text,
  acquisition_channel_id uuid references public.acquisition_channels(id),
  consulted_on           date not null default current_date,
  staff_id               uuid references public.staff(id),   -- 상담자

  result                 text not null default 'pending'
                           check (result in ('pending','registered','hold','lost')),
  registered_member_id   uuid references public.members(id), -- 등록 전환된 회원
  next_contact_on        date,                               -- 보류 고객 재연락일
  memo                   text,

  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  created_by             uuid references public.staff(id)
);
create index on public.consultations (branch_id, consulted_on);
create index on public.consultations (next_contact_on)
  where result = 'hold';
create trigger t_consultations_updated before update on public.consultations
  for each row execute function public.touch_updated_at();


-- =====================================================================
-- 12. 출입 기록 (자리만 만들어 둠 — 지금은 쓰지 않는다)
--     브로제이 등 외부 출입 시스템에서 받아올 때를 대비.
-- =====================================================================
create table public.check_ins (
  id            uuid primary key default gen_random_uuid(),
  member_id     uuid not null references public.members(id),
  branch_id     uuid not null references public.branches(id),
  checked_in_at timestamptz not null,
  source        text not null default 'manual'
                  check (source in ('manual','broj','kiosk','import')),
  external_ref  text,
  created_at    timestamptz not null default now()
);
create index on public.check_ins (branch_id, checked_in_at);
create index on public.check_ins (member_id, checked_in_at);
create unique index on public.check_ins (source, external_ref)
  where external_ref is not null;


-- =====================================================================
-- 13. 변경 이력
-- =====================================================================
create table public.audit_logs (
  id          bigserial primary key,
  table_name  text not null,
  record_id   uuid not null,
  action      text not null check (action in ('insert','update','delete')),
  actor_id    uuid,
  before      jsonb,
  after       jsonb,
  created_at  timestamptz not null default now()
);
create index on public.audit_logs (table_name, record_id);
create index on public.audit_logs (created_at);


-- =====================================================================
-- 14. 대시보드용 뷰
-- =====================================================================

-- 월별 · 지점별 매출 (환불이 음수로 들어가 자동 차감됨)
create or replace view public.v_monthly_revenue as
select
  p.branch_id,
  date_trunc('month', p.paid_on)::date as month,
  pr.kind                              as product_kind,
  sum(p.amount)                        as revenue,
  count(*) filter (where p.kind = 'payment') as payment_count,
  sum(p.amount) filter (where p.kind = 'refund') as refund_amount
from public.payments p
join public.contracts c on c.id = p.contract_id
join public.products  pr on pr.id = c.product_id
group by 1, 2, 3;

-- 만료 임박 계약 (기간제)
create or replace view public.v_expiring_contracts as
select
  c.id as contract_id,
  c.branch_id,
  c.member_id,
  m.name  as member_name,
  m.phone as member_phone,
  pr.name as product_name,
  c.ends_on,
  (c.ends_on - current_date) as days_left
from public.contracts c
join public.members  m  on m.id = c.member_id
join public.products pr on pr.id = c.product_id
where c.status = 'active'
  and c.ends_on is not null
  and c.ends_on >= current_date
  and c.ends_on <= current_date + 30;

-- 소진 임박 PT 계약 (재결제 시점)
create or replace view public.v_low_session_contracts as
select
  c.id as contract_id,
  c.branch_id,
  c.member_id,
  m.name as member_name,
  m.phone as member_phone,
  c.trainer_id,
  c.total_sessions,
  c.used_sessions,
  (c.total_sessions - c.used_sessions) as sessions_left
from public.contracts c
join public.members m on m.id = c.member_id
where c.status = 'active'
  and c.total_sessions is not null
  and (c.total_sessions - c.used_sessions) between 0 and 2;

-- 상담 전환율
create or replace view public.v_consultation_conversion as
select
  branch_id,
  date_trunc('month', consulted_on)::date as month,
  count(*)                                        as total,
  count(*) filter (where result = 'registered')   as registered,
  round(
    count(*) filter (where result = 'registered')::numeric
    / nullif(count(*), 0) * 100, 1
  ) as conversion_rate
from public.consultations
group by 1, 2;

-- 트레이너별 세션 실적
create or replace view public.v_trainer_sessions as
select
  s.trainer_id,
  s.branch_id,
  date_trunc('month', s.session_at)::date as month,
  count(*) filter (where s.status = 'completed') as completed,
  count(*) filter (where s.status = 'noshow')    as noshow,
  count(*) filter (where s.status = 'cancelled') as cancelled
from public.pt_sessions s
group by 1, 2, 3;


-- =====================================================================
-- 15. 접근 권한 (RLS)
--     "A지점 직원은 A지점만 본다"를 DB가 강제한다.
--     앱 코드에서 실수해도 다른 지점 데이터는 나가지 않는다.
-- =====================================================================

create or replace function public.my_role()
returns text language sql stable security definer set search_path = public as $$
  select role from public.staff where id = auth.uid() and is_active
$$;

create or replace function public.my_branch()
returns uuid language sql stable security definer set search_path = public as $$
  select branch_id from public.staff where id = auth.uid() and is_active
$$;

-- 전 지점 조회 가능 여부: 관장이거나, 소속 지점이 없는(본사) 계정
create or replace function public.can_see_all_branches()
returns boolean language sql stable as $$
  select public.my_role() = 'owner' or public.my_branch() is null
$$;

create or replace function public.can_see_branch(b uuid)
returns boolean language sql stable as $$
  select public.can_see_all_branches() or public.my_branch() = b
$$;

-- 쓰기 권한: 트레이너는 PT 세션만 쓰고 회원·결제는 못 건드린다
create or replace function public.can_write()
returns boolean language sql stable as $$
  select public.my_role() in ('owner','manager','desk')
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'branches','staff','acquisition_channels','products','members',
    'contracts','contract_holds','contract_transfers','payments',
    'pt_sessions','consultations','check_ins','audit_logs'
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- 지점 자체
create policy branches_read on public.branches for select to authenticated
  using (public.can_see_all_branches() or id = public.my_branch());
create policy branches_write on public.branches for all to authenticated
  using (public.my_role() = 'owner') with check (public.my_role() = 'owner');

-- 직원
create policy staff_read on public.staff for select to authenticated
  using (id = auth.uid() or public.can_see_branch(branch_id));
create policy staff_write on public.staff for all to authenticated
  using (public.my_role() = 'owner') with check (public.my_role() = 'owner');

-- 유입경로: 전 직원 조회, 관장만 수정
create policy channels_read on public.acquisition_channels for select
  to authenticated using (true);
create policy channels_write on public.acquisition_channels for all
  to authenticated using (public.my_role() = 'owner')
  with check (public.my_role() = 'owner');

-- 상품
create policy products_read on public.products for select to authenticated
  using (branch_id is null or public.can_see_branch(branch_id));
create policy products_write on public.products for all to authenticated
  using (public.my_role() in ('owner','manager'))
  with check (public.my_role() in ('owner','manager'));

-- 지점 단위 업무 테이블: 읽기는 소속 지점, 쓰기는 데스크 이상
do $$
declare t text;
begin
  foreach t in array array[
    'members','contracts','contract_holds','contract_transfers',
    'payments','consultations','check_ins'
  ] loop
    execute format($f$
      create policy %1$s_read on public.%1$I for select to authenticated
        using (public.can_see_branch(branch_id));
      create policy %1$s_write on public.%1$I for all to authenticated
        using (public.can_see_branch(branch_id) and public.can_write())
        with check (public.can_see_branch(branch_id) and public.can_write());
    $f$, t);
  end loop;
end $$;

-- PT 세션: 트레이너도 쓸 수 있어야 한다 (본인 세션만)
create policy pt_sessions_read on public.pt_sessions for select to authenticated
  using (public.can_see_branch(branch_id));
create policy pt_sessions_write on public.pt_sessions for all to authenticated
  using (
    public.can_see_branch(branch_id)
    and (public.can_write() or trainer_id = auth.uid())
  )
  with check (
    public.can_see_branch(branch_id)
    and (public.can_write() or trainer_id = auth.uid())
  );

-- 변경 이력: 관장만 조회, 아무도 직접 수정 못 함
create policy audit_read on public.audit_logs for select to authenticated
  using (public.my_role() = 'owner');
