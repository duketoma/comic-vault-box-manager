# Comic Archive Pro — Reading Challenge

## Implementation-ready technical specification

Version 1.0 · Technical design for an AI coding agent · TypeScript, React, existing database

## 1. Implementation objective

Implement a Reading Challenge feature in Comic Archive Pro that lets a user define a reading challenge using one or more collection criteria, generates a stable ordered list of eligible comics, presents the next ten unread comics, tracks reading progress, and displays milestones for both the entire challenge and the subset already read.

The implementation must adapt the application's existing database and architecture. It must not assume that the application uses PostgreSQL, a particular ORM, a particular API framework, or specific existing table names until the codebase has been inspected.

### Confirmed product decisions

| Decision               | Requirement                                                                                      |
| ---------------------- | ------------------------------------------------------------------------------------------------ |
| Database               | Adapt the existing database and reuse existing collection entities                               |
| Default order          | Oldest release date first, with deterministic tie-breaking                                       |
| Previously read comics | Every new challenge starts fresh; previous reading history does not automatically exclude comics |
| Collection changes     | Snapshot challenge membership and order at creation                                              |
| Criteria               | Support combined AND/OR conditions in the first release                                          |
| Milestones             | Show earliest/latest items across the entire challenge and across items already read             |
| Queue                  | Display up to ten unread comics at a time                                                        |
| Challenge history      | Preserve completed and abandoned challenges                                                      |
| UI                     | Use existing React components, TypeScript conventions, design system, and light/dark themes      |

### Required implementation outcome

The feature is complete when a user can:

1. Configure criteria and preview the matching collection.
2. Start a challenge and persist its ordered snapshot.
3. Read comics through a queue of ten items.
4. Mark comics read, undo reading actions, and optionally skip comics.
5. See progress and milestone information update correctly.
6. Complete or abandon a challenge without losing its history.
7. Start another challenge using the same comics, even if they were read previously.

## 2. Mandatory repository discovery before coding

The coding agent must begin by inspecting the existing application. Do not create parallel collection tables or introduce a new database technology just to match this specification.

Inspect:

- Existing comic/issue entity, primary key, publisher, series, volume, issue number, release date, title, and cover-image fields.
- Existing creator entities and the roles used to distinguish writers, pencillers, inkers, colorists, and other contributors.
- Existing character, story arc/event, and comic-to-entity relationships.
- Existing storage box/location relationships.
- Database provider, migration framework, ORM or query layer, and transaction support.
- Existing API routing, authorization, DTOs, validation, and error handling conventions.
- Existing comic search components, card components, image handling, and theme support.
- Whether the application supports multiple users or has a single-user ownership model.
- Whether a normalized issue sort key already exists.
- Existing reading-history functionality, if any.

The agent must produce a short schema mapping before implementation.

| Logical concept          | Required action                                                                    |
| ------------------------ | ---------------------------------------------------------------------------------- |
| Comic / Issue            | Reuse the existing entity and primary key                                          |
| Publisher / Series       | Reuse existing tables and relationships                                            |
| Creator / Role           | Reuse existing role definitions and normalize only if necessary                    |
| Character / Story Arc    | Reuse existing entities and junction tables                                        |
| Cover / Storage Location | Reuse existing references and display components                                   |
| Reading History          | Reuse an existing equivalent if it satisfies this specification; otherwise add one |

If the schema lacks information required to distinguish creator roles or sort issue numbers correctly, document the gap and implement the smallest compatible extension.

Do not begin by rewriting unrelated portions of the application.

## 3. Architecture and module boundaries

Implement the feature as a separate feature module that uses the application's existing data-access and service conventions.

React presentation layer

Setup · Queue · Comic cards · Progress · Insights · History

Application service layer

Criteria validation · Preview · Snapshot creation · Read actions · Milestones · Lifecycle

Existing persistence layer

Collection queries · Challenge repositories · Transactions · Migrations

Business rules must live in the service layer, not exclusively in React. The server or trusted backend must validate challenge criteria, enforce challenge ownership, prevent duplicate read actions, and determine completion.

### Suggested module structure

Adapt to the current repository rather than creating a second architecture.

```
src/features/reading-challenges/
  components/
    ReadingChallengePage.tsx
    ChallengeSetupForm.tsx
    CriterionGroupEditor.tsx
    CriterionEditor.tsx
    ChallengePreview.tsx
    ReadingQueue.tsx
    ComicReadingCard.tsx
    ChallengeProgress.tsx
    ChallengeInsights.tsx
    ChallengeHistory.tsx
    EndChallengeDialog.tsx
  hooks/
    useReadingChallenge.ts
    useReadingQueue.ts
    useChallengeInsights.ts
  api/
    readingChallengesApi.ts
  types/
    readingChallenge.types.ts
  validation/
    readingChallenge.schemas.ts
  services/
    readingChallengeService.ts
    challengeCriteriaService.ts
    challengeSnapshotService.ts
    challengeInsightsService.ts
  repositories/
    readingChallengeRepository.ts
    challengeItemRepository.ts
  utils/
    readingOrder.ts
    milestoneFormatting.ts
```

If backend code resides in a separate directory or project, keep the service and repository modules there. Frontend hooks should call existing API abstractions and must not issue database queries directly.

## 4. Database changes

### 4.1 New logical entities

Add the following tables or equivalent document structures, using the application's naming conventions:

