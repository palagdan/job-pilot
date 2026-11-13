import type { storageEnv } from '@job-pilot/config/fragments';
import type { z } from 'zod';
import type { FileStorage } from './file-storage.ts';
import { createLocalFileStorage } from './local-file-storage.ts';
import { createS3FileStorage } from './s3-file-storage.ts';

type StorageEnv = z.infer<z.ZodObject<typeof storageEnv>>;

/** `STORAGE_DRIVER=local` (default) stores files on disk; `s3` needs the `S3_*` vars. */
export const createFileStorageFromEnv = (env: StorageEnv): FileStorage => {
  if (env.STORAGE_DRIVER === 'local') return createLocalFileStorage(env.LOCAL_STORAGE_DIR);

  const { S3_BUCKET: bucket, S3_ACCESS_KEY_ID: accessKeyId, S3_SECRET_ACCESS_KEY: secret } = env;
  if (!bucket || !accessKeyId || !secret) {
    throw new Error('STORAGE_DRIVER=s3 needs S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY');
  }
  return createS3FileStorage({
    bucket,
    region: env.S3_REGION,
    accessKeyId,
    secretAccessKey: secret,
    endpoint: env.S3_ENDPOINT,
    publicEndpoint: env.S3_PUBLIC_ENDPOINT,
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
  });
};
