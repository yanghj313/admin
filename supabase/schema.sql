-- =====================================================
-- DGE Book Life - Supabase Schema
-- Supabase SQL Editor에서 실행해 주세요
-- =====================================================

-- ── 확장 ──────────────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ── 게시글 (posts) ─────────────────────────────────────────
-- KBoard 원본 board_id → category/sub_category 매핑:
--   board_id=6  → category='archive',  sub_category='인생책'
--   board_id=7  → category='archive',  sub_category='북끈챌린지'
--   board_id=8  → category='contest',  sub_category='공모전'
--   board_id=10 → category='archive',  sub_category='인증샷'
--   board_id=2  → category='download', sub_category=null
create table if not exists posts (
  id            uuid default uuid_generate_v4() primary key,

  -- WordPress KBoard 원본 식별자 (마이그레이션용)
  wp_uid        integer unique,          -- KBoard uid (중복 방지)
  wp_board_id   integer,                 -- 원본 board_id

  -- 분류
  category      text not null,           -- 'archive' | 'contest' | 'download' | 'board'
  sub_category  text,                    -- '인생책' | '북끈챌린지' | '인증샷' | '공모전' | ...

  -- 본문
  title         text not null,
  content       text,                    -- HTML 그대로 보존
  thumbnail_url text,                    -- 대표 이미지 URL

  -- 작성자
  author_name   text,
  author_email  text,
  author_phone  text,                    -- board 7/10: kboard_option_phone_num
  author_org    text,                    -- 소속/학교 (공모전 board 8)
  sns_id        text,                    -- 인스타그램/페이스북 ID (챌린지 board 7)

  -- 첨부
  images        jsonb default '[]'::jsonb,
  files         jsonb default '[]'::jsonb,

  -- 통계 및 상태
  view_count    integer default 0,       -- 원본 view 수
  status        text default 'pending',  -- 'pending' | 'approved' | 'rejected'
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- ── 프로그램 (programs) ────────────────────────────────────
create table if not exists programs (
  id            uuid default uuid_generate_v4() primary key,
  title         text not null,
  description   text,
  thumbnail_url text,
  date_start    date,
  date_end      date,
  location      text,
  capacity      integer,
  status        text default 'upcoming', -- 'upcoming' | 'ongoing' | 'ended'
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- ── 이벤트 (events) ────────────────────────────────────────
create table if not exists events (
  id            uuid default uuid_generate_v4() primary key,
  title         text not null,
  description   text,
  thumbnail_url text,
  date_start    date,
  date_end      date,
  is_active     boolean default true,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- ── RLS (Row Level Security) ────────────────────────────────
alter table posts enable row level security;
alter table programs enable row level security;
alter table events enable row level security;

-- 공개 읽기 (승인된 게시글만)
create policy "공개 게시글 읽기" on posts
  for select using (status = 'approved');

-- 누구나 게시글 작성 가능
create policy "게시글 작성" on posts
  for insert with check (true);

-- 관리자는 모든 게시글 읽기/수정/삭제 가능
-- (Supabase 대시보드에서 service_role로 처리하거나 admin 역할 추가)
create policy "관리자 게시글 전체 접근" on posts
  for all using (auth.role() = 'authenticated');

-- 프로그램/이벤트 공개 읽기
create policy "프로그램 공개 읽기" on programs
  for select using (true);

create policy "이벤트 공개 읽기" on events
  for select using (true);

-- 프로그램/이벤트 관리자 쓰기
create policy "프로그램 관리자 쓰기" on programs
  for all using (auth.role() = 'authenticated');

create policy "이벤트 관리자 쓰기" on events
  for all using (auth.role() = 'authenticated');

-- ── 인덱스 ──────────────────────────────────────────────────
create index if not exists idx_posts_category on posts(category);
create index if not exists idx_posts_sub_category on posts(sub_category);
create index if not exists idx_posts_status on posts(status);
create index if not exists idx_posts_created_at on posts(created_at desc);
create index if not exists idx_posts_wp_board_id on posts(wp_board_id);
create index if not exists idx_programs_status on programs(status);
create index if not exists idx_events_is_active on events(is_active);

-- ── 자동 updated_at 업데이트 트리거 ────────────────────────
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger update_posts_updated_at before update on posts
  for each row execute function update_updated_at_column();
create trigger update_programs_updated_at before update on programs
  for each row execute function update_updated_at_column();
create trigger update_events_updated_at before update on events
  for each row execute function update_updated_at_column();

-- ── Storage Bucket ──────────────────────────────────────────
-- Supabase 대시보드 > Storage에서 직접 생성 필요:
-- 1. 'post-images'  버킷 (공개)
-- 2. 'program-thumbnails' 버킷 (공개)
-- 3. 'event-thumbnails' 버킷 (공개)
-- 4. 'downloads' 버킷 (공개)
