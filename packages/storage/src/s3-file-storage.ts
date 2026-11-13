import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  NoSuchKey,
  NotFound,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { contentDisposition, type FileStorage } from './file-storage.ts';

export type S3StorageConfig = {
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  endpoint?: string | undefined;
  /** Host the browser can reach, for signed URLs. Defaults to `endpoint`. */
  publicEndpoint?: string | undefined;
  forcePathStyle: boolean;
};

const isNotFound = (error: unknown) =>
  error instanceof NoSuchKey ||
  error instanceof NotFound ||
  (error as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode === 404;

export const createS3FileStorage = (config: S3StorageConfig): FileStorage => {
  const clientFor = (endpoint: string | undefined) =>
    new S3Client({
      region: config.region,
      ...(endpoint ? { endpoint } : {}),
      forcePathStyle: config.forcePathStyle,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    });
  const client = clientFor(config.endpoint);
  const signer = config.publicEndpoint ? clientFor(config.publicEndpoint) : client;
  const Bucket = config.bucket;

  return {
    put: async ({ key, body, contentType }) => {
      await client.send(
        new PutObjectCommand({ Bucket, Key: key, Body: body, ContentType: contentType }),
      );
    },

    get: async (key) => {
      try {
        const res = await client.send(new GetObjectCommand({ Bucket, Key: key }));
        const body = await res.Body?.transformToByteArray();
        if (!body) return null;
        return { body, contentType: res.ContentType ?? null, sizeBytes: body.byteLength };
      } catch (error) {
        if (isNotFound(error)) return null;
        throw error;
      }
    },

    exists: async (key) => {
      try {
        await client.send(new HeadObjectCommand({ Bucket, Key: key }));
        return true;
      } catch (error) {
        if (isNotFound(error)) return false;
        throw error;
      }
    },

    delete: async (key) => {
      await client.send(new DeleteObjectCommand({ Bucket, Key: key }));
    },

    signedDownloadUrl: (key, { filename, expiresInSeconds = 300, disposition = 'attachment' }) =>
      getSignedUrl(
        signer,
        new GetObjectCommand({
          Bucket,
          Key: key,
          ResponseContentDisposition: contentDisposition(filename, disposition),
        }),
        { expiresIn: expiresInSeconds },
      ),
  };
};
