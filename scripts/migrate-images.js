#!/usr/bin/env node
/**
 * WordPress 이미지 → Supabase Storage 이전 스크립트
 *
 * 처리 항목:
 *   1. posts.thumbnail_url  (kboard_thumbnails 이미지)
 *   2. posts.images[]       (content에서 추출한 img URL 배열)
 *   3. posts.content        (HTML 내 img src WordPress URL → Supabase URL 치환)
 *
 * 사용법:
 *   $env:SUPABASE_URL="..."; $env:SUPABASE_KEY="..."; node scripts/migrate-images.js
 *
 * 옵션 환경변수:
 *   DRY_RUN=1   실제 업로드 없이 처리 대상만 출력
 *   DELAY_MS=500 요청 간 딜레이(ms), 기본 300
 */

import { createClient } from '@supabase/supabase-js';
import https from 'https';
import http from 'http';
import path from 'path';
import { URL } from 'url';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_KEY || '';
const BUCKET = 'post-images';
const DRY_RUN = process.env.DRY_RUN === '1';
const DELAY_MS = parseInt(process.env.DELAY_MS || '300', 10);
const WP_HOST = 'dgebooklife.com';

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌  SUPABASE_URL 과 SUPABASE_KEY 환경 변수를 설정해 주세요.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── 유틸 ──────────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** URL에서 파일 이름 추출 (경로의 마지막 세그먼트) */
function urlToFilename(urlStr) {
  try {
    const u = new URL(urlStr);
    return path.posix.basename(u.pathname);
  } catch {
    return null;
  }
}

/** Supabase Storage 공개 URL 생성 */
function storagePublicUrl(storagePath) {
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${storagePath}`;
}

/** URL에서 Buffer 다운로드 */
function download(urlStr) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const client = u.protocol === 'https:' ? https : http;
    client.get(urlStr, { timeout: 15000 }, (res) => {
      // 리다이렉트 처리 (최대 3회)
      if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location) {
        return resolve(download(res.headers.location));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode} for ${urlStr}`));
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ buffer: Buffer.concat(chunks), contentType: res.headers['content-type'] || 'image/jpeg' }));
      res.on('error', reject);
    }).on('error', reject).on('timeout', () => reject(new Error(`Timeout: ${urlStr}`)));
  });
}

/**
 * 이미지 URL을 Supabase Storage에 업로드하고 새 URL 반환
 * 이미 Supabase URL이면 그대로 반환
 * 업로드 실패 시 원본 URL 반환
 */
async function uploadImage(wpUrl, storagePath) {
  if (!wpUrl) return null;
  if (wpUrl.includes('supabase.co')) return wpUrl; // 이미 이전됨

  if (DRY_RUN) {
    console.log(`    [DRY] 업로드 예정: ${wpUrl} → ${storagePath}`);
    return storagePublicUrl(storagePath);
  }

  try {
    const { buffer, contentType } = await download(wpUrl);

    // 이미 존재하면 덮어쓰기
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, buffer, { contentType, upsert: true });

    if (error) throw error;
    return storagePublicUrl(storagePath);
  } catch (err) {
    console.warn(`    ⚠️  업로드 실패 (원본 URL 유지): ${err.message}`);
    return wpUrl; // 실패 시 원본 유지
  }
}

