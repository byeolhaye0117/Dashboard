-- =====================================================================
-- 실제 헬스장 업무 시나리오로 스키마를 검증한다.
-- 각 블록은 "이런 일이 실제로 벌어졌을 때 숫자가 맞게 나오는가"를 확인한다.
-- 실행: psql -d gym -f supabase/tests/scenario_test.sql
-- =====================================================================
\set ON_ERROR_STOP on
set client_min_messages = notice;
-- assert 가 꺼져 있으면 테스트가 통째로 무의미해진다. 명시적으로 켠다.
set plpgsql.check_asserts = on;

begin;

-- ── 기초 데이터 ──────────────────────────────────────────────────────
insert into auth.users (id) values
  ('11111111-1111-1111-1111-111111111111'),  -- 관장
  ('22222222-2222-2222-2222-222222222222'),  -- 강남 데스크
  ('33333333-3333-3333-3333-333333333333');  -- 강남 트레이너

insert into public.branches (id, code, name) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'GN', '강남점'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'SW', '수원점');

insert into public.staff (id, branch_id, name, role) values
  ('11111111-1111-1111-1111-111111111111', null, '관장', 'owner'),
  ('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-0000-0000-0000-000000000001', '김데스크', 'desk'),
  ('33333333-3333-3333-3333-333333333333', 'aaaaaaaa-0000-0000-0000-000000000001', '박트레이너', 'trainer');

insert into public.acquisition_channels (id, name) values
  ('cccccccc-0000-0000-0000-000000000001', '네이버블로그'),
  ('cccccccc-0000-0000-0000-000000000002', '지인소개');

insert into public.products (id, branch_id, name, kind, duration_days, session_count, list_price) values
  ('bbbbbbbb-0000-0000-0000-000000000001', null, '3개월 회원권', 'membership', 90,  null, 330000),
  ('bbbbbbbb-0000-0000-0000-000000000002', null, 'PT 20회',      'pt',         null, 20,   1400000),
  ('bbbbbbbb-0000-0000-0000-000000000003', null, '락커 3개월',   'addon',      90,  null, 60000);


-- ─────────────────────────────────────────────────────────────────────
-- 시나리오 1. 회원권 정지 → 만료일이 자동으로 밀리는가
--   1/1 등록, 90일권 → 원래 만료 4/1 (1/1 + 90일)
--   2/1 ~ 2/15 정지 (15일) → 만료일이 15일 밀려야 함
-- ─────────────────────────────────────────────────────────────────────
insert into public.members (id, branch_id, name, phone, acquisition_channel_id, first_registered_on)
values ('dddddddd-0000-0000-0000-000000000001',
        'aaaaaaaa-0000-0000-0000-000000000001', '이회원', '010-1111-2222',
        'cccccccc-0000-0000-0000-000000000001', '2026-01-01');

insert into public.contracts
  (id, member_id, branch_id, product_id, seller_id,
   started_on, base_ends_on, ends_on, list_price, contract_price)
values
  ('eeeeeeee-0000-0000-0000-000000000001',
   'dddddddd-0000-0000-0000-000000000001',
   'aaaaaaaa-0000-0000-0000-000000000001',
   'bbbbbbbb-0000-0000-0000-000000000001',
   '22222222-2222-2222-2222-222222222222',
   '2026-01-01', '2026-04-01', '2026-04-01', 330000, 330000);

do $$
declare v date;
begin
  select ends_on into v from public.contracts
   where id = 'eeeeeeee-0000-0000-0000-000000000001';
  assert v = '2026-04-01', format('정지 전 만료일이 틀림: %s', v);
end $$;

-- 2/1 ~ 2/15 정지 (양 끝 포함 15일)
insert into public.contract_holds (contract_id, branch_id, starts_on, ends_on, status, reason)
values ('eeeeeeee-0000-0000-0000-000000000001',
        'aaaaaaaa-0000-0000-0000-000000000001',
        '2026-02-01', '2026-02-15', 'ended', '해외 출장');