1. `ReadingChallenge`
2. `ReadingChallengeItem`
3. `ReadingHistory`, unless an existing reading-history model already meets the requirements.

Do not duplicate publishers, series, creators, characters, events, cover images, or storage locations into separate catalog tables.

### 4.2 `ReadingChallenge`

One record represents one challenge.

| Field                | Suggested type                                      | Required behavior                    |
| -------------------- | --------------------------------------------------- | ------------------------------------ |
| `ChallengeId`        | Existing ID convention                              | Primary key                          |
| `OwnerId`            | Existing user ID type, nullable only if appropriate | Associate with owner when applicable |
| `Name`               | String                                              | User-visible challenge name          |
| `Status`             | Enum or constrained string                          | `Active`, `Completed`, `Abandoned`   |
| `CriteriaSnapshot`   | JSON/JSONB or equivalent                            | Validated criteria definition        |
| `CriteriaVersion`    | Integer                                             | Criteria serialization version       |
| `ReadingOrder`       | Enum or constrained string                          | Initial value `PublicationDate`      |
| `SortDirection`      | Enum or constrained string                          | Initial value `Ascending`            |
| `BatchSize`          | Integer                                             | Default `10`; must be positive       |
| `CreatedAt`          | Timestamp                                           | Creation time                        |
| `StartedAt`          | Timestamp                                           | Start time                           |
| `CompletedAt`        | Nullable timestamp                                  | Completion time                      |
| `EndedAt`            | Nullable timestamp                                  | Abandonment time                     |
| `TotalEligibleCount` | Integer                                             | Number of comics in initial snapshot |
| `CriteriaSummary`    | Nullable string                                     | Optional user-readable description   |

Recommended invariants:

- `CompletedAt` is populated only when the challenge is completed.
- `EndedAt` is populated when the challenge is abandoned.
- A completed or abandoned challenge is not editable as an active challenge.
- `TotalEligibleCount` equals the number of challenge items created for the snapshot.
- `BatchSize` defaults to 10 but can support other positive values if the product later exposes that setting.

Use the application's existing timestamp and timezone conventions. Do not introduce multiple competing representations of the same status.

### 4.3 `ReadingChallengeItem`

One record represents one comic selected for one challenge.

| Field              | Suggested type             | Required behavior                                           |
| ------------------ | -------------------------- | ----------------------------------------------------------- |
| `ChallengeItemId`  | Existing ID convention     | Primary key                                                 |
| `ChallengeId`      | Foreign key                | Parent challenge                                            |
| `ComicId`          | Existing comic ID type     | Reference to existing comic                                 |
| `SequenceNumber`   | Integer                    | Immutable initial order                                     |
| `Status`           | Enum or constrained string | `Unread`, `Read`, `Skipped`                                 |
| `AddedAt`          | Timestamp                  | Snapshot creation time                                      |
| `ReadAt`           | Nullable timestamp         | First successful read completion                            |
| `SkippedAt`        | Nullable timestamp         | Skip time                                                   |
| `MetadataSnapshot` | JSON/JSONB or equivalent   | Immutable fields needed for historical cards and milestones |

Constraints:

- Unique `(ChallengeId, ComicId)`.
- Unique `(ChallengeId, SequenceNumber)`.
- Foreign key from `ChallengeId` to the challenge.
- Foreign key to the existing comic record, with deletion behavior chosen deliberately.
- Index `(ChallengeId, Status, SequenceNumber)`.
- Index `(ChallengeId, ComicId)`.

Do not cascade-delete challenge history simply because a comic is removed from the collection. Prefer a restrictive foreign key or an explicit archival strategy consistent with the existing application's deletion rules.

#### Required metadata snapshot

Store a compact, versioned snapshot of the fields necessary to preserve the original reading experience. At minimum, include:

- Comic title.
- Publisher name and identifier.
- Series name and identifier.
- Volume and displayed issue number.
- Release date, including whether it is unknown.
- Creator names, identifiers, and relevant roles.
- Character names and identifiers.
- Story arc/event names and identifiers.
- Cover reference or image identifier, where the existing image lifecycle permits it.
- Storage-location information, if the product requires historical location display.

Do not copy the actual image bytes into each item. Store a reference to the existing image resource.

Storage location deserves special handling: if the comic moves boxes, the queue should normally show its current location so the user can find it. Historical challenge metadata may preserve the original location for audit purposes, but the current location should be displayed when available.

The snapshot is not a replacement for the collection record. It exists to preserve challenge membership, historical labels, and milestone calculations even if collection metadata changes later.

### 4.4 `ReadingHistory`

Record reading actions independently of challenge status.

| Field              | Suggested type                                    | Purpose                                               |
| ------------------ | ------------------------------------------------- | ----------------------------------------------------- |
| `ReadingHistoryId` | Existing ID convention                            | Primary key                                           |
| `ChallengeId`      | Nullable foreign key                              | Challenge context                                     |
| `ChallengeItemId`  | Nullable foreign key                              | Item context                                          |
| `ComicId`          | Existing comic ID type                            | Comic involved                                        |
| `Action`           | Enum/string                                       | `Read`, `Unread`, `Skipped`, `Unskipped` as supported |
| `OccurredAt`       | Timestamp                                         | Event time                                            |
| `ActorId`          | Nullable or required according to ownership model | User who performed the action                         |

The current challenge-item status is the authoritative current state for that challenge. The history table records events, not a second mutable status.

