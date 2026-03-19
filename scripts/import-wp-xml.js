#!/usr/bin/env node
/**
 * WordPress WXR(XML) → Supabase 마이그레이션 스크립트
 * 대상: WordPress 기본 글(posts) - bukken 카테고리 (4행시, 인생책 등)
 *
 * 사용법:
 *   $env:SUPABASE_URL="..."; $env:SUPABASE_KEY="..."; node scripts/import-wp-xml.js 경로\wordpress-export.xml
 *
 * sub_category 자동 매핑:
 *   WordPress 카테고리/태그에 '인생'  포함 → '인생책'
 *   WordPress 카테고리/태그에 '4행시' 또는 '사행시' 포함 → '사행시'
 *   그 외 → sub_category = null  (관리자가 나중에 수동 분류)
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import { parseString } from 'xml2js';
import { promisify } from 'util';

const parseXml = promisify(parseString);

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_KEY || '';

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌  SUPABASE_URL 과 SUPABASE_KEY 환경 변수를 설정해 주세요.');
  process.exit(1);
}

const xmlFile = process.argv[2];
if (!xmlFile || !fs.existsSync(xmlFile)) {
  console.error('❌  XML 파일 경로를 인수로 전달해 주세요.');
  console.error('   예) node scripts/import-wp-xml.js C:\\Users\\...\\wordpress-export.xml');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── sub_category 자동 판별 ────────────────────────────────────────────────
// 1순위: 카테고리/태그, 2순위: 제목 키워드

function detectSubCategory(categories = [], tags = [], title = '') {
  const all = [...categories, ...tags].map((s) => s.toLowerCase());
  if (all.some((s) => s.includes('인생'))) return '인생책';
  if (all.some((s) => s.includes('4행시') || s.includes('사행시'))) return '사행시';

  // 제목 기반 판별
  const t = title.toLowerCase();
  if (t.includes('인생')) return '인생책';
  if (
    t.includes('사행시') || t.includes('4행시') ||
    t.includes('내책내힘') || t.includes('내손내책') ||
    t.includes('내책내힘')
  ) return '사행시';

  return null;
}

// ── WordPress postmeta 추출 ──────────────────────────────────────────────

function getMeta(item, key) {
  const metas = item['wp:postmeta'] || [];
  const found = metas.find((m) => m['wp:meta_key']?.[0] === key);
  return found ? (found['wp:meta_value']?.[0] || null) : null;
}

// ── HTML에서 img URL 추출 ────────────────────────────────────────────────

function extractImageUrls(html = '') {
  const urls = [];
  const re = /<img[^>]+src="([^"]+)"/gi;
  let m;
  while ((m = re.exec(html)) !== null) urls.push(m[1]);
  return urls;
}

// ── 썸네일 URL 추출 (wp:postmeta에서 _thumbnail_id 기반은 어려우므로
//    content 첫 번째 img 사용) ──────────────────────────────────────────

function firstImageUrl(html = '') {
  const m = html.match(/<img[^>]+src="([^"]+)"/i);
  return m ? m[1] : null;
}

// ── 메인 ────────────────────────────────────────────────────────────────

async function main() {
  console.log(`📂  XML 파일: ${xmlFile}\n`);

  const raw = fs.readFileSync(xmlFile, 'utf-8');
  const parsed = await parseXml(raw, { explicitArray: true, trim: true });

  const channel = parsed?.rss?.channel?.[0];
  if (!channel) {
    console.error('❌  올바른 WordPress WXR 파일이 아닙니다.');
    process.exit(1);
  }

  const items = channel.item || [];
  console.log(`📋  전체 항목 수: ${items.length}`);

  // publish된 글만 필터 (page, attachment 제외)
  const posts = items.filter((item) => {
    const type = item['wp:post_type']?.[0];
    const status = item['wp:status']?.[0];
    return type === 'post' && status === 'publish';
  });

  console.log(`✅  발행된 글(post): ${posts.length}건\n`);

  if (posts.length === 0) {
    console.log('처리할 글이 없습니다.');
    return;
  }

  let inserted = 0, skipped = 0, failed = 0;

  // 100건씩 배치 처리
  const BATCH = 100;
  for (let i = 0; i < posts.length; i += BATCH) {
    const batch = posts.slice(i, i + BATCH);

    const records = batch.map((item) => {
      const wpId = parseInt(item['wp:post_id']?.[0], 10) || null;
      const title = item.title?.[0] || '(제목 없음)';
      const content = item['content:encoded']?.[0] || '';
      const dateRaw = item['wp:post_date']?.[0] || item.pubDate?.[0] || null;
      const authorLogin = item['dc:creator']?.[0] || null;

      // 카테고리 / 태그
      const categoryFields = (item.category || []).filter(
        (c) => typeof c === 'object' && c.$.domain === 'category'
      ).map((c) => c._ || c);

      const tagFields = (item.category || []).filter(
        (c) => typeof c === 'object' && c.$.domain === 'post_tag'
      ).map((c) => c._ || c);

      const sub = detectSubCategory(categoryFields, tagFields, title);

      // USP 플러그인 메타에서 작성자 정보 추출
      const metaName  = getMeta(item, 'contact_name')  || getMeta(item, '_contact_name')  || authorLogin;
      const metaPhone = getMeta(item, 'contact_phone') || getMeta(item, '_contact_phone') || null;
      const metaEmail = getMeta(item, 'contact_email') || getMeta(item, '_contact_email') || null;

      // 날짜 파싱
      let createdAt;
      try {
        createdAt = dateRaw ? new Date(dateRaw).toISOString() : undefined;
      } catch {
        createdAt = undefined;
      }

      const images = extractImageUrls(content);
      const thumbnail = firstImageUrl(content);

      return {
        wp_uid:       wpId ? wpId + 100000 : null,  // KBoard uid와 충돌 방지 (+100000)
        wp_board_id:  0,                             // WordPress 기본 글 = 0
        category:     'archive',
        sub_category: sub,
        title,
        content,
        thumbnail_url: thumbnail,
        author_name:  metaName,
        author_phone: metaPhone,
        author_email: metaEmail,
        images,
        files:        [],
        view_count:   0,
        status:       'approved',
        created_at:   createdAt,
      };
    });

    const { error } = await supabase
      .from('posts')
      .upsert(records, { onConflict: 'wp_uid', ignoreDuplicates: false });

    if (error) {
      console.error(`❌  배치 ${i + 1}~${i + batch.length} 오류: [${error.code}] ${error.message}`);
      failed += batch.length;
    } else {
      console.log(`✅  ${i + 1}~${i + batch.length}건 upsert 완료 (sub_category 분류: ${records.map(r => r.sub_category || '미분류').join(', ').slice(0, 80)}...)`);
      inserted += batch.length;
    }
  }

  // sub_category별 통계 출력
  const subStats = {};
  posts.forEach((item) => {
    const cats = (item.category || []).filter(c => typeof c === 'object' && c.$.domain === 'category').map(c => c._ || c);
    const tags = (item.category || []).filter(c => typeof c === 'object' && c.$.domain === 'post_tag').map(c => c._ || c);
    const sub = detectSubCategory(cats, tags, item.title?.[0] || '') || '미분류';
    subStats[sub] = (subStats[sub] || 0) + 1;
  });

  console.log('\n=== WordPress 글 마이그레이션 완료 ===');
  console.log(`✅  성공: ${inserted}건`);
  console.log(`❌  실패: ${failed}건`);
  console.log('\nsub_category 분류 결과:');
  Object.entries(subStats).forEach(([k, v]) => console.log(`   ${k}: ${v}건`));

  if (subStats['미분류'] > 0) {
    console.log('\n⚠️  미분류 게시글은 Supabase 대시보드 또는 관리자 페이지에서');
    console.log('   sub_category를 직접 수정해 주세요.');
  }
}

main().catch((err) => {
  console.error('치명적 오류:', err);
  process.exit(1);
});