do $$
declare v date;
begin
  select ends_on into v from public.contracts
   where id = 'eeeeeeee-0000-0000-0000-000000000001';
  assert v = '2026-04-16', format('정지 15일 반영 후 만료일이 틀림: %s (기대 2026-04-16)', v);
  raise notice '[통과] 시나리오1: 15일 정지 → 만료일 04-01 에서 % 로 자동 연장', v;
end $$;

-- 정지를 취소하면 만료일도 원복되는가
update public.contract_holds set status = 'cancelled'
 where contract_id = 'eeeeeeee-0000-0000-0000-000000000001';

do $$
declare v date;
begin
  select ends_on into v from public.contracts
   where id = 'eeeeeeee-0000-0000-0000-000000000001';
  assert v = '2026-04-01', format('정지 취소 후 원복 실패: %s', v);
  raise notice '[통과] 시나리오1: 정지 취소 → 만료일 % 로 원복', v;
end $$;

-- 다시 살려둔다 (이후 시나리오에서 사용)
update public.contract_holds set status = 'ended'
 where contract_id = 'eeeeeeee-0000-0000-0000-000000000001';


-- ─────────────────────────────────────────────────────────────────────
-- 시나리오 2. 분할결제 → 월 매출이 결제 시점 기준으로 나뉘는가
--   330,000원을 1월에 20만, 2월에 13만으로 나눠 받음
-- ─────────────────────────────────────────────────────────────────────
insert into public.payments
  (contract_id, member_id, branch_id, amount, paid_on, method, installment_no, installment_total)
values
  ('eeeeeeee-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001',
   'aaaaaaaa-0000-0000-0000-000000000001', 200000, '2026-01-05', 'card', 1, 2),
  ('eeeeeeee-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001',
   'aaaaaaaa-0000-0000-0000-000000000001', 130000, '2026-02-05', 'transfer', 2, 2);

do $$
declare jan int; feb int;
begin
  select revenue into jan from public.v_monthly_revenue
   where month = '2026-01-01' and branch_id = 'aaaaaaaa-0000-0000-0000-000000000001'
     and product_kind = 'membership';
  select revenue into feb from public.v_monthly_revenue
   where month = '2026-02-01' and branch_id = 'aaaaaaaa-0000-0000-0000-000000000001'
     and product_kind = 'membership';
  assert jan = 200000, format('1월 매출 틀림: %s', jan);
  assert feb = 130000, format('2월 매출 틀림: %s', feb);
  raise notice '[통과] 시나리오2: 분할결제 33만원 → 1월 % / 2월 % 으로 분리 집계', jan, feb;
end $$;


-- ─────────────────────────────────────────────────────────────────────
-- 시나리오 3. 환불 → 원본은 남고 매출에서만 빠지는가
--   3월에 PT 140만원 결제 후, 같은 달 50만원 부분환불
-- ─────────────────────────────────────────────────────────────────────
insert into public.members (id, branch_id, name, phone, first_registered_on)
values ('dddddddd-0000-0000-0000-000000000002',
        'aaaaaaaa-0000-0000-0000-000000000001', '최회원', '010-3333-4444', '2026-03-02');

insert into public.contracts
  (id, member_id, branch_id, product_id, seller_id, trainer_id,
   started_on, total_sessions, list_price, contract_price)
values
  ('eeeeeeee-0000-0000-0000-000000000002',
   'dddddddd-0000-0000-0000-000000000002',
   'aaaaaaaa-0000-0000-0000-000000000001',
   'bbbbbbbb-0000-0000-0000-000000000002',
   '22222222-2222-2222-2222-222222222222',
   '33333333-3333-3333-3333-333333333333',
   '2026-03-02', 20, 1400000, 1400000);

insert into public.payments
  (id, contract_id, member_id, branch_id, amount, paid_on, method)
