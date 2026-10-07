/* Proteção Veicular RN · animações + simulador. Sem dependências. */
(() => {
  const CFG = window.CFG || {};
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduz = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const temZap = /^\d{10,13}$/.test(CFG.whatsapp || "");
  const linkZap = (texto) => `https://wa.me/${CFG.whatsapp}?text=${encodeURIComponent(texto)}`;

  // --- título por palavras (efeito de assinatura) ---
  const h1 = $(".palavras");
  if (h1 && !reduz) {
    h1.innerHTML = h1.textContent.trim().split(/\s+/)
      .map((w, i) => `<span class="w" style="--i:${i}">${w}</span>`).join(" ");
  }

  // --- contador do preço ---
  const cont = $("[data-contador]");
  if (cont) {
    const alvo = parseFloat(cont.dataset.contador.replace(",", "."));
    const fmt = (v) => v.toFixed(2).replace(".", ",");
    if (reduz) cont.textContent = fmt(alvo);
    else {
      const t0 = performance.now() + 500, dur = 1200;
      const passo = (t) => {
        const p = Math.min(1, Math.max(0, (t - t0) / dur));
        cont.textContent = fmt(alvo * (1 - Math.pow(1 - p, 3)));
        if (p < 1) requestAnimationFrame(passo);
      };
      requestAnimationFrame(passo);
    }
  }

  // --- revelação na rolagem ---
  const alvos = $$(".rv");
  if (reduz || !("IntersectionObserver" in window)) alvos.forEach((e) => e.classList.add("in"));
  else {
    const io = new IntersectionObserver((ents) => ents.forEach((e) => {
      if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
    }), { rootMargin: "0px 0px -10% 0px", threshold: .1 });
    alvos.forEach((e) => io.observe(e));
  }

  // --- menu mobile (irmão do header, nunca filho) ---
  const btnMenu = $(".menu-btn"), menu = $("#menu-mobile");
  const fecharMenu = () => { menu.hidden = true; btnMenu.setAttribute("aria-expanded", "false"); document.documentElement.style.overflow = ""; };
  btnMenu?.addEventListener("click", () => {
    const abrir = menu.hidden;
    menu.hidden = !abrir;
    btnMenu.setAttribute("aria-expanded", String(abrir));
    document.documentElement.style.overflow = abrir ? "hidden" : "";
  });
  $$("a", menu).forEach((a) => a.addEventListener("click", fecharMenu));

  // --- links de WhatsApp: viram wa.me se o número existe; senão vão pro simulador ---
  $$("[data-zap]").forEach((a) => {
    if (temZap) { a.href = linkZap(a.dataset.zap); a.target = "_blank"; a.rel = "noopener"; }
  });

  // --- seja consultor: só aparece se há como chamar ---
  const secEquipe = $("#seja-consultor"), btnEquipe = $("[data-equipe]");
  if (secEquipe && (CFG.equipeUrl || temZap)) {
    secEquipe.hidden = false;
    btnEquipe.href = CFG.equipeUrl || linkZap("Olá! Vi no site e quero saber como ser consultor 21Go no RN.");
    btnEquipe.target = "_blank"; btnEquipe.rel = "noopener";
  }

  // --- plano pré-selecionado ---
  const campoPlano = $("#plano");
  $$("[data-plano]").forEach((a) => a.addEventListener("click", () => { campoPlano.value = a.dataset.plano; }));

  // --- simulador em 2 etapas ---
  const form = $("#form-lead");
  if (!form) return;
  const etapas = $$(".etapa", form), rotulo = $("[data-etapa-atual]", form);
  const irPara = (n) => {
    etapas.forEach((e) => { const ativa = e.dataset.etapa === String(n); e.classList.toggle("ativa", ativa); if (e.classList.contains("sucesso")) e.hidden = !ativa; });
    form.classList.toggle("etapa-2", n >= 2);
    if (rotulo) rotulo.textContent = Math.min(n, 2);
    if (n === 3) $(".etapa-rotulo", form).hidden = true;
    $(`.etapa[data-etapa="${n}"] input:not([type=hidden]):not([type=radio]):not([type=checkbox])`, form)?.focus({ preventScroll: true });
  };
  const mostrarErros = (erros) => {
    $$("[data-erro]", form).forEach((s) => (s.textContent = ""));
    $$("[aria-invalid]", form).forEach((i) => i.removeAttribute("aria-invalid"));
    for (const [campo, msg] of Object.entries(erros)) {
      const s = $(`[data-erro="${campo}"]`, form); if (s) s.textContent = msg;
      const i = form.elements[campo]; if (i && i.setAttribute) i.setAttribute("aria-invalid", "true");
    }
  };
  const anoAtual = new Date().getFullYear();
  const validarEtapa1 = () => {
    const erros = {};
    if (form.modelo.value.trim().length < 2) erros.modelo = "Diga o modelo do veículo.";
    const ano = Number(form.ano.value);
    if (!/^\d{4}$/.test(form.ano.value) || ano < 1980 || ano > anoAtual + 1) erros.ano = "Ano inválido.";
    return erros;
  };
  const validarEtapa2 = () => {
    const erros = {};
    if (!/\S+\s+\S+/.test(form.nome.value.trim())) erros.nome = "Digite seu nome e sobrenome.";
    const dig = form.whatsapp.value.replace(/\D/g, "");
    if (dig.length < 10 || dig.length > 13) erros.whatsapp = "WhatsApp com DDD, só números.";
    return erros;
  };

  $("[data-proximo]", form).addEventListener("click", () => {
    const erros = validarEtapa1(); mostrarErros(erros);
    if (!Object.keys(erros).length) irPara(2);
  });
  $("[data-voltar]", form).addEventListener("click", () => irPara(1));

  // máscara leve do telefone
  form.whatsapp.addEventListener("input", () => {
    const d = form.whatsapp.value.replace(/\D/g, "").slice(0, 11);
    form.whatsapp.value = d.length > 6 ? `(${d.slice(0, 2)}) ${d.slice(2, d.length - 4)}-${d.slice(-4)}`
      : d.length > 2 ? `(${d.slice(0, 2)}) ${d.slice(2)}` : d;
  });

  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const erros = validarEtapa2(); mostrarErros(erros);
    if (Object.keys(erros).length) return;
    const btn = $('button[type="submit"]', form); btn.setAttribute("aria-busy", "true");
    const fd = new FormData(form), dados = Object.fromEntries(fd.entries());
    try {
      const r = await fetch("/api/leads", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(dados) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { mostrarErros(j.erros || { geral: j.erro || "Não deu pra enviar. Tente de novo." }); return; }
    } catch {
      mostrarErros({ geral: "Sem conexão. Tente de novo em instantes." }); return;
    } finally { btn.removeAttribute("aria-busy"); }

    const extras = [dados.app && "uso em app", dados.leilao && "leilão", dados.temSeguro && "tenho seguro"].filter(Boolean).join(", ");
    const msg = `Olá! Fiz a simulação no site.\nNome: ${dados.nome}\nVeículo: ${dados.tipo} ${dados.modelo} ${dados.ano}\nCidade: ${dados.cidade}` +
      (extras ? `\nPerfil: ${extras}` : "") + (dados.plano ? `\nPlano de interesse: ${dados.plano}` : "");
    const abrir = $("[data-abrir-zap]", form), txt = $("[data-sucesso-txt]", form);
    if (temZap) {
      abrir.href = linkZap(msg); abrir.target = "_blank"; abrir.rel = "noopener";
      irPara(3);
      setTimeout(() => window.open(abrir.href, "_blank", "noopener"), 400);
    } else {
      txt.textContent = "Recebi sua simulação. Vou te chamar no WhatsApp informado com os valores para o seu veículo.";
      abrir.hidden = true;
      irPara(3);
    }
  });

  $("[data-ano]").textContent = new Date().getFullYear();
})();
