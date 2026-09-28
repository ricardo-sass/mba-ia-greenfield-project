import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().port().default(3000),
  DB_HOST: Joi.string().default('localhost'),
  DB_PORT: Joi.number().default(5432),
  DB_USERNAME: Joi.string().required(),
  DB_PASSWORD: Joi.string().required(),
  DB_NAME: Joi.string().required(),
  JWT_SECRET: Joi.string().required(),
  JWT_REFRESH_SECRET: Joi.string().required(),
  JWT_ACCESS_EXPIRATION: Joi.string().default('15m'),
  JWT_REFRESH_EXPIRATION: Joi.string().default('7d'),
  CONFIRMATION_TOKEN_EXPIRATION_HOURS: Joi.number().default(1),
  PASSWORD_RESET_TOKEN_EXPIRATION_HOURS: Joi.number().default(1),
  APP_URL: Joi.string().uri().default('http://localhost:3000'),
  MAIL_HOST: Joi.string().default('mailpit'),
  MAIL_PORT: Joi.number().default(1025),
  MAIL_FROM: Joi.string().default('"StreamTube" <noreply@streamtube.com>'),
  SWAGGER_ENABLED: Joi.string().valid('true', 'false').default('false'),
  STORAGE_ENDPOINT: Joi.string().uri().required(),
  STORAGE_REGION: Joi.string().required(),
  STORAGE_BUCKET: Joi.string().required(),
  STORAGE_ACCESS_KEY_ID: Joi.string().required(),
  STORAGE_SECRET_ACCESS_KEY: Joi.string().required(),
  STORAGE_FORCE_PATH_STYLE: Joi.string().valid('true', 'false').default('true'),
  STORAGE_UPLOAD_PART_URL_TTL_SECONDS: Joi.number()
    .integer()
    .min(60)
    .default(900),
  STORAGE_READ_URL_TTL_SECONDS: Joi.number().integer().min(60).default(300),
  QUEUE_REDIS_HOST: Joi.string().required(),
  QUEUE_REDIS_PORT: Joi.number().port().default(6379),
  QUEUE_REDIS_PASSWORD: Joi.string().allow('').optional(),
  VIDEO_PROCESSING_ATTEMPTS: Joi.number().integer().min(1).default(3),
  VIDEO_PROCESSING_BACKOFF_MS: Joi.number().integer().min(1000).default(30000),
  VIDEO_MAX_UPLOAD_BYTES: Joi.number()
    .integer()
    .min(1)
    .max(10 * 1024 * 1024 * 1024)
    .default(10 * 1024 * 1024 * 1024),
});