values
  ('ffffffff-0000-0000-0000-000000000001',
   'eeeeeeee-0000-0000-0000-000000000002', 'dddddddd-0000-0000-0000-000000000002',
   'aaaaaaaa-0000-0000-0000-000000000001', 1400000, '2026-03-02', 'card');

insert into public.payments
  (contract_id, member_id, branch_id, kind, amount, paid_on, method, refund_of_id, memo)
values
  ('eeeeeeee-0000-0000-0000-000000000002', 'dddddddd-0000-0000-0000-000000000002',
   'aaaaaaaa-0000-0000-0000-000000000001', 'refund', -500000, '2026-03-20', 'card',
   'ffffffff-0000-0000-0000-000000000001', '개인사정 중도환불');

do $$
declare net int; rows int;
begin
  select revenue into net from public.v_monthly_revenue
   where month = '2026-03-01' and product_kind = 'pt';
  select count(*) into rows from public.payments
   where contract_id = 'eeeeeeee-0000-0000-0000-000000000002';
  assert net = 900000, format('3월 PT 실매출 틀림: %s (기대 900000)', net);
  assert rows = 2, format('결제 기록이 사라짐: %s행 (기대 2행)', rows);
  raise notice '[통과] 시나리오3: 140만 결제 + 50만 환불 → 실매출 %, 기록은 %행 모두 보존', net, rows;
end $$;

-- 환불을 양수로 넣는 실수를 DB가 막는가
do $$
begin
  begin
    insert into public.payments (contract_id, member_id, branch_id, kind, amount, paid_on)
    values ('eeeeeeee-0000-0000-0000-000000000002', 'dddddddd-0000-0000-0000-000000000002',
            'aaaaaaaa-0000-0000-0000-000000000001', 'refund', 500000, '2026-03-21');
    raise exception '환불을 양수로 넣었는데 통과됨 — 제약조건이 동작하지 않는다';
  exception when check_violation then
    raise notice '[통과] 시나리오3: 환불 금액을 양수로 넣으려 하자 DB가 차단함';
  end;
end $$;


-- ─────────────────────────────────────────────────────────────────────
-- 시나리오 4. PT 세션 체크 → 사용/잔여 횟수가 자동으로 맞는가
--   20회권에서 3회 진행 + 1회 노쇼(차감) + 1회 취소(차감 안 함)
-- ─────────────────────────────────────────────────────────────────────
insert into public.pt_sessions
  (contract_id, member_id, trainer_id, branch_id, session_at, status, deducted)
values
  ('eeeeeeee-0000-0000-0000-000000000002', 'dddddddd-0000-0000-0000-000000000002',
   '33333333-3333-3333-3333-333333333333', 'aaaaaaaa-0000-0000-0000-000000000001',
   '2026-03-03 10:00+09', 'completed', true),
  ('eeeeeeee-0000-0000-0000-000000000002', 'dddddddd-0000-0000-0000-000000000002',
   '33333333-3333-3333-3333-333333333333', 'aaaaaaaa-0000-0000-0000-000000000001',
   '2026-03-05 10:00+09', 'completed', true),
  ('eeeeeeee-0000-0000-0000-000000000002', 'dddddddd-0000-0000-0000-000000000002',
   '33333333-3333-3333-3333-333333333333', 'aaaaaaaa-0000-0000-0000-000000000001',
   '2026-03-07 10:00+09', 'completed', true),
  ('eeeeeeee-0000-0000-0000-000000000002', 'dddddddd-0000-0000-0000-000000000002',
   '33333333-3333-3333-3333-333333333333', 'aaaaaaaa-0000-0000-0000-000000000001',
   '2026-03-09 10:00+09', 'noshow', true),      -- 노쇼도 차감하는 정책
  ('eeeeeeee-0000-0000-0000-000000000002', 'dddddddd-0000-0000-0000-000000000002',
   '33333333-3333-3333-3333-333333333333', 'aaaaaaaa-0000-0000-0000-000000000001',
   '2026-03-11 10:00+09', 'cancelled', false);  -- 사전 취소는 차감 안 함

