---
kind: phase
name: phase-03-videos
test_specs_aware: true
sources_mtime:
  docs/phases/phase-03-videos/context.md: "2026-09-22 00:39:59.653476375 -0300"
  docs/phases/phase-03-videos/library-refs.md: "2026-09-22 00:39:43.610456631 -0300"
  docs/decisions/technical-decisions-phase-03-videos.md: "2026-09-22 00:25:05.345111716 -0300"
  docs/decisions/technical-decisions-openapi-docs-nestjs.md: "2026-09-17 21:41:36.287559685 -0300"
---

# Phase 03 — Upload e Processamento de Vídeos

## Objective

Deliver video upload and processing for StreamTube: S3-compatible storage for videos and thumbnails, direct multipart uploads up to 10GB, automatic draft creation, background metadata/thumbnail processing, unique video URLs, streaming playback, and user download access.

---

## Step Implementations

### SI-03.1 — Infra: configurar storage, fila e dependências de vídeo

**Description:** Preparar a fundação operacional para uploads diretos, processamento assíncrono e storage S3-compatible sem colocar bytes de vídeo no processo HTTP.

**Technical actions:**

1. Instalar `@nestjs/bullmq`, `bullmq`, `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner` e `nanoid` em `nestjs-project` via `docker compose exec nestjs-api npm install ...` (per `phase-03-videos/TD-01`, `phase-03-videos/TD-02`, `phase-03-videos/TD-05`, `phase-03-videos/TD-06`).
2. Atualizar `nestjs-project/compose.yaml` com serviços `redis` e `minio`, usando nomes de serviço Docker (`redis`, `minio`) nas variáveis de conexão, e declarar o futuro worker como container separado do `nestjs-api` (per `phase-03-videos/TD-01`, `phase-03-videos/TD-03`, `phase-03-videos/TD-04`).
3. Criar `src/config/storage.config.ts` e `src/config/queue.config.ts` com factories `registerAs()`, variáveis de bucket, endpoint, credenciais, expiração de URL assinada, conexão Redis, tentativas e backoff (per `phase-03-videos/TD-01`, `phase-03-videos/TD-03`, `phase-03-videos/TD-06`).
4. Atualizar `src/config/env.validation.ts` e `src/app.module.ts` para registrar e validar as configurações de storage/fila, mantendo o padrão herdado de `@nestjs/config` e Joi.
5. Criar `src/videos/videos.constants.ts` com nomes de queue, prefixes `videos/raw`, `videos/processed`, `videos/thumbnails`, limite de 10GB, range de partes multipart e TTLs de presign.

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `storage.config.ts` / `queue.config.ts` | Unit: factories parse env and expose Docker service hosts | `src/config/video-infra.config.spec.ts` |
| `env.validation.ts` | Integration: required storage/queue env vars, 10GB limits, URL TTL constraints | `src/config/env.validation.integration-spec.ts` |
| `AppModule` config registration | Unit: module compilation with ConfigModule loading storage and queue config | `src/app.module.spec.ts` |

**Dependencies:** none

**Acceptance criteria:**

- `docker compose ps` shows `redis` and `minio` running with healthy backend infrastructure.
- The API container resolves Redis through host `redis` and object storage through host `minio`.
- Startup with missing storage or queue env vars fails validation with a Joi configuration error.
- Startup with valid storage and queue env vars compiles `AppModule` without unresolved config tokens.

---

### SI-03.2 — Criar modelo de domínio de vídeos

**Description:** Introduzir as entidades persistidas que representam o ciclo de vida de vídeo, partes multipart e jobs de processamento.

**Technical actions:**

