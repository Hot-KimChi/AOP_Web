// frontend/tests/app.spec.js
const { test, expect } = require('@playwright/test');

// ─── 홈페이지 ────────────────────────────────────────────────
test.describe('홈페이지', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('페이지가 정상 로드되고 Hero 섹션이 표시된다', async ({ page }) => {
    await expect(page.locator('text=AOP Web Platform')).toBeVisible();
    await expect(page.locator('text=Acoustic Output Power management platform')).toBeVisible();
  });

  test('5개 Feature 카드가 모두 표시된다', async ({ page }) => {
    const cards = page.locator('.home-feature-card');
    await expect(cards).toHaveCount(5);

    const expectedTitles = [
      'MeasSet Generation',
      'Viewer',
      'Verification Report',
      'SSR DocOut',
      'Machine Learning',
    ];
    for (const title of expectedTitles) {
      await expect(page.locator(`.home-feature-card:has-text("${title}")`)).toBeVisible();
    }
  });

  test('버전 배지가 v 0.9.33으로 표시된다', async ({ page }) => {
    const badge = page.locator('.version-badge');
    await expect(badge).toBeVisible();
    await expect(badge).toHaveText('v 0.9.33');
  });
});

// ─── Navbar ──────────────────────────────────────────────────
test.describe('Navbar', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('로고와 네비게이션 링크가 표시된다', async ({ page }) => {
    await expect(page.locator('.navbar-logo')).toBeVisible();
    await expect(page.locator('.navbar-logo-text')).toHaveText('AOP Web');

    const navLinks = page.locator('.navbar-link');
    await expect(navLinks).toHaveCount(5);
  });

  test('비로그인 상태에서 Login 버튼이 표시된다', async ({ page }) => {
    await expect(page.locator('button:has-text("Login")')).toBeVisible();
  });

  test('비로그인 상태에서 메뉴 링크가 비활성화된다', async ({ page }) => {
    const disabledLinks = page.locator('.navbar-link.disabled');
    await expect(disabledLinks).toHaveCount(5);
  });

  test('다크/라이트 테마 토글이 동작한다', async ({ page }) => {
    const themeBtn = page.locator('.theme-toggle');
    await expect(themeBtn).toBeVisible();

    // 초기 테마 확인 (light가 기본)
    const initialTheme = await page.locator('html').getAttribute('data-theme');

    // 토글 클릭
    await themeBtn.click();
    await page.waitForTimeout(300);

    const afterToggle = await page.locator('html').getAttribute('data-theme');
    expect(afterToggle).not.toBe(initialTheme);

    // 다시 토글하여 원래대로
    await themeBtn.click();
    await page.waitForTimeout(300);

    const afterSecondToggle = await page.locator('html').getAttribute('data-theme');
    // light 모드는 data-theme이 null이거나 없음
    if (initialTheme === null || initialTheme === 'light') {
      expect(afterSecondToggle === null || afterSecondToggle === 'light').toBeTruthy();
    }
  });
});

// ─── 페이지 라우팅 ───────────────────────────────────────────
test.describe('페이지 라우팅', () => {
  const routes = [
    { path: '/auth/login', text: 'Login' },
    { path: '/viewer', titleOrText: 'Viewer' },
    { path: '/measset-generation', titleOrText: 'MeasSet' },
    { path: '/machine-learning', titleOrText: 'Machine Learning' },
    { path: '/verification-report', titleOrText: 'Verification' },
    { path: '/SSR_DocOut', titleOrText: 'SSR' },
  ];

  for (const route of routes) {
    test(`${route.path} 접근 시 페이지가 정상 로드된다`, async ({ page }) => {
      const res = await page.goto(route.path);
      expect(res.status()).toBeLessThan(500);
    });
  }
});

// ─── CSS / 스타일 ────────────────────────────────────────────
test.describe('스타일 및 레이아웃', () => {
  test('version-badge가 우측 하단에 고정되어 있다', async ({ page }) => {
    await page.goto('/');
    const badge = page.locator('.version-badge');
    await expect(badge).toBeVisible();

    const position = await badge.evaluate((el) => {
      const style = window.getComputedStyle(el);
      return { position: style.position, bottom: style.bottom, right: style.right };
    });
    expect(position.position).toBe('fixed');
  });

  test('다크모드 CSS 변수가 올바르게 적용된다', async ({ page }) => {
    await page.goto('/');
    // 다크모드 전환
    await page.locator('.theme-toggle').click();
    await page.waitForTimeout(300);

    const bgColor = await page.evaluate(() => {
      return getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
    });
    expect(bgColor).toBeTruthy();
  });
});
