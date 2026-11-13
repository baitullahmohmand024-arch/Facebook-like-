# HOSTELVERSE Security Specification

## Data Invariants
1. **PII Isolation**: User email, privacy mode, notification toggles, and blocked user lists are stored exclusively in `/users/{userId}/private/settings`, readable and writable only by the owner (`request.auth.uid == userId`) or a verified administrator.
2. **Email Verification & Identity Integrity**: All authenticated writes require `request.auth.token.email_verified == true`. Every user-authored document enforces `incoming().authorId == request.auth.uid` (or `userId` / `reporterId` / `followerId` / `senderId`).
3. **Immutable Ownership & Timestamps**: `createdAt`, `uid`, `authorId`, `postId`, and `id` cannot be reassigned after creation. `createdAt` and `updatedAt` are validated against `request.time`.
4. **Atomic Counter Synchronization**:
   - Liking or unliking a post requires an atomic batch creating/deleting `/likes/{postId}_{uid}` AND incrementing/decrementing `/posts/{postId}.likesCount` by exactly 1 (`existsAfter` / `getAfter` verified).
   - Following or unfollowing requires an atomic batch creating/deleting `/follows/{followerId}_{followingId}` AND adjusting `followingCount` / `followersCount` by 1.
   - Commenting requires an atomic batch creating `/comments/{commentId}` AND incrementing `posts/{postId}.commentsCount` by 1.
5. **Private Messaging Containment**: Conversations and messages are accessible strictly to `participantAId` and `participantBId` (`request.auth.uid in resource.data.participantIds`), with parent `get()` verification on message creation.
6. **Admin Privilege Protection**: Ordinary users cannot read or write `/admins/{userId}`, cannot modify `isSuspended`, cannot edit `/platformSettings/config`, and cannot resolve `/reports/{reportId}`.
7. **Terminal State Locking**: Once a report reaches `resolved` or `dismissed`, non-admins cannot reopen or alter it.

## Dirty Dozen Adversarial Payloads (Must Return PERMISSION_DENIED)
1. **Spoofed Post Author**: User A attempts `create` on `/posts/p1` with `authorId: "userB"`.
2. **Ghost Field Injection (Shadow Update)**: User A attempts `update` on `/users/userA` adding `isAdmin: true` or `isSuspended: false`.
3. **Unverified Admin Email Spoof**: User with `email: "baitullahmohmand024@gmail.com"` and `email_verified: false` attempts `update` on `/platformSettings/config`.
4. **PII Blanket Read**: User A attempts `get` on `/users/userB/private/settings`.
5. **Client-Forged Timestamp**: User A attempts `create` on `/posts/p2` with `createdAt` set to a past date instead of `request.time`.
6. **ID Poisoning**: User A attempts `create` on `/posts/<2000-char-invalid-id>` with non-alphanumeric characters or oversized document ID.
7. **Like Inflation Bypass**: User A attempts `update` on `/posts/p1` setting `likesCount: 99999` without creating `/likes/p1_userA` in the same batch.
8. **Duplicate Like Spam**: User A attempts `update` on `/posts/p1` incrementing `likesCount` when `/likes/p1_userA` already exists.
9. **Unauthorized Message Eavesdrop**: User C attempts `get` or `list` on `/conversations/userA_userB/messages` without being in `participantIds`.
10. **Self-Suspension Bypass**: Suspended User A attempts `update` on `/users/userA` setting `isSuspended: false`.
11. **Report Terminal Reopen**: Ordinary user attempts `update` on `/reports/r1` (status `'resolved'`) to change status back to `'open'`.
12. **Blanket Query Scraping**: User A attempts `list` on `/notifications` without scoping to `recipientId == request.auth.uid`.
