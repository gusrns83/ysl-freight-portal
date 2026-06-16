-- ============================================================================
-- quote_requests 잠금 — anon 직접 INSERT 제거
--   배경: 고객 견적요청이 anon 키로 quote_requests 에 직접 INSERT → 봇이 행을 대량
--         INSERT 할 수 있었음(레이트리밋 없음).
--   조치: 이제 검증·IP레이트리밋을 거친 send-quote-request 엣지함수가 service_role 로
--         INSERT 하므로, anon 직접 접근은 차단. admin(authenticated)만 조회/수정.
--   ★ 순서: 반드시 (1) 엣지함수 재배포 + (2) 앱(클라이언트) 재배포 가 끝난 뒤 실행.
--     (그 전에 실행하면 구버전 앱의 직접 INSERT가 막혀 견적요청이 실패함)
-- ============================================================================
alter table quote_requests enable row level security;

do $$
declare p record;
begin
  for p in select policyname from pg_policies
           where schemaname = 'public' and tablename = 'quote_requests' loop
    execute format('drop policy if exists %I on quote_requests', p.policyname);
  end loop;
end $$;

create policy quote_requests_auth_all on quote_requests
  for all to authenticated using (true) with check (true);

-- 확인: authenticated 정책 1개만
select policyname, cmd, roles::text from pg_policies
where schemaname = 'public' and tablename = 'quote_requests';
