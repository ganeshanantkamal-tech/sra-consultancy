import { get, put } from '@vercel/blob';

// Photos uploaded from /admin, in the private Vercel Blob store "sra-cms" (BLOB_READ_WRITE_TOKEN is set
// by Vercel) as media/<time>-<name>.jpg. Text content and enquiries are in Postgres (see db.js).

export const isStorageConfigured = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN);

export async function readFile(pathname) {
  const result = await get(pathname, { access: 'private', useCache: false });
  if (!result) return null;
  return { buffer: Buffer.from(await new Response(result.stream).arrayBuffer()), contentType: result.blob?.contentType };
}

export function writeFile(pathname, buffer, contentType) {
  return put(pathname, buffer, { access: 'private', contentType, addRandomSuffix: false, allowOverwrite: false });
}

export const stamp = () => new Date().toISOString().replace(/[:.]/g, '-');
