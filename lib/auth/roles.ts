/**
 * 역할 정규화 + 역할별 홈 라우팅.
 *
 * 백엔드의 `user.role` 은 영문 코드(owner/admin/nurse/caregiver/viewer)일 수도,
 * 한글 라벨(원장/간호사/요양보호사...)일 수도 있어 둘 다 정규화한다.
 * 정규화 결과는 7개 표준 역할 키 중 하나.
 */

export const ROLE_KEYS = [
  'owner', // 시설장/대표
  'director', // 원장/센터장
  'nurse', // 간호사
  'nurse_assistant', // (간호)조무사
  'caregiver', // 요양보호사
  'social_worker', // 사회복지사
  'volunteer', // 자원봉사자
] as const;

export type RoleKey = (typeof ROLE_KEYS)[number];

/** 표준 역할 키 → 한글 표시명. */
export const ROLE_LABELS: Record<RoleKey, string> = {
  owner: '시설장',
  director: '원장',
  nurse: '간호사',
  nurse_assistant: '간호조무사',
  caregiver: '요양보호사',
  social_worker: '사회복지사',
  volunteer: '자원봉사자',
};

/** 다양한 원시 역할 문자열 → 표준 역할 키 매핑. (모두 소문자/trim 후 조회) */
const ROLE_ALIASES: Record<string, RoleKey> = {
  // 영문 코드 (웹 JWT / 권한 시드)
  owner: 'owner',
  admin: 'owner',
  manager: 'director',
  director: 'director',
  nurse: 'nurse',
  nurse_assistant: 'nurse_assistant',
  assistant: 'nurse_assistant',
  caregiver: 'caregiver',
  social_worker: 'social_worker',
  socialworker: 'social_worker',
  volunteer: 'volunteer',
  viewer: 'volunteer', // 읽기 전용 → 가장 제한적인 홈
  // 한글 라벨 (staff.role 등)
  '시설장': 'owner',
  '대표': 'owner',
  '대표이사': 'owner',
  '원장': 'director',
  '센터장': 'director',
  '관리자': 'director',
  '간호사': 'nurse',
  '간호조무사': 'nurse_assistant',
  '조무사': 'nurse_assistant',
  '요양보호사': 'caregiver',
  '사회복지사': 'social_worker',
  '자원봉사자': 'volunteer',
  '봉사자': 'volunteer',
};

/** 안전 기본값 — 알 수 없는 역할은 가장 제한적인 홈으로. */
export const DEFAULT_ROLE_KEY: RoleKey = 'caregiver';

/** 원시 역할 문자열을 표준 역할 키로 정규화. */
export function normalizeRole(raw: string | null | undefined): RoleKey {
  if (!raw) return DEFAULT_ROLE_KEY;
  const key = raw.trim().toLowerCase();
  if (key in ROLE_ALIASES) return ROLE_ALIASES[key];
  // 원본(대소문자 보존) 한글 매칭 재시도
  const krKey = raw.trim();
  if (krKey in ROLE_ALIASES) return ROLE_ALIASES[krKey];
  return DEFAULT_ROLE_KEY;
}

/**
 * 역할별 홈 라우트. expo-router 경로 문자열.
 * 모든 역할 홈은 `app/(home)/` 그룹 아래에 위치.
 */
export const ROLE_HOME_ROUTE: Record<RoleKey, string> = {
  owner: '/(home)/owner',
  director: '/(home)/director',
  nurse: '/(home)/nurse',
  nurse_assistant: '/(home)/nurse-assistant',
  caregiver: '/(home)/caregiver',
  social_worker: '/(home)/social-worker',
  volunteer: '/(home)/volunteer',
};

/** 원시 역할 → 홈 라우트 (정규화 포함). */
export function homeRouteForRole(raw: string | null | undefined): string {
  return ROLE_HOME_ROUTE[normalizeRole(raw)];
}
