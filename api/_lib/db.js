import { neon } from '@neondatabase/serverless';

// Neon Postgres (DATABASE_URL in Vercel's environment variables). Tables are in db/schema.sql.
// Holds the website content, its saved versions and the enquiries; photos are in Blob storage.

const VERSIONS_KEEP = 30;

export const isDbConfigured = () => Boolean(process.env.DATABASE_URL);

let client;
const db = () => (client ??= neon(process.env.DATABASE_URL));

// Neon talks over HTTPS; a dropped request (no Postgres error code) is retried once.
// Real SQL errors carry a code and are not retried.
async function retry(run) {
  try {
    return await run();
  } catch (error) {
    if (error?.code) throw error;
    await new Promise((r) => setTimeout(r, 400));
    return run();
  }
}

const sql = (strings, ...values) => retry(() => db()(strings, ...values));

const ENQUIRY_COLUMNS = `id, status, name, phone, place, building_type AS "buildingType", message, notes,
  received_at AS "receivedAt", updated_at AS "updatedAt"`;

export async function getContent() {
  const rows = await sql`SELECT content FROM site_content WHERE id = 1`;
  return rows[0]?.content ?? null;
}

// Content, its version record and the pruning of old versions happen in one transaction
export function saveContent(content) {
  const json = JSON.stringify(content);
  return retry(() => {
    const q = db();
    return q.transaction([
      q`INSERT INTO site_content (id, content, updated_at) VALUES (1, ${json}::jsonb, now())
        ON CONFLICT (id) DO UPDATE SET content = EXCLUDED.content, updated_at = now()`,
      q`INSERT INTO content_versions (content) VALUES (${json}::jsonb)`,
      q`DELETE FROM content_versions
        WHERE id NOT IN (SELECT id FROM content_versions ORDER BY saved_at DESC, id DESC LIMIT ${VERSIONS_KEEP})`,
    ]);
  });
}

export function listVersions() {
  return sql`SELECT id, saved_at FROM content_versions ORDER BY saved_at DESC, id DESC`;
}

export async function getVersion(id) {
  const rows = await sql`SELECT content FROM content_versions WHERE id = ${id}`;
  return rows[0]?.content ?? null;
}

export function addEnquiry(e) {
  return sql`
    INSERT INTO enquiries (name, phone, place, building_type, message)
    VALUES (${e.name}, ${e.phone}, ${e.place}, ${e.buildingType}, ${e.message})`;
}

export function listEnquiries(limit = 300) {
  return retry(() => db().query(`SELECT ${ENQUIRY_COLUMNS} FROM enquiries ORDER BY received_at DESC LIMIT $1`, [limit]));
}

export async function updateEnquiry(id, { status, notes }) {
  const rows = await retry(() => db().query(
    `UPDATE enquiries
     SET status = COALESCE($2, status), notes = COALESCE($3, notes), updated_at = now()
     WHERE id = $1
     RETURNING ${ENQUIRY_COLUMNS}`,
    [id, status ?? null, notes ?? null],
  ));
  return rows[0] ?? null;
}

export async function deleteEnquiry(id) {
  const rows = await sql`DELETE FROM enquiries WHERE id = ${id} RETURNING id`;
  return rows.length > 0;
}
