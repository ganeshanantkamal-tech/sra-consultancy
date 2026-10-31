import { randomUUID } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import ExcelJS from "exceljs";
import { del, get, put } from "@vercel/blob";
import { Router } from "express";
import { db, tx } from "./db/pool.js";
import { requirePermission } from "./auth.js";
import { createQuotation, today } from "./sales.js";
import { UNITS } from "./units.js";

const router = Router();
const MAX_PHOTOS = 6;
const text = (v: unknown, max = 3000) =>
  String(v ?? "")
    .trim()
    .slice(0, max);
const id = (v: unknown) => {
  const value = String(v ?? "");
  if (!/^\d+$/.test(value)) throw new Error("Invalid record id.");
  return value;
};
// Blank amounts count as zero; anything else must be whole, non-negative paise.
const amount = (v: unknown, label = "Amounts") => {
  if (v === null || v === undefined || v === "") return 0;
  const n = Number(v);
  if (!Number.isSafeInteger(n) || n < 0)
    throw new Error(`${label} must be whole, non-negative paise.`);
  return n;
};
const percent = (v: unknown) => {
  const n = Number(v ?? 15);
  if (!Number.isFinite(n) || n < 0 || n > 100)
    throw new Error("Contingency must be between 0 and 100%.");
  return Math.round(n * 100) / 100;
};
const stateCode = (v: unknown) => {
  const value = text(v, 2);
  if (value && !/^\d{2}$/.test(value))
    throw new Error("Place of supply must be a 2-digit state code.");
  return value;
};
const lines = (v: unknown) =>
  (Array.isArray(v) ? v : [])
    .map((x) => text(x, 1000))
    .filter(Boolean)
    .slice(0, 30);
const fail = (status: number, message: string) =>
  Object.assign(new Error(message), { status });
