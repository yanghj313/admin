# DGE Book Life 프로젝트

## 🚀 시작하기

### 1. 의존성 설치

```bash
npm install
```

### 2. 환경변수 설정

```bash
# .env.example을 복사해서 .env 생성
copy .env.example .env
```

`.env` 파일 열어서 Supabase 정보 입력:

```
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

> Supabase 대시보드 → Settings → API에서 확인

### 3. Supabase DB 설정

1. [Supabase 대시보드](https://supabase.com/dashboard) 접속
2. SQL Editor → 새 쿼리 → `supabase/schema.sql` 내용 전체 붙여넣기 → 실행
3. Storage → 버킷 생성: `post-images`, `program-thumbnails`, `event-thumbnails` (Public)
4. Authentication → Providers → Google 활성화

### 4. 개발 서버 실행

```bash
npm run dev
# → http://localhost:3000
```

---

## 🤖 Claude Code (AI 코딩 어시스턴트)

이미 설치 완료: `@anthropic-ai/claude-code`

### API 키 설정 (최초 1회)

```powershell
# VS Code 터미널에서
$env:ANTHROPIC_API_KEY = "sk-ant-..."
# 또는 영구 설정:
[System.Environment]::SetEnvironmentVariable("ANTHROPIC_API_KEY", "sk-ant-...", "User")
```

> API 키는 https://console.anthropic.com/ 에서 발급

### Claude Code 사용법

```bash
# 대화형 모드 (권장)
claude

# 직접 명령
claude "admin/events.html에 검색 기능 추가해줘"
claude "프로그램 카드에 신청 버튼 추가해줘"
claude "supabase에서 posts 테이블 조회하는 API 함수 만들어줘"
```

### VS Code 터미널에서 바로 실행

`Ctrl + `` ` ``(백틱)으로 터미널 열기 →`claude` 입력

---

## 📁 프로젝트 구조

```
├── index.html                 # 메인 홈페이지
├── pages/
│   ├── book/                  # 내 손의 책
│   │   ├── campaign.html
│   │   ├── archive-2025.html
│   │   └── download.html
│   ├── life/                  # 내 삶의 힘
│   │   ├── program.html       # 갤러리형
│   │   ├── event.html         # 갤러리형
│   │   └── contest.html       # 공모전 + 참여 목록
│   └── board/
│       ├── index.html         # 게시판 목록
│       └── write.html         # 참여 신청 폼 (개인정보 수집)
├── admin/                     # 관리자 패널 (구글 로그인 필요)
│   ├── login.html
│   ├── index.html             # 대시보드
│   ├── programs.html          # 프로그램 CRUD
│   ├── events.html            # 이벤트 CRUD
│   ├── posts.html             # 게시글 검토/승인
│   └── users.html             # 참여자 목록 + CSV 내보내기
├── src/
│   ├── lib/supabase.js        # DB 연결 + 쿼리 함수
│   ├── js/
│   │   ├── auth.js            # 구글 인증
│   │   └── utils.js           # Toast, 날짜, CSV, 파일업로드 등
│   └── css/
│       ├── main.css           # 전역 스타일
│       └── admin.css          # Admin 전용
├── supabase/
│   └── schema.sql             # DB 테이블 + RLS 정책
├── CLAUDE.md                  # Claude Code 프로젝트 컨텍스트
└── vite.config.js
```

---

## 📦 빌드 & 배포

```bash
npm run build    # dist/ 폴더에 빌드
npm run preview  # 빌드 결과 미리보기
```

배포: Vercel / Netlify에 `dist/` 폴더 또는 루트 연결