1. Criar `src/videos/entities/video.entity.ts` com os campos, enums, relações e índices definidos em `## Technical Specifications` → `### Data Model` → `#### Video` (per `phase-03-videos/TD-02`, `phase-03-videos/TD-03`, `phase-03-videos/TD-05`, `phase-03-videos/TD-07`).
2. Criar `src/videos/entities/video-upload-part.entity.ts` com FK para `Video`, unique `(video_id, part_number)` e cascade delete conforme `VideoUploadPart` (per `phase-03-videos/TD-02`).
3. Criar `src/videos/entities/video-processing-job.entity.ts` com `bullmq_job_id`, enum de status e índices conforme `VideoProcessingJob` (per `phase-03-videos/TD-01`, `phase-03-videos/TD-07`).
4. Criar `src/videos/videos.module.ts` com `TypeOrmModule.forFeature([Video, VideoUploadPart, VideoProcessingJob])` e importar `ChannelsModule` para consultas de propriedade de canal sem recriar lógica de canais.
5. Gerar migration TypeORM para as três tabelas via CLI, revisar `up()`/`down()` e atualizar `src/database/migrations.integration-spec.ts` para incluir as novas entidades.

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `Video` | Integration: unique `public_id`, enum status, FK owner/channel, nullable processing fields | `src/videos/entities/video.entity.integration-spec.ts` |
| `VideoUploadPart` | Integration: FK cascade and unique `(video_id, part_number)` | `src/videos/entities/video-upload-part.entity.integration-spec.ts` |
| `VideoProcessingJob` | Integration: status defaults and unique non-null `bullmq_job_id` | `src/videos/entities/video-processing-job.entity.integration-spec.ts` |
| `VideosModule` | Unit: module compiles with TypeOrm feature repositories and ChannelsModule | `src/videos/videos.module.spec.ts` |
| Video migration | Integration: migrations create/drop video tables and indexes on a fresh DB | `src/database/migrations.integration-spec.ts` |

**Dependencies:** SI-03.1 — storage/queue config constants define enum names, prefixes, and validated limits used by the entities.

**Acceptance criteria:**

- Saving a video without `owner_user_id`, `channel_id`, or `public_id` is rejected by PostgreSQL constraints.
- Inserting two videos with the same `public_id` returns a unique-constraint failure.
- Deleting a video removes its `video_upload_parts` rows.
- Running migrations on an empty DB creates `videos`, `video_upload_parts`, and `video_processing_jobs`.

---

### SI-03.3 — Implementar serviços de storage e identificador público

**Description:** Centralizar geração de `public_id`, chaves de objeto e comandos S3-compatible para que API e worker compartilhem o mesmo contrato de storage.

**Technical actions:**

1. Criar `src/videos/video-public-id.service.ts` usando `nanoid` para gerar `public_id` curto e URL-safe com retry no service layer quando a constraint unique falhar (per `phase-03-videos/TD-05`).
2. Criar `src/videos/video-object-keys.service.ts` para gerar chaves `videos/raw/{ownerUserId}/{videoId}/{filename}`, `videos/processed/{ownerUserId}/{videoId}/{filename}` e `videos/thumbnails/{ownerUserId}/{videoId}/{filename}` (per `phase-03-videos/TD-03`).
3. Criar `src/videos/storage/videos-storage.service.ts` encapsulando `S3Client`, `CreateMultipartUploadCommand`, `CompleteMultipartUploadCommand`, `AbortMultipartUploadCommand`, `UploadPartCommand`, `GetObjectCommand` e `getSignedUrl()` (per `phase-03-videos/TD-02`, `phase-03-videos/TD-03`, `phase-03-videos/TD-06`).
4. Mapear falhas do adapter de storage para exceções de domínio com `errorCode`s do `### Error Catalog` (`STORAGE_MULTIPART_INIT_FAILED`, `STORAGE_MULTIPART_COMPLETE_FAILED`, `STORAGE_MULTIPART_ABORT_FAILED`, `STORAGE_PRESIGN_FAILED`).
5. Exportar os serviços pelo `VideosModule` para consumo pelo controller, service e worker sem expor tipos do AWS SDK fora da fronteira `videos/storage`.

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `VideoPublicIdService` | Unit: URL-safe ID, retry on unique collision signal | `src/videos/video-public-id.service.spec.ts` |
| `VideoObjectKeysService` | Unit: deterministic raw/processed/thumbnail key prefixes | `src/videos/video-object-keys.service.spec.ts` |
| `VideosStorageService` | Unit: S3 command construction, presign expiry, domain exception mapping | `src/videos/storage/videos-storage.service.spec.ts` |
| `VideosStorageService` | Integration: multipart init/sign/complete/abort and GetObject presign against local MinIO | `src/videos/storage/videos-storage.service.integration-spec.ts` |

**Dependencies:** SI-03.1 — storage config and constants; SI-03.2 — `Video` identifiers and ownership fields.

**Acceptance criteria:**

