# 운임 자동 전환 + 만료 임박 알림 (rate-scheduler)

## 구성

| 구성요소 | 파일 | 역할 |
|---|---|---|
| Edge Function | `supabase/functions/rate-scheduler/index.ts` | 자동 전환(`action=transition`) + 알림 메일(`action=alert`) |
| 스케줄 SQL | `supabase-rate-scheduler-cron.sql` | pg_cron: 매일 00:05 MSK 전환 / 09:00 MSK 알림 |
| 프런트 | `src/App.jsx` | 만료 운임 고객 화면 비표시 + Admin 만료 임박 배너 |

## 동작 규칙

- **자동 전환 (매일 00:05 모스크바, UTC 21:05)** — Ocean / Drop off / Rental 모두:
  - `validity_info_json`의 future.from 이 도래했고 **향후 운임 데이터가 실제로 존재**하면
    current ← future 로 전환, 이전 current 는 `byValidity` 아카이브에 보존 (삭제 없음).
  - 전환·만료 시 `rate_history` 에 `source='auto-transition'` 행 기록.
  - 향후 운임이 없는데 종료일이 지난 운임은 "만료"로 기록만 하고 데이터는 보존
    → 고객 화면(3개 탭)은 till 이 지난 운임을 자동으로 숨김 (App.jsx 가드).
  - 주의: `pol_margins_future`(POL 마진)는 선사별 전환 시점이 달라 자동 승격하지 않음.
    매출가는 업로드 시 저장되는 명시적 `sell` 값이 그대로 전환됨.
- **알림 메일 (매일 09:00 모스크바, UTC 06:00)**:
  - 해상(Ocean/Drop off) D-3, 렌탈 D-2부터, 차기 운임 미입력 건이 있으면 선사별 집계 메일 1통.
  - 수신: Edge Function 환경변수 `ADMIN_EMAIL` (기본 gusrns83@gmail.com).
  - 미입력 0건이면 발송 안 함.

## 배포 (1회)

```powershell
# 1. Supabase CLI 로그인 후 함수 배포 (프로젝트 루트에서)
..\_tools\supabase.exe login
..\_tools\supabase.exe functions deploy rate-scheduler --project-ref mmswsopevmyreoygovpa --no-verify-jwt

# 2. (선택) 환경변수 — RESEND_API_KEY 는 send-quote-request 와 공유됨
..\_tools\supabase.exe secrets set ADMIN_EMAIL=gusrns83@gmail.com --project-ref mmswsopevmyreoygovpa
..\_tools\supabase.exe secrets set ADMIN_URL=https://<배포 도메인> --project-ref mmswsopevmyreoygovpa

# 3. Supabase 대시보드 → SQL Editor 에서 supabase-rate-scheduler-cron.sql 실행
```

## 테스트

자세한 SQL 은 `supabase-rate-scheduler-cron.sql` 하단 주석 참고.

```powershell
# dry-run (DB 변경 없음, 어떤 전환이 일어날지 JSON 으로 반환)
curl.exe -s -X POST "https://mmswsopevmyreoygovpa.supabase.co/functions/v1/rate-scheduler" `
  -H "Content-Type: application/json" -d '{\"action\":\"transition\",\"dryRun\":true}'

# 특정 날짜로 시뮬레이션 (예: 전환일 당일로 가정)
curl.exe -s -X POST "https://mmswsopevmyreoygovpa.supabase.co/functions/v1/rate-scheduler" `
  -H "Content-Type: application/json" -d '{\"action\":\"transition\",\"dryRun\":true,\"today\":\"2026-06-16\"}'

# 알림 메일 미리보기(발송 없음) / 실제 발송
curl.exe -s -X POST ".../rate-scheduler" -H "Content-Type: application/json" -d '{\"action\":\"alert\",\"dryRun\":true}'
curl.exe -s -X POST ".../rate-scheduler" -H "Content-Type: application/json" -d '{\"action\":\"alert\"}'
```
