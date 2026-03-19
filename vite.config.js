import { defineConfig } from 'vite';

export default defineConfig({
	root: '.',
	build: {
		outDir: 'dist',
		rollupOptions: {
			input: {
				main: 'index.html',
				// 내 손의 책
				campaign: 'pages/book/campaign.html',
				archive: 'pages/book/archive-2025.html',
				download: 'pages/book/download.html',
				// 내 삶의 힘
				program: 'pages/life/program.html',
				event: 'pages/life/event.html',
				contest: 'pages/life/contest.html',
				// 게시판
				board: 'pages/board/index.html',
				boardWrite: 'pages/board/write.html',
				// Admin
				adminLogin: 'admin/login.html',
				adminDashboard: 'admin/index.html',
				adminPosts: 'admin/posts.html',
				adminPrograms: 'admin/programs.html',
				adminEvents: 'admin/events.html',
				adminUsers: 'admin/users.html',
			},
		},
	},
	server: {
		port: 3000,
		open: true,
	},
});
