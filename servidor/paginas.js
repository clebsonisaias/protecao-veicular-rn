/** HTML do painel do consultor e da página da cotação (sem template engine). */

export const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
export const brl = (n) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const STATUS = { nova: "Nova", enviada: "Cotação enviada", documentos: "Documentos recebidos", fechou: "Fechou", perdeu: "Perdeu" };

// O que a 21Go pede para fechar. A chave vira nome de arquivo e parte da URL.
export const DOCS = {
  cnh: ["CNH", "Aberta, frente e verso na mesma foto, com tudo legível."],
  veiculo: ["Documento do veículo", "O CRLV, em foto ou no PDF do aplicativo."],
  residencia: ["Comprovante de residência", "Conta de luz, água ou internet dos últimos 3 meses."],
};

// Coberturas copiadas de 21go.site em 06/10/2026 (as mesmas da página inicial).
export const PLANOS = [
  { chave: "basico", nome: "Básico", itens: ["Roubo e furto", "Colisão parcial e total", "Incêndio", "Terceiros até R$ 5 mil", "Guincho 200 km", "Assistência 24h", "Fenômenos da natureza", "Para-brisa"] },
  { chave: "doSeuJeito", nome: "Do Seu Jeito", itens: ["Tudo do Básico", "Terceiros até R$ 10 mil", "Guincho 400 km", "Carro reserva", "Todos os vidros", "Táxi 50 km", "Carona amiga 25 km"] },
  { chave: "vip", nome: "VIP", destaque: true, itens: ["Tudo do Do Seu Jeito", "Terceiros até R$ 50 mil", "Guincho 1.000 km", "Carro reserva 7 dias", "Táxi 100 km", "Todos os vidros"] },
  { chave: "premium", nome: "Premium", itens: ["Tudo do VIP", "Terceiros até R$ 100 mil", "Guincho 1.400 km", "Carro reserva 15 dias", "Táxi 150 km"] },
];