const run = async (res: any, action: () => Promise<unknown>, status = 200) => {
  try {
    res.status(status).json(await action());
  } catch (error: any) {
    res
      .status(error.status || 400)
      .json({ error: error.message || "Request could not be completed." });
  }
};
const load = async (estimateId: string) => {
  const estimate = (
    await db().query(
      `SELECT e.id, e.status, e.title, e.location, e.enquiry_id AS "enquiryId", e.client_ledger_id AS "clientLedgerId", e.building_type AS "buildingType", e.problem_note AS "problemNote", e.is_nongst AS "isNonGst", e.place_of_supply_state_code AS "placeOfSupplyStateCode", e.contingency_pct::float AS "contingencyPct", e.basis_line AS "basisLine", e.important_note AS "importantNote", e.assumptions, e.exclusions, e.quotation_id AS "quotationId", q.quotation_no AS "quotationNo", e.created_at AS "createdAt", e.updated_at AS "updatedAt", (e.ai_raw IS NOT NULL) AS "aiAnalysed", l.name AS "clientName" FROM estimates e LEFT JOIN ledgers l ON l.id=e.client_ledger_id LEFT JOIN quotations q ON q.id=e.quotation_id WHERE e.id=$1`,
      [estimateId],
    )
  ).rows[0];
  if (!estimate) throw fail(404, "Estimate not found.");
  estimate.items = (
    await db().query(
      `SELECT id, position, section, description, unit, qty::float AS qty, material, labour, other_cost AS "other", low_rate AS "lowRate", high_rate AS "highRate", rate_mode AS "rateMode", custom_rate AS "customRate", selected_rate AS "selectedRate", included, hsn_sac AS "hsnSac", gst_rate_pct AS "gstRatePct", notes FROM estimate_items WHERE estimate_id=$1 ORDER BY position`,
      [estimateId],
    )
  ).rows;
  estimate.photos = (
    await db().query(
      `SELECT id, content_type AS "contentType", created_at AS "createdAt" FROM estimate_photos WHERE estimate_id=$1 ORDER BY id`,
      [estimateId],
    )
  ).rows;
  return estimate;
};
const lockEditable = async (client: any, estimateId: string) => {
  const row = (
    await client.query(
      "SELECT status FROM estimates WHERE id=$1 FOR UPDATE",
      [estimateId],
    )
  ).rows[0];
  if (!row) throw fail(404, "Estimate not found.");
  if (!["draft", "analysed"].includes(row.status))
    throw new Error("This estimate is locked.");
  return row;
};
const saveItems = async (client: any, estimateId: string, raw: any[]) => {
  if (!Array.isArray(raw)) throw new Error("Items must be a list.");
  if (raw.length > 100) throw new Error("An estimate can have at most 100 items.");
  await client.query("DELETE FROM estimate_items WHERE estimate_id=$1", [
    estimateId,
  ]);
  for (let position = 0; position < raw.length; position++) {
    const item = raw[position] || {};
    const label = `Item ${position + 1}`;
    const description = text(item.description, 4000);
    if (!description) throw new Error(`${label} needs a description.`);
    const unit = text(item.unit, 20) || "LS";
    const qty = item.qty === undefined || item.qty === null || item.qty === "" ? 1 : Number(item.qty);
    if (!Number.isFinite(qty) || qty <= 0 || qty > 1e9) throw new Error(`${label}: quantity must be greater than zero.`);
    const rateMode = ["low", "high", "custom"].includes(item.rateMode)
      ? item.rateMode
      : "low";
    const material = amount(item.material, `${label} material`);
    const labour = amount(item.labour, `${label} labour`);
    const other = amount(item.other, `${label} other cost`);
    const lowRate = amount(item.lowRate ?? item.low, `${label} low rate`);
    const highRate = amount(item.highRate ?? item.high, `${label} high rate`);
    if (highRate < lowRate)
      throw new Error(`${label}: the high rate cannot be below the low rate.`);
    const customRate =
      item.customRate === null ||
      item.customRate === undefined ||
      item.customRate === ""
        ? null
        : amount(item.customRate, `${label} custom rate`);
    if (rateMode === "custom" && customRate === null)
      throw new Error(`${label}: enter the custom rate.`);
    const rate =
      rateMode === "high"
        ? highRate
        : rateMode === "custom"
          ? (customRate as number)
          : lowRate;
    const gstRatePct = Number(item.gstRatePct ?? 0);
    if (![0, 5, 12, 18, 28].includes(gstRatePct))
      throw new Error(`${label}: choose a valid GST rate.`);
    await client.query(
      `INSERT INTO estimate_items (estimate_id,position,description,material,labour,other_cost,low_rate,high_rate,rate_mode,custom_rate,selected_rate,included,hsn_sac,gst_rate_pct,notes,section,unit,qty) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
      [
        estimateId,
        position,
        description,
        material,
        labour,
        other,
        lowRate,
        highRate,
        rateMode,
        customRate,
        rate,
        item.included !== false,
        text(item.hsnSac, 20),
        gstRatePct,
        text(item.notes, 2000),
        text(item.section, 200),
        unit,
        qty,
      ],
    );
  }
};

router.get("/estimates", requirePermission("estimates"), (_, res) =>
  run(
    res,
    async () =>
      (
        await db().query(
          `SELECT e.id,e.title,e.location,e.status,e.is_nongst AS "isNonGst",e.contingency_pct::float AS "contingencyPct",e.created_at AS "createdAt",l.name AS "clientName",q.quotation_no AS "quotationNo",e.quotation_id AS "quotationId",(SELECT count(*)::int FROM estimate_photos p WHERE p.estimate_id=e.id) AS photos,(SELECT count(*)::int FROM estimate_items i WHERE i.estimate_id=e.id) AS items,(SELECT COALESCE(SUM(round(i.qty * i.selected_rate)),0)::bigint FROM estimate_items i WHERE i.estimate_id=e.id AND i.included) AS "quotedBase" FROM estimates e LEFT JOIN ledgers l ON l.id=e.client_ledger_id LEFT JOIN quotations q ON q.id=e.quotation_id ORDER BY e.created_at DESC`,
        )
      ).rows,
  ),
);
// Website enquiries that have no estimate yet, so a site visit can start from one.
router.get(
  "/estimates/enquiries",
  requirePermission("estimates", "enquiries"),
  (_, res) =>
    run(
      res,
      async () =>
        (
          await db().query(
            `SELECT q.id, q.name, q.phone, q.place, q.building_type AS "buildingType", q.message, q.status, q.received_at AS "receivedAt" FROM enquiries q WHERE q.status <> 'closed' AND NOT EXISTS (SELECT 1 FROM estimates e WHERE e.enquiry_id=q.id AND e.status <> 'discarded') ORDER BY q.received_at DESC LIMIT 100`,
          )
        ).rows,
    ),
);
router.get("/estimates/:id", requirePermission("estimates"), (req, res) =>
  run(res, () => load(id(req.params.id))),
);
router.post("/estimates", requirePermission("estimates"), (req: any, res) =>
  run(
    res,
    () =>
      tx(async (client) => {
        const b = req.body || {};
        let clientId = b.clientLedgerId ? id(b.clientLedgerId) : "";
        let enquiry: any = null;
        if (b.enquiryId) {
          enquiry = (
            await client.query(
              "SELECT id, name, phone, place, building_type, message FROM enquiries WHERE id=$1",
              [id(b.enquiryId)],
            )
          ).rows[0];
          if (!enquiry) throw new Error("Enquiry not found.");
        }
        if (!clientId && enquiry) {
          // Reuse the customer with the same name and phone, or create one from the enquiry.
          const existing = (
            await client.query(
              "SELECT id FROM ledgers WHERE is_client AND lower(name)=lower($1) AND coalesce(contact,'')=$2 LIMIT 1",
              [enquiry.name, enquiry.phone || ""],
            )
          ).rows[0];
          if (existing) clientId = String(existing.id);
          else {
            const group = (
              await client.query(
                "SELECT id FROM account_groups WHERE name='Sundry Debtors'",
              )
            ).rows[0];
            const taken = (
              await client.query("SELECT 1 FROM ledgers WHERE lower(name)=lower($1)", [enquiry.name])
            ).rows.length;
            const name = text(
              taken ? `${enquiry.name} (${enquiry.phone || `enquiry ${enquiry.id}`})` : enquiry.name,
              160,
            );
            clientId = String(
              (
                await client.query(
                  "INSERT INTO ledgers (name, group_id, is_client, contact, city) VALUES ($1,$2,true,$3,$4) RETURNING id",
                  [name, group.id, text(enquiry.phone, 30) || null, text(enquiry.place, 100) || null],
                )
              ).rows[0].id,
            );
          }
        }
        const customer = clientId
          ? (
              await client.query(
                "SELECT id, state_code FROM ledgers WHERE id=$1 AND is_client=true",
                [clientId],
              )
            ).rows[0]
          : null;
        if (!customer) throw new Error("Choose a customer.");
        const title = text(b.title, 200) || (enquiry ? `Site estimate – ${enquiry.place || enquiry.name}` : "");
        if (!title) throw new Error("Enter an estimate title.");
        return (
          await client.query(
            `INSERT INTO estimates (client_ledger_id,enquiry_id,title,location,building_type,problem_note,is_nongst,place_of_supply_state_code,contingency_pct,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
            [
              clientId,
              enquiry ? enquiry.id : null,
              title,
              text(b.location, 300) || text(enquiry?.place, 300),
              text(b.buildingType, 200) || text(enquiry?.building_type, 200),
              text(b.problemNote, 3000) || text(enquiry?.message, 3000),
              b.isNonGst !== false,
              stateCode(b.placeOfSupplyStateCode) || customer.state_code || "",
              percent(b.contingencyPct),
              req.user.id,
            ],
          )
        ).rows[0];
      }),
    201,
  ),
);
router.put("/estimates/:id", requirePermission("estimates"), (req, res) =>
  run(res, () =>
    tx(async (client) => {
      const estimateId = id(req.params.id);
      const b = req.body || {};
      await lockEditable(client, estimateId);
      await client.query(
        `UPDATE estimates SET title=$1,location=$2,building_type=$3,problem_note=$4,is_nongst=$5,place_of_supply_state_code=$6,contingency_pct=$7,basis_line=$8,important_note=$9,assumptions=$10::jsonb,exclusions=$11::jsonb,status=CASE WHEN status='draft' AND $12 THEN 'analysed' ELSE status END,updated_at=now() WHERE id=$13`,
        [
          text(b.title, 200),
          text(b.location, 300),
          text(b.buildingType, 200),
          text(b.problemNote, 3000),
          b.isNonGst !== false,
          stateCode(b.placeOfSupplyStateCode),
          percent(b.contingencyPct),
          text(b.basisLine, 500),
          text(b.importantNote, 3000),
          JSON.stringify(lines(b.assumptions)),
          JSON.stringify(lines(b.exclusions)),
          Array.isArray(b.items) && b.items.length > 0,
          estimateId,
        ],
      );
      if (Array.isArray(b.items)) await saveItems(client, estimateId, b.items);
      return { id: estimateId };
    }),
  ),
);
router.post(
  "/estimates/:id/discard",
  requirePermission("estimates"),
  (req, res) =>
    run(res, async () => {
      const row = (
        await db().query(
          `UPDATE estimates SET status='discarded',updated_at=now() WHERE id=$1 AND status IN ('draft','analysed') RETURNING id`,
          [id(req.params.id)],
        )
      ).rows[0];
      if (!row) throw new Error("Only draft or analysed estimates can be discarded.");
      return { ok: true };
    }),
);

