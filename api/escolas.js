import { createSchoolLeadHandler } from "../lib/school-lead-handler.js";

export const POST = createSchoolLeadHandler();

export function GET() {
  return new Response(JSON.stringify({ error: "Método não permitido." }), { status: 405, headers: { "Allow": "POST", "Content-Type": "application/json", "Cache-Control": "no-store" } });
}
