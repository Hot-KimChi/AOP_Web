import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 백엔드 주소(프록시 대상). 같은 PC 에서 Flask 가 도는 기본 구성은 http://localhost:5000.
const BACKEND_URL = process.env.AOP_BACKEND_URL || 'http://localhost:5000';
// 브라우저는 같은 출처의 /api 로 요청하고 Vite 서버가 백엔드로 전달한다 → CORS 불필요.
const proxy = { '^/api/': { target: BACKEND_URL, changeOrigin: false } };

export default defineConfig({
  plugins: [react()],
  // 3000(Next.js 버전)과 동시에 띄워 비교할 수 있도록 3001 을 쓴다.
  // 개발 서버는 이 PC 에서만, preview(빌드 결과)는 다른 PC 에서도 비교할 수 있게 연다.
  server: { port: 3001, strictPort: true, proxy },
  preview: { port: 3001, strictPort: true, host: true, proxy },
  build: {
    rolldownOptions: {
      onwarn(warning, warn) {
        // 원본과 동일하게 유지한 'use client' 지시문은 Vite 에서 의미가 없으므로 경고를 숨긴다.
        if (warning.code === 'MODULE_LEVEL_DIRECTIVE') return;
        warn(warning);
      },
    },
  },
});
