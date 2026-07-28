-- register_member() 검증
\set ON_ERROR_STOP on
set client_min_messages = notice;
set plpgsql.check_asserts = on;

begin;

insert into auth.users (id) values ('99999999-9999-9999-9999-999999999999');
insert into public.branches (id, code, name)
  values ('a0000000-0000-0000-0000-000000000001', 'ZT9', '테스트점');
insert into public.staff (id, branch_id, name, role)
  values ('99999999-9999-9999-9999-999999999999',
          'a0000000-0000-0000-0000-000000000001', '테스트데스크', 'desk');
insert into public.products (id, name, kind, duration_days, list_price)
  values ('b0000000-0000-0000-0000-000000000001', '테스트 3개월권', 'membership', 90, 240000);
insert into public.products (id, name, kind, session_count, list_price)
  values ('b0000000-0000-0000-0000-000000000002', '테스트 PT 10회', 'pt', 10, 750000);
insert into public.consultations (id, branch_id, name, consulted_on, result)
  values ('c0000000-0000-0000-0000-000000000001',
          'a0000000-0000-0000-0000-000000000001', '상담자', current_date, 'hold');

-- ── 1. 기간제: 만료일이 상품 기간대로 잡히는가 ────────────────────
do $$
declare v_id uuid; v_ends date; v_paid int;
begin
  v_id := public.register_member(
    p_branch_id      => 'a0000000-0000-0000-0000-000000000001',
    p_name           => '홍길동',
    p_product_id     => 'b0000000-0000-0000-0000-000000000001',
    p_started_on     => '2026-03-01',
    p_contract_price => 240000,
    p_paid_amount    => 240000,
    p_phone          => '010-1234-5678'
  );

  select c.ends_on into v_ends from public.contracts c where c.member_id = v_id;
  assert v_ends = '2026-05-30', format('만료일 틀림: %s (기대 2026-05-30)', v_ends);

  select sum(p.amount) into v_paid from public.payments p where p.member_id = v_id;
  assert v_paid = 240000, format('결제액 틀림: %s', v_paid);

  raise notice '[통과] 기간제 등록 → 만료일 % / 결제 % 자동 생성', v_ends, v_paid;
end $$;

-- ── 2. 횟수제: 총 횟수가 상품에서 따라오는가 ──────────────────────
do $$
declare v_id uuid; v_total int; v_ends date;
begin
  v_id := public.register_member(
    p_branch_id      => 'a0000000-0000-0000-0000-000000000001',
    p_name           => '김철수',
    p_product_id     => 'b0000000-0000-0000-0000-000000000002',
    p_started_on     => current_date,
    p_contract_price => 750000,
    p_paid_amount    => 750000
  );
  select total_sessions, ends_on into v_total, v_ends
    from public.contracts where member_id = v_id;
  assert v_total = 10, format('총 횟수 틀림: %s', v_total);
  assert v_ends is null, 'PT 계약에 만료일이 잘못 들어감';
  raise notice '[통과] 횟수제 등록 → 총 %회, 만료일 없음', v_total;
end $$;

-- ── 3. 미수금: 계약 40만인데 20만만 받은 경우 ─────────────────────
do $$
declare v_id uuid; v_price int; v_paid int;
begin
  v_id := public.register_member(
    p_branch_id      => 'a0000000-0000-0000-0000-000000000001',
    p_name           => '박미수',
    p_product_id     => 'b0000000-0000-0000-0000-000000000001',
    p_started_on     => current_date,
    p_contract_price => 400000,
    p_paid_amount    => 200000
  );
  select contract_price into v_price from public.contracts where member_id = v_id;
  select coalesce(sum(amount),0) into v_paid from public.payments where member_id = v_id;
  assert v_price - v_paid = 200000, format('미수금 계산 틀림: %s', v_price - v_paid);
  raise notice '[통과] 부분 결제 → 미수금 %원이 남는 것으로 기록', v_price - v_paid;
end $$;

-- ── 4. 상담 전환: 등록하면 상담이 자동으로 '등록'이 되는가 ────────
do $$
declare v_id uuid; v_result text; v_linked uuid;
begin
  v_id := public.register_member(
    p_branch_id       => 'a0000000-0000-0000-0000-000000000001',
    p_name            => '상담자',
    p_product_id      => 'b0000000-0000-0000-0000-000000000001',
    p_started_on      => current_date,
    p_contract_price  => 240000,
    p_paid_amount     => 240000,
    p_consultation_id => 'c0000000-0000-0000-0000-000000000001'
  );
  select result, registered_member_id into v_result, v_linked
    from public.consultations where id = 'c0000000-0000-0000-0000-000000000001';
  assert v_result = 'registered', format('상담 상태 틀림: %s', v_result);
  assert v_linked = v_id, '상담과 회원이 연결되지 않음';
  raise notice '[통과] 상담 → 등록 전환이 자동 반영됨 (전환율 계산의 근거)';
end $$;

-- ── 5. 잘못된 입력을 막는가 ───────────────────────────────────────
do $$
begin
  begin
    perform public.register_member(
      p_branch_id => 'a0000000-0000-0000-0000-000000000001',
      p_name => '과다결제', p_product_id => 'b0000000-0000-0000-0000-000000000001',
      p_started_on => current_date, p_contract_price => 100000, p_paid_amount => 200000);
    raise exception '계약금액보다 큰 결제가 통과됨';
  exception when raise_exception then
    if sqlerrm like '%보다 큽니다%' then
      raise notice '[통과] 계약 금액보다 큰 결제를 차단함';
    else raise;
    end if;
  end;

  begin
    perform public.register_member(
      p_branch_id => 'a0000000-0000-0000-0000-000000000001',
      p_name => '없는상품', p_product_id => gen_random_uuid(),
      p_started_on => current_date, p_contract_price => 100000);
    raise exception '존재하지 않는 상품이 통과됨';
  exception when raise_exception then
    if sqlerrm like '%존재하지 않는 상품%' then
      raise notice '[통과] 존재하지 않는 상품을 차단함';
    else raise;
    end if;
  end;
end $$;

-- ── 6. 원자성: 실패하면 회원도 안 남는가 ──────────────────────────
do $$
declare v_before int; v_after int;
begin
  select count(*) into v_before from public.members;
  begin
    perform public.register_member(
      p_branch_id => 'a0000000-0000-0000-0000-000000000001',
      p_name => '유령회원', p_product_id => 'b0000000-0000-0000-0000-000000000001',
      p_started_on => current_date, p_contract_price => 100000, p_paid_amount => 999999);
  exception when others then null;
  end;
  select count(*) into v_after from public.members;
  assert v_before = v_after,
    format('실패한 등록인데 회원이 남음: % → %', v_before, v_after);
  raise notice '[통과] 등록 실패 시 회원도 남지 않음 (유령 데이터 방지)';
end $$;

rollback;

\echo ''
\echo '=== register_member 검증 통과 ==='