- Generating a `public_id` produces a non-empty URL-safe string and retries after a simulated unique collision.
- Multipart initiation returns an upload ID and object key under `videos/raw/{ownerUserId}/{videoId}/`.
- Presigned upload-part URLs expire according to storage config and are generated without proxying file bytes through NestJS.
- Storage command failures propagate as domain exceptions with the catalogued storage `errorCode`.

---

### SI-03.4 — Implementar lifecycle de upload multipart

**Description:** Entregar as regras de negócio que criam o rascunho, abrem upload multipart, assinam partes, completam/abortam upload e enfileiram processamento.

**Technical actions:**

1. Criar DTOs de aplicação e tipos internos para iniciar upload, assinar partes, completar upload e abortar upload alinhados aos campos de `### API Contracts`.
2. Criar `VideosService` com `initiateUpload()` — valida proprietário/canal, gera `public_id`, persiste `Video` em `uploading`, inicia multipart no storage e salva `multipart_upload_id`/`original_object_key` (per `phase-03-videos/TD-02`, `phase-03-videos/TD-05`, `phase-03-videos/TD-07`).
3. Implementar `signUploadParts()` com checagem de owner, status `uploading`, dedupe/range de `part_numbers`, e retorno de URLs assinadas de `UploadPartCommand` (per `phase-03-videos/TD-02`).
4. Implementar `completeUpload()` em transação: persistir `VideoUploadPart`s, completar multipart, transicionar `uploading` → `processing`, criar `VideoProcessingJob` e adicionar job `video.process` com tentativas/backoff explícitos (per `phase-03-videos/TD-01`, `phase-03-videos/TD-02`, `phase-03-videos/TD-07`).
5. Implementar `abortUpload()` com checagem de owner/status, `AbortMultipartUploadCommand`, remoção das partes persistidas e transição `uploading` → `draft`.

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `VideosService` | Unit: owner checks, status transitions, duplicate part validation, enqueue failure mapping | `src/videos/videos.service.spec.ts` |
| `VideosService` | Integration: DB transaction persists video/parts/job and rolls back on completion failure | `src/videos/videos.service.integration-spec.ts` |
| `VideoProcessingQueueService` | Unit: adds `video.process` with attempts/backoff and copied BullMQ job id | `src/videos/video-processing-queue.service.spec.ts` |

**Dependencies:** SI-03.1 — BullMQ queue config; SI-03.2 — entities/repositories; SI-03.3 — storage and public-id services.

**Acceptance criteria:**

- Initiating upload with a valid owner channel returns status `uploading`, object key, upload ID and part size for a video ≤10GB.
- Signing upload parts for another user's video returns `VIDEO_NOT_OWNED`.
- Completing an open upload returns `202`-equivalent service data with status `processing` and a persisted processing job.
- Completing an already-enqueued upload returns `VIDEO_PROCESSING_ALREADY_ENQUEUED`.
- Aborting an open upload causes storage abort and returns the video lifecycle to `draft`.

---

### SI-03.5 — Endpoint multipart de upload de vídeos

**Route:** POST /videos/uploads, POST /videos/:id/upload-parts/sign, POST /videos/:id/upload-complete, DELETE /videos/:id/upload
**Test Specs:** see `nestjs-project/specs/video-upload-multipart.plan.md`
**Authorization:** Authenticated owner-only after draft creation; anonymous denied by global JWT guard.

**Description:** Expor o contrato HTTP do upload multipart direto para storage, mantendo validação, autorização e documentação OpenAPI no controller.

**Technical actions:**

1. Criar `src/videos/dto/initiate-video-upload.dto.ts`, `sign-video-upload-parts.dto.ts`, `complete-video-upload.dto.ts` e response DTOs com `class-validator`/`class-transformer` para `size_bytes`, `part_count`, `part_numbers` e ETags conforme `#### Validation Rules — videos upload and access`.
2. Criar `src/videos/videos.controller.ts` com `@Controller('videos')`, `@ApiTags('videos')`, `@ApiBearerAuth('access-token')` e handlers para os quatro endpoints de upload (per `phase-03-videos/TD-02`, `phase-03-videos/TD-07`).
3. Usar `@CurrentUser()` para obter o usuário autenticado, delegar integralmente para `VideosService` e deixar exceções de domínio fluírem para o filtro herdado.
4. Documentar cada status de sucesso e cada erro previsto em `### API Contracts` com `@ApiResponse` e `ApiErrorEnvelope`, sem schemas de erro ad hoc.
5. Registrar `VideosController` e `VideosService` em `VideosModule`, e importar `VideosModule` em `AppModule`.