do $$
declare used int; left_ int;
begin
  select c.used_sessions, public.contract_remaining_sessions(c)
    into used, left_
    from public.contracts c where c.id = 'eeeeeeee-0000-0000-0000-000000000002';
  assert used = 4,  format('사용 횟수 틀림: %s (기대 4 = 진행3 + 노쇼1)', used);
  assert left_ = 16, format('잔여 횟수 틀림: %s (기대 16)', left_);
  raise notice '[통과] 시나리오4: 20회권 → 사용 %회(진행3+노쇼1), 잔여 %회 자동 계산', used, left_;
end $$;

-- 노쇼를 나중에 "차감 안 함"으로 정정하면 잔여가 되돌아오는가
update public.pt_sessions set deducted = false
 where contract_id = 'eeeeeeee-0000-0000-0000-000000000002' and status = 'noshow';

do $$
declare used int;
begin
  select used_sessions into used from public.contracts
   where id = 'eeeeeeee-0000-0000-0000-000000000002';
  assert used = 3, format('노쇼 정정 후 사용 횟수 틀림: %s (기대 3)', used);
  raise notice '[통과] 시나리오4: 노쇼 차감 취소 → 사용 %회로 자동 정정', used;
end $$;

-- 총 횟수를 넘겨 사용하는 것을 DB가 막는가
do $$
begin
  begin
    update public.contracts set used_sessions = 25
     where id = 'eeeeeeee-0000-0000-0000-000000000002';
    raise exception '20회권을 25회 사용 처리했는데 통과됨';
  exception when check_violation then
    raise notice '[통과] 시나리오4: 총 횟수 초과 사용을 DB가 차단함';
  end;
end $$;


-- ─────────────────────────────────────────────────────────────────────
-- 시나리오 5. 만료 임박 목록 / 소진 임박 목록이 잡히는가
-- ─────────────────────────────────────────────────────────────────────
insert into public.members (id, branch_id, name, phone, first_registered_on)
values ('dddddddd-0000-0000-0000-000000000003',
        'aaaaaaaa-0000-0000-0000-000000000001', '곧만료', '010-5555-6666', current_date - 80);

insert into public.contracts
  (id, member_id, branch_id, product_id, started_on, base_ends_on, ends_on,
   list_price, contract_price)
values
  ('eeeeeeee-0000-0000-0000-000000000003',
   'dddddddd-0000-0000-0000-000000000003',
   'aaaaaaaa-0000-0000-0000-000000000001',
   'bbbbbbbb-0000-0000-0000-000000000001',
   current_date - 80, current_date + 10, current_date + 10, 330000, 330000);

do $$
declare n int; d int;
begin
  select count(*) into n from public.v_expiring_contracts
   where member_name = '곧만료';
  select days_left into d from public.v_expiring_contracts
   where member_name = '곧만료';
  assert n = 1, '만료 임박 목록에 안 잡힘';
  assert d = 10, format('남은 일수 틀림: %s', d);
  raise notice '[통과] 시나리오5: 만료 %일 남은 회원이 임박 목록에 잡힘', d;
end $$;

-- 소진 임박 PT (잔여 2회 이하)
update public.contracts set used_sessions = 18
 where id = 'eeeeeeee-0000-0000-0000-000000000002';

do $$
declare n int;
begin
  select count(*) into n from public.v_low_session_contracts
   where member_name = '최회원';
  assert n = 1, 'PT 소진 임박 목록에 안 잡힘';
  raise notice '[통과] 시나리오5: 잔여 2회 PT 회원이 재결제 대상 목록에 잡힘';
end $$;


