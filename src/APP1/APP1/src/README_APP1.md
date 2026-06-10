# YSL Freight Portal — APP1 (모듈 분리 버전)

기존 App.jsx 9,032줄 단일 파일을 7개 모듈로 분리.
로직 변경 없음 — 기계적 분리 + import/export 연결만 수행.

## 구조
```
src/
├── App1.jsx                  # 메인 컴포넌트 (App 함수, 4,889줄)
├── config.js                 # 환경설정·상수 (SB_URL, PIN, 타임아웃, 캐시키)
├── data/
│   └── staticData.js         # 정적 데이터 (FR 운임, RN 렌탈, POL맵, 선사정보)
├── lib/
│   ├── api.js                # Supabase API·저장 큐·재시도 로직
│   ├── pricing.js            # 운임 스냅샷·캐시·Rate History 빌드
│   └── excelParsers.js       # 선사별 엑셀 파서 (SNK/DY/CK/RENTAL)
└── components/
    ├── common.jsx            # 공용 UI (광고·토스트·Validity 입력·아이콘·탭)
    └── adminPanels.jsx       # MarginPanel · GriAdjustPanel
```

## 적용 방법
1. 위 파일들을 GitHub `src/` 에 그대로 업로드
2. `src/main.jsx` 수정:  `import App from './App1.jsx'`
3. 기존 App.jsx는 백업으로 보관 (App.jsx.bak 등으로 이름 변경)

## 주의
- `config.js` 의 `ADMIN_SKIP_PIN = false` 로 설정됨 (운영 기본값)
- 이후 기능 추가는 해당 모듈에만 — Claude Code 명령 시
  "src/lib/excelParsers.js의 parseSnkSheet만 수정" 처럼 파일 지정 가능