**Tests:** _(empty — E2E scenarios authored by $plan-test-specs)_

**Dependencies:** SI-03.4 — upload lifecycle service owns business behavior and storage/queue side effects.

**Acceptance criteria:**

- `POST /videos/uploads` com payload válido retorna `201` com `id`, `public_id`, `status: "uploading"`, `multipart_upload_id`, `object_key` e `part_size_bytes`.
- `POST /videos/uploads` com `size_bytes` acima de 10737418240 retorna `400` com `errorCode: "VALIDATION_ERROR"`.
- `POST /videos/:id/upload-parts/sign` para vídeo de outro usuário retorna `403` com `errorCode: "VIDEO_NOT_OWNED"`.
- `POST /videos/:id/upload-complete` com partes válidas retorna `202` com `status: "processing"` e `processing_job_id`.
- `DELETE /videos/:id/upload` para upload aberto retorna `204` sem corpo.

---

### SI-03.6 — Worker de processamento de vídeo

**Description:** Consumir jobs `video.process` em container separado, extrair metadados com `ffprobe`, gerar thumbnail com `ffmpeg` e atualizar o vídeo para `ready` ou `failed`.

**Technical actions:**

1. Criar um entrypoint de worker (`src/worker-main.ts` ou app context equivalente) e `VideosWorkerModule` que registra a fila BullMQ com `@Processor()`/`WorkerHost`, separado do processo HTTP (per `phase-03-videos/TD-01`, `phase-03-videos/TD-04`).
2. Atualizar Dockerfile/compose do worker para instalar `ffmpeg`/`ffprobe` dentro do container e executar o worker com variáveis de DB, Redis e storage via nomes de serviços Docker.
3. Criar `VideoMediaProcessorService` para baixar/streamar o objeto original, rodar `ffprobe` com saída JSON, rodar `ffmpeg` para thumbnail e enviar objetos processados/thumbnail ao storage (per `phase-03-videos/TD-04`).
4. Implementar `VideoProcessor` idempotente para `video.process`: rejeitar jobs sem vídeo elegível, incrementar tentativas, persistir `duration_seconds`/`metadata`/object keys e transicionar `processing` → `ready`.
5. Implementar política de falha: erros retryable são rethrow para BullMQ; esgotamento de tentativas marca `Video` e `VideoProcessingJob` como `failed` com `failure_reason`/`last_error` (per `phase-03-videos/TD-07`).

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `VideoMediaProcessorService` | Unit: ffprobe JSON parsing, ffmpeg command args, storage upload calls | `src/videos/processing/video-media-processor.service.spec.ts` |
| `VideoProcessor` | Unit: idempotent ready/failed transitions and retryable error rethrowing | `src/videos/processing/video.processor.spec.ts` |
| `VideoProcessor` | Integration: DB status/job updates for successful and exhausted processing attempts | `src/videos/processing/video.processor.integration-spec.ts` |
| `VideosWorkerModule` | Unit: worker module compiles with queue, config, TypeOrm repositories and storage provider | `src/videos/processing/videos-worker.module.spec.ts` |

**Dependencies:** SI-03.1 — Redis/storage/worker container infra; SI-03.2 — video and job entities; SI-03.3 — storage service; SI-03.4 — `video.process` producer payload.

**Acceptance criteria:**

- A `video.process` job for a processing video eventually persists `duration_seconds`, `metadata`, `processed_object_key`, `thumbnail_object_key` and status `ready`.
- Re-running the same `video.process` job for an already-ready video leaves persisted object keys and status unchanged.
- A retryable processing error is thrown to BullMQ while attempts remain.
- Exhausted processing attempts set video status `failed` and persist a non-empty `failure_reason`.

---

### SI-03.7 — Endpoints de detalhe, streaming e download

**Route:** GET /videos/:id, GET /videos/:publicId/stream-url, GET /videos/:publicId/download-url
**Test Specs:** see `nestjs-project/specs/video-access.plan.md`
**Authorization:** Authenticated owner-only in Phase 03; anonymous/public playback remains deferred to publication work.

**Description:** Expor consulta de estado do vídeo e geração de URLs assinadas para streaming/download apenas quando o vídeo estiver pronto.

**Technical actions:**

