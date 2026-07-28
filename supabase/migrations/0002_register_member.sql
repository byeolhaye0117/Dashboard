-- =====================================================================
-- 회원 등록 = 회원 + 계약 + 결제 (+ 상담 전환) 을 한 번에 처리한다.
--
-- 앱에서 INSERT를 세 번 나눠 보내면, 중간에 실패했을 때
-- "회원은 만들어졌는데 계약이 없는" 유령 데이터가 남는다.
-- 데스크에서 이런 게 하루에 몇 건만 생겨도 명단을 못 믿게 된다.
-- 그래서 한 함수 = 한 트랜잭션으로 묶는다.
--
-- SECURITY INVOKER(기본)이므로 호출한 직원의 RLS가 그대로 적용된다.
-- 즉 이 함수로 남의 지점에 회원을 만들 수는 없다.
-- =====================================================================

create or replace function public.register_member(
  p_branch_id       uuid,
  p_name            text,
  p_product_id      uuid,
  p_started_on      date,
  p_contract_price  int,
  p_paid_amount     int     default 0,
  p_method          text    default 'card',
  p_phone           text    default null,
  p_gender          text    default null,
  p_birth_year      int     default null,
  p_channel_id      uuid    default null,
  p_memo            text    default null,
  p_trainer_id      uuid    default null,
  p_consultation_id uuid    default null
)
returns uuid
language plpgsql
as $$
declare
  v_member_id   uuid;
  v_contract_id uuid;
  v_duration    int;
  v_sessions    int;
  v_ends_on     date;
begin
  if p_contract_price < 0 then
    raise exception '계약 금액은 음수일 수 없습니다';
  end if;
  if p_paid_amount < 0 then
    raise exception '결제 금액은 음수일 수 없습니다. 환불은 별도로 처리하세요';
  end if;
  if p_paid_amount > p_contract_price then
    raise exception '결제 금액(%)이 계약 금액(%)보다 큽니다', p_paid_amount, p_contract_price;
  end if;

  select duration_days, session_count into v_duration, v_sessions
    from public.products where id = p_product_id;
  if not found then
    raise exception '존재하지 않는 상품입니다';
  end if;

  v_ends_on := case when v_duration is not null
                    then p_started_on + v_duration else null end;

  insert into public.members
    (branch_id, name, phone, gender, birth_year, acquisition_channel_id,
     first_registered_on, memo, created_by)
  values
    (p_branch_id, p_name, p_phone, p_gender, p_birth_year, p_channel_id,
     p_started_on, p_memo, auth.uid())
  returning id into v_member_id;

  insert into public.contracts
    (member_id, branch_id, product_id, seller_id, trainer_id,
     started_on, base_ends_on, ends_on, total_sessions,
     list_price, contract_price, created_by)
  values
    (v_member_id, p_branch_id, p_product_id, auth.uid(), p_trainer_id,
     p_started_on, v_ends_on, v_ends_on, v_sessions,
     p_contract_price, p_contract_price, auth.uid())
  returning id into v_contract_id;

  if p_paid_amount > 0 then
    insert into public.payments
      (contract_id, member_id, branch_id, amount, paid_on, method, created_by)
    values
      (v_contract_id, v_member_id, p_branch_id, p_paid_amount, p_started_on,
       p_method, auth.uid());
  end if;

  -- 상담에서 넘어온 등록이면 그 상담을 전환 처리한다.
  -- 이걸 빼먹으면 전환율이 실제보다 낮게 나온다.
  if p_consultation_id is not null then
    update public.consultations
       set result = 'registered',
           registered_member_id = v_member_id,
           next_contact_on = null
     where id = p_consultation_id;
  end if;

  return v_member_id;
end $$;

comment on function public.register_member is
  '회원 등록 1건을 회원·계약·결제·상담전환까지 한 트랜잭션으로 처리한다.';
