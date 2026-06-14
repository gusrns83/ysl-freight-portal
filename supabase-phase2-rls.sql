-- ============================================================================
-- 보안 B안 Phase 2 — RLS: anon은 화이트리스트만, raw(매입·마진)는 authenticated(admin)만
-- 프로젝트: mmswsopevmyreoygovpa
-- ★ 반드시 앱(이메일/비번 로그인) 배포·검증 후 적용. 적용 직후 anon/admin 양쪽 즉시 테스트.
-- 롤백: 파일 하단 주석 참고.
-- Edge Functions(rate-scheduler·send-quote-request)는 service role → RLS 우회(영향 없음).
-- ============================================================================

-- ── settings: anon은 비민감 키만 SELECT, 그 외(pol_costs·마진 등)는 authenticated만 ──
drop policy if exists "allow all" on settings;
drop policy if exists "update settings" on settings;

create policy settings_anon_read on settings for select to anon
  using (key in (
    'public_rates_json',
    'validity_info_json','validity_snk','validity_dy','validity_ck','validity_rental',
    'notices_json','notice_text','notice_on','notice_file_url',
    'ad_banners_json','ad_banner_json'
  ));

create policy settings_auth_all on settings for all to authenticated
  using (true) with check (true);

-- ── quote_requests: 고객(anon)은 견적 등록(INSERT)만. 조회/상태변경은 admin ──
drop policy if exists quote_requests_select_anon on quote_requests;
drop policy if exists quote_requests_update_anon on quote_requests;
-- quote_requests_insert_anon(INSERT anon) 유지
create policy quote_requests_auth_select on quote_requests for select to authenticated using (true);
create policy quote_requests_auth_update on quote_requests for update to authenticated using (true) with check (true);

-- ── rate_history: admin(authenticated) 전용 (고객 미사용) ──
drop policy if exists "rate_history: anon read" on rate_history;
drop policy if exists "rate_history: anon insert" on rate_history;
drop policy if exists "rate_history: anon delete" on rate_history;
create policy rate_history_auth_all on rate_history for all to authenticated using (true) with check (true);

-- ── clients: 고객 로그인(anon SELECT)은 유지, 관리(쓰기)는 admin ──
drop policy if exists "관리자 전체관리" on clients;
create policy clients_auth_all on clients for all to authenticated using (true) with check (true);
-- "클라이언트 로그인"(SELECT public) 유지 — 로그인에 필요
-- 주의: anon이 clients SELECT로 email·password_hash까지 읽히는 건 기존 구멍(Phase2 범위 밖). 추후 서버측 로그인으로 개선 권고.

-- 확인
select tablename, policyname, cmd, roles::text from pg_policies
where tablename in ('settings','quote_requests','rate_history','clients') order by tablename, cmd;

-- ============================================================================
-- 롤백 (문제 시 즉시 실행 — settings 전면 개방으로 복구)
-- create policy "allow all" on settings for all to public using (true) with check (true);
-- (필요 시 quote_requests/rate_history/clients의 anon 정책도 재생성)
-- ============================================================================
