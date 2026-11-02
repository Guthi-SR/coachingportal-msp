import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
// PDF parsing is loaded only when needed; a parser failure must not crash the mail endpoint.
import { createHash, randomUUID } from "node:crypto";

export const config = { maxDuration: 60 };
const SB = "https://izuwixrvuxrhviyabgom.supabase.co";
const PUBLIC = "sb_publishable_2Cep_1Pu93JXSKVrYzyRQA_5Nbq9XEZ";
const BUCKET = "portal-observation-pdfs";
const MAX_PDF = 8 * 1024 * 1024;
const MAX_MESSAGES = 20;
const respond = (res, code, data) => res.status(code).json(data);
const clean = v => String(v ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("de").replace(/[^a-z0-9]+/g, " ").trim();
const contained = (text, phrase) => Boolean(phrase && phrase.length >= 4 && (" " + text + " ").includes(" " + phrase + " "));
const isoDate = value => value ? new Date(value).toISOString().slice(0, 10) : null;
function deterministicId(ownerId, hash) {
  const h = createHash("sha256").update(ownerId + ":" + hash).digest("hex").slice(0, 32).split("");
  h[12] = "5";
  h[16] = "8";
  return h.slice(0, 8).join("") + "-" + h.slice(8, 12).join("") + "-" + h.slice(12, 16).join("") + "-" + h.slice(16, 20).join("") + "-" + h.slice(20).join("");
}
async function supa(path, token, opts = {}) {
  const method = opts.method || "GET";
  const headers = { apikey: PUBLIC, authorization: "Bearer " + token, "Content-Type": "application/json" };
  if (method !== "GET") headers.prefer = opts.prefer || "return=representation";
  const r = await fetch(SB + "/rest/v1/" + path, { method, headers, body: opts.body ? JSON.stringify(opts.body) : undefined, signal: AbortSignal.timeout(15000) });
  const content = await r.text();
  if (!r.ok) throw Error("Datenbankfehler " + r.status + " (" + content.slice(0, 170) + ")");
  return content ? JSON.parse(content) : [];
}
async function authenticatedAdmin(token) {
  const response = await fetch(SB + "/auth/v1/user", { headers: { apikey: PUBLIC, authorization: "Bearer " + token }, signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw Error("Bitte erneut im Portal anmelden.");
  const user = await response.json();
  const profiles = await supa("portal_profiles?user_id=eq." + encodeURIComponent(user.id) + "&select=role", token);
  if (profiles.length !== 1 || profiles[0].role !== "admin") throw Error("Nur Administratoren dürfen den Posteingang abrufen.");
  return user.id;
}
async function cronAdmin(token) {
  const admins = await supa("portal_profiles?role=eq.admin&select=user_id", token);
  if (admins.length !== 1) throw Error("Für den automatischen Abruf muss genau ein Admin festgelegt sein.");
  return admins[0].user_id;
}
function findGame(text, games) {
  // Never guess when more than one game matches, or when the evidence is weak.
  const normalized = clean(text.slice(0, 120000));
  const possibles = games.filter(g => !g.pdf_id);
  const exact = possibles.filter(g => String(g.game_key || "").length >= 8 && text.includes(String(g.game_key)));
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return null;
  const matched = possibles.filter(g => {
    const date = String(g.match_date || "");
    const [year, month, day] = date.split("-");
    const hasDate = date && (text.includes(date) || text.includes(day + "." + month + "." + year) || text.includes(day + "." + month + "." + year.slice(-2)) || text.includes(day + "/" + month + "/" + year));
    const bothTeams = contained(normalized, clean(g.home)) && contained(normalized, clean(g.away));
    const bothPeople = contained(normalized, clean(g.referee_name)) && contained(normalized, clean(g.coach_name));
    return (hasDate && (bothTeams || bothPeople)) || (bothTeams && bothPeople);
  });
  return matched.length === 1 ? matched[0] : null;
}
async function uploadPdf(token, path, bytes) {
  const r = await fetch(SB + "/storage/v1/object/" + BUCKET + "/" + path.split("/").map(encodeURIComponent).join("/"), {
    method: "POST", headers: { apikey: PUBLIC, authorization: "Bearer " + token, "Content-Type": "application/pdf", "x-upsert": "false" },
    body: bytes, signal: AbortSignal.timeout(20000)
  });
  if (!r.ok && r.status !== 409) throw Error("PDF-Speicherung fehlgeschlagen (" + r.status + ")");
}
async function pdfText(bytes) {
  let parser;
  try {
    const { CanvasFactory } = await import("pdf-parse/worker");
    const { PDFParse } = await import("pdf-parse");
    parser = new PDFParse({ data: new Uint8Array(bytes), CanvasFactory });
    const out = await parser.getText();
    return String(out?.text || "").slice(0, 120000);
  } catch (err) {
    console.warn("Eingangs-PDF ohne auswertbaren Text:", String(err?.message || err).slice(0, 130));
    return "";
  } finally { if (parser) try { await parser.destroy(); } catch {} }
}
async function storeAttachment({ token, ownerId, messageId, message, attachment, games }) {
  const bytes = attachment.content;
  if (!Buffer.isBuffer(bytes) || bytes.length < 10 || bytes.length > MAX_PDF || bytes.subarray(0, 5).toString() !== "%PDF-") return "ignored";
  const hash = createHash("sha256").update(bytes).digest("hex");
  const existing = await supa("portal_mail_imports?owner_id=eq." + ownerId + "&sha256=eq." + hash + "&select=document_id", token);
  if (existing.length) return "duplicate";
  const docId = deterministicId(ownerId, hash);
  const tombstones = await supa("portal_deleted_observations?owner_id=eq." + ownerId + "&document_id=eq." + docId + "&select=document_id", token);
  if (tombstones.length) return "duplicate";
  const safeName = String(attachment.filename || "E-Mail-Beobachtungsbogen.pdf").replace(/[\\/\u0000-\u001f]/g, "_").slice(0, 200);
  const path = ownerId + "/" + docId + ".pdf";
  await uploadPdf(token, path, bytes);
  const extracted = await pdfText(bytes);
  const context = [message.subject || "", safeName, message.text || "", extracted].join("\n");
  const game = findGame(context, games);
  const doc = { owner_id: ownerId, document_id: docId, game_key: null, referee_id: null, coach_id: null, file_name: safeName, storage_path: path };
  await supa("portal_observations?on_conflict=owner_id,document_id", token, {
    method: "POST", prefer: "resolution=ignore-duplicates,return=representation", body: doc
  });
  let assignedGame = null;
  if (game) {
    const now = new Date().toISOString();
    const changed = await supa("portal_games?owner_id=eq." + ownerId + "&game_key=eq." + encodeURIComponent(game.game_key) + "&pdf_id=is.null", token, {
      method: "PATCH", body: { pdf_id: docId, received_at: now, checked_at: null, review_status: "eingegangen", updated_at: now }
    });
    if (changed.length === 1) {
      await supa("portal_observations?owner_id=eq." + ownerId + "&document_id=eq." + docId, token, {
        method: "PATCH", body: { game_key: game.game_key, referee_id: game.referee_id || null, coach_id: game.coach_id || null }
      });
      assignedGame = game.game_key;
      game.pdf_id = docId;
    }
  }
  await supa("portal_mail_imports?on_conflict=owner_id,sha256", token, {
    method: "POST", prefer: "resolution=ignore-duplicates,return=representation",
    body: {
      owner_id: ownerId, sha256: hash, message_uid: messageId, document_id: docId,
      sender: message.from?.value?.[0]?.address?.slice(0, 254) || null,
      received_at: message.date && !Number.isNaN(new Date(message.date).valueOf()) ? new Date(message.date).toISOString() : null,
      subject: String(message.subject || "").slice(0, 300), file_name: safeName, assigned_game_key: assignedGame
    }
  });
  return assignedGame ? "assigned" : "unassigned";
}
async function importMail(token, ownerId) {
  const host = process.env.EMAIL_IMAP_HOST || "imap.web.de";
  const port = Number(process.env.EMAIL_IMAP_PORT || 993);
  if (process.env.EMAIL_ENABLED !== "true" || !process.env.EMAIL_USER || !process.env.EMAIL_PASS) throw Error("WEB.DE-Zugang in Vercel noch nicht vollständig eingerichtet.");
  if (host !== "imap.web.de" || port !== 993) throw Error("IMAP-Host und Port müssen imap.web.de:993 sein.");
  const client = new ImapFlow({
    host, port, secure: true, auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
    logger: false, connectionTimeout: 12000, greetingTimeout: 12000, socketTimeout: 20000
  });
  client.on("error", err => console.error("WEB.DE-IMAP:", String(err?.message || err).slice(0, 180)));
  const count = { scanned: 0, imported: 0, assigned: 0, unassigned: 0, duplicate: 0, ignored: 0, failed: 0 };
  const games = await supa("portal_games?owner_id=eq." + ownerId + "&select=game_key,match_date,home,away,referee_name,coach_name,referee_id,coach_id,pdf_id&limit=1000", token);
  await client.connect();
  try {
    const lock = await client.getMailboxLock("INBOX", { readOnly: true });
    try {
      const since = new Date(Date.now() - 21 * 86400000);
      const uids = await client.search({ since }, { uid: true });
      if (!Array.isArray(uids) || !uids.length) return count;
      const selected = uids.slice(-MAX_MESSAGES).reverse();
      for (const uid of selected) {
        count.scanned++;
        try {
          const data = await client.fetchOne(String(uid), { source: true }, { uid: true });
          if (!data?.source || data.source.length > 16 * 1024 * 1024) { count.ignored++; continue; }
          const msg = await simpleParser(data.source, { skipHtmlToText: true, skipTextToHtml: true, maxHtmlLengthToParse: 0 });
          const attached = (msg.attachments || []).filter(a => /\.pdf$/i.test(a.filename || "") || a.contentType === "application/pdf");
          for (const part of attached.slice(0, 6)) {
            const state = await storeAttachment({ token, ownerId, messageId: String(client.mailbox.uidValidity || "") + ":" + uid, message: msg, attachment: part, games });
            count[state]++; if (state === "assigned" || state === "unassigned") count.imported++;
          }
        } catch (err) {
          count.failed++;
          console.error("WEB.DE-PDF konnte nicht verarbeitet werden:", String(err?.message || err).slice(0, 200));
        }
      }
    } finally { lock.release(); }
  } finally { try { await client.logout(); } catch { client.close(); } }
  return count;
}
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET" && req.method !== "POST") return respond(res, 405, { error: "Nur GET oder POST." });
  let token, ownerId;
  try {
    if (req.method === "GET") {
      const secret = process.env.CRON_SECRET;
      if (!secret || req.headers.authorization !== "Bearer " + secret) return respond(res, 401, { error: "Nicht autorisiert." });
      token = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!token) return respond(res, 503, { error: "SUPABASE_SERVICE_ROLE_KEY fehlt in Vercel. Manuelle Admin-Abholung ist bereits möglich." });
      ownerId = await cronAdmin(token);
    } else {
      token = String(req.headers.authorization || "").match(/^Bearer (.+)$/)?.[1];
      if (!token) return respond(res, 401, { error: "Bitte im Coachingportal anmelden." });
      ownerId = await authenticatedAdmin(token);
    }
    const counts = await importMail(token, ownerId);
    return respond(res, 200, { ok: true, ...counts });
  } catch (err) {
    console.error("Mail-Import:", String(err?.message || err).slice(0, 250));
    return respond(res, 503, { error: String(err?.message || err).slice(0, 240) });
  }
}