1. Implementar métodos em `VideosService` para buscar vídeo por `id` do owner, buscar por `public_id` do owner, validar status `ready` e selecionar `processed_object_key`/filename (per `phase-03-videos/TD-06`, `phase-03-videos/TD-07`).
2. Implementar `getVideoDetail()`, `getStreamUrl()` e `getDownloadUrl()` retornando exatamente os response shapes de `### API Contracts`.
3. Adicionar handlers `GET /videos/:id`, `GET /videos/:publicId/stream-url` e `GET /videos/:publicId/download-url` no `VideosController`, com `@ApiResponse` para 200, 401, 403, 404, 409 e 500 conforme o Error Catalog.
4. Usar `VideosStorageService` para presign de `GetObjectCommand`, incluindo override de filename/content disposition no download URL (per `phase-03-videos/TD-06`).
5. Garantir que requests para vídeo não-ready retornem `VIDEO_NOT_READY` sem criar URL assinada.

**Tests:** _(empty — E2E scenarios authored by $plan-test-specs)_

**Dependencies:** SI-03.3 — storage presign service; SI-03.6 — processed/thumbnail object keys and ready/failed status are produced by the worker.

**Acceptance criteria:**

- `GET /videos/:id` do owner retorna `200` com status, filename, tamanho, duração, thumbnail URL nullable e timestamps.
- `GET /videos/:id` de outro usuário retorna `403` com `errorCode: "VIDEO_NOT_OWNED"`.
- `GET /videos/:publicId/stream-url` para vídeo `ready` retorna `200` com `stream_url` e `expires_in_seconds`.
- `GET /videos/:publicId/stream-url` para vídeo `processing` retorna `409` com `errorCode: "VIDEO_NOT_READY"`.
- `GET /videos/:publicId/download-url` para vídeo `ready` retorna `200` com `download_url`, `expires_in_seconds` e `filename`.

---

## Technical Specifications

### Data Model

#### Video

| Field | Type | Constraints |
|-------|------|-------------|
| id | uuid | PK, generated |
| owner_user_id | uuid | FK -> users.id, not null |
| channel_id | uuid | FK -> channels.id, not null |
| public_id | varchar(32) | unique, not null; generated with `nanoid` per `phase-03-videos/TD-05` |
| title | varchar(120) | nullable until later publication/editing flow |
| status | enum | not null, default `draft`; values: `draft`, `uploading`, `processing`, `ready`, `failed` |
| original_object_key | varchar(512) | nullable until multipart upload starts; object key under the raw video prefix per `phase-03-videos/TD-03` |
| processed_object_key | varchar(512) | nullable until processing succeeds |
| thumbnail_object_key | varchar(512) | nullable until thumbnail generation succeeds |
| multipart_upload_id | varchar(255) | nullable; present while direct multipart upload is open |
| original_filename | varchar(255) | nullable |
| mime_type | varchar(120) | nullable |
| size_bytes | bigint | nullable; must support files up to 10GB |
| duration_seconds | numeric(12,3) | nullable until `ffprobe` succeeds |
| metadata | jsonb | nullable; stores selected machine-readable `ffprobe` metadata |
| processing_attempts | integer | not null, default `0` |
| failure_reason | text | nullable |
| created_at | timestamptz | default now() |
| updated_at | timestamptz | auto-updated |

**Relations:** `Video` belongs to `User` through `owner_user_id`; `Video` belongs to `Channel` through `channel_id`. The videos module reads existing user/channel identity but owns the video lifecycle entity.

**Indexes:** unique on `public_id`; index on `owner_user_id`; index on `channel_id`; index on `status`; index on `created_at` for management/listing flows.

#### VideoUploadPart

| Field | Type | Constraints |
|-------|------|-------------|
| id | uuid | PK, generated |
| video_id | uuid | FK -> videos.id, not null, cascade delete |
| part_number | integer | not null; S3 multipart part number |
| etag | varchar(255) | not null; returned by storage after part upload |
| size_bytes | bigint | nullable |
| created_at | timestamptz | default now() |

**Relations:** `VideoUploadPart` belongs to `Video`.

**Indexes:** unique on `(video_id, part_number)`; index on `video_id`.

#### VideoProcessingJob

| Field | Type | Constraints |
|-------|------|-------------|
| id | uuid | PK, generated |
| video_id | uuid | FK -> videos.id, not null |
| bullmq_job_id | varchar(255) | nullable; copied from BullMQ after enqueue |
| status | enum | not null, default `queued`; values: `queued`, `active`, `completed`, `failed` |
| attempts_made | integer | not null, default `0` |
| last_error | text | nullable |
| created_at | timestamptz | default now() |
| updated_at | timestamptz | auto-updated |

