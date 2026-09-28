---
subproject: backend
runner: jest+supertest
scope: phase-03-videos
si: SI-03.5
target_file: nestjs-project/test/videos.e2e-spec.ts
---

# Video Multipart Upload Test Plan

## Application Overview

The multipart upload API lets an authenticated user create a video in draft status with an open multipart session, sign direct-to-storage part uploads, complete the multipart upload, enqueue processing, and abort an open upload without sending large video bytes through the API process.

## Test Scenarios

### 1. API Contracts - Multipart Upload Endpoints

**Setup:** beforeEach truncate test DB; bootstrap backend test module with global validation and domain error filters; create authenticated owner and non-owner users with channels; mock storage multipart/presign operations and the video processing queue at the provider boundary.

#### 1.1. initiate-valid-upload-returns-draft

**Covers AC:** #1
**Source:** auto
**Last sync:** 2026-09-22T04:01:38Z

**Steps:**
  1. POST /videos/uploads as an authenticated owner with valid original_filename, mime_type, size_bytes, and part_count.
    - expect: HTTP 201.
    - expect: response body includes id, public_id, status "draft", multipart_upload_id, object_key, and part_size_bytes.
    - expect: persisted video belongs to the owner and has draft status with an open multipart upload id.

#### 1.2. reject-upload-above-ten-gigabytes

**Covers AC:** #2
**Source:** auto
**Last sync:** 2026-09-22T04:01:38Z

**Steps:**
  1. POST /videos/uploads as an authenticated owner with size_bytes greater than 10737418240.
    - expect: HTTP 400.
    - expect: response errorCode is "VALIDATION_ERROR".
    - expect: no video draft is persisted for the rejected request.

#### 1.3. deny-part-signing-for-non-owner

**Covers AC:** #3
**Source:** auto
**Last sync:** 2026-09-22T04:01:38Z

**Steps:**
  1. Arrange a draft video owned by user A with an open multipart_upload_id.
  2. POST /videos/:id/upload-parts/sign as authenticated user B with valid part_numbers.
    - expect: HTTP 403.
    - expect: response errorCode is "VIDEO_NOT_OWNED".
    - expect: storage presign is not called.

#### 1.4. complete-valid-upload-enqueues-processing

**Covers AC:** #4
**Source:** auto
**Last sync:** 2026-09-22T04:01:38Z

**Steps:**
  1. Arrange a draft video owned by the authenticated user with an open multipart_upload_id.
  2. POST /videos/:id/upload-complete with valid part_number and etag entries.
    - expect: HTTP 202.
    - expect: response body includes id, public_id, status "processing", and processing_job_id.
    - expect: persisted video status is processing and a video processing job is recorded or enqueued for the video.

#### 1.5. abort-open-upload-returns-no-content

**Covers AC:** #5
**Source:** auto
**Last sync:** 2026-09-22T04:01:38Z

**Steps:**
  1. Arrange a draft video owned by the authenticated user with an open multipart_upload_id.
  2. DELETE /videos/:id/upload as the owner.
    - expect: HTTP 204 with no response body.
    - expect: storage abort is called for the video's object key and multipart upload id.
    - expect: persisted video returns to draft lifecycle state and no longer has an open multipart_upload_id.
