import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createSchoolLeadHandler } from "../lib/school-lead-handler.js";
import { normalizeSchoolPhone, SCHOOL_QUESTIONS, schoolEmailContent, validateSchoolLead } from "../lib/school-leads.js";
import { GET } from "../api/escolas.js";

const fixture = () => ({ role: "coordenador", schoolType: "particular", segments: "ambos", evaluatesBooks: "sim", nextYearSelected: "nao", name: "Pessoa de Teste", schoolName: "Escola de Teste", whatsapp: "(11) 90000-0000", email: "teste@example.com", website: "", submissionId: "32b8d314-e448-4192-b8a7-124523757768", attribution: { landingPage: "https://preview.example/escolas", source: "teste-integracao", campaign: "teste" } });
const request = (body = fixture(), headers = {}) => new Request("https://preview.example/api/escolas", { method: "POST", headers: { "Content-Type": "application/json", origin: "https://preview.example", ...headers }, body: JSON.stringify(body) });
const env = { RESEND_API_KEY: "test-key", LEAD_FROM_EMAIL: "Aquarelada <sender@example.com>", LEAD_REPLY_FROM: "reply@example.com" };
function memoryRedis() {
  const entries = new Map();
  return { entries, get: async (key) => structuredClone(entries.get(key) ?? null), set: async (key, value) => entries.set(key, structuredClone(value)), zadd: async (key, value) => entries.set(key, value), incr: async (key) => { const value = (entries.get(key) || 0) + 1; entries.set(key, value); return value; }, expire: async () => 1 };
}
function service({ redis = memoryRedis(), fetchImpl, config = env } = {}) {
  const messages = [];
  return { redis, messages, handler: createSchoolLeadHandler({ env: config, redisFactory: async () => redis, fetchImpl: fetchImpl || (async (url, options) => { assert.equal(url, "https://api.resend.com/emails"); messages.push({ message: JSON.parse(options.body), idempotency: options.headers["Idempotency-Key"] }); return Response.json({ id: `email-${messages.length}` }); }) }) };
}

test("every question and every contact field is required", () => {
  for (const key of [...Object.keys(SCHOOL_QUESTIONS), "name", "schoolName", "whatsapp", "email"]) {
    const body = fixture(); delete body[key];
    assert.ok(validateSchoolLead(body).errors[key], key);
  }
  for (const key of Object.keys(SCHOOL_QUESTIONS)) assert.ok(validateSchoolLead({ ...fixture(), [key]: "invalid-choice" }).errors[key]);
});

test("public schools and both planning answers remain valid", () => {
  const body = { ...fixture(), schoolType: "publica", evaluatesBooks: "metodo-definido", nextYearSelected: "sim" };
  assert.deepEqual(validateSchoolLead(body).errors, {});
});

test("Brazilian phone and email validation reject invalid contacts", () => {
  assert.equal(normalizeSchoolPhone("+55 (11) 98151-9590"), "+5511981519590");
  assert.equal(normalizeSchoolPhone("1133334444"), "+551133334444");
  for (const phone of ["123", "00000000000", "(00) 90000-0000", "99999999999999"]) assert.equal(normalizeSchoolPhone(phone), "");
  for (const email of ["teste", "a@b", "a@b.com\nBcc: victim@example.com"]) assert.ok(validateSchoolLead({ ...fixture(), email }).errors.email);
});

test("HTML contains exactly the allowed options, required contacts and one choice per question", () => {
  const html = fs.readFileSync(new URL("../public/escolas/index.html", import.meta.url), "utf8");
  for (const [name, question] of Object.entries(SCHOOL_QUESTIONS)) {
    const inputs = [...html.matchAll(new RegExp(`<input type="radio" name="${name}" value="([^"]+)" required>`, "g"))].map((match) => match[1]);
    assert.deepEqual(inputs, Object.keys(question.options));
  }
  for (const name of ["name", "schoolName", "whatsapp", "email"]) assert.match(html, new RegExp(`<input[^>]+name="${name}"[^>]+required>`));
  assert.equal((html.match(/class="form-step"/g) || []).length, 3);
});

