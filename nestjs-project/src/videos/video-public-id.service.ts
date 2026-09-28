import { Injectable } from '@nestjs/common';

const PUBLIC_ID_LENGTH = 12;
const DEFAULT_MAX_PUBLIC_ID_ATTEMPTS = 5;
const POSTGRES_UNIQUE_VIOLATION = '23505';

type PersistWithPublicId<T> = (publicId: string) => Promise<T>;
type PublicIdGenerator = () => string;

function isUniqueConstraintViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === POSTGRES_UNIQUE_VIOLATION
  );
}

@Injectable()
export class VideoPublicIdService {
  private generateCandidate: PublicIdGenerator | undefined;

  async generate(): Promise<string> {
    return (await this.generator())();
  }

  async createWithUniquePublicId<T>(
    persist: PersistWithPublicId<T>,
    maxAttempts = DEFAULT_MAX_PUBLIC_ID_ATTEMPTS,
  ): Promise<T> {
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        return await persist(await this.generate());
      } catch (error) {
        if (!isUniqueConstraintViolation(error) || attempt === maxAttempts) {
          throw error;
        }
      }
    }

    throw new Error('Failed to generate unique public video id');
  }

  private async generator(): Promise<PublicIdGenerator> {
    if (this.generateCandidate === undefined) {
      const { customAlphabet, urlAlphabet } = await import('nanoid');
      this.generateCandidate = customAlphabet(urlAlphabet, PUBLIC_ID_LENGTH);
    }

    return this.generateCandidate;
  }
}