const TIPOS = { carro: "Carro", moto: "Moto", utilitario: "Utilitário" };
const simNao = (v) => (v ? "Sim" : "Não");
const quando = (iso) => (iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Fortaleza", dateStyle: "short", timeStyle: "short" }) : "");
const tel = (d = "") => (d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : d);
const numero = (n) => (n ? n.toFixed(2).replace(".", ",") : "");

// Colunas na ordem em que o simulador oficial da 21Go pede os dados.
const COLUNAS = [
  ["Nome", (c) => c.nome],
  ["WhatsApp", (c) => c.whatsapp],
  ["E-mail", (c) => c.email],
  ["Placa", (c) => (c.zeroKm ? "0 km" : c.placa)],
  ["Tipo", (c) => TIPOS[c.tipo] || c.tipo],
  ["Marca", (c) => c.marca],
  ["Modelo", (c) => c.modelo],
  ["Ano", (c) => c.ano],
  ["Leilão", (c) => simNao(c.leilao)],
  ["App", (c) => simNao(c.app)],
  ["Seguro atual", (c) => simNao(c.temSeguro)],
  ["Cidade", (c) => c.cidade],
  ["Plano de interesse", (c) => c.plano],
];

const cabeca = (titulo) => `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex,nofollow">
<title>${esc(titulo)}</title><link rel="icon" href="/img/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600..800&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/painel.css"></head>`;

export function paginaEntrar(erro = "") {
  return `${cabeca("Painel de cotações")}<body class="entrar">
<form method="post" action="/painel/entrar" class="entrar-cx">
  <h1>Painel de cotações</h1>
  <label for="senha">Senha</label>
  <input id="senha" name="senha" type="password" autocomplete="current-password" required autofocus${erro ? ' aria-invalid="true" aria-describedby="erro"' : ""}>
  <p class="erro" id="erro" role="alert">${esc(erro)}</p>
  <button class="bt bt-p">Entrar</button>
</form></body></html>`;
}

const noCrm = (c) => (c.crm?.ok ? "Enviada" : c.crm ? "Falhou" : "");

export function paginaPainel({ cotacoes, filtro, aberta, salvo, crmUrl }) {
  const conta = (s) => cotacoes.filter((c) => c.status === s).length;
  const visiveis = filtro ? cotacoes.filter((c) => c.status === filtro) : cotacoes;
  const q = (id) => `/painel?${new URLSearchParams({ ...(filtro && { status: filtro }), ...(id && { id }) })}`;

  const filtros = [["", "Todas", cotacoes.length], ...Object.entries(STATUS).map(([k, v]) => [k, v, conta(k)])]
    .map(([k, rotulo, n]) => `<a href="/painel${k ? `?status=${k}` : ""}"${k === filtro ? ' aria-current="true"' : ""}>${rotulo} <span>${n}</span></a>`).join("");

  const linhas = visiveis.map((c) => `<tr${aberta?.id === c.id ? ' class="aberta"' : ""}>
    <td class="fixa"><a href="${q(c.id)}">Abrir</a></td>
    <td>${esc(quando(c.ts))}</td>
    <td class="st st-${esc(c.status)}">${esc(STATUS[c.status] || c.status)}${c.vistaEm ? " · cliente abriu" : ""}</td>
    ${crmUrl ? `<td class="crm-${c.crm?.ok ? "ok" : "falha"}">${noCrm(c)}</td>` : ""}
    ${COLUNAS.map(([, v]) => { const t = esc(v(c) ?? ""); return `<td>${t ? `<button type="button" class="cp">${t}</button>` : ""}</td>`; }).join("")}
  </tr>`).join("");

  return `${cabeca(`Cotações (${cotacoes.length})`)}<body>
<header class="barra">
  <strong>Cotações 21Go</strong>
  <nav class="filtros" aria-label="Filtrar por status">${filtros}</nav>
  <input type="search" id="busca" placeholder="Buscar nome, placa, modelo" aria-label="Buscar na planilha">
  <a class="bt" href="/painel/planilha.csv">Baixar planilha</a>
  <a class="sair" href="/painel/sair">Sair</a>
</header>
<div class="area${aberta ? " com-gaveta" : ""}">
  <main class="planilha">
    ${visiveis.length ? `<table>
      <thead><tr><th class="fixa"></th><th>Pedido em</th><th>Status</th>${crmUrl ? "<th>PowerCRM</th>" : ""}${COLUNAS.map(([n]) => `<th>${n}</th>`).join("")}</tr></thead>
      <tbody>${linhas}</tbody>
    </table>
    <p class="dica">Clique em qualquer célula para copiar o valor e colar no sistema da 21Go.</p>`
    : `<p class="vazio">${filtro ? "Nenhuma cotação com esse status." : "Nenhum pedido ainda. Quando alguém pedir cotação no site, aparece aqui."}</p>`}
  </main>
  ${aberta ? gaveta(aberta, q(""), salvo, crmUrl) : ""}
</div>
<output class="aviso-copia" id="copiado" aria-live="polite"></output>
<script>
(() => {
  const aviso = document.getElementById("copiado");
  let t;
  const copiar = async (texto, el) => {
    try { await navigator.clipboard.writeText(texto); } catch { return; }
    aviso.textContent = "Copiado: " + texto.slice(0, 60); aviso.classList.add("on");
    el.classList.add("ok"); clearTimeout(t);
    t = setTimeout(() => { aviso.classList.remove("on"); el.classList.remove("ok"); }, 1400);
  };
  document.addEventListener("click", (e) => {
    const b = e.target.closest(".cp, [data-copiar]");
    if (b) copiar(b.dataset.copiar || b.textContent, b);
  });
  document.getElementById("busca").addEventListener("input", (e) => {
    const termo = e.target.value.trim().toLowerCase();
    document.querySelectorAll("tbody tr").forEach((tr) => { tr.hidden = termo && !tr.textContent.toLowerCase().includes(termo); });
  });
})();
</script></body></html>`;
}

function blocoCrm(c, crmUrl) {
  if (!crmUrl) return "";
  if (c.crm?.ok) return `<p class="crm crm-ok">Enviada ao PowerCRM em ${esc(quando(c.crm.em))}.${c.crm.link ? ` <a href="${esc(c.crm.link)}" target="_blank" rel="noopener">Abrir a cotação gerada</a>` : ""}</p>`;
  return `<div class="crm crm-falha"><p>${c.crm ? `Não entrou no PowerCRM: ${esc(c.crm.erro)}.` : "Este pedido ainda não foi enviado ao PowerCRM."}</p>
    <form method="post" action="/painel/${esc(c.id)}/crm"><button class="bt">Enviar ao PowerCRM</button></form>
    <a class="bt" href="${esc(crmUrl)}" target="_blank" rel="noopener">Preencher no CRM à mão</a></div>`;
}

function blocoDocs(c) {
  if (!c.docs) return "";
  const plano = PLANOS.find((p) => p.chave === c.planoEscolhido);
  return `<div class="docs-painel"><h3>Documentos do cliente</h3>
    ${plano ? `<p>Plano escolhido: <strong>${plano.nome}</strong></p>` : ""}
    <ul>${Object.entries(DOCS).map(([k, [nome]]) => `<li>${c.docs[k]
      ? `<a href="/painel/${esc(c.id)}/doc/${k}" target="_blank" rel="noopener">${nome}</a> <span>${esc(quando(c.docs[k].em))}</span>`
      : `${nome} <span>não enviado</span>`}</li>`).join("")}</ul>
    <form method="post" action="/painel/${esc(c.id)}/docs/apagar" onsubmit="return confirm('Apagar os documentos deste cliente? Não dá para desfazer.')"><button class="bt">Apagar documentos</button></form></div>`;
}

function gaveta(c, voltar, salvo, crmUrl) {
  const v = c.valores || {};
  const veiculo = [c.marca, c.modelo, c.ano].filter(Boolean).join(" ");
  const tudo = COLUNAS.map(([n, f]) => `${n}: ${f(c) ?? ""}`).join("\n");
  return `<aside class="gaveta" aria-label="Cotação de ${esc(c.nome)}">
  <a class="fechar" href="${voltar}">Fechar</a>
  <h2>${esc(c.nome)}</h2>
  <p class="sub">${esc(veiculo)} · ${esc(c.zeroKm ? "0 km" : c.placa || "sem placa")} · ${esc(c.cidade)}<br>${esc(tel(c.whatsapp))} · pedido em ${esc(quando(c.ts))}</p>
  <button type="button" class="bt" data-copiar="${esc(tudo)}">Copiar todos os dados</button>
  ${blocoCrm(c, crmUrl)}
  ${blocoDocs(c)}
  ${salvo ? '<p class="ok-msg" role="status">Cotação salva.</p>' : ""}
  <form method="post" action="/painel/${esc(c.id)}">
    <h3>Valores que o sistema da 21Go deu</h3>
    <div class="valores">
      ${PLANOS.map((p) => `<label>${p.nome}<span class="rs"><input name="${p.chave}" inputmode="decimal" autocomplete="off" placeholder="0,00" value="${numero(v[p.chave])}"></span></label>`).join("")}
      <label>Taxa de ativação<span class="rs"><input name="ativacao" inputmode="decimal" autocomplete="off" placeholder="0,00" value="${numero(v.ativacao)}"></span></label>
    </div>
    <p class="ajuda">Deixe em branco o plano que não quiser oferecer.</p>
    <label class="bloco">Observação para o cliente<textarea name="obs" rows="3" maxlength="500" placeholder="Ex.: valor com rastreador incluso.">${esc(c.obs || "")}</textarea></label>
    <label class="bloco">Status<select name="status">${Object.entries(STATUS).map(([k, r]) => `<option value="${k}"${k === c.status ? " selected" : ""}>${r}</option>`).join("")}</select></label>
    <button class="bt bt-p">Salvar cotação</button>
  </form>
  ${c.valores ? `<div class="envio">
    <a class="bt bt-zap" href="/painel/${esc(c.id)}/enviar" target="_blank" rel="noopener">Enviar cotação no WhatsApp</a>
    <a class="bt" href="/c/${esc(c.id)}" target="_blank" rel="noopener">Ver a página do cliente</a>
    <p class="ajuda">${c.enviadaEm ? `Enviada em ${esc(quando(c.enviadaEm))}. ` : ""}${c.vistaEm ? `Cliente abriu em ${esc(quando(c.vistaEm))}.` : c.enviadaEm ? "Cliente ainda não abriu." : ""}</p>
  </div>` : '<p class="ajuda">Salve pelo menos um valor para liberar o envio no WhatsApp.</p>'}
</aside>`;
}

export function paginaCotacao(c, cfg) {
  if (!c) return `${cabeca("Cotação não encontrada")}<body class="cot"><main class="cot-wrap"><h1>Cotação não encontrada</h1>
<p class="lead">Confira se o link veio completo. Se preferir, peça uma nova cotação.</p><a class="bt bt-p" href="/#cotacao">Pedir cotação</a></main></body></html>`;

  const veiculo = [c.marca, c.modelo, c.ano].filter(Boolean).join(" ");
  const primeiro = c.nome.split(" ")[0];
  if (!c.valores) return `${cabeca("Sua cotação 21Go")}<body class="cot"><main class="cot-wrap"><h1>${esc(primeiro)}, sua cotação está sendo montada</h1>
<p class="lead">Recebi o pedido para o ${esc(veiculo)}. Assim que os valores saírem do sistema da 21Go eu te envio no WhatsApp, e eles aparecem nesta página.</p></main></body></html>`;

  const zap = (plano) => `https://wa.me/${cfg.whatsapp}?text=${encodeURIComponent(`Olá! Vi minha cotação do ${veiculo} e quero o plano ${plano}.`)}`;
  const planos = PLANOS.filter((p) => c.valores[p.chave]).map((p) => {
    const [reais, centavos] = c.valores[p.chave].toFixed(2).split(".");
    return `<article class="pl${p.destaque ? " destaque" : ""}">
    <h2>${p.nome}${p.destaque ? " <span>mais escolhido</span>" : ""}</h2>
    <p class="valor"><small>R$</small>${Number(reais).toLocaleString("pt-BR")}<small>,${centavos} por mês</small></p>
    <ul>${p.itens.map((i) => `<li>${i}</li>`).join("")}</ul>
    ${cfg.whatsapp ? `<a class="bt ${p.destaque ? "bt-p" : ""}" href="${zap(p.nome)}" target="_blank" rel="noopener">Quero o ${p.nome}</a>` : ""}
  </article>`;
  }).join("");

  return `${cabeca(`Cotação 21Go: ${veiculo}`)}<body class="cot">
<header class="cot-topo"><div class="cot-wrap">
  <p class="marca">21Go <span>com Clebson Isaias, consultor em Natal</span></p>
  <h1>${esc(primeiro)}, esta é a cotação do seu ${esc(veiculo)}</h1>
  <p class="lead">${esc(c.zeroKm ? "Veículo 0 km" : `Placa ${c.placa}`)} · ${esc(c.cidade)}${c.app ? " · uso em aplicativo" : ""}${c.leilao ? " · veículo de leilão" : ""}</p>
</div></header>
<main class="cot-wrap">
  <div class="pls">${planos}</div>
  ${c.valores.ativacao ? `<p class="ativ">Taxa de ativação, paga uma vez: <strong>${esc(brl(c.valores.ativacao))}</strong></p>` : ""}
  ${c.obs ? `<p class="obs">${esc(c.obs)}</p>` : ""}
  <p class="proximo">${cfg.whatsapp ? "Escolha um plano e eu te chamo no WhatsApp para agendar a vistoria por vídeo." : "Para seguir, responda a mensagem que te enviei no WhatsApp com o plano escolhido."} A proteção começa a valer depois da vistoria e do pagamento da ativação.</p>
  <section class="docs" id="documentos">
    <h2>Escolheu o plano? Envie três documentos para fechar</h2>
    <p>Pode ser foto tirada no celular ou PDF, até 10 MB cada. Só o consultor consegue abrir os arquivos, e eles são usados apenas para o seu cadastro na 21Go.</p>
    <label class="docs-plano" for="doc-plano">Plano escolhido
      <select id="doc-plano">${PLANOS.filter((p) => c.valores[p.chave]).map((p) => `<option value="${p.chave}"${p.chave === (c.planoEscolhido || "vip") ? " selected" : ""}>${p.nome}</option>`).join("")}</select>
    </label>
    <ul>${Object.entries(DOCS).map(([k, [nome, dica]]) => `<li>
      <label for="doc-${k}"><strong>${nome}</strong><span>${dica}</span></label>
      <input type="file" id="doc-${k}" data-doc="${k}" accept="image/*,application/pdf" aria-describedby="st-${k}">
      <output id="st-${k}"${c.docs?.[k] ? ' class="ok"' : ""}>${c.docs?.[k] ? `Recebido em ${esc(quando(c.docs[k].em))}. Para trocar, envie de novo.` : ""}</output>
    </li>`).join("")}</ul>
  </section>
  <script>
  document.querySelectorAll("[data-doc]").forEach((campo) => campo.addEventListener("change", async () => {
    const arquivo = campo.files[0], st = document.getElementById("st-" + campo.dataset.doc);
    if (!arquivo) return;
    st.className = "";
    if (arquivo.size > 10 * 1024 * 1024) { st.className = "falha"; st.textContent = "Arquivo acima de 10 MB. Tire a foto em qualidade menor ou envie o PDF."; return; }
    st.textContent = "Enviando...";
    try {
      const r = await fetch(location.pathname + "/doc/" + campo.dataset.doc + "?plano=" + document.getElementById("doc-plano").value, { method: "PUT", body: arquivo });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.erro || "O envio falhou. Tente de novo.");
      st.className = "ok"; st.textContent = "Recebido. Para trocar, envie de novo.";
    } catch (e) {
      st.className = "falha"; st.textContent = e instanceof TypeError ? "Sem conexão. Confira a internet e envie de novo." : e.message;
    }
  }));
  </script>
  <p class="legal">Valores calculados no sistema da 21Go para este veículo e sujeitos a confirmação na vistoria. Atendimento por consultor independente. A 21GO Associação de Proteção Patrimonial (CNPJ 40.902.817/0001-70) é uma associação mutualista regulamentada pela Lei Complementar 213/2025. Proteção veicular não é seguro.</p>
</main></body></html>`;
}

/** CSV com ; e BOM: é o que o Excel em português abre direto. */
export function csvCotacoes(cotacoes) {
  const colunas = [
    ["Pedido em", (c) => quando(c.ts)], ["Status", (c) => STATUS[c.status] || c.status], ["PowerCRM", noCrm], ...COLUNAS,
    ...PLANOS.map((p) => [p.nome, (c) => numero(c.valores?.[p.chave])]),
    ["Taxa de ativação", (c) => numero(c.valores?.ativacao)], ["Observação", (c) => c.obs],
    ["Documentos", (c) => (c.docs ? `${Object.keys(c.docs).length} de ${Object.keys(DOCS).length}` : "")],
  ];
  // célula começando com = + - @ vira fórmula no Excel: o apóstrofo desarma
  const cel = (v) => { const t = String(v ?? ""); return `"${(/^[=+\-@\t\r]/.test(t) ? "'" + t : t).replace(/"/g, '""')}"`; };
  return String.fromCharCode(0xfeff) + [colunas.map(([n]) => cel(n)), ...cotacoes.map((c) => colunas.map(([, f]) => cel(f(c))))].map((l) => l.join(";")).join("\r\n");
}
