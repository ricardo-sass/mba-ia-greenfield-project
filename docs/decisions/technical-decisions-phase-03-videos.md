---
scope_type: phase
related_phases: [3]
status: decided
date: 2026-09-22
scope_description: "Phase 03 backend decisions for video upload, S3-compatible storage usage, queue/worker processing, unique video URLs, streaming/download, and video status lifecycle."
---

# Technical Decisions — Phase 03: Upload e Processamento de Vídeos

_Subprojects in scope:_

- `nestjs-project/` — primary subproject. Owns the videos module, storage integration, processing queue, worker container, migrations, API contracts, and tests for Phase 03.
- `next-frontend/` — out of scope for this phase per `ENUNCIADO.md`; future screens inherit the API/storage contracts but no frontend implementation decision is open here.

---

## TD-01: Processing Queue Technology

**Scope:** Backend

**Capability:** Serviço de processamento em segundo plano (filas)

**Context:** Phase 03 needs a real background queue so video processing does not block API requests. The project stack is NestJS 11 in Docker Compose, with PostgreSQL already present and no queue service yet. The queue must support retries, separate workers, and operational visibility without overcomplicating a learning-phase monorepo.

**Options:**

### Option A: BullMQ with Redis
- Use `@nestjs/bullmq` + `bullmq` and add a Redis service to Compose. The API enqueues a processing job after upload completion; a separate NestJS worker container consumes the queue.
- **Pros:** First-class NestJS integration, simple local Docker footprint, retries/backoff built in, mature Node ecosystem, good fit for job processing rather than general messaging.
- **Cons:** Adds Redis as new infrastructure. CPU-heavy work must not run inside the API process; workers need careful lifecycle and idempotency handling.

### Option B: RabbitMQ with AMQP consumers
- Add RabbitMQ and publish processing messages to a durable queue. Worker consumers acknowledge messages only after video processing is complete.
- **Pros:** Strong general-purpose broker, durable queues/acks, good long-term fit for complex event-driven systems.
- **Cons:** Heavier operational model than needed for one video-processing queue. More broker concepts to configure and test in this phase.

### Option C: PostgreSQL-backed jobs with pg-boss
- Use PostgreSQL as the job store through `pg-boss`, avoiding a new queue datastore.
- **Pros:** Reuses the existing PostgreSQL service; transactional enqueue patterns can be straightforward.
- **Cons:** Puts queue churn on the primary relational database. Less aligned with the architecture diagram's separate queue container and NestJS queue recipes than BullMQ.

**Recommendation:** **Option A (BullMQ with Redis)** — it matches the NestJS stack, keeps queue semantics explicit in a dedicated service, and adds less operational weight than RabbitMQ while avoiding queue load on PostgreSQL.

**Decision:** A (BullMQ with Redis)
**Libraries:** @nestjs/bullmq, bullmq

---

## TD-02: 10GB Upload Strategy

**Scope:** Backend

**Capability:** Transversal — covers: Upload de vídeos com suporte a arquivos de até 10GB sem impacto na performance; Pré-cadastro automático do vídeo como rascunho ao iniciar o upload

**Context:** The automatic rejection criterion forbids sending a 10GB file through the API in a way that blocks the system. The API still needs to create a draft video record before upload starts, own authorization, and know when upload is complete so it can enqueue processing.

**Options:**

### Option A: API-orchestrated S3 multipart upload with presigned part URLs
- The API creates a draft video row, initiates an S3-compatible multipart upload, returns short-lived presigned URLs for parts, then completes/aborts the upload and enqueues processing after the client reports uploaded parts.
- **Pros:** Does not stream 10GB through NestJS. Supports resumable/retryable parts and fits S3's large-object model. The API remains the source of truth for draft creation, ownership, storage key, and processing enqueue.
- **Cons:** More API surface than a single upload URL: initiate, sign parts, complete, abort. Tests must exercise multipart completion and orphan cleanup.

### Option B: Single presigned PUT URL
- The API creates a draft row and returns one presigned PUT URL for direct upload to storage.
- **Pros:** Smallest implementation surface and still bypasses the API body stream.
- **Cons:** Poor fit for 10GB uploads: no first-class resumability by part, less control over retries, and harder recovery after flaky connections.

