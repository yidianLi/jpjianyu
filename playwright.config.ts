import { defineConfig, devices } from '@playwright/test';

/**
 * 静态原型 E2E 冒烟：
 * - 不依赖后端 API（前端 fetch 失败不影响 DOM 断言），避免 flaky
 * - 由 webServer 用 python http.server 托管 prototype/ 目录
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  expect: { timeout: 10000 },
  fullyParallel: true,
  retries: 1,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: 'http://localhost:8000',
    headless: true,
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'python3 -m http.server 8000 --directory prototype',
    url: 'http://localhost:8000/app.html',
    reuseExistingServer: true,
    timeout: 60000,
  },
});