router.post(
  "/estimates/:id/photos",
  requirePermission("estimates"),
  (req, res) =>
    run(res, () =>
      tx(async (client) => {
        const estimateId = id(req.params.id);
        const b = req.body || {};
        await lockEditable(client, estimateId);
        const count = (
          await client.query(
            "SELECT count(*)::int AS n FROM estimate_photos WHERE estimate_id=$1",
            [estimateId],
          )
        ).rows[0].n;
        if (count >= MAX_PHOTOS)
          throw new Error(`An estimate can have at most ${MAX_PHOTOS} photos.`);
        const contentType = text(b.contentType, 100);
        if (!["image/jpeg", "image/png", "image/webp"].includes(contentType))
          throw new Error("Only JPG, PNG, or WebP photos are accepted.");
        const buffer = Buffer.from(String(b.data || ""), "base64");
        if (!buffer.length || buffer.length > 4 * 1024 * 1024)
          throw new Error("Photo must be between 1 byte and 4 MB.");
        if (!process.env.BLOB_READ_WRITE_TOKEN)
          throw new Error("Blob storage is not configured.");
        const ext =
          contentType === "image/png"
            ? "png"
            : contentType === "image/webp"
              ? "webp"
              : "jpg";
        const pathname = `estimates/${estimateId}/${Date.now()}-${randomUUID()}.${ext}`;
        await put(pathname, buffer, {
          access: "private",
          contentType,
          addRandomSuffix: false,
        });
        return (
          await client.query(
            "INSERT INTO estimate_photos (estimate_id,pathname,content_type) VALUES ($1,$2,$3) RETURNING id",
            [estimateId, pathname, contentType],
          )
        ).rows[0];
      }),
    ),
);
const photoRow = async (estimateId: string, photoId: string) => {
  const photo = (
    await db().query(
      "SELECT id, pathname, content_type FROM estimate_photos WHERE id=$1 AND estimate_id=$2",
      [photoId, estimateId],
    )
  ).rows[0];
  if (!photo) throw fail(404, "Photo not found.");
  return photo;
};
const readBlob = async (pathname: string) => {
  const blob = await get(pathname, { access: "private", useCache: false });
  if (!blob?.stream) throw fail(404, "Photo file is missing from storage.");
  return Buffer.from(await new Response(blob.stream).arrayBuffer());
};
router.get(
  "/estimates/:id/photos/:photoId",
  requirePermission("estimates"),
  async (req, res) => {
    try {
      const photo = await photoRow(id(req.params.id), id(req.params.photoId));
      const bytes = await readBlob(photo.pathname);
      res.setHeader("Content-Type", photo.content_type);
      res.setHeader("Cache-Control", "private, max-age=3600");
      res.send(bytes);
    } catch (error: any) {
      res.status(error.status || 400).json({ error: error.message });
    }
  },
);
router.delete(
  "/estimates/:id/photos/:photoId",
  requirePermission("estimates"),
  (req, res) =>
    run(res, () =>
      tx(async (client) => {
        const estimateId = id(req.params.id);
        await lockEditable(client, estimateId);
        const photo = await photoRow(estimateId, id(req.params.photoId));
        await client.query("DELETE FROM estimate_photos WHERE id=$1", [photo.id]);
        try {
          await del(photo.pathname);
        } catch {
          // The row is gone; an orphaned private blob is harmless.
        }
        return { ok: true };
      }),
    ),
);

