// frontend/tests/app.spec.js
const { test, expect } = require('@playwright/test');

// ─── 홈페이지 ────────────────────────────────────────────────
test.describe('홈페이지', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('비로그인 상태에서 로그인 안내 카드가 표시된다', async ({ page }) => {
    await expect(page.locator('h1:has-text("로그인이 필요합니다")')).toBeVisible();
    await expect(
      page.locator('text=로그인 후 메인페이지에서 주간 엑셀 일정을 확인할 수 있습니다.')
    ).toBeVisible();
  });

  test('비로그인 상태에서는 주간 일정이 노출되지 않는다', async ({ page }) => {
    // 인증 전에는 SharePoint 임베드(iframe)가 렌더링되지 않아야 한다.
    await expect(page.locator('main iframe')).toHaveCount(0);
    await expect(page.locator('main button:has-text("로그인")')).toBeVisible();
  });

  test('버전 배지가 표시된다', async ({ page }) => {
    const badge = page.locator('.version-badge');
    await expect(badge).toBeVisible();
    // 버전은 릴리스마다 바뀌므로 형식만 검증한다.
    await expect(badge).toHaveText(/^v \d+\.\d+\.\d+$/);
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
    await expect(navLinks).toHaveCount(6);
  });

  test('비로그인 상태에서 Login 버튼이 표시된다', async ({ page }) => {
    // 데스크톱/모바일 두 벌의 버튼이 렌더링되므로 데스크톱 버튼을 특정한다.
    await expect(page.locator('.navbar-login-btn')).toBeVisible();
  });

  test('비로그인 상태에서 메뉴 링크가 비활성화된다', async ({ page }) => {
    const disabledLinks = page.locator('.navbar-link.disabled');
    await expect(disabledLinks).toHaveCount(6);
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
    { path: '/interrogator', titleOrText: 'Interrogator' },
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

// ─── #31 신규 화면 ───────────────────────────────────────────
test.describe('MSI input · Interrogator', () => {
  // 프런트 게이트는 UX 용도이므로 상태 API 만 가로채 화면을 검증한다(실제 권한은 백엔드가 판정).
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/auth/status', (route) => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ authenticated: true, username: 'e2e', has_credentials: true }),
    }));
    await page.route('**/api/get_list_database', (route) => route.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify({ databases: [] }),
    }));
  });

  test('MeasSet Generation 에서 MSI input 탭으로 전환된다(MsiChoice)', async ({ page }) => {
    await page.goto('/measset-generation');
    await expect(page.getByTestId('mode-tab-condor')).toBeVisible();
    await page.getByTestId('mode-tab-msi').click();
    await expect(page.getByTestId('msi-choice')).toBeVisible();
    await expect(page.getByTestId('msi-choice-excel')).toHaveText('MSI Input From Excel');
    await expect(page.getByTestId('msi-choice-dump')).toHaveText('MSI Input From Dumped Data');
    await page.getByTestId('mode-tab-condor').click();
    await expect(page.getByTestId('msi-choice')).toBeHidden();
  });

  test('measSetInput 이 별도 창 라우트(/msi-input)에서 전체 폼으로 열린다', async ({ page }) => {
    await page.goto('/msi-input?database=DemoDB');
    await expect(page.getByTestId('msi-excel-open')).toBeVisible();
    await expect(page.getByTestId('msi-excel-exit')).toBeVisible();
    await expect(page.locator('.navbar')).toHaveCount(0);
    await expect(page.locator('.vb-readable')).toHaveCount(1);
    await expect(page.getByText('Open Excel File 로 엑셀 파일을 불러오세요.')).toBeVisible();
  });

  test('#45 Selected Foci 입력 후 azFocusMm 셀 더블클릭 시 초점·조리개·elevIndex 가 함께 바뀐다', async ({ page }) => {
    const filler = Array.from({ length: 11 }, (_, i) => `c${i}`);
    filler[1] = 'probeId';
    await page.route('**/api/msi-excel/parse', (route) => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ status: 'success', data: {
        columns: [...filler, 'azFocusMm', 'azAperSizeMm', 'elevIndex'],
        rows: [[...filler.map((_, i) => (i === 1 ? 7 : 'x')), '10 20 30 40', '5 10 15 20', '0 0 0 0']],
      } }),
    }));
    await page.goto('/msi-input?database=DemoDB');
    const dir = require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 'msi45-'));
    require('fs').writeFileSync(require('path').join(dir, 'a.xlsx'), 'x');
    await page.getByTestId('msi-excel-picker').setInputFiles(dir);
    await page.getByTestId('msi-excel-files').getByText('a.xlsx').click();
    await page.getByTestId('msi-excel-open').click();
    await page.getByTestId('msi-excel-output-rowhead-0').dblclick();
    await page.locator('input[aria-label="Selected Foci"]').fill('15 25');

    const cells = page.locator('.vb-grid').nth(1).locator('tbody tr').first().locator('td');
    await cells.nth(11).dblclick();
    await page.getByText('Selected RTP', { exact: true }).click();
    await expect(cells.nth(11)).toHaveText('15 25');
    await expect(cells.nth(12)).toHaveText(/^\s*7\.5\s+12\.5$/);
    await expect(cells.nth(13)).toHaveText('0 0');
  });

  test('#46 Selected RTP 왼쪽 위 모서리 더블클릭으로 모든 행을 삭제한다(취소 시 유지)', async ({ page }) => {
    await page.route('**/api/msi-excel/parse', (route) => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ status: 'success', data: { columns: ['probeName', 'probeId', 'x'], rows: [['P', 7, 'a'], ['P', 7, 'b']] } }),
    }));
    await page.goto('/msi-input?database=DemoDB');
    const dir = require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 'msi46-'));
    require('fs').writeFileSync(require('path').join(dir, 'a.xlsx'), 'x');
    await page.getByTestId('msi-excel-picker').setInputFiles(dir);
    await page.getByTestId('msi-excel-files').getByText('a.xlsx').click();
    await page.getByTestId('msi-excel-open').click();
    await page.getByTestId('msi-excel-selectall').click();
    const rows = page.locator('[data-testid="msi-excel-selected"] tbody tr:not(.vb-newrow)');
    await expect(rows).toHaveCount(2);

    const dlg = page.getByTestId('app-dialog');
    await page.getByTestId('msi-excel-selected-corner').dblclick();
    await expect(dlg).toHaveAttribute('data-tone', 'danger');
    await page.getByTestId('app-dialog-cancel').click();
    await expect(dlg).toHaveCount(0);
    await expect(rows).toHaveCount(2);

    await page.getByTestId('msi-excel-selected-corner').dblclick();
    await page.getByTestId('app-dialog-ok').click();
    await expect(rows).toHaveCount(0);
  });

  test('#51 공용 알림/확인 창: 톤·Esc 닫기·포커스 복귀·Enter 확인·순차 표시', async ({ page }) => {
    let prf = 0;
    await page.route('**/api/msi-excel/update-prf', (route) => {
      prf += 1;
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'success', data: { messages: ['첫 번째 메시지', '두 번째 메시지'] } }) });
    });
    let nativeDialogs = 0;
    page.on('dialog', (d) => { nativeDialogs += 1; d.dismiss(); });
    await page.goto('/msi-input?database=DemoDB');
    const dlg = page.getByTestId('app-dialog');
    const msg = page.getByTestId('app-dialog-message');

    const saveMat = page.getByTestId('msi-excel-savemat');
    await saveMat.click();
    await expect(dlg).toHaveAttribute('data-tone', 'warning');
    await expect(msg).toContainText('Nothing in Selected RTP');
    await expect(page.getByTestId('app-dialog-ok')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dlg).toHaveCount(0);
    await expect(saveMat).toBeFocused();

    await page.getByTestId('msi-excel-updateprf').click();
    await expect(dlg).toHaveAttribute('data-kind', 'confirm');
    await page.getByTestId('app-dialog-cancel').click();
    await expect(dlg).toHaveCount(0);
    expect(prf).toBe(0);

    await page.getByTestId('msi-excel-updateprf').click();
    await expect(dlg).toHaveAttribute('data-kind', 'confirm');
    await page.keyboard.press('Enter');
    await expect(msg).toHaveText('첫 번째 메시지');
    expect(prf).toBe(1);
    await page.getByTestId('app-dialog-ok').click();
    await expect(msg).toHaveText('두 번째 메시지');
    await page.getByTestId('app-dialog-ok').click();
    await expect(dlg).toHaveCount(0);
    await expect(page.getByTestId('msi-excel-updateprf')).toBeFocused();
    expect(nativeDialogs).toBe(0);
  });

  test('#49 저장 전 중복 확인 창에서 중복 조건을 보여 주고 강제 입력(forceNew)을 보낸다', async ({ page }) => {
    await page.route('**/api/msi-excel/parse', (route) => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ status: 'success', data: { columns: ['probeName', 'probeId', 'x'], rows: [['P', 7, 'a']] } }),
    }));
    let checks = 0;
    await page.route('**/api/msi-excel/check-dup', (route) => {
      checks += 1;
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'success', data: {
        kind: 'tank', dupTotal: 1, inserted: 1, comboTotal: 2,
        duplicates: [{ row: 1, cond: { PMpulseType: 'Bipolar', FocusPMm: '20' }, ids: [3712], action: '병합: 기존 measSetId 3712 의 pulseWidth·ePulseString 보완', dup: true }],
        combos: [
          { row: 1, cond: { PMpulseType: 'Bipolar', FocusPMm: '20' }, ids: [3712], action: '병합: 기존 measSetId 3712 의 pulseWidth·ePulseString 보완', dup: true },
          { row: 1, cond: { PMpulseType: 'Bipolar', FocusPMm: '40' }, ids: [], action: '새 행 추가', dup: false },
        ],
      } }) });
    });
    const saves = [];
    await page.route('**/api/msi-excel/save-tank', (route) => {
      saves.push(route.request().postDataJSON());
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'success', data: {
        messages: [], inserted: 3, updated: 0, duplicates: [], dupTotal: 0, setRange: '3713:3715' } }) });
    });
    await page.goto('/msi-input?database=DemoDB');
    const ok = page.getByTestId('app-dialog-ok');
    const dir = require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 'msi49-'));
    require('fs').writeFileSync(require('path').join(dir, 'a.xlsx'), 'x');
    await page.getByTestId('msi-excel-picker').setInputFiles(dir);
    await page.getByTestId('msi-excel-files').getByText('a.xlsx').click();
    await page.getByTestId('msi-excel-open').click();
    await page.getByTestId('msi-excel-selectall').click();

    await page.getByTestId('msi-excel-savedb').click();
    await ok.click();
    const grid = page.getByTestId('msi-excel-dup-grid');
    await expect(grid).toContainText('FocusPMm');
    await expect(grid).toContainText('3712');
    await expect(page.getByTestId('msi-excel-dup-summary')).toContainText('1건');
    const dupRows = grid.locator('tbody tr:not(.vb-newrow)');
    await expect(grid.locator('thead th').nth(1)).toHaveText('중복 여부');
    await expect(dupRows.nth(0).locator('td').first()).toHaveText('● 중복');
    await expect(dupRows.nth(1).locator('td').first()).toHaveText('신규');
    await page.getByTestId('msi-excel-dup-cancel').click();
    await expect(page.getByTestId('msi-excel-dup')).toHaveCount(0);
    expect(saves).toHaveLength(0);

    await page.getByTestId('msi-excel-savedb').click();
    await ok.click();
    await page.getByTestId('msi-excel-dup-save').click();
    await expect.poll(() => saves.length).toBe(1);
    expect(saves[0].forceNew).toBe(false);
    await expect(page.getByTestId('app-dialog')).toHaveAttribute('data-tone', 'success');
    await ok.click();

    await page.getByTestId('msi-excel-savedb').click();
    await ok.click();
    await page.getByTestId('msi-excel-dup-force').click();
    await expect(page.getByTestId('app-dialog-message')).toContainText('중복 1건');
    await ok.click();
    await expect.poll(() => saves.length).toBe(2);
    await ok.click();
    expect(saves[1].forceNew).toBe(true);
    expect(checks).toBe(3);
  });

  test('Interrogator 메인 폼이 원본(intMain) 버튼·활성 규칙을 따른다', async ({ page }) => {
    await page.route('**/api/get_list_database', (route) => route.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify({ databases: ['BizDb'] }),
    }));
    await page.route('**/api/interrogator/probes?*', (route) => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ status: 'success', data: [{ probeId: 7, probeName: 'C1-6' }] }),
    }));
    await page.route('**/api/interrogator/rtp-names?*', (route) => route.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'success', data: ['RTP_A'] }),
    }));
    await page.route('**/api/interrogator/rtp-display?*', (route) => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ status: 'success', data: {
        rtpLut: { columns: ['pmRTPId', 'RTPName'], rows: [[1, 'RTP_A']] },
        tempPrbLut: { columns: [], rows: [] }, tempPrbVoltLut: { columns: [], rows: [] },
        tempPulseLut: { columns: [], rows: [] }, problemCount: 1,
      } }),
    }));
    await page.goto('/interrogator');
    await expect(page.getByTestId('int-main')).toBeVisible();
    await expect(page.getByTestId('int-btn-simu')).toBeDisabled();
    await expect(page.getByTestId('int-btn-tank')).toBeDisabled();
    await expect(page.getByTestId('int-btn-runaper')).toBeEnabled();

    await page.getByTestId('int-db').selectOption('BizDb');
    await page.getByTestId('int-probe').selectOption('7');
    await expect(page.getByTestId('int-probe-name')).toHaveValue('C1-6');
    await expect(page.getByTestId('int-btn-tank')).toBeEnabled();
    await expect(page.getByTestId('int-btn-power')).toBeEnabled();
    await expect(page.getByTestId('int-btn-simu')).toBeDisabled();

    await page.getByTestId('int-rtp-name').selectOption('<New...>');
    await expect(page.getByTestId('int-newname')).toBeVisible();
    await page.getByTestId('int-newname-text').fill('RTP_NEW');
    await page.getByTestId('int-newname-ok').click();
    await expect(page.getByTestId('int-rtp-name')).toHaveValue('RTP_NEW');

    await page.getByTestId('int-rtp-name').selectOption('RTP_A');
    await page.getByTestId('int-btn-display').click();
    await expect(page.getByTestId('int-rtp-display')).toBeVisible();
    await expect(page.getByTestId('int-rtp-problem')).toBeVisible();
    await page.getByTestId('int-rtp-close').click();
    await expect(page.getByTestId('int-rtp-display')).toBeHidden();

    // 중복 타이틀바·히어로 제거, DB 선택은 카드 상단(toolbar)에 통합
    await expect(page.getByTestId('int-main').locator('.vb-titlebar')).toHaveCount(0);
    await expect(page.getByTestId('int-main').locator('.vb-toolbar').getByTestId('int-db')).toBeVisible();

    // Power 분석 창: 화면 전체 최대창 + 화면 맞춤 ↔ 원본 크기 전환 + Esc 닫기 + 배경 스크롤 잠금
    await page.route('**/api/interrogator/power/sw-versions?*', (route) => route.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'success', data: ['1.0'] }),
    }));
    await page.getByTestId('int-btn-power').click();
    const modal = page.getByTestId('int-power-modal');
    await expect(modal).toBeVisible();
    const vp = page.viewportSize();
    const box = await modal.boundingBox();
    expect(Math.round(box.width)).toBe(vp.width);
    expect(Math.round(box.height)).toBe(vp.height);
    await expect(page.locator('body')).toHaveCSS('overflow', 'hidden');
    const win = await page.getByTestId('int-power').locator('.vb-window').boundingBox();
    expect(win.height).toBeLessThanOrEqual(vp.height + 1);
    await page.getByTestId('int-power-view-actual').click();
    await expect(page.getByTestId('int-power-view-actual')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('int-power')).toHaveAttribute('data-zoom', '1.00');
    await page.getByTestId('int-power-view-width').click();
    await expect.poll(async () => (await page.getByTestId('int-power').locator('.vb-window').boundingBox()).width)
      .toBeGreaterThan(vp.width - 40);
    await page.getByTestId('int-power-view-page').click();
    await expect.poll(async () => (await page.getByTestId('int-power').locator('.vb-window').boundingBox()).height)
      .toBeLessThanOrEqual(vp.height + 1);
    await page.keyboard.press('Escape');
    await expect(modal).toBeHidden();
    await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden');
  });
});