-- ─────────────────────────────────────────────────────────────────────
-- 시나리오 6. 상담 → 등록 전환율
--   강남점 3월: 상담 4건 중 1건 등록 = 25%
-- ─────────────────────────────────────────────────────────────────────
insert into public.consultations
  (branch_id, name, phone, acquisition_channel_id, consulted_on, result, registered_member_id)
values
  ('aaaaaaaa-0000-0000-0000-000000000001', '최회원', '010-3333-4444',
   'cccccccc-0000-0000-0000-000000000001', '2026-03-02', 'registered',
   'dddddddd-0000-0000-0000-000000000002'),
  ('aaaaaaaa-0000-0000-0000-000000000001', '문의A', '010-0000-0001',
   'cccccccc-0000-0000-0000-000000000001', '2026-03-04', 'hold', null),
  ('aaaaaaaa-0000-0000-0000-000000000001', '문의B', '010-0000-0002',
   'cccccccc-0000-0000-0000-000000000002', '2026-03-06', 'lost', null),
  ('aaaaaaaa-0000-0000-0000-000000000001', '문의C', '010-0000-0003',
   'cccccccc-0000-0000-0000-000000000002', '2026-03-08', 'pending', null);

do $$
declare rate numeric; tot int;
begin
  select conversion_rate, total into rate, tot
    from public.v_consultation_conversion
   where month = '2026-03-01'
     and branch_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  assert tot = 4, format('상담 건수 틀림: %s', tot);
  assert rate = 25.0, format('전환율 틀림: %s (기대 25.0)', rate);
  raise notice '[통과] 시나리오6: 상담 %건 중 1건 등록 → 전환율 %%%', tot, rate;
end $$;


-- ─────────────────────────────────────────────────────────────────────
-- 시나리오 7. 양도 — A회원 계약을 B회원에게 넘김
-- ─────────────────────────────────────────────────────────────────────
insert into public.members (id, branch_id, name, phone, first_registered_on)
values ('dddddddd-0000-0000-0000-000000000004',
        'aaaaaaaa-0000-0000-0000-000000000001', '양수인', '010-7777-8888', current_date);

-- 새 계약 생성 (양수인 명의, 잔여 기간 그대로 승계)
insert into public.contracts
  (id, member_id, branch_id, product_id, started_on, base_ends_on, ends_on,
   list_price, contract_price, memo)
values
  ('eeeeeeee-0000-0000-0000-000000000004',
   'dddddddd-0000-0000-0000-000000000004',
   'aaaaaaaa-0000-0000-0000-000000000001',
   'bbbbbbbb-0000-0000-0000-000000000001',
   current_date, current_date + 10, current_date + 10,
   0, 0, '곧만료 회원으로부터 양도받음');

-- 원 계약 닫기
update public.contracts set status = 'transferred_out'
 where id = 'eeeeeeee-0000-0000-0000-000000000003';

insert into public.contract_transfers
  (from_contract_id, to_contract_id, from_member_id, to_member_id, branch_id,
   transferred_on, fee, remaining_days)
values
  ('eeeeeeee-0000-0000-0000-000000000003', 'eeeeeeee-0000-0000-0000-000000000004',
   'dddddddd-0000-0000-0000-000000000003', 'dddddddd-0000-0000-0000-000000000004',
   'aaaaaaaa-0000-0000-0000-000000000001', current_date, 30000, 10);

do $$
declare n int; old_status text;
begin
  -- 양도된 원 계약은 만료 임박 목록에서 빠져야 한다 (연락하면 안 되는 사람)
  select count(*) into n from public.v_expiring_contracts where member_name = '곧만료';
  assert n = 0, '양도한 원 계약이 아직 만료 임박 목록에 남아있음';

  -- 양수인 계약은 목록에 들어와야 한다
  select count(*) into n from public.v_expiring_contracts where member_name = '양수인';
  assert n = 1, '양수인 계약이 만료 임박 목록에 안 잡힘';

  raise notice '[통과] 시나리오7: 양도 처리 → 원 계약은 목록에서 빠지고 양수인이 들어옴';
