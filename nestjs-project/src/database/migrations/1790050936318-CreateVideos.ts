import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateVideos1790050936318 implements MigrationInterface {
  name = 'CreateVideos1790050936318';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."video_processing_jobs_status_enum" AS ENUM('queued', 'active', 'completed', 'failed')`,
    );
    await queryRunner.query(
      `CREATE TABLE "video_processing_jobs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "video_id" uuid NOT NULL, "bullmq_job_id" character varying(255), "status" "public"."video_processing_jobs_status_enum" NOT NULL DEFAULT 'queued', "attempts_made" integer NOT NULL DEFAULT '0', "last_error" text, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_f6387ce05f24eb173540731237a" UNIQUE ("bullmq_job_id"), CONSTRAINT "PK_5948d0663dfbe0b7e2e59406991" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_73d68b0137da77532588a8d3ff" ON "video_processing_jobs" ("video_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_dac342751ae6399820190b467a" ON "video_processing_jobs" ("status") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."videos_status_enum" AS ENUM('draft', 'uploading', 'processing', 'ready', 'failed')`,
    );
    await queryRunner.query(
      `CREATE TABLE "videos" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "owner_user_id" uuid NOT NULL, "channel_id" uuid NOT NULL, "public_id" character varying(32) NOT NULL, "title" character varying(120), "status" "public"."videos_status_enum" NOT NULL DEFAULT 'draft', "original_object_key" character varying(512), "processed_object_key" character varying(512), "thumbnail_object_key" character varying(512), "multipart_upload_id" character varying(255), "original_filename" character varying(255), "mime_type" character varying(120), "size_bytes" bigint, "duration_seconds" numeric(12,3), "metadata" jsonb, "processing_attempts" integer NOT NULL DEFAULT '0', "failure_reason" text, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_39a1f0fe7991162aace659078ec" UNIQUE ("public_id"), CONSTRAINT "PK_e4c86c0cf95aff16e9fb8220f6b" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_eea204624e93cb253aa8ef92a1" ON "videos" ("owner_user_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_023a8e4f3f1a34ff3d8ca04a4c" ON "videos" ("channel_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ece1558efc6efd53eb530479db" ON "videos" ("status") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_10db4256c96824e89c22fff501" ON "videos" ("created_at") `,
    );
    await queryRunner.query(
      `CREATE TABLE "video_upload_parts" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "video_id" uuid NOT NULL, "part_number" integer NOT NULL, "etag" character varying(255) NOT NULL, "size_bytes" bigint, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_2b9068aed89120eb02f9e57556e" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_cbfc857492ef53ea896719ba55" ON "video_upload_parts" ("video_id") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_ed979803033122402ca36f6318" ON "video_upload_parts" ("video_id", "part_number") `,
    );
    await queryRunner.query(
      `ALTER TABLE "video_processing_jobs" ADD CONSTRAINT "FK_73d68b0137da77532588a8d3ffa" FOREIGN KEY ("video_id") REFERENCES "videos"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "videos" ADD CONSTRAINT "FK_eea204624e93cb253aa8ef92a1c" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "videos" ADD CONSTRAINT "FK_023a8e4f3f1a34ff3d8ca04a4cc" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "video_upload_parts" ADD CONSTRAINT "FK_cbfc857492ef53ea896719ba557" FOREIGN KEY ("video_id") REFERENCES "videos"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "video_upload_parts" DROP CONSTRAINT "FK_cbfc857492ef53ea896719ba557"`,
    );
    await queryRunner.query(
      `ALTER TABLE "videos" DROP CONSTRAINT "FK_023a8e4f3f1a34ff3d8ca04a4cc"`,
    );
    await queryRunner.query(
      `ALTER TABLE "videos" DROP CONSTRAINT "FK_eea204624e93cb253aa8ef92a1c"`,
    );
    await queryRunner.query(
      `ALTER TABLE "video_processing_jobs" DROP CONSTRAINT "FK_73d68b0137da77532588a8d3ffa"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_ed979803033122402ca36f6318"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_cbfc857492ef53ea896719ba55"`,
    );
    await queryRunner.query(`DROP TABLE "video_upload_parts"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_10db4256c96824e89c22fff501"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_ece1558efc6efd53eb530479db"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_023a8e4f3f1a34ff3d8ca04a4c"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_eea204624e93cb253aa8ef92a1"`,
    );
    await queryRunner.query(`DROP TABLE "videos"`);
    await queryRunner.query(`DROP TYPE "public"."videos_status_enum"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_dac342751ae6399820190b467a"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_73d68b0137da77532588a8d3ff"`,
    );
    await queryRunner.query(`DROP TABLE "video_processing_jobs"`);
    await queryRunner.query(
      `DROP TYPE "public"."video_processing_jobs_status_enum"`,
    );
  }
}