### Option C: API streaming proxy to S3
- The client uploads to the NestJS API; the API streams the request body into S3 without buffering the whole file in memory.
- **Pros:** Simple client contract and full API control over validation.
- **Cons:** Keeps a long-lived 10GB connection open through the API, consumes API bandwidth/workers, and directly conflicts with the phase's "sem travar" constraint compared with direct-to-storage upload.

**Recommendation:** **Option A (API-orchestrated S3 multipart upload with presigned part URLs)** — it is the only option here that satisfies 10GB scale, retry/resume expectations, and the draft-first business flow without making the API carry the file bytes.

**Decision:** A (API-orchestrated S3 multipart upload with presigned part URLs)
**Libraries:** @aws-sdk/client-s3, @aws-sdk/s3-request-presigner

---

## TD-03: Object Storage Bucket and Key Layout

**Scope:** Backend

**Capability:** Serviço de armazenamento de arquivos (vídeos e thumbnails)

**Context:** S3-compatible storage is already fixed by the project/enunciado, with MinIO locally and S3-compatible APIs in production. The open choice is how Phase 03 organizes buckets and keys so videos, thumbnails, processing, streaming, and cleanup remain predictable.

**Options:**

### Option A: One private media bucket with typed key prefixes
- Store both source videos and generated thumbnails in one private bucket using deterministic prefixes such as `videos/{videoId}/source/{filename}` and `videos/{videoId}/thumbnails/default.jpg`.
- **Pros:** One bucket/env contract to configure across API, worker, Compose, and tests. Private-by-default fits presigned upload/download and future authorization. Prefixes keep cleanup and inspection simple.
- **Cons:** Different retention/cache policies for videos and thumbnails must be expressed by object metadata or future lifecycle rules rather than separate buckets.

### Option B: Separate private buckets for videos and thumbnails
- Use one bucket for video sources and another for thumbnails.
- **Pros:** Clear policy separation; thumbnail lifecycle/CDN rules can diverge from source video rules later.
- **Cons:** Doubles bucket configuration and test setup for little immediate benefit. Cross-object cleanup now spans buckets.

### Option C: Private video bucket plus public thumbnail bucket
- Keep videos private but expose thumbnails publicly from storage.
- **Pros:** Future frontend can load thumbnails without signed URLs.
- **Cons:** Premature public exposure in a backend-only phase. Future visibility rules may make thumbnail access conditional, so public-by-default is risky.

**Recommendation:** **Option A (one private media bucket with typed key prefixes)** — it gives Phase 03 the smallest correct storage contract while leaving room for future lifecycle or CDN policies without changing database ownership of object keys.

**Decision:** A (one private media bucket with typed key prefixes)
**Libraries:** @aws-sdk/client-s3

---

## TD-04: Worker Runtime and Media Processing Tooling

**Scope:** Backend

**Capability:** Transversal — covers: Serviço de processamento em segundo plano (filas); Processamento automático do vídeo após upload (extração de duração e metadados); Geração automática de thumbnail a partir de um frame do vídeo

**Context:** Video metadata extraction and thumbnail generation are CPU/I/O-heavy and must not run inside the request path. The worker also needs access to the queue, object storage, and database so it can mark videos as ready or failed.

**Options:**

### Option A: Separate NestJS worker container using FFmpeg/ffprobe CLI
- Build a worker entrypoint/container from the backend codebase. It consumes BullMQ jobs, downloads or streams the uploaded object to worker-local temp storage, runs `ffprobe` for metadata and `ffmpeg` for thumbnail extraction, uploads the thumbnail, and updates the video row.
- **Pros:** Keeps API and processing lifecycles isolated. Reuses NestJS DI/config/database patterns. FFmpeg/ffprobe are the canonical tools for media metadata and thumbnail extraction.
- **Cons:** Requires Docker image changes to include FFmpeg. Processing must be idempotent because queue jobs may retry.

### Option B: Process jobs inside the API container
- Register the BullMQ processor in the same NestJS runtime as the HTTP API.
- **Pros:** Fewer containers and simpler local startup.
- **Cons:** CPU-heavy FFmpeg work competes with HTTP requests and can starve the Node event loop, increasing risk of stalled queue jobs and poor API latency.

