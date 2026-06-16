-- ============================================================================
-- 견적요청(send-quote-request) IP 레이트리밋용 테이블
--   엣지함수가 service_role 로만 읽고/쓰며, anon/authenticated 는 접근 불가(RLS 정책 없음).
-- ============================================================================
create table if not exists quote_rate_limit (
  id uuid primary key default gen_random_uuid(),
  ip text not null,
  created_at timestamptz not null default now()
);
create index if not exists quote_rate_limit_ip_time on quote_rate_limit (ip, created_at);

alter table quote_rate_limit enable row level security;
-- 정책을 만들지 않음 → anon/authenticated 는 0건. service_role(엣지함수)만 RLS 우회.

-- 확인
select tablename, rowsecurity from pg_tables where tablename = 'quote_rate_limit';