test("invalid fields, bot field, malformed JSON and foreign origins cannot send email", async () => {
  const api = service();
  assert.equal((await api.handler(request({}))).status, 400);
  assert.equal((await api.handler(request({ ...fixture(), website: "spam" }))).status, 400);
  assert.equal((await api.handler(request(fixture(), { origin: "https://other.example" }))).status, 403);
  assert.equal((await api.handler(new Request("https://preview.example/api/escolas", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{oops" }))).status, 400);
  assert.equal(api.messages.length, 0);
  assert.equal(GET().status, 405);
});

test("success emails every answer to the fixed recipient and confirms the author's WhatsApp", async () => {
  const api = service();
  const response = await api.handler(request({ ...fixture(), notifyTo: "attacker@example.com" }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { success: true, leadId: fixture().submissionId, confirmationSent: true });
  assert.equal(api.messages.length, 2);
  const notification = api.messages[0].message, confirmation = api.messages[1].message;
  assert.deepEqual(notification.to, ["editora@aquarelada.com.br"]);
  assert.equal(notification.reply_to, "teste@example.com");
  for (const [key, question] of Object.entries(SCHOOL_QUESTIONS)) assert.ok(notification.text.includes(question.options[fixture()[key]]));
  assert.ok(notification.text.includes("Escola de Teste"));
  assert.deepEqual(confirmation.to, ["teste@example.com"]);
  assert.ok(confirmation.text.includes("Leandro Dimov"));
  assert.ok(confirmation.text.includes("(11) 98151-9590"));
  assert.ok(confirmation.text.includes("O cadastro não garante"));
  assert.equal(confirmation.attachments, undefined);
  assert.ok(api.redis.entries.has(`school:submission:${fixture().submissionId}`));
  assert.ok(!api.redis.entries.has("leads:all"));
  assert.equal((await api.handler(request())).status, 200);
  assert.equal(api.messages.length, 2, "retry must not duplicate either email");
});

test("notification failures are not falsely reported as successful submissions", async (t) => {
  t.mock.method(console, "error", () => {});
  let calls = 0;
  const api = service({ fetchImpl: async () => { calls++; return Response.json({ error: "provider unavailable" }, { status: 500 }); } });
  assert.equal((await api.handler(request())).status, 502);
  assert.equal(calls, 1, "confirmation is not sent before the internal notification");
  assert.equal(api.redis.entries.get(`school:submission:${fixture().submissionId}`).notificationSent, false);
});

test("confirmation failure does not lose the lead; retry only resends the pending confirmation", async (t) => {
  t.mock.method(console, "error", () => {});
  let calls = 0;
  const api = service({ fetchImpl: async () => { calls++; return calls === 2 ? Response.json({}, { status: 500 }) : Response.json({ id: `receipt-${calls}` }); } });
  const first = await api.handler(request());
  assert.equal(first.status, 200);
  assert.equal((await first.json()).confirmationSent, false);
  const second = await api.handler(request());
  assert.equal((await second.json()).confirmationSent, true);
  assert.equal(calls, 3, "the internal notification was not repeated");
  assert.equal(api.redis.entries.get(`school:submission:${fixture().submissionId}`).notificationId, "receipt-1");
});

test("missing configuration, changed retries and rate limits are reported honestly", async (t) => {
  t.mock.method(console, "error", () => {});
  assert.equal((await service({ config: {} }).handler(request())).status, 503);
  const api = service(); await api.handler(request());
  assert.equal((await api.handler(request({ ...fixture(), schoolName: "Outra escola" }))).status, 409);
  const blocked = service({ redis: { get: async () => null, incr: async () => 9 } });
  assert.equal((await blocked.handler(request(fixture(), { "x-forwarded-for": "192.0.2.1" }))).status, 429);
  assert.equal(blocked.messages.length, 0);
});

test("email templates escape submitted HTML", () => {
  const { value } = validateSchoolLead({ ...fixture(), name: '<img src=x onerror="alert(1)">' });
  const content = schoolEmailContent({ ...value, id: "test", createdAt: new Date().toISOString() });
  assert.ok(!content.notificationHtml.includes("<img"));
  assert.ok(!content.confirmationHtml.includes("<img"));
  assert.ok(content.notificationHtml.includes("&lt;img"));
});
