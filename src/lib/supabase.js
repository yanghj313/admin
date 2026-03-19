import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
	console.error('⚠️ .env 파일에 Supabase 환경변수를 설정해주세요.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// ─── Auth 헬퍼 ────────────────────────────────────────────
export async function signInWithGoogle() {
	const { data, error } = await supabase.auth.signInWithOAuth({
		provider: 'google',
		options: {
			redirectTo: `${window.location.origin}/admin/index.html`,
		},
	});
	if (error) console.error('Google 로그인 오류:', error);
	return { data, error };
}

export async function signInWithEmail(email, password) {
	const { data, error } = await supabase.auth.signInWithPassword({ email, password });
	return { data, error };
}

export async function signOut() {
	const { error } = await supabase.auth.signOut();
	if (!error) window.location.href = '/admin/login.html';
}

export async function getSession() {
	const {
		data: { session },
	} = await supabase.auth.getSession();
	return session;
}

// ─── 게시글 ────────────────────────────────────────────────
export async function getPosts({ category, sub_category, status = 'approved', page = 1, limit = 12 } = {}) {
	let query = supabase.from('posts').select('*', { count: 'exact' });
	if (category) query = query.eq('category', category);
	if (sub_category) query = query.eq('sub_category', sub_category);
	if (status) query = query.eq('status', status);
	query = query.order('created_at', { ascending: false }).range((page - 1) * limit, page * limit - 1);
	return query;
}

export async function createPost(data) {
	return supabase.from('posts').insert([data]).select().single();
}

export async function updatePost(id, data) {
	return supabase.from('posts').update(data).eq('id', id).select().single();
}

// ─── 프로그램 ──────────────────────────────────────────────
export async function getPrograms({ status, page = 1, limit = 9 } = {}) {
	let query = supabase.from('programs').select('*', { count: 'exact' });
	if (status) query = query.eq('status', status);
	query = query.order('date_start', { ascending: false }).range((page - 1) * limit, page * limit - 1);
	return query;
}

export async function upsertProgram(data) {
	return supabase.from('programs').upsert([data]).select().single();
}

// ─── 이벤트 ────────────────────────────────────────────────
export async function getEvents({ isActive, page = 1, limit = 9 } = {}) {
	let query = supabase.from('events').select('*', { count: 'exact' });
	if (typeof isActive === 'boolean') query = query.eq('is_active', isActive);
	query = query.order('created_at', { ascending: false }).range((page - 1) * limit, page * limit - 1);
	return query;
}

export async function upsertEvent(data) {
	return supabase.from('events').upsert([data]).select().single();
}