// Claude returns whole rupees per unit (converted to paise here), so a slip cannot inflate
// amounts 100×. Low rate = material + labour + other per unit; amount = qty × rate.
const ESTIMATE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "location", "basisLine", "items", "contingencyPct", "importantNote", "assumptions", "exclusions"],
  properties: {
    title: { type: "string", description: "Short estimate heading in capitals, e.g. 'RCC COLUMN REPAIR – LABOUR & MATERIAL COST ESTIMATE'." },
    location: { type: "string" },
    basisLine: { type: "string", description: "One line: indicative budget for <city>, INR, what it is based on, and that it is not a structural design or contractor quotation." },
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["section", "description", "unit", "qty", "material", "labour", "other", "high", "notes"],
        properties: {
          section: { type: "string", description: "BOQ section heading this line belongs to, e.g. 'Preparatory works', 'Structural repair works', 'Finishing works'." },
          description: { type: "string", description: "Full BOQ item specification: what is done, how, materials and standard, like a contractor's tender item." },
          unit: { type: "string", enum: UNITS, description: "Unit of measurement. Use LS with qty 1 for lump-sum stages such as inspection or design." },
          qty: { type: "number", description: "Estimated quantity in that unit, from what the photos and brief show." },
          material: { type: "integer", description: "Material / equipment rate per unit in whole rupees." },
          labour: { type: "integer", description: "Labour / professional fee per unit in whole rupees." },
          other: { type: "integer", description: "Other / disposal cost per unit in whole rupees." },
          high: { type: "integer", description: "Upper-bound rate per unit in whole rupees; at least material + labour + other." },
          notes: { type: "string", description: "Short note or assumption for this line." },
        },
      },
    },
    contingencyPct: { type: "number" },
    importantNote: { type: "string" },
    assumptions: { type: "array", items: { type: "string" }, description: "Safety and assumption bullets." },
    exclusions: { type: "array", items: { type: "string" }, description: "Optional or site-specific work deliberately excluded from the base total." },
  },
} as const;
const SYSTEM_PROMPT = `You are a senior civil and structural repair estimator in India who prepares preliminary labour-and-material budgets from site photos for SRA Consultancy.

Produce an indicative bill of quantities in the format Indian structural repair contractors use: lines grouped under section headings (for example Preparatory works, Structural repair works, Waterproofing, Finishing works), each line a full tender-style specification with a unit of measurement (Sqft, Rmt, Cum, Kg, Nos, LS…) and an estimated quantity read from the photos and brief. Cover the stages from inspection and engineering, through scaffolding, temporary supports and safety, breaking and repair, disposal and services, to finishing and completion inspection. Price each line per unit in whole Indian rupees at current local market rates for the given city, split into material/equipment, labour/professional fee, and other/disposal, and give an upper-bound "high" rate per unit that reflects realistic variation. Use LS with quantity 1 for lump-sum stages. State quantity assumptions in the line notes.

Only describe what the photos and brief support. Where the structural system, reinforcement or load path cannot be confirmed from photos, say so in the assumptions and keep major structural work (transfer beams, new columns, foundations, steel frames) out of the base total, listing it under exclusions instead. Never state that a structural member can be safely removed or cut. Use a contingency of 10–20% depending on uncertainty.`;

