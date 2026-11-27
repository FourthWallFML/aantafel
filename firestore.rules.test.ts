/**
 * Security Rules Specification Verification Suite (Dirty Dozen)
 * Run with @firebase/rules-unit-testing against the Firebase Emulator.
 */
export interface DirtyDozenCase {
  id: number;
  name: string;
  collectionPath: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  expected: 'PERMISSION_DENIED';
  payload?: Record<string, unknown>;
}

export const DIRTY_DOZEN_TESTS: DirtyDozenCase[] = [
  {
    id: 1,
    name: 'Self-privilege escalation on /admins',
    collectionPath: '/admins/attacker_uid',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    payload: {
      uid: 'attacker_uid',
      email: 'attacker@example.com',
      displayName: 'Attacker',
      grantedBy: 'attacker_uid',
    },
  },
  {
    id: 2,
    name: 'Unverified admin email spoof on /admins list',
    collectionPath: '/admins',
    operation: 'list',
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 3,
    name: 'Shadow RBAC field injection on /users',
    collectionPath: '/users/user_a',
    operation: 'update',
    expected: 'PERMISSION_DENIED',
    payload: { isAdmin: true, role: 'admin' },
  },
  {
    id: 4,
    name: 'Identity spoofing ownerId on /recipes create',
    collectionPath: '/recipes/rec_spoof',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    payload: { ownerId: 'victim_uid', title: 'Spoofed' },
  },
  {
    id: 5,
    name: 'PII scraping on /familyMembers by non-owner',
    collectionPath: '/familyMembers/mem_1',
    operation: 'get',
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 6,
    name: 'Terminal state override of revoked /familyMembers by non-admin',
    collectionPath: '/familyMembers/mem_revoked',
    operation: 'update',
    expected: 'PERMISSION_DENIED',
    payload: { status: 'active' },
  },
  {
    id: 7,
    name: 'Unauthenticated list scraping on /sharedCookbooks',
    collectionPath: '/sharedCookbooks',
    operation: 'list',
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 8,
    name: 'Public get on paused /sharedCookbooks (isActive: false)',
    collectionPath: '/sharedCookbooks/tfb_paused_1234',
    operation: 'get',
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 9,
    name: 'ID poisoning with invalid shareCode path characters',
    collectionPath: '/sharedCookbooks/bad..code$1',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 10,
    name: 'Value poisoning recipeCount > 30 on /sharedCookbooks update',
    collectionPath: '/sharedCookbooks/tfb_valid_1234',
    operation: 'update',
    expected: 'PERMISSION_DENIED',
    payload: { recipeCount: 999 },
  },
  {
    id: 11,
    name: 'Admin self-delete lockout on /admins/{ownUid}',
    collectionPath: '/admins/admin_uid',
    operation: 'delete',
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 12,
    name: 'Forged client timestamp on /familyMembers create',
    collectionPath: '/familyMembers/mem_time',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    payload: { createdAt: '2020-01-01T00:00:00Z' },
  },
];