Repeated requests for the same state must not generate duplicate logical read events. An actual undo followed by a new read can create a new event.

If the application already tracks reading history, reuse it only if it can distinguish challenge-specific actions, preserve repeat readings, and record timestamps correctly.

### 4.5 Migrations and rollback

The coding agent must:

1. Create migrations through the existing migration system.
2. Include all indexes, foreign keys, unique constraints, and status validation.
3. Avoid destructive modifications to existing collection tables.
4. Provide a rollback migration where supported.
5. Verify migration against a development database containing representative collection data.
6. Confirm that the existing collection screens and queries still function.

For PostgreSQL, use `JSONB` for criteria and metadata snapshots. For another database, use its supported JSON representation or the established project convention. The logical behavior must remain the same.

## 5. Criteria language and evaluation rules

### 5.1 Required criteria types

The first release must support:

- Entire collection.
- Publisher.
- Series.
- Story arc/event.
- Creator plus role, including writer and penciller.
- Character.
- Release-date range.
- Multiple criteria combined through AND and OR.

Multiple selected values within the same criterion use OR semantics. For example, selecting two publishers means either publisher qualifies.

### 5.2 Use a nested Boolean expression

A single top-level `match: "all" | "any"` property is insufficient for expressions such as:

`(Publisher A OR Publisher B) AND (Writer X OR Character Y)`.

Use a nested criteria tree instead.

```
type CreatorRole =
  | "writer"
  | "penciller"
  | "cover penciller"
  | "cover artist"
  | "artist"
  | "variant cover artist";

type CriterionLeaf =
  | { type: "collection" }
  | { type: "publisher"; ids: string[] }
  | { type: "series"; ids: string[] }
  | { type: "storyArc"; ids: string[] }
  | {
      type: "creator";
      ids: string[];
      roles: CreatorRole[];
    }
  | { type: "character"; ids: string[] }
  | {
      type: "releaseDateRange";
      from?: string;
      through?: string;
    };

type CriterionNode =
  | CriterionLeaf
  | {
      type: "group";
      operator: "AND" | "OR";
      children: CriterionNode[];
    };

interface ReadingChallengeCriteria {
  version: 1;
  root: CriterionNode;
}
```

The identifier type shown here is illustrative. Use the exact type already used by the application's entity IDs.

### 5.3 Criteria examples

Entire collection:

```
{
  "version": 1,
  "root": { "type": "collection" }
}
```

All comics by a particular writer, published from 1980 through 1989:

```
{
  "version": 1,
  "root": {
    "type": "group",
    "operator": "AND",
    "children": [
      {
        "type": "creator",
        "ids": ["CREATOR_ID"],
        "roles": ["writer"]
      },
      {
        "type": "releaseDateRange",
        "from": "1980-01-01",
        "through": "1989-12-31"
      }
    ]
  }
}
```

A publisher combination with nested alternatives:

```
{
  "version": 1,
  "root": {
    "type": "group",
    "operator": "AND",
    "children": [
      {
        "type": "group",
        "operator": "OR",
        "children": [
          { "type": "publisher", "ids": ["PUBLISHER_A"] },
          { "type": "publisher", "ids": ["PUBLISHER_B"] }
        ]
      },
      {
        "type": "character",
        "ids": ["CHARACTER_X"]
      }
    ]
  }
}
```

These examples describe the criteria contract. The service must translate it into safe database queries; it must never concatenate user-provided identifiers or field names into raw SQL.

### 5.4 Validation rules

Validate the tree on the backend before previewing or starting a challenge.

- Root node must exist and be valid.
- Groups must have at least one child.
- Empty selections are invalid.
- All selected entity IDs must exist and be accessible.
- Creator roles must be supported roles.
- Date values must be valid calendar dates.
- `from` must not be later than `through`.
- A collection node cannot be combined with other conditions unless explicit semantics for that combination are implemented. Recommended first-release rule: reject such a combination.
- Limit tree depth, node count, and selected-ID count to avoid pathological queries.
- Reject unsupported criterion versions with a clear validation error.
- Normalize duplicate selected IDs.
- Validate that the user is authorized to access all selected entities.

A query matching no comics is valid. It should return a zero-result preview, not an exception.

### 5.5 Date and role semantics

- Date ranges are inclusive.
- `from` and `through` refer to comic release dates, not import timestamps or dates when the user purchased the comic.
- Unknown release dates do not match a date-range criterion.
- A creator criterion matches only the specified roles.
- If multiple roles are selected, any matching role qualifies.
- A comic matching several branches of an OR expression must appear only once in the final snapshot.

The criteria engine should express relationship checks using `EXISTS`, joins, or the equivalent supported by the persistence layer, while preventing duplicate comic rows from many-to-many relationships.

## 6. Reading order and immutable snapshot

### 6.1 Default ordering

Use release date ascending, with unknown dates last.

The initial ordering contract is:

1. Known release date, earliest first.
2. Series ordering key, if appropriate for the selected order and available.
3. Normalized issue ordering key, if available.
4. Comic primary key as the final stable tie-breaker.

Conceptual PostgreSQL query:

```
ORDER BY
    release_date ASC NULLS LAST,
    series_id ASC NULLS LAST,
    issue_sort_key ASC NULLS LAST,
    comic_id ASC;
```

This is an example, not a literal query to run against an unknown schema. The agent must map the columns and ordering rules to the existing collection schema.

