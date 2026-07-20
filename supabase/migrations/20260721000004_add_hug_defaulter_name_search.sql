-- 계약서에서 추출된 임대인 이름을 hug_defaulters.name과 trigram 유사도로 비교한다.
-- hug_defaulters_name_trgm_idx(gin_trgm_ops)를 활용해 오탈자/표기 차이가 있어도 유사한 이름을 찾는다.
create or replace function public.search_hug_defaulters_by_name(query_name text, min_similarity real default 0.4)
returns table(name text, address text, similarity real)
language sql
stable
as $$
  select name, address, similarity(name, query_name) as similarity
  from public.hug_defaulters
  where query_name is not null
    and length(trim(query_name)) > 0
    and similarity(name, query_name) >= min_similarity
  order by similarity(name, query_name) desc
  limit 5
$$;

grant execute on function public.search_hug_defaulters_by_name(text, real) to anon, authenticated, service_role;
