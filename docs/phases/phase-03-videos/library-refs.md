---
libs:
  "@nestjs/bullmq":
    version: "planned (not yet in nestjs-project/package.json)"
    context7_id: "/nestjs/bull"
    fetched_at: "2026-09-22T00:39:02-03:00"
  "bullmq":
    version: "planned (not yet in nestjs-project/package.json)"
    context7_id: "/nestjs/bull"
    fetched_at: "2026-09-22T00:39:02-03:00"
  "@aws-sdk/client-s3":
    version: "planned (not yet in nestjs-project/package.json)"
    context7_id: "/aws/aws-sdk-js-v3"
    fetched_at: "2026-09-22T00:39:02-03:00"
  "@aws-sdk/s3-request-presigner":
    version: "planned (not yet in nestjs-project/package.json)"
    context7_id: "/aws/aws-sdk-js-v3"
    fetched_at: "2026-09-22T00:39:02-03:00"
  "ffmpeg":
    version: "Docker image package version TBD"
    context7_id: "/websites/ffmpeg_documentation"
    fetched_at: "2026-09-22T00:39:02-03:00"
  "ffprobe":
    version: "Docker image package version TBD"
    context7_id: "/websites/ffmpeg_documentation"
    fetched_at: "2026-09-22T00:39:02-03:00"
  "nanoid":
    version: "planned (not yet in nestjs-project/package.json)"
    context7_id: "official-docs-fallback: https://github.com/ai/nanoid"
    fetched_at: "2026-09-22T00:39:02-03:00"
sources_mtime:
  docs/decisions/technical-decisions-phase-03-videos.md: "2026-09-22 00:25:05.345111716 -0300"
---

# Library References - phase-03-videos

## Scope

This cache covers the Phase 03 backend decisions for large direct-to-storage uploads, S3-compatible object storage, BullMQ-backed processing, FFmpeg/ffprobe media inspection, signed streaming/download URLs, and short public video slugs.

### @nestjs/bullmq

Source: Context7 `/nestjs/bull`, selected for NestJS queue integration docs covering `@nestjs/bullmq`.

Relevant notes:

- Use `BullModule.forRoot()` or `BullModule.forRootAsync()` to configure the shared Redis connection for queues. In Docker Compose, use the Redis service name as host, not `localhost`.
- Register the video processing queue with `BullModule.registerQueue({ name: ... })` in the producer module so services can inject the queue and enqueue work after multipart upload completion.
- Workers use `@Processor()` classes extending `WorkerHost`; the `process(job)` method receives the BullMQ job payload.
- Worker options such as concurrency and stalled-job handling can be attached to the processor registration. Keep CPU-heavy FFmpeg work in the worker container, not in the API request path.

### bullmq

Source: Context7 `/nestjs/bull` plus official BullMQ docs fallback:

- https://docs.bullmq.io/guide/retrying-failing-jobs
- https://docs.bullmq.io/guide/workers/stalled-jobs
- https://docs.bullmq.io/guide/connections

Relevant notes:

- BullMQ is Redis-backed. Queue and worker connection options flow through Nest's BullMQ module, so Compose env should point at the Redis service.
- Job retries require jobs to fail by throwing errors and to be enqueued with an `attempts` value. Backoff should be explicit for media processing retries.
- Stalled jobs can be retried by BullMQ when a worker loses its lock. Video processing must therefore be idempotent: re-running a job for the same video should not corrupt storage keys or status transitions.
- Keep failed job details visible enough for the API/database status policy to mark exhausted processing as `failed` with a useful reason.

### @aws-sdk/client-s3

Source: Context7 `/aws/aws-sdk-js-v3`, selected for AWS SDK for JavaScript v3 S3 command docs.

Relevant notes:

- Use `S3Client` with endpoint/region/credentials driven by config so the same code works against MinIO locally and S3-compatible storage later.
- For 10GB uploads, initiate multipart uploads with `CreateMultipartUploadCommand`, sign each `UploadPartCommand`, complete with `CompleteMultipartUploadCommand`, and abort abandoned sessions with `AbortMultipartUploadCommand`.
- S3 multipart upload parts are at least 5 MB except the final part, and the service supports up to 10,000 parts. Choose part size to keep a 10GB file comfortably below that limit.
- Store object keys, upload IDs, status, and ETags needed for completion in the application database so the API remains the source of truth for draft/upload lifecycle.
- Use `GetObjectCommand` for download/stream access. S3-compatible storage handles object range requests once the browser/client uses the signed object URL.

### @aws-sdk/s3-request-presigner

Source: Context7 `/aws/aws-sdk-js-v3`, selected for `getSignedUrl` and S3 presigner examples.

Relevant notes:

- Generate short-lived URLs with `getSignedUrl(client, command, { expiresIn })`.
- Presign `UploadPartCommand` for direct multipart upload parts so the API does not proxy 10GB file bodies.
- Presign `GetObjectCommand` for playback/download only after the API has resolved the video, checked access/status, and selected the correct object key.
- For explicit downloads, set response override parameters such as content disposition on `GetObjectCommand` before signing.

### ffmpeg

Source: Context7 `/websites/ffmpeg_documentation`, selected for official FFmpeg command documentation.

Relevant notes:

- Install the FFmpeg CLI in the worker image, not only in the host environment.
- Generate a thumbnail with a worker-local command shaped like `ffmpeg -i <input> -vf thumbnail,scale=<w>:<h> -frames:v 1 <output>`.
- Use worker-local temp files or streams carefully, then upload the generated thumbnail to the configured media bucket under the typed thumbnail prefix.
- Treat FFmpeg command failures as retryable or terminal based on the error category and the video's processing-attempt policy.

### ffprobe

Source: Context7 `/websites/ffmpeg_documentation` plus official ffprobe docs fallback:

- https://ffmpeg.org/ffprobe.html

Relevant notes:

- Install `ffprobe` alongside `ffmpeg` in the worker image.
- Prefer machine-readable output such as JSON for metadata extraction rather than parsing human-oriented stderr/stdout.
- Extract duration and stream/container metadata before marking a video `ready`; persist enough metadata to support streaming/download checks and future UI display.
- Validate missing or malformed metadata as processing failure cases so the state machine remains explicit.

### nanoid

Source: official docs fallback:

- https://github.com/ai/nanoid

Relevant notes:

- Nano ID generates compact URL-friendly identifiers suitable for public video slugs.
- Keep a database unique constraint as the final collision guard.
- Generate the slug before publication workflows depend on mutable titles. On unique-constraint collision, retry generation in the service layer.
- Avoid using title-derived slugs in Phase 03; title editing and redirects belong to later publication phases.
