-- hug_defaulters.address를 region_stats.region_name 기준으로 매칭해 지역별 상습채무불이행자
-- 수를 집계하는 함수. _shared/riskScore.ts의 recalculateAllRiskScores가 이 함수를 RPC로 호출해
-- 위험도 공식의 세 번째 요소(HUG 채무불이행자 밀도)로 사용한다.
--
-- 매칭 방식: region_name을 공백 기준으로 "힌트"(시/도 약칭, 있는 경우)와 "구/군/시" 조각으로
-- 나눠 각각을 주소 안에서 한글 단어 경계를 강제해 찾는다("남동구"가 "동구"에, "남양주시"가
-- "양주시"에 잘못 매칭되는 부분 문자열 오매칭을 막기 위함). 힌트는 광역시/도 약칭 -> 정식 명칭
-- alias_map으로 확장한다(예: "경남" -> "경상남도", 도로명주소에 정식 명칭이 쓰이는 경우가 많음).
create or replace function public.hug_defaulter_region_counts()
returns table(region_code text, defaulter_count integer)
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
  -- region_name이 토큰 하나뿐인데 그 정식 명칭이 실제 주소에서는 축약형으로 더 흔히 쓰이는 경우
  -- (예: "세종특별자치시" 단독 표기 vs 실제 주소의 "세종"/"세종시").
  district_alias_map(full_name, forms) as (
    values
      ('세종특별자치시', array['세종특별자치시','세종시','세종'])
  ),
  region_tokens as (
    select
      rs.region_code,
      rs.region_name,
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
    count(hd.id)::int as defaulter_count
  from region_patterns rp
  left join public.hug_defaulters hd
    on exists (
      select 1 from unnest(rp.district_forms) d
      where hd.address ~ ('(^|[^가-힣])' || d || '([^가-힣]|$)')
    )
    and (
      rp.hint is null
      or exists (
        select 1 from unnest(rp.hint_forms) f
        where hd.address ~ ('(^|[^가-힣])' || f || '([^가-힣]|$)')
      )
    )
  group by rp.region_code
$$;

grant execute on function public.hug_defaulter_region_counts() to anon, authenticated, service_role;

alter table public.region_stats
  add column if not exists hug_defaulter_count integer;
