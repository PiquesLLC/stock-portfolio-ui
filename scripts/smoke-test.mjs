#!/usr/bin/env node
/* eslint-disable no-console */

const BASE_URL = process.env.UI_SMOKE_BASE_URL || 'http://127.0.0.1:5173';

async function runCheck(check) {
  const url = `${BASE_URL}${check.path}`;
  try {
    const response = await fetch(url, {
      method: check.method ?? 'GET',
      headers: check.headers ?? {},
    });
    const ok = check.acceptedStatus.includes(response.status);
    return {
      ...check,
      status: response.status,
      ok,
      expected: check.acceptedStatus.join('/'),
    };
  } catch (error) {
    return {
      ...check,
      status: 'ERR',
      ok: false,
      expected: check.acceptedStatus.join('/'),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function main() {
  console.log('=== UI Smoke Test ===');
  console.log(`Base URL: ${BASE_URL}`);
  console.log('');

  const checks = [
    {
      name: 'UI root',
      path: '/',
      acceptedStatus: [200],
    },
    {
      name: 'Vite proxy auth gate',
      path: '/api/auth/me',
      acceptedStatus: [401],
    },
  ];

  let failures = 0;
  for (const check of checks) {
    const result = await runCheck(check);
    const tag = result.ok ? 'PASS' : 'FAIL';
    const detail = result.error ? ` (${result.error})` : '';
    console.log(`[${tag}] GET ${result.path} (${result.name}) -> ${result.status} (expected ${result.expected})${detail}`);
    if (!result.ok) failures += 1;
  }

  console.log('');
  if (failures > 0) {
    console.log(`UI smoke test FAILED: ${failures} check(s) did not match expected status.`);
    process.exit(1);
  }

  console.log('UI smoke test PASSED: all checks matched expected status.');
}

main();
