#!/usr/bin/env node
/**
 * KBoard CSV → Supabase 마이그레이션 스크립트
 *
 * 사용법:
 *   node scripts/import-csv.js
 *
 * 환경 변수(.env 또는 직접 설정):
 *   SUPABASE_URL   - Supabase 프로젝트 URL
 *   SUPABASE_KEY   - service_role key (RLS 우회)
 *   CSV_DIR        - CSV 파일이 있는 폴더 경로 (기본값: d:\양현진\교육청\csv)
 */

import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

// ── 설정 ────────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const CSV_DIR = process.env.CSV_DIR || 'd:\\양현진\\교육청\\csv';
const WP_BASE_URL = 'https://dgebooklife.com';

// board_id → { category, sub_category, status } 매핑
const BOARD_MAP = {
  6:  { category: 'archive',  sub_category: '인생책',    status: 'approved' },
  7:  { category: 'archive',  sub_category: '북끈챌린지', status: 'approved' },
  8:  { category: 'contest',  sub_category: '공모전',    status: 'approved' },
  10: { category: 'archive',  sub_category: '인증샷',    status: 'approved' },
  2:  { category: 'download', sub_category: null,        status: 'approved' },
};

// board 1은 trash이므로 건너뜀, board 9는 비어있으므로 건너뜀
const SKIP_BOARDS = new Set([1, 9]);

// ── CSV 파서 ─────────────────────────────────────────────────────────────

/**
 * CSV 파일 파싱 → 객체 배열
 * quoted 필드 내 줄바꿈(멀티라인) 완전 지원
 */
function parseCsv(filePath) {
  const raw = fs.readFileSync(filePath, 'utf-8').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  if (!raw.trim()) return [];

  // 전체 텍스트를 문자 단위로 순회해 레코드 분리
  const records = [];
  let fields = [];
  let current = '';
  let inQuote = false;

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch === '"') {
      if (inQuote && raw[i + 1] === '"') {
        current += '"'; i++;
      } else {
        inQuote = !inQuote;
      }
    } else if (ch === ',' && !inQuote) {
      fields.push(current); current = '';
    } else if (ch === '\n' && !inQuote) {
      fields.push(current); current = '';
      if (fields.some(f => f !== '')) records.push(fields);
      fields = [];
    } else {
      current += ch;
    }
  }
  // 마지막 행
  fields.push(current);
  if (fields.some(f => f !== '')) records.push(fields);

  if (records.length < 2) return [];

  const headers = records[0].map((h) => h.trim());
  return records.slice(1).map((vals) => {
    const row = {};
    headers.forEach((h, idx) => {
      row[h] = (vals[idx] ?? '').trim();
    });
    return row;
  });
}

// ── 데이터 변환 ──────────────────────────────────────────────────────────

/**
 * content 문자열에서 정규식으로 필드 추출 (board 8 공모전)
 * 형식 예시:
 *   이름: 홍길동
 *   연락처: 010-1234-5678
 *   소속(학교/직업): 서울고등학교
 *   이메일: test@example.com
 *   책 제목: 어린왕자
 *   작품설명: ...
 */
function parseContestContent(content) {
  const plain = content.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
  const extract = (pattern) => {
    const m = plain.match(pattern);
    return m ? m[1].trim() : null;
  };
  return {
    author_name:  extract(/이름\s*[:：]\s*(.+)/),
    author_phone: extract(/연락처\s*[:：]\s*(.+)/),
    author_org:   extract(/소속[^:：\n]*[:：]\s*(.+)/),
    author_email: extract(/이메일\s*[:：]\s*(.+)/),
    book_title:   extract(/책\s*제목\s*[:：]\s*(.+)/),
    description:  extract(/작품\s*설명\s*[:：]\s*([\s\S]+)/),
  };
}

/**
 * content 문자열에서 <img src="..."> URL 추출
 */
function extractImageUrls(content) {
  const urls = [];
  const re = /<img[^>]+src="([^"]+)"/gi;
  let m;
  while ((m = re.exec(content)) !== null) {
    urls.push(m[1]);
  }
  return urls;
}

/**
 * KBoard thumbnail_file 경로 → 완전한 URL
 * 예: /wp-content/uploads/kboard_thumbnails/7/2024-01/xxx.jpg
 *  → https://dgebooklife.com/wp-content/uploads/kboard_thumbnails/7/2024-01/xxx.jpg
 */
function toThumbnailUrl(thumbnailFile) {
  if (!thumbnailFile) return null;
  if (thumbnailFile.startsWith('http')) return thumbnailFile;
  return WP_BASE_URL + thumbnailFile;
}

/**
 * KBoard CSV 행 하나를 posts 테이블 레코드로 변환
 */
