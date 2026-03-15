import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BrowserContext } from '@playwright/test';

interface LocalApiEnv {
  jwtSecret: string;
  userId: string;
}

function base64UrlEncode(input: string | Buffer): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function signJwt(payload: Record<string, unknown>, secret: string): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const data = `${encodedHeader}.${encodedPayload}`;
  const signature = crypto
    .createHmac('sha256', secret)
    .update(data)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');

  return `${data}.${signature}`;
}

function parseEnvFile(raw: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

function loadLocalApiEnv(): LocalApiEnv {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const apiEnvPath = path.resolve(here, '..', '..', '..', 'stock-portfolio-api', '.env');
  const raw = fs.readFileSync(apiEnvPath, 'utf8');
  const parsed = parseEnvFile(raw);
  const jwtSecret = parsed.JWT_SECRET;
  const userId = parsed.WAITLIST_ADMIN_USER_IDS?.split(',')[1]?.trim() || parsed.WAITLIST_ADMIN_USER_IDS?.split(',')[0]?.trim();

  if (!jwtSecret) {
    throw new Error('JWT_SECRET is missing from the local API .env');
  }
  if (!userId) {
    throw new Error('WAITLIST_ADMIN_USER_IDS is missing from the local API .env');
  }

  return { jwtSecret, userId };
}

export async function attachLocalAuthCookie(context: BrowserContext, baseURL: string) {
  const { jwtSecret, userId } = loadLocalApiEnv();
  const now = Math.floor(Date.now() / 1000);
  const token = signJwt(
    {
      userId,
      username: 'playwright-local',
      emailVerified: true,
      plan: 'elite',
      iat: now,
      exp: now + 60 * 60,
    },
    jwtSecret,
  );

  await context.addCookies([
    {
      name: 'authToken',
      value: token,
      url: baseURL,
      httpOnly: false,
      sameSite: 'Lax',
    },
  ]);
}
