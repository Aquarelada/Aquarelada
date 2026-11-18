export const SCHOOL_QUESTIONS = {
  role: {
    label: "Qual é o seu cargo na escola?",
    options: { professor: "Professor(a)", coordenador: "Coordenador(a) pedagógico(a)", diretor: "Diretor(a)", proprietario: "Proprietário(a) / Mantenedor(a)" }
  },
  schoolType: { label: "A escola é:", options: { particular: "Particular", publica: "Pública" } },
  segments: {
    label: "Quais segmentos a escola atende?",
    options: { infantil: "Somente Educação Infantil", "fundamental-1": "Somente Ensino Fundamental I (1º ao 5º ano)", ambos: "Ambos" }
  },
  evaluatesBooks: {
    label: "A coordenação costuma avaliar livros paradidáticos para adotar e trabalhar com as turmas?",
    options: { sim: "Sim", "metodo-definido": "Não, já vem pré definido pelo método de ensino." }
  },
  nextYearSelected: { label: "Os livros paradidáticos para o próximo ano já foram escolhidos?", options: { sim: "Sim", nao: "Não" } }
};

const CONTACT_FIELDS = { name: ["Nome completo", 150], schoolName: ["Nome da escola", 200], whatsapp: ["WhatsApp (com DDD)", 25], email: ["E-mail", 254] };
const text = (value, max = 300) => typeof value === "string" ? value.trim().slice(0, max) : "";
const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);

export function normalizeSchoolPhone(value) {
  let digits = String(value ?? "").replace(/\D/g, "");
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) digits = digits.slice(2);
  if (!/^\d{10,11}$/.test(digits) || Number(digits.slice(0, 2)) < 11 || /^(\d)\1+$/.test(digits)) return "";
  return `+55${digits}`;
}

export function validateSchoolLead(body) {
  const errors = {};
  const value = {};
  if (!body || typeof body !== "object" || Array.isArray(body)) return { errors: { form: "Preencha os dados do formulário." } };
  if (body.website) return { errors: { form: "Não foi possível validar o formulário. Atualize a página e tente novamente." } };
  for (const [key, question] of Object.entries(SCHOOL_QUESTIONS)) {
    if (typeof body[key] !== "string" || !Object.hasOwn(question.options, body[key])) errors[key] = "Selecione uma das opções.";
    else value[key] = body[key];
  }
  for (const [key, [label, max]] of Object.entries(CONTACT_FIELDS)) {
    const raw = body[key];
    if (typeof raw !== "string" || raw.trim().length < 2 || raw.length > max) errors[key] = `Preencha ${label.toLowerCase()} corretamente.`;
    else value[key] = raw.trim();
  }
  if (!errors.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email)) errors.email = "Informe um e-mail válido.";
  if (!errors.whatsapp) {
    const normalized = normalizeSchoolPhone(value.whatsapp);
    if (!normalized) errors.whatsapp = "Informe o WhatsApp com DDD, incluindo 10 ou 11 dígitos.";
    else value.whatsapp = normalized;
  }
  if (body.submissionId != null && !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(body.submissionId)) errors.form = "Atualize a página e tente novamente.";
  if (Object.keys(errors).length) return { errors };
  value.email = value.email.toLowerCase();
  const attribution = body.attribution && typeof body.attribution === "object" ? body.attribution : {};
  value.attribution = Object.fromEntries(["landingPage", "referrer", "source", "medium", "campaign", "content", "term"].map((key) => [key, text(attribution[key], 1000)]));
  value.privacyNoticeVersion = "2026-11-18";
  return { value, errors: {} };
}

export function schoolEmailContent(lead) {
  const rows = [
    ["Nome completo", lead.name], ["Nome da escola", lead.schoolName], ["WhatsApp", lead.whatsapp], ["E-mail", lead.email],
    ...Object.entries(SCHOOL_QUESTIONS).map(([key, question]) => [question.label, question.options[lead[key]]]),
    ["Recebido em", new Date(lead.createdAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })],
    ["Página", lead.attribution.landingPage], ["Origem", lead.attribution.source], ["Campanha", lead.attribution.campaign], ["Referência", lead.id]
  ];
  const notificationText = ["Novo contato de escola — Aquarelada", ...rows.map(([label, answer]) => `${label}: ${answer || "Não informada"}`)].join("\n\n");
  const notificationHtml = `<div style="font-family:Arial,sans-serif;color:#20372f;line-height:1.6;max-width:680px"><h1 style="font-size:24px">Novo contato de escola</h1><p>Cadastro recebido pela landing page de escolas da Aquarelada Editora.</p><table style="border-collapse:collapse;width:100%">${rows.map(([label, answer]) => `<tr><th style="text-align:left;vertical-align:top;padding:10px;border-bottom:1px solid #ddd;width:42%">${escape(label)}</th><td style="padding:10px;border-bottom:1px solid #ddd;overflow-wrap:anywhere">${escape(answer || "Não informada")}</td></tr>`).join("")}</table><p>Responda a este e-mail para falar com o interessado. O exemplar físico depende de seleção após análise.</p></div>`;
  const confirmationText = `Olá, ${lead.name}!\n\nObrigado pelo interesse no livro “Um Dia Diferente, Como Era Antigamente!” e nos materiais de apoio para escolas. Recebemos o seu cadastro.\n\nO autor, Leandro Dimov, entrará em contato com você pelo WhatsApp. O contato será feito pelo número (11) 98151-9590, para apresentar a proposta e conversar sobre as possibilidades de adoção escolar.\n\nAlgumas escolas serão selecionadas, após análise dos cadastros, para receber um exemplar físico gratuito para avaliação. O cadastro não garante o envio do livro.\n\nAté breve!\nAquarelada Editora`;
  const confirmationHtml = `<div style="font-family:Arial,sans-serif;color:#20372f;line-height:1.7;max-width:600px"><h1 style="font-size:24px">Obrigado pelo contato!</h1>${confirmationText.split("\n\n").map((paragraph) => `<p>${escape(paragraph).replace(/\n/g, "<br>")}</p>`).join("")}</div>`;
  return { notificationText, notificationHtml, confirmationText, confirmationHtml };
}