The default challenge order must be `PublicationDate` with ascending direction. Additional orders can be supported where the existing data model allows them, but the initial implementation must not sacrifice correct chronological ordering.

### 6.2 Stable ordering rules

- Do not sort displayed issue numbers lexicographically.
- Do not assume that issue numbers uniquely identify chronological order.
- Treat annuals, specials, variants, fractional issues, and legacy numbering according to existing normalized fields when available.
- Use the comic primary key as the final tie-breaker.
- Keep the initial sequence numbers stable even if the collection is later edited.

If no suitable issue sort key exists, use a documented fallback and ensure the user can still choose publication-date order.

### 6.3 Starting a challenge

Challenge creation must be atomic.

Recommended workflow:

1. Validate the challenge name, criteria, batch size, and reading order.
2. Confirm that no other active challenge exists for the same owner, if the product enforces one active challenge per user.
3. Execute the criteria query against the current collection.
4. Apply deterministic ordering.
5. Create the challenge record and save its criteria snapshot.
6. Insert a challenge item for each matching comic, with consecutive sequence numbers starting at 1.
7. Store each item's required metadata snapshot.
8. Set `TotalEligibleCount`.
9. Mark the challenge active.
10. Commit the transaction.
11. Return the initial queue and progress summary.

If the operation fails, roll back all challenge records and items created by that operation.

For very large collections, the implementation may use database-side `INSERT ... SELECT` or a transaction-safe bulk insertion approach. It must preserve the same deterministic ordering and all-or-nothing behavior.

### 6.4 Snapshot semantics

Once a challenge starts:

- New comics added to the collection do not enter the challenge automatically.
- Changes to a comic's release date do not reorder existing items.
- Changes to publisher, series, creator, character, or story-arc relationships do not change challenge membership.
- Existing challenge items remain in their original sequence.
- Deleted or unavailable comics remain represented by their challenge-item snapshot.

For the first release, do not implement automatic rebuilding of a challenge. This prevents new purchases and catalog corrections from silently changing the user's goal.

If a user wants to incorporate new comics, they can create a new challenge. A future explicit refresh feature can be designed separately.

## 7. Reading queue and progress rules

### 7.1 Queue definition

The queue consists of the first `BatchSize` challenge items whose status is `Unread`, sorted by `SequenceNumber` ascending.

Conceptual query:

```
SELECT *
FROM ReadingChallengeItem
WHERE ChallengeId = @ChallengeId
  AND Status = 'Unread'
ORDER BY SequenceNumber ASC
LIMIT @BatchSize;
```

Use the database's parameterization and query conventions. `@BatchSize` is placeholder notation here; PostgreSQL typically uses `$1`, `$2`, etc., or the parameters supplied by the chosen ORM.

The queue is a view over challenge items. Do not persist a second independent queue array.

### 7.2 Status behavior

| Status    | Appears in queue? | Counts as read? | Resolves an item?            |
| --------- | ----------------- | --------------- | ---------------------------- |
| `Unread`  | Yes               | No              | No                           |
| `Read`    | No                | Yes             | Yes                          |
| `Skipped` | No                | No              | Yes, for completion purposes |

A skipped comic is not considered read. Track read count and skipped count separately.

Completion rule:

`ReadCount + SkippedCount = TotalEligibleCount`

This rule makes completion possible when the user intentionally skips comics. If every comic must be read to finish the challenge, disable skipping or change the completion rule explicitly; do not implement contradictory behavior.

### 7.3 Progress calculations

Return these values from the service:

- `totalEligible`
- `readCount`
- `skippedCount`
- `remainingCount`
- `resolvedCount`
- `progressPercent`
- `queue`

Recommended definitions:

- `readCount` = number of items with status `Read`.
- `skippedCount` = number of items with status `Skipped`.
- `resolvedCount` = `readCount + skippedCount`.
- `remainingCount` = `totalEligible - resolvedCount`.
- `progressPercent` = `resolvedCount / totalEligible × 100`, or zero when the total is zero.

Because skipped comics are not read, the UI must not label `progressPercent` as a percentage of comics read. Display both the completion percentage and the read count.

### 7.4 Queue retrieval

Every queue retrieval must:

1. Verify challenge ownership.
2. Retrieve challenge status and counts.
3. Retrieve the first unread items in sequence order.
4. Return comic display data, using snapshot data for historical metadata and live storage location when available.
5. Return milestone statistics or a separate insights endpoint reference.
6. Indicate whether the challenge is complete or abandoned.

Use an existing DTO for comic display data wherever possible.

## 8. Service contracts and API requirements

The following contracts are logical requirements. The coding agent should adapt routing, naming, and HTTP conventions to the existing backend.

### 8.1 Preview challenge

`POST /api/reading-challenges/preview`

Request:

```
interface PreviewChallengeRequest {
  criteria: ReadingChallengeCriteria;
  readingOrder: "PublicationDate";
  sortDirection: "Ascending" | "Descending";
  limit?: number;
}
```

Response:

```
interface PreviewChallengeResponse {
  eligibleCount: number;
  previewItems: ComicSummary[];
  warnings: string[];
}
```

Requirements:

- Do not create a challenge or reading-history record.
- Apply the same criteria semantics and sorting as actual creation.
- Return the full matching count, not merely the preview count.
- Apply a safe maximum preview limit.
- Reuse the same query-building logic as challenge creation.

### 8.2 Create a challenge

