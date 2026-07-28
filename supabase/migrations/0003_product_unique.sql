-- =====================================================================
-- 같은 이름의 상품이 두 줄 생기는 것을 막는다.
--
-- "PT 20회"가 두 개 있으면 데스크가 아무거나 고르게 되고,
-- 그때부터 상품별 매출이 두 갈래로 갈라진다. 되돌리려면
-- 이미 팔린 계약을 전부 손봐야 한다.
--
-- 지점 공통 상품(branch_id is null)과 지점 전용 상품은 별개로 취급한다.
-- 강남점만 가격이 다른 "PT 20회"를 따로 두는 경우가 있기 때문이다.
-- =====================================================================

-- 이미 중복이 있으면 인덱스 생성이 실패한다. 먼저 정리한다.
-- (계약이 걸려 있지 않은, 나중에 들어온 중복 행만 지운다)
delete from public.products p
 where exists (
   select 1 from public.products q
    where q.name = p.name
      and q.branch_id is not distinct from p.branch_id
      and q.ctid < p.ctid
 )
 and not exists (select 1 from public.contracts c where c.product_id = p.id);

create unique index if not exists products_name_common_uniq
  on public.products (name) where branch_id is null;

create unique index if not exists products_name_branch_uniq
  on public.products (branch_id, name) where branch_id is not null;