router.post(
  "/estimates/:id/analyse",
  requirePermission("estimates"),
  (req, res) =>
    run(res, async () => {
      const estimateId = id(req.params.id);
      if (!process.env.ANTHROPIC_API_KEY)
        throw fail(
          503,
          "ANTHROPIC_API_KEY is not configured. Add it to .env (local) or the Vercel project settings, then try again.",
        );
      const estimate = await load(estimateId);
      if (!["draft", "analysed"].includes(estimate.status))
        throw new Error("Only draft or analysed estimates can be analysed.");
      const photos = (
        await db().query(
          "SELECT pathname,content_type FROM estimate_photos WHERE estimate_id=$1 ORDER BY id",
          [estimateId],
        )
      ).rows;
      if (!photos.length) throw new Error("Upload at least one site photo first.");
      const content: Anthropic.Beta.BetaContentBlockParam[] = [];
      for (const photo of photos)
        content.push({
          type: "image",
          source: {
            type: "base64",
            media_type: photo.content_type,
            data: (await readBlob(photo.pathname)).toString("base64"),
          },
        });
      content.push({
        type: "text",
        text: `Site brief\nLocation: ${estimate.location || "not given"}\nBuilding type: ${estimate.buildingType || "not given"}\nObserved problem and scope: ${estimate.problemNote || "not given"}\n\nPrepare the estimate for the ${photos.length} photo(s) above.`,
      });
      // The Claude call runs outside any database transaction so no row stays locked while it works.
      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      let message: Anthropic.Beta.BetaMessage;
      try {
        message = await anthropic.beta.messages
          .stream({
            model: process.env.CLAUDE_MODEL || "claude-opus-5-5",
            max_tokens: 32000,
            betas: ["server-side-fallback-2026-07-01"],
            fallbacks: "default",
            thinking: { type: "adaptive" },
            output_config: {
              effort: "high",
              format: { type: "json_schema", schema: ESTIMATE_SCHEMA },
            },
            system: SYSTEM_PROMPT,
            messages: [{ role: "user", content }],
          })
          .finalMessage();
      } catch (error: any) {
        if (error instanceof Anthropic.AuthenticationError)
          throw fail(503, "The Anthropic API key was rejected. Check ANTHROPIC_API_KEY.");
        if (error instanceof Anthropic.RateLimitError)
          throw fail(429, "Claude is busy right now. Try the analysis again in a minute.");
        if (error instanceof Anthropic.APIError)
          throw fail(502, `Claude could not analyse the photos (${error.status ?? "network"}). Try again.`);
        throw error;
      }
      if (message.stop_reason === "refusal")
        throw new Error("Claude declined to analyse these photos. Enter the estimate lines manually.");
      if (message.stop_reason === "max_tokens")
        throw new Error("The estimate was too long to finish. Narrow the brief or use fewer photos.");
      const output = message.content
        .filter((part): part is Anthropic.Beta.BetaTextBlock => part.type === "text")
        .map((part) => part.text)
        .join("");
      let ai: any;
      try {
        ai = JSON.parse(output);
      } catch {
        throw new Error("Claude returned an estimate that could not be read. Try again.");
      }
      const rupees = (v: unknown) => Math.max(0, Math.round(Number(v) || 0)) * 100;
      const items = (Array.isArray(ai.items) ? ai.items : [])
        .filter((x: any) => text(x?.description))
        .map((x: any) => {
          const material = rupees(x.material);
          const labour = rupees(x.labour);
          const other = rupees(x.other);
          const low = material + labour + other;
          const qty = Number(x.qty) > 0 ? Math.round(Number(x.qty) * 1000) / 1000 : 1;
          return {
            section: text(x.section, 200),
            unit: UNITS.includes(x.unit) ? x.unit : "LS",
            qty,
            description: x.description,
            material,
            labour,
            other,
            lowRate: low,
            highRate: Math.max(low, rupees(x.high)),
            rateMode: "low",
            included: true,
            notes: x.notes || "",
            hsnSac: "",
            gstRatePct: 0,
          };
        });
      if (!items.length) throw new Error("Claude returned no estimate items.");
      return tx(async (client) => {
        // Re-check under lock: the estimate may have been approved while Claude was working.
        await lockEditable(client, estimateId);
        await client.query(
          `UPDATE estimates SET title=$1,location=$2,basis_line=$3,contingency_pct=$4,important_note=$5,assumptions=$6::jsonb,exclusions=$7::jsonb,ai_raw=$8::jsonb,status='analysed',updated_at=now() WHERE id=$9`,
          [
            text(ai.title || estimate.title, 200),
            text(ai.location || estimate.location, 300),
            text(ai.basisLine, 500),
            percent(Math.min(100, Math.max(0, Number(ai.contingencyPct ?? 15)))),
            text(ai.importantNote, 3000),
            JSON.stringify(lines(ai.assumptions)),
            JSON.stringify(lines(ai.exclusions)),
            JSON.stringify({ model: message.model, usage: message.usage, response: ai }),
            estimateId,
          ],
        );
        await saveItems(client, estimateId, items);
        return { id: estimateId, items: items.length };
      });
    }),
);

