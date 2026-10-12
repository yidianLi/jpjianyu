import { test, expect } from '@playwright/test';

/**
 * 静态原型冒烟：只断言不依赖后端的 DOM 结构，保证页面可加载、导航/表单存在。
 * 前端通过 assets/*.js 本地构建菜单，CDN 失败仅影响样式不影响 DOM。
 */

test('桌面端应用壳加载且导航菜单存在', async ({ page }) => {
  await page.goto('/app.html');
  await expect(page).toHaveTitle(/物料管理系统/);
  await expect(page.locator('#menu')).toBeVisible();
  // 至少存在一个一级导航分组
  await expect(page.locator('.nav-group-toggle').first()).toBeVisible();
});

test('登录页渲染出输入控件', async ({ page }) => {
  await page.goto('/pages/login.html');
  await expect(page.locator('input').first()).toBeVisible();
});

test('移动端 H5 入口加载', async ({ page }) => {
  await page.goto('/mobile-app/live-app.html');
  await expect(page.locator('body')).toBeVisible();
});
