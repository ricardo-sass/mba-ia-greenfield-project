export abstract class DomainException extends Error {
  constructor(
    public readonly errorCode: string,
    public readonly httpStatus: number,
    message: string,
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class EmailAlreadyExistsException extends DomainException {
  constructor() {
    super('EMAIL_ALREADY_EXISTS', 409, 'Email is already registered');
  }
}

export class InvalidCredentialsException extends DomainException {
  constructor() {
    super('INVALID_CREDENTIALS', 401, 'Invalid email or password');
  }
}

export class EmailNotConfirmedException extends DomainException {
  constructor() {
    super('EMAIL_NOT_CONFIRMED', 403, 'Email address has not been confirmed');
  }
}

export class InvalidTokenException extends DomainException {
  constructor() {
    super('INVALID_TOKEN', 401, 'Token is invalid');
  }
}

export class TokenExpiredException extends DomainException {
  constructor() {
    super('TOKEN_EXPIRED', 401, 'Token has expired');
  }
}

export class TokenReuseDetectedException extends DomainException {
  constructor() {
    super(
      'TOKEN_REUSE_DETECTED',
      401,
      'Token reuse detected — all sessions revoked',
    );
  }
}

export class StorageMultipartInitFailedException extends DomainException {
  constructor() {
    super(
      'STORAGE_MULTIPART_INIT_FAILED',
      500,
      'Failed to initiate multipart upload',
    );
  }
}

export class StorageMultipartCompleteFailedException extends DomainException {
  constructor() {
    super(
      'STORAGE_MULTIPART_COMPLETE_FAILED',
      500,
      'Failed to complete multipart upload',
    );
  }
}

export class StorageMultipartAbortFailedException extends DomainException {
  constructor() {
    super(
      'STORAGE_MULTIPART_ABORT_FAILED',
      500,
      'Failed to abort multipart upload',
    );
  }
}

export class StoragePresignFailedException extends DomainException {
  constructor() {
    super('STORAGE_PRESIGN_FAILED', 500, 'Failed to create storage URL');
  }
}

export class VideoNotFoundException extends DomainException {
  constructor() {
    super('VIDEO_NOT_FOUND', 404, 'Video was not found');
  }
}

export class VideoNotOwnedException extends DomainException {
  constructor() {
    super('VIDEO_NOT_OWNED', 403, 'Video does not belong to this user');
  }
}

export class VideoUploadNotOpenException extends DomainException {
  constructor() {
    super('VIDEO_UPLOAD_NOT_OPEN', 409, 'Video upload is not open');
  }
}

export class VideoProcessingAlreadyEnqueuedException extends DomainException {
  constructor() {
    super(
      'VIDEO_PROCESSING_ALREADY_ENQUEUED',
      409,
      'Video processing was already enqueued',
    );
  }
}

export class VideoProcessingEnqueueFailedException extends DomainException {
  constructor() {
    super(
      'VIDEO_PROCESSING_ENQUEUE_FAILED',
      500,
      'Failed to enqueue video processing',
    );
  }
}

export class VideoNotReadyException extends DomainException {
  constructor() {
    super('VIDEO_NOT_READY', 409, 'Video is not ready for playback');
  }
}

export class InvalidVideoUploadPartsException extends DomainException {
  constructor(message = 'Invalid video upload parts') {
    super('VALIDATION_ERROR', 400, message);
  }
}