/** WordPress URL 경로를 Storage 경로로 변환 */
function wpUrlToStoragePath(wpUrl) {
  try {
    const u = new URL(wpUrl);
    // /wp-content/uploads/... → wp-content/uploads/...
    return u.pathname.replace(/^\//, '');
  } catch {
    return null;
  }
}

/** HTML 내 WordPress 이미지 URL을 모두 Supabase URL로 치환 */
function replaceImgUrls(html, urlMap) {
  let result = html;
  for (const [oldUrl, newUrl] of Object.entries(urlMap)) {
    result = result.replaceAll(oldUrl, newUrl);
  }
  return result;
}

// ── 메인 ─────────────────────────────────────────────────────────────────

async function main() {
  console.log(DRY_RUN ? '🔍  DRY RUN 모드 (실제 업로드 없음)\n' : '🚀  이미지 마이그레이션 시작\n');

  // 버킷 확인 / 생성
  if (!DRY_RUN) {
    const { data: buckets } = await supabase.storage.listBuckets();
    const exists = buckets?.some((b) => b.name === BUCKET);
    if (!exists) {
      const { error } = await supabase.storage.createBucket(BUCKET, { public: true });
      if (error) {
        console.error(`❌  버킷 생성 실패: ${error.message}`);
        console.error('   Supabase 대시보드 > Storage에서 "post-images" 버킷을 공개로 생성해 주세요.');
        process.exit(1);
      }
      console.log(`✅  버킷 "${BUCKET}" 생성됨\n`);
    }
  }

  // 전체 posts 가져오기 (WordPress 이미지가 있는 것만)
  const { data: posts, error: fetchErr } = await supabase
    .from('posts')
    .select('id, thumbnail_url, images, content')
    .or(`thumbnail_url.ilike.%${WP_HOST}%,content.ilike.%${WP_HOST}%`);

  if (fetchErr) {
    console.error('❌  posts 조회 실패:', fetchErr.message);
    process.exit(1);
  }

  console.log(`📋  처리 대상 게시글: ${posts.length}건\n`);

  let done = 0, skipped = 0, failed = 0;

  for (const post of posts) {
    console.log(`[${++done}/${posts.length}] ID: ${post.id.slice(0, 8)}...`);
    const updates = {};
    const urlMap = {}; // oldUrl → newUrl (content 치환용)
    let changed = false;

    // 1. thumbnail_url
    if (post.thumbnail_url?.includes(WP_HOST)) {
      const storagePath = wpUrlToStoragePath(post.thumbnail_url);
      if (storagePath) {
        const newUrl = await uploadImage(post.thumbnail_url, storagePath);
        if (newUrl !== post.thumbnail_url) {
          urlMap[post.thumbnail_url] = newUrl;
          updates.thumbnail_url = newUrl;
          changed = true;
          console.log(`    📸 thumbnail → ${path.basename(storagePath)}`);
        }
      }
    }

    // 2. images 배열
    if (Array.isArray(post.images) && post.images.length > 0) {
      const newImages = [];
      for (const imgUrl of post.images) {
        if (imgUrl?.includes(WP_HOST)) {
          await sleep(DELAY_MS);
          const storagePath = wpUrlToStoragePath(imgUrl);
          if (storagePath) {
            const newUrl = await uploadImage(imgUrl, storagePath);
            newImages.push(newUrl);
            if (newUrl !== imgUrl) {
              urlMap[imgUrl] = newUrl;
              changed = true;
              console.log(`    🖼  image → ${path.basename(storagePath)}`);
            }
          } else {
            newImages.push(imgUrl);
          }
        } else {
          newImages.push(imgUrl);
        }
      }
      if (JSON.stringify(newImages) !== JSON.stringify(post.images)) {
        updates.images = newImages;
      }
    }

    // 3. content HTML 내 img src 치환 (WordPress URL 전체 경로 매핑)
    if (post.content?.includes(WP_HOST)) {
      // content에서 WordPress URL 추출
      const re = /https?:\/\/dgebooklife\.com\/wp-content\/uploads\/[^\s"'<>]+/g;
      const found = [...new Set(post.content.match(re) || [])];

      for (const wpUrl of found) {
        if (urlMap[wpUrl]) continue; // 이미 처리됨
        await sleep(DELAY_MS);
        const storagePath = wpUrlToStoragePath(wpUrl);
        if (storagePath) {
          const newUrl = await uploadImage(wpUrl, storagePath);
          if (newUrl !== wpUrl) {
            urlMap[wpUrl] = newUrl;
            changed = true;
            console.log(`    📄 content img → ${path.basename(storagePath)}`);
          }
        }
      }

      if (Object.keys(urlMap).length > 0) {
        const newContent = replaceImgUrls(post.content, urlMap);
        if (newContent !== post.content) {
          updates.content = newContent;
        }
      }
    }

    // 변경사항 저장
    if (changed && !DRY_RUN) {
      const { error: updateErr } = await supabase
        .from('posts')
        .update(updates)
        .eq('id', post.id);

      if (updateErr) {
        console.error(`    ❌  DB 업데이트 실패: ${updateErr.message}`);
        failed++;
      }
    } else if (!changed) {
      console.log(`    → 변경 없음`);
      skipped++;
    }

    await sleep(DELAY_MS);
  }

  console.log('\n=== 이미지 마이그레이션 완료 ===');
  console.log(`✅  처리: ${done - skipped - failed}건`);
  console.log(`⏭  변경 없음: ${skipped}건`);
  console.log(`❌  실패: ${failed}건`);
}

main().catch((err) => {
  console.error('치명적 오류:', err);
  process.exit(1);
});
