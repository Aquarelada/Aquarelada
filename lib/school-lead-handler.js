import { createHash, randomUUID } from "node:crypto";
import { schoolEmailContent, validateSchoolLead } from "./school-leads.js";

const NOTIFY_TO = "editora@aquarelada.com.br";
const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers } });

async function createRedis(env) {
  if (!env.KV_REST_API_URL || !env.KV_REST_API_TOKEN) return null;
  const { Redis } = await import("@upstash/redis");
  return new Redis({ url: env.KV_REST_API_URL, token: env.KV_REST_API_TOKEN });
}

export function createSchoolLeadHandler({ env = process.env, fetchImpl = globalThis.fetch, redisFactory = createRedis } = {}) {
  return async function handleSchoolLead(request) {
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin) return json({ error: "Origem não permitida." }, 403);
    if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return json({ error: "Envie o formulário em formato JSON." }, 415);
    let body;
    try {
      const raw = await request.text();
      if (raw.length > 16384) return json({ error: "Formulário muito grande." }, 413);
      body = JSON.parse(raw);
    } catch { return json({ error: "Não foi possível ler o formulário." }, 400); }
    const { value, errors } = validateSchoolLead(body);
    if (!value) return json({ error: "Confira os campos indicados e tente novamente.", errors }, 400);
    if (!env.RESEND_API_KEY || !env.LEAD_FROM_EMAIL) {
      console.error("school-lead: missing email configuration");
      return json({ error: "O envio está temporariamente indisponível. Tente novamente em instantes." }, 503);
    }

    const id = body.submissionId || randomUUID();
    const fingerprint = createHash("sha256").update(JSON.stringify(value)).digest("hex");
    const storageKey = `school:submission:${id}`;
    let redis = null;
    let existing = null;
    try {
      redis = await redisFactory(env);
      if (redis) {
        existing = await redis.get(storageKey);
        if (existing && existing.fingerprint !== fingerprint) return json({ error: "O formulário foi alterado. Atualize a página e tente novamente." }, 409);
        if (existing?.notificationSent && existing?.confirmationSent) return json({ success: true, leadId: id, confirmationSent: true });
        const ip = (request.headers.get("x-vercel-forwarded-for") || request.headers.get("x-forwarded-for") || "").split(",")[0].trim();
        if (ip) {
          const key = `school:rate:${createHash("sha256").update(ip).digest("hex").slice(0, 32)}`;
          const count = await redis.incr(key);
          if (count === 1) await redis.expire(key, 600);
          if (count > 8) return json({ error: "Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente." }, 429, { "Retry-After": "600" });
        }
      }
    } catch { console.warn("school-lead: storage lookup unavailable", { leadId: id }); }

    const lead = { ...value, id, fingerprint, createdAt: existing?.createdAt || new Date().toISOString(), notificationSent: existing?.notificationSent || false, confirmationSent: existing?.confirmationSent || false, notificationId: existing?.notificationId, confirmationId: existing?.confirmationId };
    const save = async () => {
      if (!redis) return;
      try {
        await redis.set(storageKey, lead);
        await redis.zadd("school:submissions", { score: new Date(lead.createdAt).getTime(), member: id });
      } catch { console.warn("school-lead: storage write unavailable", { leadId: id }); }
    };
    const send = async (type, message) => {
      const response = await fetchImpl("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json", "Idempotency-Key": `school-${id}-${type}` },
        body: JSON.stringify(message),
        signal: AbortSignal.timeout(12000)
      });
      if (!response.ok) {
        const error = new Error("Email provider rejected the request");
        error.status = response.status;
        throw error;
      }
      const receipt = await response.json();
      if (!receipt.id) throw new Error("provider-missing-receipt");
      return receipt.id;
    };
    const content = schoolEmailContent(lead);
    await save();
    try {
      if (!lead.notificationSent) {
        lead.notificationId = await send("notification", { from: env.LEAD_FROM_EMAIL, to: [NOTIFY_TO], reply_to: lead.email, subject: `[Aquarelada Escolas] ${lead.schoolName.replace(/[\r\n]/g, " ")}`, html: content.notificationHtml, text: content.notificationText });
        lead.notificationSent = true;
        await save();
      }
    } catch (error) {
      console.error("school-lead: notification failed", { leadId: id, providerStatus: error.status, timeout: error.name === "TimeoutError" });
      return json({ error: "Não foi possível enviar seu cadastro agora. Seus dados continuam preenchidos; tente novamente." }, 502);
    }
    try {
      if (!lead.confirmationSent) {
        lead.confirmationId = await send("confirmation", { from: env.LEAD_REPLY_FROM || env.LEAD_FROM_EMAIL, to: [lead.email], reply_to: NOTIFY_TO, subject: "Recebemos seu contato — Aquarelada Editora", html: content.confirmationHtml, text: content.confirmationText });
        lead.confirmationSent = true;
      }
    } catch (error) { console.error("school-lead: confirmation failed", { leadId: id, providerStatus: error.status, timeout: error.name === "TimeoutError" }); }
    await save();
    console.info("school-lead: processed", { leadId: id, notificationId: lead.notificationId, confirmationId: lead.confirmationId, confirmationSent: lead.confirmationSent });
    return json({ success: true, leadId: id, confirmationSent: lead.confirmationSent });
  };
}