### Option C: External managed media service
- Upload the source video and call a managed media/transcoding API to extract metadata and thumbnails.
- **Pros:** Offloads CPU, scaling, and media tooling from the app.
- **Cons:** Adds vendor dependency, credentials, cost, and internet dependency. The phase explicitly expects a local worker and FFmpeg-style processing in Docker.

**Recommendation:** **Option A (separate NestJS worker container using FFmpeg/ffprobe CLI)** — it matches the architecture diagram, keeps the API responsive, and uses proven media tooling while staying fully runnable in Docker.

**Decision:** A (separate NestJS worker container using FFmpeg/ffprobe CLI)
**Libraries:** ffmpeg, ffprobe

---

## TD-05: Unique Video URL Identifier

**Scope:** Backend

**Capability:** URL única por vídeo, sem conflito com outros vídeos

**Context:** Videos need a stable unique URL that does not collide with other videos. The identifier should be generated before publication workflows exist, work independently of mutable titles, and remain short enough for public sharing.

**Options:**

### Option A: Nano ID public slug with a database unique constraint
- Generate a URL-safe random slug, store it in a unique `slug` column, and retry on the rare unique-constraint collision.
- **Pros:** Short, URL-friendly, title-independent, and safe to generate before video metadata is finalized. The database remains the final collision guard.
- **Cons:** Adds one small dependency. Slugs are opaque rather than human-readable.

### Option B: UUID as public slug
- Reuse a UUID-style identifier directly in video URLs.
- **Pros:** No new dependency, extremely low collision probability, straightforward unique constraint.
- **Cons:** Long and less friendly for public video URLs.

### Option C: Title-derived slug plus suffix
- Build the public URL from a normalized title and append a suffix only when needed.
- **Pros:** Human-readable URLs when a title is available.
- **Cons:** Phase 03 creates drafts before final title/editing workflows. Renames create either stale URLs or redirect logic, both better deferred to later publishing phases.

**Recommendation:** **Option A (Nano ID public slug with a database unique constraint)** — it satisfies uniqueness and short URL needs now without coupling Phase 03 URLs to mutable future title-editing behavior.

**Decision:** A (Nano ID public slug with a database unique constraint)
**Libraries:** nanoid

---

## TD-06: Streaming and Download Delivery Strategy

**Scope:** Backend

**Capability:** Transversal — covers: Reprodução via streaming (sem necessidade de download completo); Download do vídeo pelo usuário

**Context:** The platform must play video without requiring a full download and also expose an explicit download path. The architecture diagram already shows the frontend streaming from object storage, while the backend remains responsible for resource lookup, readiness, ownership/visibility checks, and signed access.

**Options:**

### Option A: API returns short-lived presigned GET URLs backed by S3 range support
- The API resolves the video slug, checks status/access, and returns or redirects to a short-lived presigned object URL. The storage service handles HTTP `Range` requests and `206 Partial Content`; download uses a signed URL with response headers for attachment disposition.
- **Pros:** Offloads large response bandwidth from NestJS. Aligns with the architecture diagram's frontend-to-storage streaming path. Uses S3/MinIO's native range handling for progressive playback and downloads.
- **Cons:** Requires local MinIO endpoint/CORS details to be configured carefully for browser playback later. The API must keep signed URL TTLs short and avoid exposing non-ready objects.

### Option B: API proxies range requests from S3
- The client streams from a NestJS endpoint. The API forwards `Range` to storage and returns `206`, `Content-Range`, and the object stream.
- **Pros:** Full API control over headers and access checks for every byte range. No browser-facing storage URL.
- **Cons:** Pushes large video bandwidth through the API and makes NestJS part of the hot streaming path, which is exactly what object storage is meant to avoid.

### Option C: Generate HLS/DASH renditions in Phase 03
- Process uploads into segmented adaptive-streaming assets and serve playlists/segments.
- **Pros:** Best long-term playback experience for multiple network conditions.
- **Cons:** Much larger processing and storage scope than the phase requires; transcoding ladder, segment lifecycle, and player support belong in a later media-optimization phase.

