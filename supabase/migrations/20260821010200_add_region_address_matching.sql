-- 계약서에서 추출한 매물 주소(자유 텍스트)로 region_stats의 지역을 찾는 함수. 실제 전세가율
-- 계산(보증금 vs 해당 지역 평균 매매가)에 쓴다.
--
-- 매칭 방식은 hug_defaulter_region_counts()(20260721000003_add_hug_defaulter_region_matching.sql)
-- 와 동일한 토큰/별칭 매칭을 그대로 재사용한다: region_name을 "힌트"(시/도 약칭)와 "구/군/시"
-- 조각으로 나눠 각각 한글 단어 경계를 강제해 찾는다(부분 문자열 오매칭 방지). 다만 그 함수는
-- hug_defaulters 전체를 지역별로 집계하는 반면, 이 함수는 입력 주소 문자열 하나를 region_stats
-- 전체와 비교해 가장 구체적인(region_name이 긴) 매칭 하나를 반환한다.
create or replace function public.match_region_by_address(input_address text)
returns table(
  region_code text,
  region_name text,
  avg_sale_price numeric,
  villa_avg_sale_price numeric
)
language sql
stable
as $$
  with alias_map(abbr, full_forms) as (
    values
      ('서울', array['서울특별시','서울']),
      ('부산', array['부산광역시','부산']),
      ('대구', array['대구광역시','대구']),
      ('인천', array['인천광역시','인천']),
      ('광주', array['광주광역시','광주']),
      ('대전', array['대전광역시','대전']),
      ('울산', array['울산광역시','울산']),
      ('세종', array['세종특별자치시','세종']),
      ('경기', array['경기도','경기']),
      ('강원', array['강원특별자치도','강원도','강원']),
      ('충북', array['충청북도','충북']),
      ('충남', array['충청남도','충남']),
      ('전북', array['전북특별자치도','전라북도','전북']),
      ('전남', array['전라남도','전남']),
      ('경북', array['경상북도','경북']),
      ('경남', array['경상남도','경남']),
      ('제주', array['제주특별자치도','제주'])
  ),
  district_alias_map(full_name, forms) as (
    values
      ('세종특별자치시', array['세종특별자치시','세종시','세종'])
  ),
  region_tokens as (
    select
      rs.region_code,
      rs.region_name,
      rs.avg_sale_price,
      rs.villa_avg_sale_price,
      split_part(rs.region_name, ' ', 1) as tok1,
      case when position(' ' in rs.region_name) > 0
        then trim(substring(rs.region_name from position(' ' in rs.region_name) + 1))
        else null
      end as tok2
    from public.region_stats rs
  ),
  region_patterns as (
    select
      rt.region_code,
      rt.region_name,
      rt.avg_sale_price,
      rt.villa_avg_sale_price,
      case when rt.tok2 is not null then rt.tok1 else null end as hint,
      case when rt.tok2 is not null
        then coalesce((select full_forms from alias_map where abbr = rt.tok1), array[rt.tok1])
        else null
      end as hint_forms,
      case when rt.tok2 is null
        then coalesce((select forms from district_alias_map where full_name = rt.tok1), array[rt.tok1])
        else array[rt.tok2]
      end as district_forms
    from region_tokens rt
  )
  select
    rp.region_code,
    rp.region_name,
    rp.avg_sale_price,
    rp.villa_avg_sale_price
  from region_patterns rp
  where exists (
      select 1 from unnest(rp.district_forms) d
      where input_address ~ ('(^|[^가-힣])' || d || '([^가-힣]|$)')
    )
    and (
      rp.hint is null
      or exists (
        select 1 from unnest(rp.hint_forms) f
        where input_address ~ ('(^|[^가-힣])' || f || '([^가-힣]|$)')
      )
    )
  order by length(rp.region_name) desc
  limit 1
$$;

-- analyze-contract Edge Function의 service_role 클라이언트에서만 호출한다 — hug 명단 조회와 달리
-- 클라이언트에서 직접 호출할 이유가 없으므로 anon/authenticated에는 권한을 주지 않는다.
grant execute on function public.match_region_by_address(text) to service_role;