function transformRow(row, boardId) {
  const mapping = BOARD_MAP[boardId];
  if (!mapping) return null;

  // status=trash이면 건너뜀
  if (row.status === 'trash') return null;
  // board 8 관리자 글(member_uid=1)은 공지 여부 관계없이 건너뜀
  if (boardId === 8 && row.member_uid === '1') return null;

  const base = {
    wp_uid:       parseInt(row.uid, 10) || null,
    wp_board_id:  boardId,
    category:     mapping.category,
    sub_category: mapping.sub_category,
    title:        row.title || '(제목 없음)',
    content:      row.content || '',
    thumbnail_url: toThumbnailUrl(row.thumbnail_file),
    author_name:  row.member_display || null,
    author_email: null,
    author_phone: null,
    author_org:   null,
    sns_id:       null,
    images:       extractImageUrls(row.content || []),
    files:        [],
    view_count:   parseInt(row.view, 10) || 0,
    status:       mapping.status,
    created_at:   row.date ? new Date(row.date.replace(' ', 'T')).toISOString() : undefined,
  };

  // board 7 (북끈챌린지): phone + SNS ID
  if (boardId === 7) {
    base.author_phone = row.kboard_option_phone_num || null;
    // content에서 이름, SNS ID 파싱
    const plain = (row.content || '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ');
    const nameM = plain.match(/이름\s*[:：]\s*(.+)/);
    const snsM  = plain.match(/(?:인스타그램|페이스북)[^:：\n]*[:：]\s*(.+)/i);
    if (nameM) base.author_name = nameM[1].trim();
    if (snsM)  base.sns_id = snsM[1].trim();
  }

  // board 10 (인증샷 챌린지): phone
  if (boardId === 10) {
    base.author_phone = row.kboard_option_phone_num || null;
    const plain = (row.content || '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ');
    const nameM = plain.match(/이름\s*[:：]\s*(.+)/);
    if (nameM) base.author_name = nameM[1].trim();
  }

  // board 8 (공모전): content에서 필드 파싱
  if (boardId === 8) {
    const parsed = parseContestContent(row.content || '');
    if (parsed.author_name)  base.author_name  = parsed.author_name;
    if (parsed.author_phone) base.author_phone = parsed.author_phone;
    if (parsed.author_org)   base.author_org   = parsed.author_org;
    if (parsed.author_email) base.author_email = parsed.author_email;
    // 책 제목은 title이 비어있을 때 대체
    if (parsed.book_title && (!base.title || base.title === '(제목 없음)')) {
      base.title = parsed.book_title;
    }
  }

  return base;
}

// ── 메인 ─────────────────────────────────────────────────────────────────

async function main() {
  // 환경 변수 검사
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('❌  SUPABASE_URL 과 SUPABASE_KEY 환경 변수를 설정해 주세요.');
    console.error('   예) SUPABASE_URL=https://xxx.supabase.co SUPABASE_KEY=service_role_key node scripts/import-csv.js');
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  // CSV 파일 목록 수집
  const csvFiles = fs.readdirSync(CSV_DIR).filter((f) => f.endsWith('.csv'));
  if (csvFiles.length === 0) {
    console.error(`❌  CSV 파일을 찾을 수 없습니다: ${CSV_DIR}`);
    process.exit(1);
  }

  console.log(`📂  CSV 폴더: ${CSV_DIR}`);
  console.log(`📄  파일 목록: ${csvFiles.join(', ')}\n`);

  let totalInserted = 0;
  let totalSkipped = 0;
  let totalError = 0;

  for (const file of csvFiles) {
    const filePath = path.join(CSV_DIR, file);
    const rows = parseCsv(filePath);
    if (rows.length === 0) {
      console.log(`⏭  ${file}: 데이터 없음, 건너뜀`);
      continue;
    }

    // board_id 추출 (첫 행에서)
    const boardId = parseInt(rows[0].board_id, 10);
    if (SKIP_BOARDS.has(boardId)) {
      console.log(`⏭  ${file}: board_id=${boardId} 무시 대상, 건너뜀`);
      continue;
    }
    if (!BOARD_MAP[boardId]) {
      console.log(`⚠️   ${file}: board_id=${boardId} 매핑 없음, 건너뜀`);
      continue;
    }

    console.log(`📥  ${file} (board_id=${boardId}, ${rows.length}건) 처리 중...`);

    // 변환
    const records = rows
      .map((row) => transformRow(row, boardId))
      .filter(Boolean);

    if (records.length === 0) {
      console.log(`   → 유효한 행 없음`);
      continue;
    }

    // Supabase upsert (wp_uid 기준 중복 방지)
    const { error, count } = await supabase
      .from('posts')
      .upsert(records, { onConflict: 'wp_uid', ignoreDuplicates: false })
      .select('id', { count: 'exact', head: true });

    if (error) {
      console.error(`   ❌  오류: [${error.code}] ${error.message}`);
      if (error.details) console.error(`   상세:`, error.details);
      totalError += records.length;
    } else {
      console.log(`   ✅  ${records.length}건 upsert 완료`);
      totalInserted += records.length;
    }

    totalSkipped += rows.length - records.length;
  }

  console.log('\n=== 마이그레이션 완료 ===');
  console.log(`✅  성공: ${totalInserted}건`);
  console.log(`⏭  건너뜀: ${totalSkipped}건`);
  console.log(`❌  오류: ${totalError}건`);
}

main().catch((err) => {
  console.error('치명적 오류:', err);
  process.exit(1);
});
