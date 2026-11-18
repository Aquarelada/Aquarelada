(() => {
  const heroButton = document.getElementById("hero-cta");
  const capture = document.getElementById("cadastro");
  const mobileAction = document.getElementById("mobile-action");
  if (heroButton && capture && mobileAction && "IntersectionObserver" in window) {
    let heroVisible = true, captureVisible = false;
    const update = () => { mobileAction.hidden = heroVisible || captureVisible; };
    new IntersectionObserver(([entry]) => { heroVisible = entry.isIntersecting; update(); }).observe(heroButton);
    new IntersectionObserver(([entry]) => { captureVisible = entry.isIntersecting; update(); }).observe(capture);
  }
  const privacy = document.getElementById("privacy-dialog");
  document.getElementById("open-privacy")?.addEventListener("click", () => {
    const frame = document.getElementById("privacy-frame");
    if (!frame.getAttribute("src")) frame.src = "/politicas";
    privacy.showModal();
  });
  document.getElementById("close-privacy")?.addEventListener("click", () => privacy.close());

  const form = document.getElementById("school-form");
  if (!form) return;
  const steps = Array.from(form.querySelectorAll(".form-step"));
  const back = document.getElementById("form-back"), next = document.getElementById("form-next"), submit = document.getElementById("form-submit");
  const feedback = document.getElementById("school-form-feedback");
  const titles = ["Seu perfil", "Planejamento da escola", "Identificação e contato"];
  let current = 0, sending = false, submissionId = null;
  function showStep(index, focus = true) {
    current = index;
    steps.forEach((step, number) => { step.hidden = number !== index; });
    back.hidden = index === 0;
    next.hidden = index === steps.length - 1;
    submit.hidden = index !== steps.length - 1;
    document.getElementById("form-step-label").textContent = `Etapa ${index + 1} de ${steps.length} · ${titles[index]}`;
    document.getElementById("form-progress").value = index + 1;
    feedback.textContent = "";
    if (focus) {
      steps[index].tabIndex = -1;
      steps[index].focus({ preventScroll: true });
      form.scrollIntoView({ block: "start", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
    }
  }
  function validateStep(index) {
    const phone = document.getElementById("school-whatsapp");
    if (steps[index].contains(phone)) {
      let digits = phone.value.replace(/\D/g, "");
      if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) digits = digits.slice(2);
      phone.setCustomValidity(phone.value && (!/^\d{10,11}$/.test(digits) || Number(digits.slice(0, 2)) < 11 || /^(\d)\1+$/.test(digits)) ? "Informe o WhatsApp com DDD, incluindo 10 ou 11 dígitos." : "");
    }
    const invalid = Array.from(steps[index].querySelectorAll("input")).find((input) => !input.checkValidity());
    if (!invalid) return true;
    if (current !== index) showStep(index);
    feedback.textContent = "Preencha os campos obrigatórios para continuar.";
    invalid.reportValidity();
    return false;
  }
  next.addEventListener("click", () => { if (validateStep(current)) showStep(current + 1); });
  back.addEventListener("click", () => showStep(current - 1));
  form.addEventListener("input", (event) => {
    if (sending) return;
    submissionId = null;
    feedback.textContent = "";
    for (const input of form.querySelectorAll("input")) if (input.name === event.target.name) input.setCustomValidity("");
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (sending) return;
    if (current < steps.length - 1) { if (validateStep(current)) showStep(current + 1); return; }
    for (let index = 0; index < steps.length; index++) if (!validateStep(index)) return;
    submissionId ||= crypto.randomUUID();
    const query = new URLSearchParams(location.search);
    const payload = { ...Object.fromEntries(new FormData(form)), submissionId, attribution: {
      landingPage: `${location.origin}${location.pathname}${location.search}`, referrer: document.referrer,
      source: query.get("utm_source") || query.get("source") || "landing-escolas", medium: query.get("utm_medium") || "",
      campaign: query.get("utm_campaign") || "", content: query.get("utm_content") || "", term: query.get("utm_term") || ""
    } };
    sending = true;
    const controls = Array.from(form.querySelectorAll("input, button"));
    controls.forEach((control) => { control.disabled = true; });
    form.setAttribute("aria-busy", "true");
    submit.textContent = "Enviando cadastro...";
    feedback.textContent = "";
    try {
      const response = await fetch("/api/escolas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), signal: AbortSignal.timeout(30000) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) {
        const key = Object.keys(result.errors || {}).find((name) => name !== "form" && form.querySelector(`input[name="${CSS.escape(name)}"]`));
        if (key) {
          const input = form.querySelector(`input[name="${CSS.escape(key)}"]`);
          showStep(steps.findIndex((step) => step.contains(input)));
          input.setCustomValidity(result.errors[key]);
        }
        throw new Error(result.error || "Não foi possível enviar agora. Tente novamente.");
      }
      form.hidden = true;
      form.reset();
      document.getElementById("school-form-description").hidden = true;
      document.getElementById("form-title").textContent = "Seu cadastro foi recebido.";
      document.getElementById("form-success-message").textContent = result.confirmationSent
        ? "Enviamos um e-mail de agradecimento para o endereço informado. O autor entrará em contato para apresentar a proposta e conversar sobre a adoção escolar."
        : "Recebemos suas informações. O autor entrará em contato para apresentar a proposta e conversar sobre a adoção escolar.";
      const success = document.getElementById("form-success");
      success.hidden = false;
      success.focus();
    } catch (error) {
      feedback.textContent = error.name === "TimeoutError" ? "O envio está demorando. Seus dados continuam preenchidos; tente novamente." : error.message || "Não foi possível enviar agora. Tente novamente.";
    } finally {
      sending = false;
      controls.forEach((control) => { control.disabled = false; });
      form.removeAttribute("aria-busy");
      submit.textContent = "Quero receber a apresentação";
    }
  });
  showStep(0, false);
})();
