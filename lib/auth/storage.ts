/**
 * 토큰/세션 영속 저장 — expo-secure-store(OS Keychain/Keystore) 래퍼.
 *
 * SecureStore 는 항목당 ~2KB 제한이 있으나 JWT + 경량 세션은 충분히 들어간다.
 * 웹/SSR 환경(예: expo-web)에서는 SecureStore 가 없으므로 메모리 폴백을 둔다.
 */
import * as SecureStore from 'expo-secure-store';
import { STORAGE_KEYS } from '../config';
import type { AuthSession } from './types';

const memoryStore = new Map<string, string>();
const secureStoreAvailable = typeof SecureStore.getItemAsync === 'function';

async function getItem(key: string): Promise<string | null> {
  if (!secureStoreAvailable) return memoryStore.get(key) ?? null;
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return memoryStore.get(key) ?? null;
  }
}

async function setItem(key: string, value: string): Promise<void> {
  memoryStore.set(key, value);
  if (!secureStoreAvailable) return;
  try {
    await SecureStore.setItemAsync(key, value);
  } catch {
    /* 메모리에는 이미 저장됨 */
  }
}

async function removeItem(key: string): Promise<void> {
  memoryStore.delete(key);
  if (!secureStoreAvailable) return;
  try {
    await SecureStore.deleteItemAsync(key);
  } catch {
    /* noop */
  }
}

export async function loadToken(): Promise<string | null> {
  return getItem(STORAGE_KEYS.token);
}

export async function saveToken(token: string): Promise<void> {
  return setItem(STORAGE_KEYS.token, token);
}

export async function loadSession(): Promise<AuthSession | null> {
  const raw = await getItem(STORAGE_KEYS.session);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthSession;
  } catch {
    return null;
  }
}

export async function saveSession(session: AuthSession): Promise<void> {
  // 토큰은 별도 키로 저장하므로 세션 객체에선 제외.
  const { token: _token, ...rest } = session;
  return setItem(STORAGE_KEYS.session, JSON.stringify(rest));
}

export async function clearAuthStorage(): Promise<void> {
  await Promise.all([removeItem(STORAGE_KEYS.token), removeItem(STORAGE_KEYS.session)]);
}
