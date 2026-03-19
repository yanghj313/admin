import { supabase, getSession, signOut } from '../lib/supabase.js';

// ─── Admin 페이지 진입 전 인증 체크 ───────────────────────
export async function requireAuth() {
	const session = await getSession();
	if (!session) {
		window.location.href = '/admin/login.html';
		return null;
	}
	return session;
}

// ─── Admin 대시보드 유저 정보 렌더링 ──────────────────────
export async function renderAdminUser() {
	const session = await getSession();
	if (!session) return;

	const user = session.user;
	const nameEl = document.querySelector('.user-info .name');
	const imgEl = document.querySelector('.user-avatar img');
	const avatarInitEl = document.querySelector('.user-avatar span');

	if (nameEl) nameEl.textContent = user.user_metadata?.full_name || user.email;
	if (imgEl && user.user_metadata?.avatar_url) {
		imgEl.src = user.user_metadata.avatar_url;
	} else if (avatarInitEl) {
		const name = user.user_metadata?.full_name || user.email || 'A';
		avatarInitEl.textContent = name[0].toUpperCase();
	}

	document.querySelectorAll('.user-email').forEach(el => (el.textContent = user.email));

	// 로그아웃 버튼
	document.querySelectorAll('[data-action="signout"]').forEach(btn => {
		btn.onclick = () => signOut();
	});
}

// ─── Supabase Auth 상태 변경 리스너 ───────────────────────
export function onAuthChange(callback) {
	return supabase.auth.onAuthStateChange((event, session) => {
		callback(event, session);
	});
}