`POST /api/reading-challenges`

Request:

```
interface CreateReadingChallengeRequest {
  name: string;
  criteria: ReadingChallengeCriteria;
  readingOrder?: "PublicationDate";
  sortDirection?: "Ascending";
  batchSize?: number;
}
```

Response:

```
interface ReadingChallengeSummary {
  challengeId: string;
  name: string;
  status: "Active" | "Completed" | "Abandoned";
  startedAt: string;
  totalEligible: number;
  readCount: number;
  skippedCount: number;
  remainingCount: number;
  progressPercent: number;
  queue: ChallengeQueueItem[];
}
```

Requirements:

- Default `readingOrder` to `PublicationDate`.
- Default `sortDirection` to `Ascending`.
- Default `batchSize` to 10.
- Validate that the name is not blank.
- Reject an empty result set from automatic activation, or return a preview-only result requiring explicit confirmation. Recommended behavior: do not create an active empty challenge.
- Create challenge and items atomically.
- Enforce the active-challenge policy in the service and database when supported.

### 8.3 Retrieve active challenge

`GET /api/reading-challenges/active`

Response: the active challenge summary and current queue, or a well-defined `null`/not-found response if none exists.

The frontend must not assume that a challenge exists or create one implicitly.

### 8.4 Retrieve challenge details

`GET /api/reading-challenges/:challengeId`

Return the challenge configuration, lifecycle status, counts, progress, and timestamps. Do not return thousands of items as part of the summary.

### 8.5 Retrieve queue

`GET /api/reading-challenges/:challengeId/queue`

Return:

```
interface ChallengeQueueItem {
  challengeItemId: string;
  comicId: string;
  sequenceNumber: number;
  status: "Unread";
  comic: ComicSummary;
}

interface ChallengeQueueResponse {
  challengeId: string;
  status: "Active" | "Completed" | "Abandoned";
  totalEligible: number;
  readCount: number;
  skippedCount: number;
  resolvedCount: number;
  remainingCount: number;
  progressPercent: number;
  queue: ChallengeQueueItem[];
}
```

The `ComicSummary` type must reuse or extend the application's existing comic DTO.

### 8.6 Mark an item read

`POST /api/reading-challenges/:challengeId/items/:itemId/read`

Request body is optional; if present, it may include user notes.

Successful response: updated challenge summary and queue, or a documented item-action response if the frontend retrieves the queue separately.

Requirements:

- Verify ownership and active challenge status.
- Verify that the item belongs to the specified challenge.
- Set `Status = Read` and `ReadAt` only on the first successful transition to `Read`.
- Insert a reading-history event in the same transaction.
- Recalculate challenge completion.
- Return the updated queue and counts.
- Make repeated requests idempotent.

### 8.7 Undo read

`POST /api/reading-challenges/:challengeId/items/:itemId/unread`

Requirements:

- Only allow changes while the challenge is active.
- If the item is currently read, set it to `Unread`, clear its current `ReadAt`, and record an `Unread` event.
- If the item is already unread, treat the request as an idempotent no-op.
- Reopen a challenge if an explicit undo operation makes an automatically completed challenge incomplete, provided the product allows undo after completion. Recommended policy: allow undo while the completion screen is open, and otherwise require an explicit reopen action or disallow it after completion.
- Recalculate queue, counts, and milestones.

For the first release, the simplest safe policy is to permit undo only while the challenge is active and provide a short confirmation window before final completion. If undo after completion is required, implement the completed-to-active transition explicitly and test it.

### 8.8 Skip an item

`POST /api/reading-challenges/:challengeId/items/:itemId/skip`

Requirements:

- Only allow skipping unread items in active challenges.
- Set `Status = Skipped` and `SkippedAt`.
- Record a history event.
- Exclude the item from the queue.
- Recalculate counts and completion.
- Do not count skipped items as read in milestones or reading-history statistics.

If the product does not expose skipping in the first release, the API and status can be omitted until that behavior is implemented. Do not expose a nonfunctional skip button.

### 8.9 Retrieve insights

`GET /api/reading-challenges/:challengeId/insights`

Return milestone data for both the entire challenge and read items.

```
type MilestoneKind = "Earliest" | "Latest";
type MilestoneScope = "WholeChallenge" | "ReadItems";

interface ChallengeMilestone {
  category:
    | "Collection"
    | "Publisher"
    | "Series"
    | "StoryArc"
    | "Creator"
    | "Character";
  entityId?: string;
  entityName?: string;
  kind: MilestoneKind;
  scope: MilestoneScope;
  challengeItemId: string;
  comicId: string;
  releaseDate?: string;
  dateKnown: boolean;
}

interface ChallengeInsightsResponse {
  challengeId: string;
  milestones: ChallengeMilestone[];
}
```

The actual response may be grouped by category or entity for more efficient rendering. The contract above defines the information each milestone must communicate.

### 8.10 End challenge

`POST /api/reading-challenges/:challengeId/end`

Requirements:

- Only an active challenge can be abandoned.
- Set status to `Abandoned` and set `EndedAt`.
- Preserve all items and reading-history records.
- Do not delete or reset reading progress.
- Return the final counts and status.

### 8.11 List challenge history

`GET /api/reading-challenges/history`

Requirements:

- Return paginated challenge summaries, newest first.
- Include completed and abandoned challenges.
- Include progress counts and start/end timestamps.
- Exclude other users' challenges.
- Do not include all challenge items in each history result.

