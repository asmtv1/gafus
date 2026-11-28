import { test as base, expect, type Page } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';

type Fixture = {
  username: string;
  password: string;
  login: string;
  training: string;
  stepName: string;
};

const test = base.extend<{ stand: { runId: string; fixture: Fixture; directory: string } }>({
  stand: async ({}, use) => {
    const readyFile = process.env.GAFUS_WEB_E2E_READY_FILE || '';
    const directory = dirname(readyFile);
    if (!/^web-e2e-gafusqa[a-f0-9]{12}$/.test(directory.split('/').at(-1) || '') ||
        dirname(directory) !== resolve(process.cwd(), '.qa/testing') ||
        readyFile !== join(directory, 'ready.json')) {
      throw Error('REFUSE_BROWSER_TEST_OUTSIDE_ISOLATED_QA');
    }
    const { runId, fixture, webOrigin } = JSON.parse(readFileSync(readyFile, 'utf8'));
    if (directory !== join(resolve(process.cwd(), '.qa/testing'), 'web-e2e-' + runId) ||
        !/^http:\/\/127\.0\.0\.1:[1-9][0-9]{3,4}$/.test(webOrigin) ||
        new URL(fixture.login).origin !== webOrigin ||
        new URL(fixture.training).origin !== webOrigin ||
        !fixture.username.startsWith('qa_learner_')) {
      throw Error('INVALID_FRESH_WEB_E2E_FIXTURE');
    }
    await use({ runId, fixture, directory });
  },
});

test('learner completes training after fresh session', async ({ page, browser, stand }) => {
  const { fixture } = stand;
  const stepName = 'Подробнее: ' + fixture.stepName;
  const doneName = 'Я выполнил: ' + fixture.stepName;

  async function login(target: Page) {
    const origin = new URL(fixture.login).origin;
    await target.context().route('**/*', (route) =>
      new URL(route.request().url()).origin === origin ? route.continue() : route.abort(),
    );
    await target.goto(fixture.login);
    await target.locator('#login-name').fill(fixture.username);
    await target.locator('#login-password').fill(fixture.password);
    await target.locator('#login-password').press('Enter');
    await expect(target).toHaveURL(/\/courses(?:\?|$)/, { timeout: 18000 });
  }

  async function openStep(target: Page) {
    await target.goto(fixture.training);
    const tour = target.getByRole('button', { name: 'Пропустить', exact: true });
    if (await tour.waitFor({ state: 'visible', timeout: 1500 }).then(() => true, () => false)) {
      await tour.click();
      await expect(target).toHaveURL(/\/profile(?:\?|$)/);
      await target.goto(fixture.training);
    }
    await target.getByRole('button', { name: stepName }).click();
  }

  const completed = (target: Page) => expect(
    target.getByRole('region', { name: 'Управление текущим шагом' }),
  ).toContainText('Упражнение выполнено');

  await login(page);
  await openStep(page);
  const response = page.waitForResponse((item) =>
    new URL(item.url()).origin === new URL(fixture.training).origin &&
    new URL(item.url()).pathname === '/api/v1/training/step/complete/practice' &&
    item.request().method() === 'POST',
  );
  await page.getByRole('button', { name: doneName }).click();
  const status = (await response).status();
  expect(status).toBe(200);
  await completed(page);

  const fresh = await browser.newContext();
  try {
    const reader = await fresh.newPage();
    await login(reader);
    await openStep(reader);
    await completed(reader);
  } finally {
    await fresh.close();
  }
  writeFileSync(join(stand.directory, 'browser-evidence.json'), JSON.stringify({
    schema: 1, runId: stand.runId, browserCompletion: true, freshLoginReadback: true,
    post200: true, actualCompletionResponseStatuses: [status], verifiedAt: new Date().toISOString(),
  }, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
});
