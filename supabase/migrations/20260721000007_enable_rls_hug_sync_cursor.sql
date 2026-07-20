-- 보안 감사 중 발견: hug_sync_cursor를 처음 만들 때(20260721000001) RLS 활성화를 빠뜨렸다.
-- Supabase 프로젝트 기본 설정상 새 테이블은 anon/authenticated에 전체 CRUD grant가 기본으로
-- 열려 있고 RLS로 막는 게 정석인데(region_sync_cursor도 동일한 패턴), 이 테이블만 RLS가
-- 꺼진 채 방치되어 있었다. 동기화 커서는 크롤러(service_role)만 읽고 쓰면 되므로
-- region_sync_cursor와 동일하게 RLS만 켜고 별도 정책은 두지 않는다(= anon/authenticated는
-- 기본적으로 아무 접근도 못 함, service_role은 RLS를 우회하므로 영향 없음).
alter table public.hug_sync_cursor enable row level security;