**Relations:** `VideoProcessingJob` belongs to `Video`.

**Indexes:** index on `video_id`; index on `status`; unique on `bullmq_job_id` when present.

### API Contracts

#### POST /videos/uploads

**Request headers:**
- Authorization: Bearer access token
- Content-Type: application/json

**Request body:**
- original_filename: string, required, max 255 characters
- mime_type: string, required
- size_bytes: number, required, integer, min 1, max 10737418240
- part_count: number, required, integer, min 1, max 10000

**Response 201:**
- id: string (uuid)
- public_id: string
- status: `uploading`
- multipart_upload_id: string
- object_key: string
- part_size_bytes: number

**Error responses:**
- 401 Unauthorized: missing or invalid access token
- 400 VALIDATION_ERROR: invalid body, unsupported media type, size over 10GB, invalid `part_count`
- 409 VIDEO_UPLOAD_ALREADY_OPEN: authenticated user already has an incompatible open upload for the same draft when retrying the initiate flow
- 500 STORAGE_MULTIPART_INIT_FAILED: storage could not create the multipart upload

---

#### POST /videos/:id/upload-parts/sign

**Request headers:**
- Authorization: Bearer access token
- Content-Type: application/json

**Request body:**
- part_numbers: number[], required; each entry integer, min 1, max 10000

**Response 200:**
- video_id: string (uuid)
- expires_in_seconds: number
- parts: array of objects:
  - part_number: number
  - upload_url: string

**Error responses:**
- 401 Unauthorized: missing or invalid access token
- 403 VIDEO_NOT_OWNED: authenticated user does not own the video draft
- 404 VIDEO_NOT_FOUND: no video exists for `id`
- 409 VIDEO_UPLOAD_NOT_OPEN: video is not in `uploading` status or has no `multipart_upload_id`
- 400 VALIDATION_ERROR: invalid body or out-of-range part numbers
- 500 STORAGE_PRESIGN_FAILED: storage presigning failed

---

#### POST /videos/:id/upload-complete

**Request headers:**
- Authorization: Bearer access token
- Content-Type: application/json

**Request body:**
- parts: array, required, non-empty:
  - part_number: number, required
  - etag: string, required

**Response 202:**
- id: string (uuid)
- public_id: string
- status: `processing`
- processing_job_id: string

**Error responses:**
- 401 Unauthorized: missing or invalid access token
- 403 VIDEO_NOT_OWNED: authenticated user does not own the video draft
- 404 VIDEO_NOT_FOUND: no video exists for `id`
- 409 VIDEO_UPLOAD_NOT_OPEN: video is not in `uploading` status or has no `multipart_upload_id`
- 409 VIDEO_PROCESSING_ALREADY_ENQUEUED: upload was already completed and processing was already enqueued
- 400 VALIDATION_ERROR: missing parts, duplicated part numbers, or malformed ETags
- 500 STORAGE_MULTIPART_COMPLETE_FAILED: storage rejected multipart completion
- 500 VIDEO_PROCESSING_ENQUEUE_FAILED: upload completed but enqueue failed; video remains recoverable for a retry command

---

#### DELETE /videos/:id/upload

**Request headers:**
- Authorization: Bearer access token

**Response 204:** No content.

**Error responses:**
- 401 Unauthorized: missing or invalid access token
- 403 VIDEO_NOT_OWNED: authenticated user does not own the video draft
- 404 VIDEO_NOT_FOUND: no video exists for `id`
- 409 VIDEO_UPLOAD_NOT_OPEN: video is not in `uploading` status or has no `multipart_upload_id`
- 500 STORAGE_MULTIPART_ABORT_FAILED: storage could not abort the multipart upload

---

#### GET /videos/:id

**Request headers:**
- Authorization: Bearer access token

**Response 200:**
- id: string (uuid)
- public_id: string
- status: `draft` | `uploading` | `processing` | `ready` | `failed`
- original_filename: string | null
- mime_type: string | null
- size_bytes: number | null
- duration_seconds: number | null
- thumbnail_url: string | null
- failure_reason: string | null
- created_at: string (ISO timestamp)
- updated_at: string (ISO timestamp)