**Recommendation:** **Option A (API returns short-lived presigned GET URLs backed by S3 range support)** — it satisfies streaming/download now, honors the storage architecture, and avoids turning the API into a video CDN.

**Decision:** A (API returns short-lived presigned GET URLs backed by S3 range support)
**Libraries:** @aws-sdk/client-s3, @aws-sdk/s3-request-presigner

---

## TD-07: Video Status Lifecycle and Failure Policy

**Scope:** Backend

**Capability:** Transversal — covers: Pré-cadastro automático do vídeo como rascunho ao iniciar o upload; Processamento automático do vídeo após upload (extração de duração e metadados); Geração automática de thumbnail a partir de um frame do vídeo

**Context:** The database needs to reflect the video lifecycle from draft upload initiation through processing success or failure. The status contract drives API responses, worker idempotency, retry behavior, and future management screens.

**Options:**

### Option A: Explicit state machine with retryable processing failures
- Use statuses `draft`, `uploading`, `processing`, `ready`, and `failed`. Upload initiation creates `draft`/`uploading`, upload completion moves to `processing` and enqueues a job, successful worker completion moves to `ready`, and exhausted retries move to `failed` with reason and retry metadata.
- **Pros:** Represents each externally meaningful phase. Supports retry/idempotency and user-facing failure diagnostics. Keeps "ready for streaming/download" unambiguous.
- **Cons:** Slightly more state-transition rules to validate in services and tests.

### Option B: Minimal lifecycle: `draft`, `processing`, `ready`, `error`
- Collapse upload-in-progress into `draft` and use `error` for all failures.
- **Pros:** Matches the simplified example in the enunciado and has fewer enum values.
- **Cons:** Cannot distinguish a draft that has not started upload from one with an incomplete upload. Less useful for cleanup, retries, and diagnostics.

### Option C: Event log only with derived status
- Store immutable upload/processing events and derive current status from the latest event.
- **Pros:** Strong audit trail and excellent debugging history.
- **Cons:** Too heavy for Phase 03 and harder to expose consistently through simple REST contracts.

**Recommendation:** **Option A (explicit state machine with retryable processing failures)** — it preserves the enunciado's draft-to-processing-to-ready/failed intent while adding the minimum extra state needed for direct multipart uploads and reliable worker retries.

**Decision:** A (explicit state machine with retryable processing failures)

---

## Decisions Summary

| ID | Scope | Decision | Recommendation | Choice |
|----|-------|----------|----------------|--------|
| TD-01 | Backend | Processing Queue Technology | BullMQ with Redis | A |
| TD-02 | Backend | 10GB Upload Strategy | API-orchestrated S3 multipart upload with presigned part URLs | A |
| TD-03 | Backend | Object Storage Bucket and Key Layout | One private media bucket with typed key prefixes | A |
| TD-04 | Backend | Worker Runtime and Media Processing Tooling | Separate NestJS worker container using FFmpeg/ffprobe CLI | A |
| TD-05 | Backend | Unique Video URL Identifier | Nano ID public slug with a database unique constraint | A |
| TD-06 | Backend | Streaming and Download Delivery Strategy | API returns short-lived presigned GET URLs backed by S3 range support | A |
| TD-07 | Backend | Video Status Lifecycle and Failure Policy | Explicit state machine with retryable processing failures | A |

## Research Sources

- NestJS queues / BullMQ integration: https://docs.nestjs.com/techniques/queues
- BullMQ retries and stalled-job behavior: https://docs.bullmq.io/guide/retrying-failing-jobs and https://docs.bullmq.io/guide/jobs/stalled
- AWS S3 multipart upload and limits: https://docs.aws.amazon.com/AmazonS3/latest/userguide/mpuoverview.html and https://docs.aws.amazon.com/AmazonS3/latest/userguide/qfacts.html
- AWS SDK JS v3 S3 presigning/multipart docs via Context7 (`/aws/aws-sdk-js-v3`)
- MinIO JavaScript SDK presigned object docs: https://github.com/minio/minio-js/blob/master/docs/API.md
- HTTP Range / 206 semantics: https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Range_requests
- FFmpeg / ffprobe docs via Context7 (`/websites/ffmpeg_documentation`)
- Nano ID project documentation: https://github.com/ai/nanoid
