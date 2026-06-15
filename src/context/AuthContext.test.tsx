import { describe, it, expect, beforeEach } from 'vitest';
import { toCachedUser } from './AuthContext';

const STORAGE_KEY = 'nala_auth_user';

const fullUser = {
  id: 'u_123',
  username: 'janedoe',
  displayName: 'Jane Doe',
  email: 'jane@example.com',
  emailVerified: true,
  plan: 'elite' as const,
  planExpiresAt: '2099-01-01T00:00:00.000Z',
  createdAt: '2020-01-01T00:00:00.000Z',
  isWaitlistAdmin: true,
};

describe('toCachedUser (non-PII whitelist)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('excludes PII fields (email, emailVerified)', () => {
    const cached = toCachedUser(fullUser);
    expect(cached).not.toHaveProperty('email');
    expect(cached).not.toHaveProperty('emailVerified');
  });

  it('excludes createdAt (not needed for first paint)', () => {
    const cached = toCachedUser(fullUser);
    expect(cached).not.toHaveProperty('createdAt');
  });

  it('keeps the non-PII identity fields needed for first paint', () => {
    const cached = toCachedUser(fullUser);
    expect(cached).toEqual({
      id: 'u_123',
      username: 'janedoe',
      displayName: 'Jane Doe',
      plan: 'elite',
      planExpiresAt: '2099-01-01T00:00:00.000Z',
      isWaitlistAdmin: true,
    });
  });

  it('preserves isWaitlistAdmin so ErrorBoundary still reads it', () => {
    // ErrorBoundary.tsx reads only isWaitlistAdmin from the persisted blob.
    expect(toCachedUser(fullUser).isWaitlistAdmin).toBe(true);
    expect(toCachedUser({ ...fullUser, isWaitlistAdmin: false }).isWaitlistAdmin).toBe(false);
  });

  it('when persisted to localStorage, the blob contains NO email but DOES have username/displayName', () => {
    // Mirror exactly how writeCachedUser serializes the value.
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toCachedUser(fullUser)));

    const raw = localStorage.getItem(STORAGE_KEY);
    expect(raw).toBeTruthy();
    expect(raw).not.toContain('jane@example.com');

    const blob = JSON.parse(raw as string);
    expect(blob).not.toHaveProperty('email');
    expect(blob).not.toHaveProperty('emailVerified');
    expect(blob).toHaveProperty('username', 'janedoe');
    expect(blob).toHaveProperty('displayName', 'Jane Doe');
  });
});
