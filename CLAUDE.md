# DGE Book Life 홈페이지 이관 프로젝트

## 프로젝트 개요

- **원본 사이트**: https://dgebooklife.com/ (WordPress 기반)
- **기술 스택**: Vanilla HTML/CSS/JS + Vite + Supabase
- **목적**: WordPress → 정적 사이트 + Supabase 백엔드로 이관

---

## 사이트맵

```
HOME (index.html)
├── 내 손의 책
│   ├── 캠페인 소개        pages/book/campaign.html
│   ├── 2025 아카이브      pages/book/archive-2025.html
│   │   ├── 내책내힘 사행시
│   │   ├── 북끈 챌린지
│   │   ├── 인생 책 공유
│   │   ├── 인증샷 챌린지
│   │   └── 내만내책 공모전
│   └── 다운로드 자료      pages/book/download.html
├── 내 삶의 힘
│   ├── 프로그램 (갤러리형) pages/life/program.html
│   ├── 이벤트 (갤러리형)  pages/life/event.html
│   └── 공모전             pages/life/contest.html
├── 랜딩 페이지            pages/landing.html
└── 게시판                 pages/board/index.html
    └── 작성               pages/board/write.html

admin/ (관리자 전용)
├── 로그인                 admin/login.html
├── 대시보드               admin/index.html
├── 게시글 관리            admin/posts.html
├── 프로그램 관리          admin/programs.html
├── 이벤트 관리            admin/events.html
└── 사용자 관리            admin/users.html
```

---

## Supabase 테이블 구조

### `posts` - 게시판 (공모전/일반 참여자 게시물)

| 컬럼         | 타입        | 설명                                |
| ------------ | ----------- | ----------------------------------- |
| id           | uuid        | PK                                  |
| category     | text        | 'contest' / 'board' / 'archive'     |
| sub_category | text        | 세부 카테고리                       |
| title        | text        | 제목                                |
| content      | text        | 내용                                |
| author_name  | text        | 작성자 이름                         |
| author_email | text        | 이메일                              |
| author_phone | text        | 연락처                              |
| images       | jsonb       | 이미지 URL 배열                     |
| files        | jsonb       | 첨부파일 URL 배열                   |
| status       | text        | 'pending' / 'approved' / 'rejected' |
| created_at   | timestamptz |                                     |

### `programs` - 프로그램 (갤러리형)

| 컬럼          | 타입        | 설명                             |
| ------------- | ----------- | -------------------------------- |
| id            | uuid        | PK                               |
| title         | text        | 제목                             |
| description   | text        | 설명                             |
| thumbnail_url | text        | 대표 이미지                      |
| date_start    | date        | 시작일                           |
| date_end      | date        | 종료일                           |
| location      | text        | 장소                             |
| capacity      | int         | 정원                             |
| status        | text        | 'upcoming' / 'ongoing' / 'ended' |
| created_at    | timestamptz |                                  |

### `events` - 이벤트 (갤러리형)

| 컬럼          | 타입        | 설명        |
| ------------- | ----------- | ----------- |
| id            | uuid        | PK          |
| title         | text        | 제목        |
| description   | text        | 설명        |
| thumbnail_url | text        | 대표 이미지 |
| date_start    | date        | 시작일      |
| date_end      | date        | 종료일      |
| is_active     | bool        | 진행 여부   |
| created_at    | timestamptz |             |

---

## 환경 변수 (.env)

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

---

## 폴더 구조

```
├── index.html                 # 메인 홈
├── vite.config.js
├── .env                       # (gitignore에 포함)
├── CLAUDE.md                  # ← 이 파일
├── src/
│   ├── lib/
│   │   └── supabase.js        # Supabase 클라이언트
│   ├── js/
│   │   ├── auth.js            # 구글 소셜 로그인
│   │   ├── nav.js             # 네비게이션 컴포넌트
│   │   └── utils.js           # 공통 유틸
│   └── css/
│       ├── main.css           # 전역 스타일
│       ├── components.css     # 재사용 컴포넌트
│       └── admin.css          # Admin 전용 스타일
├── pages/
│   ├── book/                  # 내 손의 책
│   ├── life/                  # 내 삶의 힘
│   └── board/                 # 게시판
├── admin/                     # 관리자 패널
└── supabase/
    └── schema.sql             # DB 스키마 전체
```

---

## 개발 명령어

```bash
npm run dev      # 개발 서버 (http://localhost:3000)
npm run build    # 프로덕션 빌드
npm run preview  # 빌드 결과 미리보기
```

---

## KBoard CSV 마이그레이션

### CSV 파일 위치
`d:\양현진\교육청\csv\`

### board_id → 카테고리 매핑

| wp_board_id | category | sub_category | 추가 필드 |
|-------------|----------|-------------|-----------|
| 2  | download | null | 관리자 전용 자료 |
| 6  | archive  | 인생책 | - |
| 7  | archive  | 북끈챌린지 | kboard_option_phone_num, SNS ID |
| 8  | contest  | 공모전 | content 파싱: 연락처/이메일/소속 |
| 10 | archive  | 인증샷 | kboard_option_phone_num |
| 1  | (무시)  | - | status=trash |
| 9  | (무시)  | - | 빈 파일 |

### 임포트 스크립트 실행

```bash
# .env 파일에 service_role key 필요 (SUPABASE_KEY)
SUPABASE_URL=https://xxx.supabase.co SUPABASE_KEY=service_role_key node scripts/import-csv.js

# CSV 폴더 경로가 다를 경우
CSV_DIR=C:\path\to\csv node scripts/import-csv.js
```

---

## Claude Code 사용법

VS Code 터미널에서 바로 실행:

```bash
claude "여기에 작업 내용 입력"
```

대화형 모드:

```bash
claude
```

---

## 디자인 시스템

- **Primary Color**: #2E4A6B (네이비)
- **Accent Color**: #4A90A4 (청록)
- **Background**: #F8F9FA
- **Font**: Noto Sans KR
- **Card Radius**: 12px
- **Shadow**: 0 2px 16px rgba(0,0,0,0.08)