end $$;


-- ─────────────────────────────────────────────────────────────────────
-- 시나리오 8. 개인정보 파기 요청 — 이름/연락처는 지우되 매출은 남는가
-- ─────────────────────────────────────────────────────────────────────
do $$
declare before_rev int; after_rev int;
begin
  select sum(revenue) into before_rev from public.v_monthly_revenue
   where month = '2026-03-01';

  update public.members
     set name = '삭제된 회원', phone = null, anonymized_at = now()
   where id = 'dddddddd-0000-0000-0000-000000000002';

  select sum(revenue) into after_rev from public.v_monthly_revenue
   where month = '2026-03-01';

  assert before_rev = after_rev,
    format('개인정보 파기 후 매출이 바뀜: % → %', before_rev, after_rev);
  raise notice '[통과] 시나리오8: 개인정보 파기 후에도 3월 매출 % 유지', after_rev;
end $$;


-- ─────────────────────────────────────────────────────────────────────
-- 시나리오 9. 지점 격리 — 수원점 데이터가 강남 집계에 섞이지 않는가
-- ─────────────────────────────────────────────────────────────────────
insert into public.members (id, branch_id, name, first_registered_on)
values ('dddddddd-0000-0000-0000-000000000005',
        'aaaaaaaa-0000-0000-0000-000000000002', '수원회원', '2026-03-01');

insert into public.contracts
  (id, member_id, branch_id, product_id, started_on, base_ends_on, ends_on,
   list_price, contract_price)
values
  ('eeeeeeee-0000-0000-0000-000000000005',
   'dddddddd-0000-0000-0000-000000000005',
   'aaaaaaaa-0000-0000-0000-000000000002',
   'bbbbbbbb-0000-0000-0000-000000000001',
   '2026-03-01', '2026-05-30', '2026-05-30', 330000, 330000);

insert into public.payments (contract_id, member_id, branch_id, amount, paid_on)
values ('eeeeeeee-0000-0000-0000-000000000005', 'dddddddd-0000-0000-0000-000000000005',
        'aaaaaaaa-0000-0000-0000-000000000002', 330000, '2026-03-01');

do $$
declare gn int; sw int;
begin
  select coalesce(sum(revenue),0) into gn from public.v_monthly_revenue
   where month = '2026-03-01' and branch_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  select coalesce(sum(revenue),0) into sw from public.v_monthly_revenue
   where month = '2026-03-01' and branch_id = 'aaaaaaaa-0000-0000-0000-000000000002';
  assert gn = 900000, format('강남 3월 매출 틀림: %s', gn);
  assert sw = 330000, format('수원 3월 매출 틀림: %s', sw);
  raise notice '[통과] 시나리오9: 지점별 3월 매출 분리 — 강남 % / 수원 %', gn, sw;
end $$;


-- ─────────────────────────────────────────────────────────────────────
-- 시나리오 10. 브로제이 등 외부 시스템 중복 유입 방지
-- ─────────────────────────────────────────────────────────────────────
insert into public.members (branch_id, name, source, external_ref, first_registered_on)
values ('aaaaaaaa-0000-0000-0000-000000000001', '연동회원', 'broj', 'BROJ-10001', current_date);

do $$
begin
  begin
    insert into public.members (branch_id, name, source, external_ref, first_registered_on)
    values ('aaaaaaaa-0000-0000-0000-000000000001', '연동회원', 'broj', 'BROJ-10001', current_date);
    raise exception '같은 외부 ID가 두 번 들어왔는데 통과됨';
  exception when unique_violation then
    raise notice '[통과] 시나리오10: 같은 외부 ID 재유입을 DB가 차단함 (동기화 중복 방지)';
  end;
end $$;

rollback;

\echo ''
\echo '===================================================='
\echo ' 전체 시나리오 통과'
\echo '===================================================='