### 8.12 API errors

Use the application's established error format. At minimum, distinguish:

- Invalid criteria (`400` or the application's validation equivalent).
- Unauthenticated or unauthorized requests (`401`/`403` as appropriate).
- Challenge or item not found (`404`).
- Conflicting lifecycle state (`409`).
- Server/database failure (`500`).

Do not return database exceptions, SQL text, or internal stack traces to the client.

## 9. Milestone calculation specification

### 9.1 Required milestone scopes

Every milestone category must be calculated in two scopes:

1. Whole Challenge: all items in the original challenge snapshot, regardless of whether they have been read.
2. Read Items: only items whose current challenge status is `Read`.

Skipped and unread items are excluded from the Read Items scope.

Milestones must be calculated from the snapshot metadata, not from current collection membership or relationships. Otherwise, editing a comic's creator credits after a challenge starts could unexpectedly change the challenge's historical milestones.

### 9.2 Categories and grouping

Implement the following calculations.

| Category        | Grouping key              | Earliest/latest field |
| --------------- | ------------------------- | --------------------- |
| Collection      | One group per challenge   | Release date          |
| Publisher       | Publisher ID              | Release date          |
| Series          | Series ID                 | Release date          |
| Story arc/event | Story arc ID              | Release date          |
| Creator         | Creator ID + creator role | Release date          |
| Character       | Character ID              | Release date          |

For every group, return both earliest and latest results, where available, for both scopes.

For creators, a writer milestone and a penciller milestone must be separate when the role differs. If a creator holds multiple roles on one comic, the comic may qualify for both role-specific groups but should not be duplicated within one group.

### 9.3 Definition of earliest and latest

- Earliest = lowest known release date.
- Latest = highest known release date.
- For equal dates, use `SequenceNumber` ascending as the deterministic tie-breaker for both earliest and latest.
- If all matching comics have unknown release dates, do not fabricate a chronological result. Return an unavailable/unknown-date state, or use an explicitly labeled sequence-based fallback.
- If a group has no read items, omit its Read Items milestone rather than treating the whole-challenge milestone as a read milestone.
- If a group contains one qualifying comic, that comic is both earliest and latest.

Do not label the earliest comic in the collection as a character's first-ever appearance. Use labels such as "Earliest in this challenge" and "Latest among comics you've read."

### 9.4 Query efficiency

Use database-side aggregation where practical. Do not fetch every comic's entire metadata into React to calculate milestones.

The implementation may:

- Query the snapshot metadata in the challenge-item table.
- Use normalized snapshot tables if the existing database design supports them more naturally.
- Use a database view or grouped queries if that improves maintainability.

Do not introduce a separate milestone cache in the first release unless performance measurements show it is necessary.

### 9.5 Milestone UI requirements

The insights view should distinguish the two scopes visually and accessibly:

- Whole Challenge: what the challenge covers.
- Read Items: how far the user has progressed through each category.

Each milestone card should show:

- Earliest or latest label.
- Category and entity name.
- Comic title, series, issue number, and release date.
- Cover image.
- Read/unread status.
- Link to the comic detail page.

When the milestone is a read item, the UI should not imply that its position in the overall publication timeline equals its position in the reading queue if those orders differ.

## 10. React UI and state-management requirements

### 10.1 Main page states

The page must handle the following states explicitly:

- No active challenge.
- Creating or previewing a challenge.
- Active challenge with a full ten-item queue.
- Active challenge with fewer than ten remaining.
- Active challenge with no unread items because all remaining items are skipped or because of a transient inconsistency.
- Completed challenge.
- Abandoned challenge.
- Loading, empty, and error states.

Do not infer the challenge state solely from the number of cards currently displayed.

### 10.2 Setup form

The form must support:

- Selecting a criterion type.
- Searching and selecting existing catalog entities.
- Adding multiple criteria.
- Creating nested AND/OR groups.
- Removing or editing criteria.
- Choosing the reading order.
- Previewing matching count and sample cards.
- Starting the challenge after reviewing the preview.

Provide a readable summary of the final expression before the user starts. For example:

"Publisher is Marvel or DC, AND character is Spider-Man, AND release date is 1980–1989."

The editor must prevent invalid empty groups and make the AND/OR relationship clear. If deeply nested expressions become difficult to navigate, provide a visual group editor rather than exposing raw JSON.

### 10.3 Queue card

The comic card must use the existing collection metadata and cover-image components.

Display at least:

- Cover.
- Title and series.
- Volume and issue number.
- Publisher.
- Release date.
- Writer and penciller.
- Characters and story arcs.
- Current storage box/location.
- Mark as Read action.

Optional secondary details can be expandable to keep the interface compact.

The Mark as Read action must provide a clear pending state, prevent accidental double submissions, and update the UI after the server confirms success.

### 10.4 Progress panel

Display separately:

- Read: `readCount / totalEligible`.
- Skipped: `skippedCount`.
- Remaining: `remainingCount`.
- Overall completion percentage.
- Current challenge status.
- Start date and completion date, when applicable.

The progress panel must not confuse resolved items with read items.

### 10.5 Challenge history and replacement

When a challenge is active and the user attempts to start a new one:

1. Show a confirmation dialog.
2. Explain that the current challenge will be abandoned.
3. Explain that its progress and history will be preserved.
4. Only end the current challenge after the user confirms.
5. Create the new challenge through the service.
6. If new challenge creation fails, report the failure clearly and do not silently lose the previous challenge's progress.

Prefer a backend operation that safely transitions from one active challenge to another within a transaction, if supported by the existing database. Otherwise, make the transition recoverable and ensure that a failed create operation does not leave the UI falsely claiming the new challenge started.

## 11. Concurrency, integrity, and security

These are implementation requirements, not optional future optimizations.

### 11.1 Active challenge invariant

If the application allows only one active challenge per user, enforce that invariant in the database when supported and in the service layer.

For PostgreSQL, a partial unique index can enforce one active challenge per owner. Other database systems should use their equivalent or an appropriate transactional locking strategy.

If the app is single-user, follow its existing ownership conventions rather than introducing an unnecessary multi-tenant model.

### 11.2 Atomic read action

A read action must be a transaction that:

1. Loads and validates the challenge and item.
2. Checks the current status.
3. Changes the item status and timestamp.
4. Inserts the history event.
5. Recalculates completion and counts.
6. Commits the operation.

If any required step fails, roll back the entire operation.

Concurrent requests for the same item must not create duplicate logical transitions. Use conditional updates, row locking, or equivalent concurrency control appropriate to the database.

### 11.3 Idempotency

Repeated requests to mark an already-read item as read should return its current state without creating another read event.

Likewise, repeated skip requests should not create duplicate skip transitions.

If the existing API supports idempotency keys, use them for challenge creation and other non-idempotent operations. Otherwise, implement request-safe behavior and unique database constraints where appropriate.

### 11.4 Security

- Enforce ownership on every challenge and item endpoint.
- Validate all criteria on the backend.
- Use parameterized queries or safe ORM query construction.
- Do not trust user-supplied entity IDs or roles.
- Limit query-tree depth and size.
- Do not expose another user's collection or challenge history.
- Reuse the application's existing authentication, authorization, logging, and rate-limiting practices.

### 11.5 Metadata and deletion behavior

The snapshot must preserve historical challenge identity, but the live collection remains authoritative for current availability and storage location.

If a comic is deleted, its challenge item and snapshot must remain usable. Implement the behavior using the existing deletion strategy, such as soft deletion, archived comic records, or a deliberately managed nullable reference. Do not allow a foreign-key cascade to erase reading history.

## 12. Testing specification

The coding agent must implement automated tests using the repository's existing test framework. If none exists, choose a framework compatible with the existing TypeScript and backend stack rather than introducing multiple test systems.

### 12.1 Criteria tests

- Collection criterion selects every eligible comic.
- Publisher, series, story arc, creator, character, and date criteria select correct comics.
- Creator role matching distinguishes writers from pencillers.
- Multiple IDs within a criterion use OR semantics.
- Nested AND/OR groups return correct results.
- Duplicate relationship matches do not duplicate a comic.
- Invalid IDs, invalid dates, empty groups, and excessive nesting are rejected.
- Empty results return a valid zero-result preview.
- Date boundaries are inclusive.
- Unknown dates do not match a date-range criterion.

### 12.2 Ordering and snapshot tests

- Oldest known release date sorts first.
- Unknown release dates sort last.
- Equal release dates resolve deterministically.
- Issue `10` is not accidentally sorted before issue `2` due to string comparison when issue ordering is used.
- Starting a challenge persists exactly the previewed matching membership when the collection has not changed.
- Adding a comic after challenge start does not change the active challenge.
- Editing release dates or creator relationships does not alter existing sequence numbers or historical milestones.
- Snapshot creation rolls back completely on failure.

### 12.3 Queue and lifecycle tests

- Initial queue contains ten items when at least ten unread items exist.
- Queue contains fewer than ten when fewer remain.
- Reading an item removes it from the queue and reveals the next unread item.
- Skipped items are not read items and do not block the queue.
- Progress counts and percentages are correct.
- Repeated read requests do not duplicate history events.
- Undo updates the queue and counts correctly.
- Completion is triggered according to the resolved-item rule.
- Abandonment preserves all item and history records.
- Starting a new challenge permits previously read comics.
- Concurrent read actions do not double-count an item.
- Concurrent challenge creation cannot violate the active-challenge invariant.

### 12.4 Milestone tests

- Earliest/latest milestones are correct for the whole challenge.
- Earliest/latest milestones are correct for read items only.
- Skipped items do not enter the read-only scope.
- Creator milestones are role-specific.
- Characters, creators, and story arcs with multiple matching comics are grouped correctly.
- Tied release dates use the documented tie-breaker.
- All-unknown dates do not produce a false chronological claim.
- Changes to live collection metadata do not change snapshot milestones.

### 12.5 UI tests

- Setup form supports nested criteria and validation feedback.
- Preview results and counts are displayed correctly.
- Queue remains correct after a successful read action.
- Failed API calls do not falsely mark a comic read.
- Confirmation is required before abandoning an active challenge.
- Completed and abandoned challenges are displayed in history.
- Cards use current storage locations where available.
- Light mode, dark mode, and mobile layouts work with existing application styling.

### 12.6 Integration tests

Run migrations against a development/test database and verify:

- Foreign keys and uniqueness constraints.
- Transaction rollback behavior.
- Existing collection browsing and search functionality.
- API authorization and error responses.
- Large challenge creation and queue retrieval.
- No unexpected changes to existing collection data.

## 13. Phased implementation tasks for the coding agent

The following phases are ordered dependencies. Do not begin the next phase until its acceptance criteria pass.

### 1

Repository and schema analysis

Prerequisite

- Map current entities, keys, relationships, and creator roles.
- Identify database and migration conventions.
- Identify API, validation, authorization, and test patterns.
- Document issue-number sorting and deletion behavior.
- Propose exact migrations before modifying production-facing code.

Acceptance: schema mapping reviewed; no assumed table names or destructive changes.

### 2

Database and typed contracts

- Add challenge, item, and history structures.
- Add constraints, indexes, and migrations.
- Define criteria AST, request/response DTOs, and validation schemas.
- Implement repository interfaces and transaction boundaries.

Acceptance: migrations pass and the domain types validate against test fixtures.

### 3

Criteria engine and preview

- Implement all criterion types.
- Implement nested AND/OR evaluation.
- Implement deterministic ordering.
- Return accurate match counts and preview items.
- Add criteria and query integration tests.

Acceptance: preview and creation use the same matching and ordering rules.

### 4

Challenge snapshot and lifecycle

- Implement transactional challenge creation.
- Persist immutable item membership, order, and metadata snapshots.
- Implement active-challenge retrieval, abandonment, and history.
- Enforce the active-challenge policy.

Acceptance: a challenge can be created, reloaded, and abandoned without losing its snapshot.

### 5

Queue, reading actions, and progress

- Implement queue retrieval.
- Implement read, undo, and skip if included.
- Record history events transactionally.
- Update counts and completion status.
- Test duplicate requests and concurrent actions.

Acceptance: the ten-item reading workflow works end to end and survives refreshes.

### 6

Milestones and insights

- Calculate earliest/latest milestones by category and entity.
- Support both whole-challenge and read-only scopes.
- Preserve creator-role distinctions.
- Implement insight response DTOs and tests.

Acceptance: milestone results match expected values for ties, unknown dates, and metadata edits.

### 7

React interface and integration

- Build the setup form, criteria editor, preview, queue cards, progress, insights, and history.
- Integrate existing cover and storage-location components.
- Add loading, error, empty, and confirmation states.
- Validate responsive and theme behavior.

Acceptance: users can create, run, complete, abandon, and review challenges through the UI.

### 8

Regression, performance, and handoff

- Run the complete test suite.
- Test representative small and large collections.
- Verify migration rollback and existing collection behavior.
- Document schema changes, API endpoints, known limitations, and deployment steps.

Acceptance: all required tests pass and the implementation is documented.

## 14. Final implementation rules and non-goals

The coding agent must follow these rules throughout implementation.

1. Inspect before modifying. Never assume the existing database, ORM, table names, API framework, or authentication model.
2. Reuse the collection. Challenge items reference existing comics. Snapshot only the metadata needed for historical display and stable milestone calculations.
3. Keep one source of truth per concept. Challenge-item status determines current challenge progress; reading history records actions; challenge criteria define the original selection.
4. Keep matching consistent. Preview and challenge creation must share the same criteria evaluation and ordering implementation.
5. Preserve the snapshot. Do not automatically add new comics, change item sequence, or recompute membership after the challenge starts.
6. Make transitions atomic. Read actions, history events, challenge creation, and lifecycle transitions must maintain database integrity.
7. Use accurate labels. Distinguish comics read from comics skipped, whole-challenge milestones from read-only milestones, and collection-first appearances from verified first-ever appearances.
8. Avoid unnecessary infrastructure. Do not introduce a queue-processing service, background worker, separate analytics database, or milestone cache unless the existing architecture or measured performance requires it.

### Explicitly outside the first release

- Automatically importing newly acquired comics into an active challenge.
- Automatic challenge reordering after metadata changes.
- Verified first appearances across comics the user does not own.
- Social sharing, public leaderboards, and multi-user competitions.
- Achievement points, badges, and rewards.
- Advanced milestone caching.
- Automatic recommendations for what to read next beyond the selected criteria and reading order.

These can be added later without changing the basic challenge-item model.

## 15. Definition of done

The implementation is ready to merge when all of the following are true:

- Existing database and application conventions have been inspected and documented.
- Migrations preserve existing collection data.
- Criteria support every required category and nested AND/OR logic.
- Preview and creation return consistent matching results.
- Starting a challenge creates a stable, ordered collection snapshot.
- The queue displays up to ten unread comics and advances correctly.
- Read, undo, and any implemented skip actions are transactional and idempotent.
- Progress and completion status are correct, including the distinction between read and skipped comics.
- Whole-challenge and read-only milestones are accurate and deterministic.
- Completed and abandoned challenges retain their history.
- A new challenge starts fresh, regardless of previous reading history.
- Existing comic cards, cover images, storage locations, and navigation are reused.
- Authorization, validation, migrations, and automated tests pass.
- The feature works in light mode, dark mode, and supported mobile layouts.
- Deployment and rollback instructions are documented.

Final instruction to the coding AI: Implement this specification incrementally in the existing repository. Begin with repository discovery and a concrete schema mapping. Then implement and test each phase before proceeding. At the end of each phase, report files changed, migrations created, tests run, results, and any deviations from this specification. Do not replace existing application architecture or make unrelated changes to the collection system.

The intended result is a reading challenge feature that is reliable for a collection of thousands of comics, maintains accurate reading history, and provides meaningful collection insights without duplicating or destabilizing the existing Comic Archive Pro catalog.