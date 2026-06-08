import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const isProd = mode === 'production';
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        /** 开发时 API 走同源 /api，避免用手机/局域网 IP 打开页面时仍请求 localhost:3001 导致 Failed to fetch */
        proxy: {
          '/api': {
            target: 'http://127.0.0.1:3001',
            changeOrigin: true,
          },
        },
      },
      plugins: [react()],
      /**
       * react-draggable（react-grid-layout 的拖拽依赖）编译产物里有
       * `if (process.env.DRAGGABLE_DEBUG)`，而浏览器没有 process 全局，
       * 会在拖拽/缩放按下鼠标时抛 ReferenceError。这里精确替换该表达式，
       * 避免引用不存在的 process。
       */
      define: {
        'process.env.DRAGGABLE_DEBUG': 'false',
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      /**
       * Phase 1.5：vendor chunk 切分 + 体积监控 + 生产环境 drop console。
       *
       * 主入口原本 ~437KB（含 React/Router/Query/Icons/Dnd/Zxing 等），切分后预计 ~150KB。
       * vendor 单独成 chunk 后业务代码迭代不会让全体用户重下框架。
       */
      build: {
        target: 'es2020',
        chunkSizeWarningLimit: 350,
        rollupOptions: {
          output: {
            manualChunks: {
              'react-vendor': ['react', 'react-dom', 'react-router-dom'],
              'query-vendor': ['@tanstack/react-query'],
              'icon-vendor': ['lucide-react'],
              'dnd-vendor': ['@dnd-kit/core', '@dnd-kit/sortable', '@dnd-kit/utilities'],
              'scan-vendor': ['@zxing/browser', '@zxing/library', 'qrcode.react'],
            },
          },
        },
      },
      esbuild: {
        /** 生产构建清掉散落的 console.log / debugger，避免泄漏调试信息 */
        drop: isProd ? ['console', 'debugger'] : [],
      },
      test: {
        globals: true,
        environment: 'node',
        include: ['**/*.test.{ts,tsx}'],
      },
    };
});
