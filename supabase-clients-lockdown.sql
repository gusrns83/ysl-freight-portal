-- ============================================================================
-- clients 테이블 잠금 — 고객 로그인 기능 폐지에 따라 anon 접근 완전 차단
--   배경: 고객 로그인이 anon 키(번들 공개)로 clients?email=..&password_hash=.. 를
--         조회했고, anon SELECT 정책이 열려 있어 누구나 전 고객 email+평문 비번을
--         덤프할 수 있었음. 고객 로그인을 제거했으므로 anon은 clients가 전혀 필요 없음.
--   조치: clients의 모든 기존 정책 제거 → authenticated(admin)만 전체 권한.
--   주의: 데이터(행)는 유지(사용자 선택). RLS만으로 차단.
-- ============================================================================

-- RLS 활성화 보장
alter table clients enable row level security;

-- 기존 정책 전부 제거 (anon SELECT 정책 이름이 무엇이든 확실히 제거)
do $$
declare p record;
begin
  for p in select policyname from pg_policies where schemaname = 'public' and tablename = 'clients' loop
    execute format('drop policy if exists %I on clients', p.policyname);
  end loop;
end $$;

-- admin(로그인된 사용자)만 전체 권한 — anon 은 정책 없음 → 접근 0건
create policy clients_auth_all on clients
  for all to authenticated using (true) with check (true);

-- 확인: clients 에 authenticated 정책 1개만 있어야 함
select policyname, cmd, roles::text
from pg_policies
where schemaname = 'public' and tablename = 'clients'
order by cmd;

-- ============================================================================
-- 롤백 (만약 고객 로그인을 되살릴 경우에만):
--   create policy "클라이언트 로그인" on clients for select to anon using (true);
-- ============================================================================
