// ─── Toast 알림 ────────────────────────────────────────────
let toastContainer = null;

function getToastContainer() {
	if (!toastContainer) {
		toastContainer = document.createElement('div');
		toastContainer.className = 'toast-container';
		document.body.appendChild(toastContainer);
	}
	return toastContainer;
}

export function showToast(message, type = 'info', duration = 3000) {
	const container = getToastContainer();
	const toast = document.createElement('div');
	toast.className = `toast toast-${type}`;
	toast.textContent = message;
	container.appendChild(toast);
	setTimeout(() => {
		toast.style.opacity = '0';
		toast.style.transition = 'opacity 0.3s';
	}, duration - 300);
	setTimeout(() => toast.remove(), duration);
}

// ─── 날짜 포맷 ─────────────────────────────────────────────
export function formatDate(dateStr, format = 'YYYY.MM.DD') {
	if (!dateStr) return '-';
	const d = new Date(dateStr);
	const year = d.getFullYear();
	const month = String(d.getMonth() + 1).padStart(2, '0');
	const day = String(d.getDate()).padStart(2, '0');
	return format.replace('YYYY', year).replace('MM', month).replace('DD', day);
}

// ─── 텍스트 줄임 ───────────────────────────────────────────
export function truncate(str, len = 60) {
	if (!str) return '';
	return str.length > len ? str.slice(0, len) + '…' : str;
}

// ─── 이미지 기본값 ─────────────────────────────────────────
export function imgFallback(url, fallback = '/assets/placeholder.png') {
	return url || fallback;
}

// ─── 빈 문자열/null 체크 ──────────────────────────────────
export function isEmpty(val) {
	return val === null || val === undefined || String(val).trim() === '';
}

// ─── 로딩 표시 ─────────────────────────────────────────────
export function showLoading() {
	const overlay = document.createElement('div');
	overlay.className = 'loading-overlay';
	overlay.id = 'global-loading';
	overlay.innerHTML = '<div class="spinner"></div>';
	document.body.appendChild(overlay);
}

export function hideLoading() {
	document.getElementById('global-loading')?.remove();
}

// ─── 페이지네이션 렌더링 ───────────────────────────────────
export function renderPagination(containerId, { current, total, perPage, onChange }) {
	const totalPages = Math.ceil(total / perPage);
	const container = document.getElementById(containerId);
	if (!container || totalPages <= 1) return;

	container.innerHTML = '';
	const wrap = document.createElement('div');
	wrap.className = 'pagination';

	const createBtn = (label, page, disabled = false, active = false) => {
		const btn = document.createElement('button');
		btn.textContent = label;
		btn.disabled = disabled;
		if (active) btn.classList.add('active');
		btn.onclick = () => onChange(page);
		return btn;
	};

	wrap.appendChild(createBtn('‹', current - 1, current === 1));
	for (let i = 1; i <= totalPages; i++) {
		wrap.appendChild(createBtn(i, i, false, i === current));
	}
	wrap.appendChild(createBtn('›', current + 1, current === totalPages));
	container.appendChild(wrap);
}

// ─── CSV → JSON 변환 ───────────────────────────────────────
export function parseCSV(csvText) {
	const lines = csvText.trim().split('\n');
	const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
	return lines.slice(1).map(line => {
		const values = line.match(/(".*?"|[^,]+)(?=,|$)/g) || [];
		return Object.fromEntries(headers.map((h, i) => [h, (values[i] || '').replace(/^"|"$/g, '').trim()]));
	});
}

// ─── 파일 → Base64 / Supabase Storage URL ─────────────────
export async function uploadFile(supabase, file, bucket = 'images') {
	const ext = file.name.split('.').pop();
	const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
	const { data, error } = await supabase.storage.from(bucket).upload(path, file);
	if (error) throw error;
	const {
		data: { publicUrl },
	} = supabase.storage.from(bucket).getPublicUrl(path);
	return publicUrl;
}
