---
subproject: backend
runner: jest+supertest
scope: phase-03-videos
si: SI-03.7
target_file: nestjs-project/test/videos.e2e-spec.ts
---

# Video Access Test Plan

## Application Overview

The video access API lets an authenticated owner inspect a video's lifecycle state and request short-lived signed stream or download URLs only after processing has produced ready media.

## Test Scenarios

### 1. API Contracts - Video Detail And Access URLs

**Setup:** beforeEach truncate test DB; bootstrap backend test module with global validation and domain error filters; create authenticated owner and non-owner users with channels; seed videos in draft, processing, ready, and failed states; mock storage presign operations at the provider boundary.

#### 1.1. owner-gets-video-detail

**Covers AC:** #1
**Source:** auto
**Last sync:** 2026-09-22T04:01:38Z

**Steps:**
  1. Arrange a video owned by the authenticated user with filename, size, duration, nullable thumbnail, and timestamps.
  2. GET /videos/:id as the owner.
    - expect: HTTP 200.
    - expect: response body includes status, original_filename, size_bytes, duration_seconds, thumbnail_url nullable, created_at, and updated_at.
    - expect: response id and public_id match the persisted video.

#### 1.2. deny-detail-for-non-owner

**Covers AC:** #2
**Source:** auto
**Last sync:** 2026-09-22T04:01:38Z

**Steps:**
  1. Arrange a video owned by user A.
  2. GET /videos/:id as authenticated user B.
    - expect: HTTP 403.
    - expect: response errorCode is "VIDEO_NOT_OWNED".

#### 1.3. ready-video-returns-stream-url

**Covers AC:** #3
**Source:** auto
**Last sync:** 2026-09-22T04:01:38Z

**Steps:**
  1. Arrange a ready video owned by the authenticated user with processed_object_key populated.
  2. GET /videos/:publicId/stream-url as the owner.
    - expect: HTTP 200.
    - expect: response body includes public_id, stream_url, and expires_in_seconds.
    - expect: storage presign is called for the processed object key.

#### 1.4. processing-video-stream-url-is-not-ready

**Covers AC:** #4
**Source:** auto
**Last sync:** 2026-09-22T04:01:38Z

**Steps:**
  1. Arrange a processing video owned by the authenticated user without a processed object key.
  2. GET /videos/:publicId/stream-url as the owner.
    - expect: HTTP 409.
    - expect: response errorCode is "VIDEO_NOT_READY".
    - expect: storage presign is not called.

#### 1.5. ready-video-returns-download-url-with-filename

**Covers AC:** #5
**Source:** auto
**Last sync:** 2026-09-22T04:01:38Z

**Steps:**
  1. Arrange a ready video owned by the authenticated user with processed_object_key and original_filename populated.
  2. GET /videos/:publicId/download-url as the owner.
    - expect: HTTP 200.
    - expect: response body includes public_id, download_url, expires_in_seconds, and filename.
    - expect: storage presign is called with a download disposition or filename override.
