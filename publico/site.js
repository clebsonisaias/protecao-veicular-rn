/* Proteção Veicular RN · pedido de cotação. Sem dependências. */
(() => {
  const CFG = window.CFG || {};
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduz = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const temZap = /^\d{10,13}$/.test(CFG.whatsapp || "");
  const linkZap = (texto) => `https://wa.me/${CFG.whatsapp}?text=${encodeURIComponent(texto)}`;

  $("[data-ano]").textContent = new Date().getFullYear();

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

  // --- links de WhatsApp: viram wa.me se o número existe; senão vão pro formulário ---
  $$("[data-zap]").forEach((a) => {
    if (temZap) { a.href = linkZap(a.dataset.zap); a.target = "_blank"; a.rel = "noopener"; }
  });

  const form = $("#cotacao");
  if (!form) return;

  // --- plano pré-selecionado pelos botões da tabela de planos ---
  $$("[data-plano]").forEach((a) => a.addEventListener("click", () => { form.plano.value = a.dataset.plano; }));

  // --- a placa: única animação da página, o exemplo é "digitado" ao carregar ---
  const placa = form.placa, caixaPlaca = $(".placa", form);
  if (!reduz) {
    const exemplo = placa.placeholder;
    placa.placeholder = "";
    [...exemplo].forEach((_, i) => setTimeout(() => { placa.placeholder = exemplo.slice(0, i + 1); }, 500 + i * 110));
  }
  placa.addEventListener("input", () => { placa.value = placa.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 7); });
  form.zeroKm.addEventListener("change", () => {
    placa.disabled = form.zeroKm.checked;
    caixaPlaca.classList.toggle("sem-placa", form.zeroKm.checked);
    if (form.zeroKm.checked) { placa.value = ""; mostrarErros({}); }
  });

  // --- marca, ano e modelo: listas do catálogo da 21Go; se não carregarem, fica o texto livre ---
  const valor = (el) => (el.tagName === "SELECT" ? (el.value ? el.selectedOptions[0].text : "") : el.value.trim());
  const listar = async (q) => {
    const r = await fetch("/api/veiculos?" + new URLSearchParams(q));
    if (!r.ok) throw new Error("lista indisponível");
    return r.json();
  };
  const encher = (sel, itens, vazio) => {
    sel.replaceChildren(new Option(vazio, ""), ...itens.map((o) => new Option(o.text, o.id)));
    sel.disabled = !itens.length;
  };
  const virarSelect = (nome) => {
    const antigo = form.elements[nome], sel = document.createElement("select");
    sel.id = antigo.id; sel.name = nome; sel.required = true;
    antigo.replaceWith(sel);
    return sel;
  };
  const tipoAtual = () => form.querySelector("[name=tipo]:checked").value;
  listar({ tipo: tipoAtual() }).then((marcas) => {
    const marca = virarSelect("marca"), ano = virarSelect("ano"), modelo = virarSelect("modelo");
    const limpar = (deMarca) => {
      if (deMarca) encher(ano, [], "Escolha a marca primeiro");
      encher(modelo, [], "Escolha o ano primeiro");
    };
    const carregar = async (sel, q, vazio, falha) => {
      encher(sel, [], "Carregando...");
      try { encher(sel, await listar(q), vazio); } catch { encher(sel, [], falha); mostrarErros({ [sel.name]: "A lista não carregou. Escolha de novo o campo anterior." }); }
    };
    encher(marca, marcas, "Escolha a marca"); limpar(true);
    $$("[name=tipo]", form).forEach((r) => r.addEventListener("change", () => { limpar(true); carregar(marca, { tipo: tipoAtual() }, "Escolha a marca", "Lista indisponível"); }));
    marca.addEventListener("change", () => { limpar(true); if (marca.value) carregar(ano, { marca: marca.value }, "Escolha o ano", "Lista indisponível"); });
    ano.addEventListener("change", () => { limpar(false); if (ano.value) carregar(modelo, { marca: marca.value, ano: ano.value }, "Escolha o modelo", "Lista indisponível"); });
  }).catch(() => {});

  // --- 3 etapas + sucesso ---
  const ETAPAS = 3;
  const etapas = $$(".etapa", form), rotulo = $("[data-etapa-atual]", form), barra = $(".progresso span", form);
  const irPara = (n) => {
    etapas.forEach((e) => { const ativa = e.dataset.etapa === String(n); e.classList.toggle("ativa", ativa); if (e.classList.contains("sucesso")) e.hidden = !ativa; });
    rotulo.textContent = Math.min(n, ETAPAS);
    barra.style.width = `${(Math.min(n, ETAPAS) / ETAPAS) * 100}%`;
    if (n > ETAPAS) { $(".etapa-rotulo", form).hidden = true; $(".progresso", form).hidden = true; }
    form.scrollIntoView({ block: "nearest" }); // o cartão encolhe entre etapas; não deixa ele sair da tela
    $(`.etapa[data-etapa="${n}"] :is(input:not([type=hidden],[type=radio],[type=checkbox],:disabled),select)`, form)?.focus({ preventScroll: true });
  };
  function mostrarErros(erros) {
    $$("[data-erro]", form).forEach((s) => (s.textContent = ""));
    $$("[aria-invalid]", form).forEach((i) => i.removeAttribute("aria-invalid"));
    for (const [campo, msg] of Object.entries(erros)) {
      const s = $(`[data-erro="${campo}"]`, form); if (s) s.textContent = msg;
      const i = form.elements[campo]; if (i && i.setAttribute) i.setAttribute("aria-invalid", "true");
    }
  }
  const anoAtual = new Date().getFullYear();
  const validar = {
    1: () => (form.zeroKm.checked || /^[A-Z]{3}\d[A-Z0-9]\d{2}$/.test(placa.value) ? {} : { placa: "Placa no formato ABC1D23 ou ABC1234." }),
    2: () => {
      const erros = {};
      if (valor(form.marca).length < 2) erros.marca = "Diga a marca do veículo.";
      if (valor(form.modelo).length < 2) erros.modelo = "Diga o modelo do veículo.";
      const ano = Number(form.ano.value);
      if (!/^\d{4}$/.test(form.ano.value) || ano < 1980 || ano > anoAtual + 1) erros.ano = "Ano inválido.";
      return erros;
    },
    3: () => {
      const erros = {};
      if (!/\S+\s+\S+/.test(form.nome.value.trim())) erros.nome = "Digite seu nome e sobrenome.";
      const dig = form.whatsapp.value.replace(/\D/g, "");
      if (dig.length < 10 || dig.length > 13) erros.whatsapp = "WhatsApp com DDD, só números.";
      const email = form.email.value.trim();
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) erros.email = "E-mail inválido. Pode deixar em branco.";
      return erros;
    },
  };
  const etapaDe = (el) => Number(el.closest(".etapa").dataset.etapa);

  $$("[data-proximo]", form).forEach((b) => b.addEventListener("click", () => {
    const n = etapaDe(b), erros = validar[n](); mostrarErros(erros);
    if (!Object.keys(erros).length) irPara(n + 1);
  }));
  $$("[data-voltar]", form).forEach((b) => b.addEventListener("click", () => irPara(etapaDe(b) - 1)));
  // Enter num campo avança a etapa em vez de enviar o formulário pela metade
  form.addEventListener("keydown", (ev) => {
    if (ev.key !== "Enter" || ev.target.tagName !== "INPUT") return;
    const proximo = $("[data-proximo]", ev.target.closest(".etapa"));
    if (proximo) { ev.preventDefault(); proximo.click(); }
  });

  // máscara leve do telefone
  form.whatsapp.addEventListener("input", () => {
    const d = form.whatsapp.value.replace(/\D/g, "").slice(0, 11);
    form.whatsapp.value = d.length > 6 ? `(${d.slice(0, 2)}) ${d.slice(2, d.length - 4)}-${d.slice(-4)}`
      : d.length > 2 ? `(${d.slice(0, 2)}) ${d.slice(2)}` : d;
  });

  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const erros = validar[3](); mostrarErros(erros);
    if (Object.keys(erros).length) return;
    const btn = $('button[type="submit"]', form); btn.setAttribute("aria-busy", "true");
    const dados = Object.fromEntries(new FormData(form).entries());
    if (form.marca.tagName === "SELECT") {
      // o servidor guarda o nome para a planilha e o código para o CRM
      Object.assign(dados, { marcaId: form.marca.value, modeloId: form.modelo.value, marca: valor(form.marca), modelo: valor(form.modelo) });
    }
    try {
      const r = await fetch("/api/leads", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(dados) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        const doServidor = j.erros || { geral: j.erro || "O pedido não foi enviado. Tente de novo." };
        // erro num campo de etapa anterior: volta pra onde ele está
        const campo = form.elements[Object.keys(doServidor)[0]];
        if (campo?.closest) irPara(etapaDe(campo));
        mostrarErros(doServidor);
        return;
      }
    } catch {
      mostrarErros({ geral: "Sem conexão. Confira a internet e tente de novo." }); return;
    } finally { btn.removeAttribute("aria-busy"); }

    const extras = [dados.app && "uso em app", dados.leilao && "leilão", dados.temSeguro && "tenho seguro"].filter(Boolean).join(", ");
    const msg = `Olá! Pedi uma cotação no site.\nNome: ${dados.nome}\nVeículo: ${dados.marca} ${dados.modelo} ${dados.ano}\nPlaca: ${dados.zeroKm ? "0 km" : dados.placa}\nCidade: ${dados.cidade}` +
      (extras ? `\nPerfil: ${extras}` : "") + (dados.plano ? `\nPlano de interesse: ${dados.plano}` : "");
    const abrir = $("[data-abrir-zap]", form);
    if (temZap) { abrir.href = linkZap(msg); abrir.target = "_blank"; abrir.rel = "noopener"; }
    else abrir.hidden = true;
    irPara(ETAPAS + 1);
  });
})();
