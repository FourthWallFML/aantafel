# Security Specification — Tafelboek (Share & Admin RBAC)

## 1. Data Invariants
1. **Default Deny**: Every unmatched Firestore path is denied (`allow read, write: if false;`).
2. **Verified Admin Bootstrapping**: `isBootstrappedAdmin()` checks `request.auth != null && request.auth.token.email_verified == true && request.auth.token.email == 'adamske@gmail.com'`. `isAdmin()` adds `exists(/databases/$(database)/documents/admins/$(request.auth.uid))`. Never relies on client claims or unverified email tokens.
3. **Self-Assigned Role Prevention**: Users cannot write to `/admins/{uid}` unless they are already an admin, and cannot inject `role` or `isAdmin` shadow keys into `/users/{userId}`.
4. **PII Isolation**: `/familyMembers/{memberId}` and `/admins/{adminUid}` contain emails and are strictly readable only by the owner, the invited verified member (matching verified token email), or an admin. `/sharedCookbooks/{shareCode}` contains ZERO PII (no emails, phones, addresses) and forbids public `list` queries.
5. **Terminal State Locking**: Once a `familyMembers` document reaches `status == 'revoked'`, non-admin owners cannot mutate it further; only `isAdmin()` can override/reactivate.
6. **Zero `get()`/`exists()` in `allow list`**: Every `allow list` block strictly evaluates `existing().ownerId == request.auth.uid || isBootstrappedAdmin()`, avoiding O(n) read amplification.
7. **Master Gate & Immutability**: Subcollection `/recipes/{recipeId}/comments/{commentId}` verifies parent existence and ownership/admin status; `ownerId`, `createdAt`, `shareCode`, and `uid` remain immutable on update.
8. **Strict Timestamps & Bounded Arrays**: Every `create` checks `incoming().createdAt == request.time`; every `update` checks `incoming().updatedAt == request.time`. All arrays and strings have explicit upper `.size()` bounds.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Self-Privilege Escalation**: Non-admin user attempts `create` on `/admins/{ownUid}` to grant themselves admin role -> `PERMISSION_DENIED`.
2. **Email Spoofing Admin Bypass**: Unverified token (`email_verified: false`) with `email: 'adamske@gmail.com'` attempts `list` on `/admins` or `delete` on another user's recipe -> `PERMISSION_DENIED`.
3. **Shadow Field Injection on User Profile**: User updates `/users/{uid}` adding `{ isAdmin: true, role: 'admin' }` -> `PERMISSION_DENIED`.
4. **Cross-Owner Recipe Theft**: Non-admin User B tries to `create` `/recipes/r1` with `ownerId: userA` -> `PERMISSION_DENIED`.
5. **Family Member PII Scraping**: Non-owner User C tries `get` or `list` on `/familyMembers/{memberId}` belonging to User A -> `PERMISSION_DENIED`.
6. **Revoked Invite Resuscitation by Non-Admin**: Non-admin attempts to update `/familyMembers/{id}` where `existing().status == 'revoked'` back to `'active'` -> `PERMISSION_DENIED`.
7. **Public List Scraping of Shared Cookbooks**: Unauthenticated or non-owner user runs `list` on `/sharedCookbooks` -> `PERMISSION_DENIED`.
8. **Inactive Share Link Read**: Unauthenticated user tries `get` on `/sharedCookbooks/{shareCode}` where `isActive == false` -> `PERMISSION_DENIED`.
9. **Share Code Mismatch / ID Poisoning**: Owner tries `create` on `/sharedCookbooks/bad..id` or with `shareCode != docId` -> `PERMISSION_DENIED`.
10. **Value Poisoning on Share Update**: Owner updates `/sharedCookbooks/{code}` setting `recipeCount: 999` or `cookbookTitle: 500-char string` -> `PERMISSION_DENIED`.
11. **Admin Self-Lockout**: Admin tries to `delete` their own `/admins/{ownUid}` document -> `PERMISSION_DENIED`.
12. **Client Timestamp Forgery**: User creates `/familyMembers/m1` with `createdAt` set to a past client timestamp instead of `request.time` -> `PERMISSION_DENIED`.
