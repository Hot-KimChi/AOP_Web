import os from 'node:os';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 백엔드 주소(프록시 대상). 같은 PC 에서 Flask 가 도는 기본 구성은 http://localhost:5000.
const BACKEND_URL = process.env.AOP_BACKEND_URL || 'http://localhost:5000';

// 자주 바뀌지 않는 라이브러리를 화면 코드와 다른 청크로 나눈다.
// 화면 코드만 바뀐 배포에서는 이 청크들이 브라우저 캐시에 그대로 남아 다시 받지 않는다.
const VENDOR_GROUPS = [
  { name: 'vendor-react', test: /node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/ },
  { name: 'vendor-chart', test: /node_modules[\\/](chart\.js|react-chartjs-2|@kurkle)[\\/]/ },
  { name: 'vendor', test: /node_modules[\\/]/ },
];

export default defineConfig({
  plugins: [react()],
  // 개발 서버(npm run dev): 기본 무인 기동이 dev 모드이고 다른 PC 에서도 접속하므로 LAN 에서 수신한다.
  // Host 헤더는 localhost·IP 와 이 PC 이름만 허용한다(DNS rebinding 방지).
  // 브라우저는 같은 출처의 /api 로 요청하고 개발 서버가 백엔드로 전달한다 → CORS 불필요.
  // 운영(npm start)은 server.mjs 가 같은 역할을 한다.
  server: {
    port: 3000,
    strictPort: true,
    host: true,
    allowedHosts: [os.hostname().toLowerCase()],
    proxy: { '^/api/': { target: BACKEND_URL, changeOrigin: false } },
  },
  build: {
    rolldownOptions: {
      output: { codeSplitting: { groups: VENDOR_GROUPS } },
    },
  },
});
