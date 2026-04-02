// ─── Admin 사이드바 햄버거 토글 ──────────────────────────
export function initSidebarToggle() {
	const sidebar = document.querySelector('.sidebar');
	const overlay = document.getElementById('sidebar-overlay');
	const btn = document.getElementById('hamburger-btn');
	if (!sidebar || !overlay || !btn) return;

	function open() {
		sidebar.classList.add('open');
		overlay.classList.add('open');
	}
	function close() {
		sidebar.classList.remove('open');
		overlay.classList.remove('open');
	}

	btn.addEventListener('click', () => {
		sidebar.classList.contains('open') ? close() : open();
	});
	overlay.addEventListener('click', close);
}