// Layout follows RCC_column_structural_work_labour_material_cost_sheet.xlsx, extended to a
// structural BOQ: section rows, unit and quantity, per-unit rates (low rate = material + labour +
// other) and live amount formulas (qty × rate), subtotals, contingency and grand totals, plus a
// Summary sheet that reads its figures from the BOQ sheet.
const NAVY = "FF20364D";
const BLUE = "FF356A86";
const LIGHT = "FFDDEBF2";
const GREEN = "FFC6E0B4";
const PEACH = "FFFCE4D6";
const SECTION = "FFEEF2F6";
const INR = "₹#,##0.##";
const fill = (argb: string) => ({ type: "pattern" as const, pattern: "solid" as const, fgColor: { argb } });
export async function estimateWorkbook(estimate: any) {
  const book = new ExcelJS.Workbook();
  book.creator = "SRA Consultancy";
  const boq = book.addWorksheet("BOQ Estimate", { views: [{ state: "frozen", ySplit: 4 }] });
  // A Sr | B Description | C Unit | D Qty | E Material | F Labour | G Other | H Low rate | I High rate | J Quoted rate | K Low amt | L High amt | M Quoted amt | N Notes
  [7, 56, 9, 10, 14, 14, 13, 13, 13, 13, 16, 16, 16, 40].forEach((width, i) => (boq.getColumn(i + 1).width = width));
  const banner = (row: number, value: string, opts: { bold?: boolean; color?: string; size?: number; argb?: string } = {}) => {
    boq.mergeCells(`A${row}:N${row}`);
    const cell = boq.getCell(`A${row}`);
    cell.value = value;
    cell.font = { bold: opts.bold, size: opts.size, color: opts.color ? { argb: opts.color } : undefined };
    cell.alignment = { wrapText: true, vertical: "middle" };
    if (opts.argb) cell.fill = fill(opts.argb);
  };
  banner(1, (estimate.title || "SITE REPAIR – LABOUR & MATERIAL COST ESTIMATE").toUpperCase(), { bold: true, size: 14, color: "FFFFFFFF", argb: NAVY });
  banner(2, estimate.basisLine || `Indicative budget for ${estimate.location || "site"} | INR | Based on photos and limited information; not a structural design or contractor quotation`);
  boq.getRow(2).height = 30;
  const header = boq.getRow(4);
  header.values = ["Sr.", "Description of Work", "Unit", "Qty", "Material / Unit (₹)", "Labour / Unit (₹)", "Other / Unit (₹)", "Low Rate (₹)", "High Rate (₹)", "Quoted Rate (₹)", "Low Amount (₹)", "High Amount (₹)", "Quoted Amount (₹)", "Notes / Assumptions"];
  header.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = fill(BLUE);
    cell.alignment = { wrapText: true, vertical: "middle", horizontal: "center" };
  });
  header.height = 34;
  const included = estimate.items.filter((i: any) => i.included);
  const optional = estimate.items.filter((i: any) => !i.included);
  const first = 5;
  let r = first;
  let section: string | null = null;
  let sections = 0;
  let number = 0;
  for (const item of included) {
    const heading = String(item.section || "").trim();
    if (heading && heading !== section) {
      sections += 1;
      number = 0;
      const row = boq.getRow(r++);
      row.getCell(1).value = String.fromCharCode(64 + ((sections - 1) % 26) + 1);
      row.getCell(2).value = heading.toUpperCase();
      for (let c = 1; c <= 14; c++) { row.getCell(c).fill = fill(SECTION); row.getCell(c).font = { bold: true }; }
    }
    section = heading;
    number += 1;
    const row = boq.getRow(r);
    const quoted = item.rateMode === "high" ? { formula: `I${r}` } : item.rateMode === "custom" ? Number(item.customRate ?? item.selectedRate) / 100 : { formula: `H${r}` };
    row.values = [number, item.description, item.unit || "LS", Number(item.qty) || 1, Number(item.material) / 100, Number(item.labour) / 100, Number(item.other) / 100, { formula: `E${r}+F${r}+G${r}` }, Number(item.highRate) / 100, quoted, { formula: `D${r}*H${r}` }, { formula: `D${r}*I${r}` }, { formula: `D${r}*J${r}` }, item.notes || ""];
    // A low rate typed in by hand that differs from material + labour + other is kept as a value.
    if (Number(item.lowRate) !== Number(item.material) + Number(item.labour) + Number(item.other)) row.getCell(8).value = Number(item.lowRate) / 100;
    row.getCell(2).alignment = row.getCell(14).alignment = { wrapText: true, vertical: "top" };
    row.getCell(3).alignment = { horizontal: "center", vertical: "top" };
    [5, 6, 7, 8, 9, 10, 11, 12, 13].forEach((c) => (row.getCell(c).numFmt = INR));
    r += 1;
  }
  const last = Math.max(r - 1, first);
  optional.forEach((item: any) => {
    const row = boq.getRow(r++);
    row.values = ["", `OPTIONAL / NOT INCLUDED: ${item.description}`, item.unit || "", Number(item.qty) || "", Number(item.material) / 100 || "", Number(item.labour) / 100 || "", Number(item.other) / 100 || "", "", "", "", "NOT INCLUDED", "NOT INCLUDED", "", item.notes || ""];
    row.eachCell((cell) => (cell.fill = fill(PEACH)));
    row.getCell(2).alignment = row.getCell(14).alignment = { wrapText: true, vertical: "top" };
  });
  const pct = Number(estimate.contingencyPct) || 0;
  const subtotal = r + 1;
  const totals: [number, string, (col: string) => string, string][] = [
    [subtotal, "Base estimate subtotal", (c) => `SUM(${c}${first}:${c}${last})`, LIGHT],
    [subtotal + 1, `Contingency allowance (${pct}%)`, (c) => `${c}${subtotal}*${pct}%`, LIGHT],
    [subtotal + 2, "Indicative base total including contingency", (c) => `${c}${subtotal}+${c}${subtotal + 1}`, GREEN],
  ];
  for (const [rowNo, label, formula, colour] of totals) {
    const row = boq.getRow(rowNo);
    row.getCell(2).value = label;
    for (const col of ["K", "L", "M"]) {
      const cell = boq.getCell(`${col}${rowNo}`);
      cell.value = { formula: formula(col) };
      cell.numFmt = INR;
    }
    for (let c = 2; c <= 13; c++) {
      row.getCell(c).fill = fill(colour);
      row.getCell(c).font = { bold: true };
    }
  }
  let notes = subtotal + 4;
  if (estimate.importantNote) {
    banner(notes, `IMPORTANT: ${estimate.importantNote}`, { bold: true });
    boq.getRow(notes++).height = 30;
  }
  notes++;
  for (const bullet of [...(estimate.assumptions || []), ...(estimate.exclusions || []).map((x: string) => `Excluded: ${x}`)]) {
    banner(notes, `• ${bullet}`);
    boq.getRow(notes++).height = 30;
  }
  const summary = book.addWorksheet("Summary");
  [55, 24, 24, 24].forEach((width, i) => (summary.getColumn(i + 1).width = width));
  summary.mergeCells("A1:D1");
  summary.getCell("A1").value = "COST SUMMARY";
  summary.getCell("A1").font = { bold: true, size: 14, color: { argb: "FFFFFFFF" } };
  summary.getCell("A1").fill = fill(NAVY);
  summary.getRow(2).values = ["Client", estimate.clientName || "", "Location", estimate.location || ""];
  const sheet = "'BOQ Estimate'!";
  const sumHead = summary.getRow(3);
  sumHead.values = ["Category", "Low Estimate (₹)", "High Estimate (₹)", "Quoted (₹)"];
  sumHead.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = fill(BLUE);
  });
  const product = (col: string) => `SUMPRODUCT(${sheet}D${first}:D${last},${sheet}${col}${first}:${col}${last})`;
  const rows: [string, string, string, string][] = [
    ["Materials / equipment", product("E"), product("E"), ""],
    ["Labour / professional fees", product("F"), product("F"), ""],
    ["Other / disposal", product("G"), product("G"), ""],
    ["Base subtotal", `${sheet}K${subtotal}`, `${sheet}L${subtotal}`, `${sheet}M${subtotal}`],
    [`Contingency ${pct}%`, `${sheet}K${subtotal + 1}`, `${sheet}L${subtotal + 1}`, `${sheet}M${subtotal + 1}`],
    ["Base total (optional / excluded work not included)", `${sheet}K${subtotal + 2}`, `${sheet}L${subtotal + 2}`, `${sheet}M${subtotal + 2}`],
  ];
  rows.forEach(([label, low, high, quoted], i) => {
    const row = summary.getRow(4 + i);
    row.values = [label, { formula: low }, { formula: high }, quoted ? { formula: quoted } : ""];
    [2, 3, 4].forEach((c) => (row.getCell(c).numFmt = INR));
    if (i === rows.length - 1)
      row.eachCell((cell) => {
        cell.font = { bold: true };
        cell.fill = fill(GREEN);
      });
  });
  if (optional.length) summary.getRow(4 + rows.length).values = ["Optional / site-specific work", "TBD after design", "TBD after design", "Not included"];
  return Buffer.from(await book.xlsx.writeBuffer());
}
router.get(
  "/estimates/:id/excel",
  requirePermission("estimates"),
  async (req, res) => {
    try {
      const estimate = await load(id(req.params.id));
      if (!estimate.items.length) throw new Error("Add estimate lines before downloading Excel.");
      const bytes = await estimateWorkbook(estimate);
      if (process.env.BLOB_READ_WRITE_TOKEN) {
        const pathname = `estimates/${estimate.id}/boq-${Date.now()}.xlsx`;
        await put(pathname, bytes, {
          access: "private",
          contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          addRandomSuffix: false,
        });
        await db().query("UPDATE estimates SET generated_excel_path=$1 WHERE id=$2", [pathname, estimate.id]);
      }
      const name = `BOQ-${estimate.id}-${String(estimate.title || "estimate").replace(/[^\w-]+/g, "-").slice(0, 60)}.xlsx`;
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="${name}"`);
      res.send(bytes);
    } catch (error: any) {
      res.status(error.status || 400).json({ error: error.message || "Could not create Excel." });
    }
  },
);

// Approval turns the reviewed lines into a draft BOQ quotation (section headings, unit, qty and
// rate per line, plus a separate Contingency line) through the same code path as a hand-made
// quotation, then locks the estimate.
router.post(
  "/estimates/:id/approve",
  requirePermission("estimates", "bills_quotes"),
  (req: any, res) =>
    run(res, () =>
      tx(async (client) => {
        const estimateId = id(req.params.id);
        const status = (
          await client.query("SELECT status FROM estimates WHERE id=$1 FOR UPDATE", [estimateId])
        ).rows[0]?.status;
        if (!status) throw fail(404, "Estimate not found.");
        if (status !== "analysed")
          throw new Error(status === "quoted" ? "This estimate already has a quotation." : "Analyse or enter and save the estimate lines before approval.");
        const estimate = await load(estimateId);
        const included = estimate.items.filter((item: any) => item.included);
        if (!included.length) throw new Error("Include at least one estimate item.");
        const zero = included.find((item: any) => !Number(item.selectedRate));
        if (zero) throw new Error(`"${zero.description}" has no amount selected.`);
        const gst = !estimate.isNonGst;
        if (gst) {
          const missing = included.find((item: any) => !item.hsnSac);
          if (missing) throw new Error(`Choose an HSN/SAC code and GST rate for "${missing.description}" or mark the estimate Non-GST.`);
        }
        const items: any[] = [];
        let section: string | null = null;
        for (const item of included) {
          const heading = String(item.section || "").trim();
          if (heading && heading !== section) items.push({ kind: "section", description: heading });
          section = heading;
          items.push({
            kind: "item",
            description: item.description,
            unit: item.unit || "LS",
            hsnSac: item.hsnSac,
            qty: Number(item.qty) || 1,
            rate: Number(item.selectedRate),
            gstRatePct: gst ? item.gstRatePct : 0,
          });
        }
        const priced = items.filter((item) => item.kind === "item");
        const base = priced.reduce((n: number, item: any) => n + Math.round(item.qty * item.rate), 0);
        const contingency = Math.round((base * Number(estimate.contingencyPct)) / 100);
        if (contingency > 0) {
          // In GST mode the contingency follows the highest-rated line so it is not under-taxed.
          const top = gst ? priced.reduce((a: any, b: any) => (b.gstRatePct > a.gstRatePct ? b : a)) : null;
          // With section headings in use, the contingency gets its own heading rather than being numbered as building work.
          if (items.some((item) => item.kind === "section")) items.push({ kind: "section", description: "Contingency" });
          items.push({
            kind: "item",
            description: `Contingency allowance (${Number(estimate.contingencyPct)}%)`,
            unit: "LS",
            hsnSac: top?.hsnSac || "",
            qty: 1,
            rate: contingency,
            gstRatePct: top?.gstRatePct || 0,
          });
        }
        const terms = [
          estimate.importantNote,
          ...(estimate.assumptions || []).map((x: any) => `• ${x}`),
          ...(estimate.exclusions || []).map((x: any) => `• Excluded: ${x}`),
        ]
          .filter(Boolean)
          .join("\n");
        const quotation = await createQuotation(
          client,
          {
            clientLedgerId: estimate.clientLedgerId,
            date: req.body?.date || today(),
            validUntil: req.body?.validUntil,
            placeOfSupplyStateCode: estimate.placeOfSupplyStateCode,
            isNonGst: estimate.isNonGst,
            items,
            notes: estimate.basisLine || "",
            terms,
            subject: `Quotation for ${estimate.title || "site repair works"}${estimate.location ? ` at ${estimate.location}` : ""}`,
            siteReference: "",
          },
          req.user.id,
          estimateId,
        );
        await client.query(
          `UPDATE estimates SET status='quoted',quotation_id=$1,updated_at=now() WHERE id=$2`,
          [quotation.id, estimateId],
        );
        return quotation;
      }),
    ),
);
export default router;