**Error responses:**
- 401 Unauthorized: missing or invalid access token
- 403 VIDEO_NOT_OWNED: authenticated user does not own the video
- 404 VIDEO_NOT_FOUND: no video exists for `id`

---

#### GET /videos/:publicId/stream-url

**Request headers:**
- Authorization: Bearer access token

**Response 200:**
- public_id: string
- stream_url: string
- expires_in_seconds: number

**Error responses:**
- 401 Unauthorized: missing or invalid access token
- 403 VIDEO_NOT_OWNED: authenticated user does not own the video in Phase 03; anonymous/public playback is enabled by the Phase 04 publication flow
- 404 VIDEO_NOT_FOUND: no video exists for `publicId`
- 409 VIDEO_NOT_READY: video status is not `ready`
- 500 STORAGE_PRESIGN_FAILED: storage presigning failed

---

#### GET /videos/:publicId/download-url

**Request headers:**
- Authorization: Bearer access token

**Response 200:**
- public_id: string
- download_url: string
- expires_in_seconds: number
- filename: string

**Error responses:**
- 401 Unauthorized: missing or invalid access token
- 403 VIDEO_NOT_OWNED: authenticated user does not own the video in Phase 03; public download policy is deferred to later publication work
- 404 VIDEO_NOT_FOUND: no video exists for `publicId`
- 409 VIDEO_NOT_READY: video status is not `ready`
- 500 STORAGE_PRESIGN_FAILED: storage presigning failed

#### Validation Rules — videos upload and access

- `size_bytes`: must be greater than 0 and less than or equal to 10737418240.
- `part_count`: must be between 1 and 10000; choose `part_size_bytes` so a 10GB upload remains below the S3-compatible multipart limit.
- `part_numbers`: each value must be unique and between 1 and 10000.
- `etag`: required for every completed part; store exactly the value returned by object storage.
- `mime_type`: must be accepted by the videos module allowlist for Phase 03 video uploads.

### Authorization Matrix

| Endpoint | Anonymous | Authenticated non-owner | Owner |
|----------|-----------|-------------------------|-------|
| POST /videos/uploads | ✗ | ✓ | ✓ |
| POST /videos/:id/upload-parts/sign | ✗ | ✗ | ✓ |
| POST /videos/:id/upload-complete | ✗ | ✗ | ✓ |
| DELETE /videos/:id/upload | ✗ | ✗ | ✓ |
| GET /videos/:id | ✗ | ✗ | ✓ |
| GET /videos/:publicId/stream-url | ✗ | ✗ | ✓ |
| GET /videos/:publicId/download-url | ✗ | ✗ | ✓ |

**Boundary note:** Phase 03 keeps streaming/download URLs owner-authenticated because video publication and public visibility are Phase 04 concerns. The `public_id` is generated in Phase 03 and remains stable for the later public page/URL flow.

### Error Catalog

| errorCode | HTTP | Trigger |
|-----------|------|---------|
| VIDEO_NOT_FOUND | 404 | Requested video `id` or `public_id` does not exist |
| VIDEO_NOT_OWNED | 403 | Authenticated user attempts to mutate or access another user's non-public Phase 03 video |
| VIDEO_UPLOAD_ALREADY_OPEN | 409 | Initiate upload conflicts with an already-open incompatible draft/upload for the same retry flow |
| VIDEO_UPLOAD_NOT_OPEN | 409 | Signing/completing/aborting is requested after upload is no longer open |
| VIDEO_PROCESSING_ALREADY_ENQUEUED | 409 | Completion is retried after processing was already enqueued |
| VIDEO_NOT_READY | 409 | Stream/download URL is requested before processing status is `ready` |
| STORAGE_MULTIPART_INIT_FAILED | 500 | Storage client fails `CreateMultipartUploadCommand` |
| STORAGE_MULTIPART_COMPLETE_FAILED | 500 | Storage client fails `CompleteMultipartUploadCommand` |
| STORAGE_MULTIPART_ABORT_FAILED | 500 | Storage client fails `AbortMultipartUploadCommand` |
| STORAGE_PRESIGN_FAILED | 500 | Storage client fails to presign upload, stream, or download URLs |
| VIDEO_PROCESSING_ENQUEUE_FAILED | 500 | Upload completion succeeded but BullMQ enqueue failed |
| VIDEO_PROCESSING_FAILED | 500 | Worker exhausts retry policy or media probing/thumbnail generation fails terminally |

