-- ============================================================================
-- 운임 자동 전환 + 만료 임박 알림 스케줄 (Supabase SQL Editor에서 1회 실행)
-- 프로젝트: mmswsopevmyreoygovpa
--
-- 사전 조건: Edge Function `rate-scheduler` 배포 완료
--   supabase functions deploy rate-scheduler --no-verify-jwt
-- ============================================================================

-- 1) 확장 활성화 (pg_cron: 스케줄, pg_net: HTTP 호출)
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 2) 기존 동일 스케줄 제거 (재실행 안전)
do $$
begin
  perform cron.unschedule('rate-auto-transition');
exception when others then null;
end $$;
do $$
begin
  perform cron.unschedule('rate-expiry-alert');
exception when others then null;
end $$;

-- 3) 운임 자동 전환 — 매일 00:05 모스크바(UTC+3) = 21:05 UTC
select cron.schedule(
  'rate-auto-transition',
  '5 21 * * *',
  $$
  select net.http_post(
    url     := 'https://mmswsopevmyreoygovpa.supabase.co/functions/v1/rate-scheduler',
    body    := '{"action":"transition"}'::jsonb,
    headers := '{"Content-Type":"application/json"}'::jsonb
  );
  $$
);

-- 4) 만료 임박 알림 메일 — 매일 09:00 모스크바 = 06:00 UTC
select cron.schedule(
  'rate-expiry-alert',
  '0 6 * * *',
  $$
  select net.http_post(
    url     := 'https://mmswsopevmyreoygovpa.supabase.co/functions/v1/rate-scheduler',
    body    := '{"action":"alert"}'::jsonb,
    headers := '{"Content-Type":"application/json"}'::jsonb
  );
  $$
);

-- 등록 확인
select jobid, jobname, schedule, active from cron.job;

-- ============================================================================
-- 테스트 / 수동 실행
-- ============================================================================

-- (A) 자동 전환 즉시 실행 (실제 반영)
-- select net.http_post(
--   url     := 'https://mmswsopevmyreoygovpa.supabase.co/functions/v1/rate-scheduler',
--   body    := '{"action":"transition"}'::jsonb,
--   headers := '{"Content-Type":"application/json"}'::jsonb
-- );

-- (B) 자동 전환 dry-run (DB 변경 없이 어떤 전환이 일어날지 확인)
-- select net.http_post(
--   url     := 'https://mmswsopevmyreoygovpa.supabase.co/functions/v1/rate-scheduler',
--   body    := '{"action":"transition","dryRun":true}'::jsonb,
--   headers := '{"Content-Type":"application/json"}'::jsonb
-- );
-- 응답 확인: select * from net._http_response order by id desc limit 1;

-- (C) 알림 메일 수동 발송 테스트
-- select net.http_post(
--   url     := 'https://mmswsopevmyreoygovpa.supabase.co/functions/v1/rate-scheduler',
--   body    := '{"action":"alert"}'::jsonb,
--   headers := '{"Content-Type":"application/json"}'::jsonb
-- );

-- (D) 렌탈 운임 전환 테스트: RENTAL validity를 조작해서 전환 트리거
--   1. 현재 RENTAL validity 백업
-- select value from settings where key = 'validity_info_json';
--   2. RENTAL future.from 을 어제로, current.till 을 그제로 조작 (전환 조건 충족)
-- update settings
-- set value = (
--   jsonb_set(
--     jsonb_set(
--       value::jsonb,
--       '{RENTAL,current,till}',
--       to_jsonb('Till ' || to_char(now() - interval '2 day', 'DD.MM.YYYY'))
--     ),
--     '{RENTAL,future,from}',
--     to_jsonb('From ' || to_char(now() - interval '1 day', 'DD.MM.YYYY'))
--   )
-- )::text
-- where key = 'validity_info_json';
--   3. (A)의 transition 수동 실행 → 응답에서 "rental: ... → ..." 확인
--   4. 검증: rental_rates_json 의 future 가 current 로 이동했는지,
--      rate_history 에 source='auto-transition' 행이 생겼는지 확인
-- select created_at, carrier, category, note from rate_history
--   where source = 'auto-transition' order by created_at desc limit 10;
--   5. 필요 시 1번에서 백업한 value 로 원복

-- 크론 실행 이력 확인
-- select * from cron.job_run_details order by start_time desc limit 10;
