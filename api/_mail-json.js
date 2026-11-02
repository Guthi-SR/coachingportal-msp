import { createHash } from "node:crypto";

const BUCKET = "portal-observation-jsons";
const SUPABASE = "https://izuwixrvuxrhviyabgom.supabase.co";
const PUBLIC = "sb_publishable_2Cep_1Pu93JXSKVrYzyRQA_5Nbq9XEZ";
const MAX_JSON_BYTES = 5 * 1024 * 1024;
const str = value => typeof value === "string" ? value.trim() : "";
const norm = value => str(value).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\b(e\.?v\.?|fc|tsv|sv|sc|spvgg|dj?k|sg|vfl|fsv)\b/g, "").replace(/[^a-z0-9]/g, "");
const similar = (a, b) => {
  const x = norm(a), y = norm(b);
  return Boolean(x && y && (x === y || x.length >= 5 && y.includes(x) || y.length >= 5 && x.includes(y)));
};
const safePart = (value, fallback) =>
  (str(value).replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").replace(/\s+/g, " ").replace(/[. ]+$/g, "").slice(0, 90) || fallback);
function friendlyName(d) {
  return (safePart(d.referee, "Schiedsrichter unbekannt") + " - " +
    safePart(d.home, "Heim unbekannt") + " gegen " +
    safePart(d.away, "Gast unbekannt") + " - " +
    safePart(d.coach, "Coach unbekannt")).slice(0, 185).replace(/[. ]+$/g, "") + ".json";
}
function validate(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const d = {
    match_date: str(body.spieldatum),
    home: str(body.heimmannschaft),
    away: str(body.gastmannschaft),
    referee: str(body.schiedsrichter),
    coach: str(body.coach)
  };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.match_date) || !d.home || !d.away || !d.referee) return null;
  const time = new Date(d.match_date + "T00:00:00Z");
  if (Number.isNaN(time.valueOf()) || time.toISOString().slice(0, 10) !== d.match_date) return null;
  return d;
}
function uniqueGame(d, games) {
  const matches = games.filter(g => g.match_date === d.match_date &&
    similar(g.home, d.home) && similar(g.away, d.away) && similar(g.referee_name, d.referee));
  return matches.length === 1 ? matches[0] : null;
}
function deterministicId(ownerId, hash) {
  const h = createHash("sha256").update("json:" + ownerId + ":" + hash).digest("hex").slice(0, 32).split("");
  h[12] = "5"; h[16] = "8";
  return [h.slice(0,8).join(""), h.slice(8,12).join(""), h.slice(12,16).join(""),
    h.slice(16,20).join(""), h.slice(20).join("")].join("-");
}
async function upload(token, path, bytes) {
  const response = await fetch(SUPABASE + "/storage/v1/object/" + BUCKET + "/" +
    path.split("/").map(encodeURIComponent).join("/"), {
    method: "POST",
    headers: { apikey: PUBLIC, authorization: "Bearer " + token,
      "Content-Type": "application/json", "x-upsert": "false" },
    body: bytes,
    signal: AbortSignal.timeout(20000)
  });
  if (!response.ok && response.status !== 409) throw Error("JSON-Datei konnte nicht gespeichert werden (" + response.status + ")");
}
export async function storeJsonAttachment({ attachment, token, ownerId, games, supa }) {
  const bytes = attachment.content;
  if (!Buffer.isBuffer(bytes) || bytes.length < 2 || bytes.length > MAX_JSON_BYTES) return "invalid";
  let body;
  try { body = JSON.parse(bytes.toString("utf8").replace(/^\uFEFF/, "")); }
  catch { return "invalid"; }
  const d = validate(body);
  if (!d) return "invalid";

  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const foundByHash = await supa("portal_json_imports?owner_id=eq." + ownerId + "&sha256=eq." + sha256 + "&select=id&limit=1", token);
  if (foundByHash.length) return "duplicate";

  // Many coaching exports have a stable source ID. Treat a resend with changed whitespace as the same observation.
  const sourceId = str(body.id);
  if (sourceId) {
    const foundById = await supa("portal_json_imports?owner_id=eq." + ownerId +
      "&json_body->>id=eq." + encodeURIComponent(sourceId) + "&select=id&limit=1", token);
    if (foundById.length) return "duplicate";
  }

  const id = deterministicId(ownerId, sha256);
  const path = ownerId + "/" + id + ".json";
  const game = uniqueGame(d, games);
  const original = safePart(attachment.filename, "Coachingbogen.json").slice(0, 200);
  await upload(token, path, bytes);

  const row = {
    id, owner_id: ownerId, file_name: friendlyName(d), original_file_name: original,
    storage_path: path, sha256, json_body: body,
    game_key: game?.game_key || null, match_date: d.match_date,
    home: d.home, away: d.away, referee_name: d.referee,
    coach_name: d.coach, assigned_at: game ? new Date().toISOString() : null
  };
  try { await supa("portal_json_imports", token, { method: "POST", body: row }); }
  catch (error) {
    if (/Datenbankfehler 409\b/.test(String(error?.message || ""))) return "duplicate";
    throw error;
  }
  return game ? "assigned" : "unassigned";
}