**Error response shape:** Reuse the inherited Phase 02 `{ statusCode, error, message }` domain error envelope and `VALIDATION_ERROR` handling.

### Events/Messages

#### video.process

**Payload:**

```json
{
  "videoId": "uuid",
  "originalObjectKey": "videos/raw/{ownerUserId}/{videoId}/{filename}",
  "attempt": 1
}
```

**Producer:** `VideosService` after successful multipart completion (per `phase-03-videos/TD-01`, `phase-03-videos/TD-02`, `phase-03-videos/TD-07`)

**Consumer:** `VideoProcessor` worker class in the worker container (per `phase-03-videos/TD-01`, `phase-03-videos/TD-04`)

**Trigger:** `POST /videos/:id/upload-complete` completes S3-compatible multipart upload and transitions the video to `processing`.

**Delivery semantics:** at-least-once via BullMQ. The worker must be idempotent for the same `videoId`, because BullMQ retries failed jobs and may recover stalled jobs.

**Retry policy:** enqueue with explicit `attempts` and backoff. On retryable FFmpeg/ffprobe/storage errors, throw so BullMQ records the failed attempt. On exhausted attempts, update the video status to `failed` and persist `failure_reason`.

**Processing actions:**

- Download or stream the source object from storage using `originalObjectKey`.
- Run `ffprobe` with machine-readable output to extract duration and selected metadata.
- Run `ffmpeg` in the worker container to create a thumbnail from a video frame.
- Upload the processed video object and thumbnail object under the configured storage key prefixes.
- Update `Video` with `processed_object_key`, `thumbnail_object_key`, `duration_seconds`, `metadata`, and status `ready`.

**State transitions:**

| From | To | Actor | Trigger |
|------|----|-------|---------|
| `draft` | `uploading` | API | Multipart upload is initiated |
| `uploading` | `processing` | API | Multipart upload is completed and `video.process` is enqueued |
| `uploading` | `draft` | API | Multipart upload is aborted before completion |
| `processing` | `ready` | Worker | Metadata extraction and thumbnail generation complete |
| `processing` | `failed` | Worker | Retry policy is exhausted or media is invalid |
| `failed` | `processing` | API or maintenance command | Explicit retry is requested in a later SI if included in this phase |

---

## Dependency Map

SI-03.1 (root)
├── SI-03.2 — depends on SI-03.1 (validated storage/queue constants and infra are needed before entities/migration)
│   ├── SI-03.3 — depends on SI-03.1 + SI-03.2 (storage config and video IDs are needed before adapters)
│   │   ├── SI-03.4 — depends on SI-03.1 + SI-03.2 + SI-03.3 (upload lifecycle needs queue, schema, storage, and public IDs)
│   │   │   ├── SI-03.5 — depends on SI-03.4 (HTTP endpoints delegate to completed upload service behavior)
│   │   │   └── SI-03.6 — depends on SI-03.1 + SI-03.2 + SI-03.3 + SI-03.4 (worker consumes the upload completion job payload)
│   │   │       └── SI-03.7 — depends on SI-03.3 + SI-03.6 (delivery URLs require ready object keys and storage presigning)

---

## Deliverables

- [ ] SI-03.1 — Infra: configurar storage, fila e dependências de vídeo
- [ ] SI-03.2 — Criar modelo de domínio de vídeos
- [ ] SI-03.3 — Implementar serviços de storage e identificador público
- [ ] SI-03.4 — Implementar lifecycle de upload multipart
- [ ] SI-03.5 — Endpoint multipart de upload de vídeos
- [ ] SI-03.6 — Worker de processamento de vídeo
- [ ] SI-03.7 — Endpoints de detalhe, streaming e download

**Full test suites:**

- [ ] Backend unit/integration tests pass (`cd nestjs-project && docker compose exec nestjs-api npm test -- --runInBand`)
- [ ] Backend e2e tests pass (`cd nestjs-project && docker compose exec nestjs-api npm run test:e2e`)
- [ ] Type/compilation checks pass (`cd nestjs-project && docker compose exec nestjs-api npx tsc --noEmit`)
- [ ] Backend build passes (`cd nestjs-project && docker compose exec nestjs-api npm run build`)
- [ ] Lint passes (`cd nestjs-project && docker compose exec nestjs-api npm run lint`)
