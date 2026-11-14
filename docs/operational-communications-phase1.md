# AeroStation Operational Communications — Phase 1 design

Status: design only; no production deployment.

## Existing system
- Keep `src/pages/MessagesPage.jsx` and existing `conversations/{id}/messages` private chat intact.
- Existing `NotificationsPage.jsx`, presence, push utilities and AppLayout message counters should be reused where appropriate.
- Current AeroStation legacy login is not sufficient to authorize sensitive Firestore reads/writes directly. Existing broad Firestore fallback must not be used for new chat data.

## Scope
- Department channels (AA BSO, AV, WAL, SY, DL Cabin, Ramp, WCHR/Security, Duty Managers).
- Separate direct messages and station announcements.
- Mobile-first list/detail navigation, accessible composer, unread indicators, membership controls.
- Optional attachments after server-side access controls and storage rules are ready.
- Read acknowledgments for critical announcements.
- No passenger personal data, UMNR details, passport/ID photos or medical details in general channels.

## Proposed data model (new isolated collections)
- `ops_channels/{channelId}`: name, department, status, createdAt, createdBy, settings.
- `ops_channel_members/{channelId_userId}`: channelId, userId, role, status, joinedAt.
- `ops_channels/{channelId}/messages/{messageId}`: senderId, text, createdAt, editedAt, deletedAt, attachment metadata (future).
- `ops_channel_reads/{channelId_userId}`: channelId, userId, lastReadAt.
- `ops_announcements/{announcementId}`: channelId, title, body, priority, createdAt, createdBy, requiresAck.
- `ops_announcement_acks/{announcementId_userId}`: announcementId, userId, acknowledgedAt.

## Security gate
- New collections: deny browser access until authenticated server APIs are implemented and tested.
- Server must verify identity, membership, role and action authorization on every request; never trust client-provided role, senderId or channel membership.
- Station Manager: all channels/admin; Duty Manager: explicitly assigned oversight; Supervisor: assigned departmental moderation; Agent: assigned membership.
- Do not change legacy collections or UMNR protected rules as part of chat launch.
- Apply rate limits, text length limits, attachment scanning/type/size limits, retention policy and audit events.
- Push notifications must not include sensitive message content on lock screens.

## Implementation milestones
1. Server auth/session compatibility audit and role mapping.
2. Server-side channel membership and message APIs, tests and security rules.
3. Channel directory, message view, mobile composer and unread counts.
4. Announcements and acknowledgments.
5. Attachment support, push, device testing (PWA/iOS/Android).
6. Staged pilot, then release after acceptance tests.

## Acceptance checks
- Unauthorized users cannot list/read/send in channels.
- Revoked members immediately lose access.
- A user cannot impersonate another sender or elevate their role.
- Direct Messages V2 continues working unchanged.
- UMNR/WCHR flows and production reports remain unchanged.
- iPhone/iPad/Android layouts have no unintended horizontal overflow.
- No secrets, Firebase Admin credentials or sensitive passenger data enter client bundles.
