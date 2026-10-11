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
  ["Nome", (c) => c.nome, true],
  ["WhatsApp", (c) => c.whatsapp],
  ["E-mail", (c) => c.email],
  ["Placa", (c) => (c.zeroKm ? "0 km" : c.placa), true],
  ["Tipo", (c) => TIPOS[c.tipo] || c.tipo],
  ["Marca", (c) => c.marca],
  ["Modelo", (c) => c.modelo, true],
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

// Botão "Mostrar" dos campos de senha (login e perfil).
const VER_SENHA = `<script>
document.querySelectorAll("[data-ver]").forEach((b) => b.addEventListener("click", () => {
  const campo = document.getElementById(b.dataset.ver), ver = campo.type === "password";
  campo.type = ver ? "text" : "password";
  b.textContent = ver ? "Ocultar" : "Mostrar";
  b.setAttribute("aria-pressed", String(ver));
}));
</script>`;
const campoSenha = (id, rotulo, auto, extra = "") => `<label for="${id}">${rotulo}</label>
  <div class="senha"><input id="${id}" name="${id}" type="password" autocomplete="${auto}" required ${extra}>
  <button type="button" class="ver" data-ver="${id}" aria-pressed="false">Mostrar</button></div>`;

export function paginaEntrar(erro = "") {
  return `${cabeca("Painel do consultor")}<body class="entrar">
<div class="entrar-col">
<img src="/img/logo-21go.png" alt="21Go Proteção Veicular" width="164" height="72">
<form method="post" action="/painel/entrar" class="entrar-cx">
  <h1>Painel do consultor</h1>
  ${campoSenha("senha", "Senha", "current-password", `autofocus${erro ? ' aria-invalid="true" aria-describedby="erro"' : ""}`)}
  <p class="erro" id="erro" role="alert">${esc(erro)}</p>
  <button class="bt bt-p">Entrar</button>
</form></div>${VER_SENHA}</body></html>`;
}

// Moldura comum do painel: marca, navegação e saída sempre no mesmo lugar.
const moldura = (titulo, ativo, corpo) => `${cabeca(titulo)}<body>
<a class="pular" href="#conteudo">Pular para o conteúdo</a>
<header class="topo">
  <a class="logo" href="/painel"><img src="/img/logo-21go.png" alt="21Go Proteção Veicular" width="82" height="36"><span>painel do consultor</span></a>
  <nav aria-label="Seções do painel">
    <a href="/painel"${ativo === "cotacoes" ? ' aria-current="page"' : ""}>Cotações</a>
    <a href="/painel/perfil"${ativo === "perfil" ? ' aria-current="page"' : ""}>Perfil</a>
  </nav>
  <a class="sair" href="/painel/sair">Sair</a>
</header>
${corpo}</body></html>`;

const noCrm = (c) => (c.crm?.ok ? "Enviada" : c.crm ? "Falhou" : "");
const pilula = (c) => `<span class="pill st-${esc(c.status)}">${esc(STATUS[c.status] || c.status)}</span>`;

export function paginaPainel({ cotacoes, filtro, aberta, salvo, crmUrl, temLeitor, erroLeitura }) {
  const conta = (s) => cotacoes.filter((c) => c.status === s).length;
  const visiveis = filtro ? cotacoes.filter((c) => c.status === filtro) : cotacoes;
  const q = (id) => `/painel?${new URLSearchParams({ ...(filtro && { status: filtro }), ...(id && { id }) })}`;

  const filtros = [["", "Todas", cotacoes.length], ...Object.entries(STATUS).map(([k, v]) => [k, v, conta(k)])]
    .map(([k, rotulo, n]) => `<a href="/painel${k ? `?status=${k}` : ""}"${k === filtro ? ' aria-current="true"' : ""}>${rotulo} <span>${n}</span></a>`).join("");

  const linhas = visiveis.map((c) => `<tr${aberta?.id === c.id ? ' class="aberta"' : ""}>
    <td class="fixa m"><a class="abrir" href="${q(c.id)}" aria-label="Abrir a cotação de ${esc(c.nome)}">Abrir</a></td>
    <td>${esc(quando(c.ts))}</td>
    <td class="m">${pilula(c)}${c.vistaEm ? ' <span class="nota">cliente abriu</span>' : ""}</td>
    ${crmUrl ? `<td class="crm-${c.crm?.ok ? "ok" : "falha"}">${noCrm(c)}</td>` : ""}
    ${COLUNAS.map(([, v, m]) => { const t = esc(v(c) ?? ""); return `<td${m ? ' class="m"' : ""}>${t ? `<button type="button" class="cp" title="Copiar">${t}</button>` : ""}</td>`; }).join("")}
  </tr>`).join("");

  return moldura(`Cotações (${cotacoes.length})`, "cotacoes", `
<div class="ferramentas">
  <nav class="filtros" aria-label="Filtrar por status">${filtros}</nav>
  <input type="search" id="busca" placeholder="Buscar nome, placa, modelo" aria-label="Buscar na planilha">
  <a class="bt" href="/painel/planilha.csv">Baixar planilha</a>
</div>
<div class="area${aberta ? " com-gaveta" : ""}">
  <main class="planilha" id="conteudo">
    ${visiveis.length ? `<div class="rolagem" tabindex="0" role="region" aria-label="Planilha de cotações"><table>
      <thead><tr><th class="fixa m"><span class="sr">Abrir</span></th><th>Pedido em</th><th class="m">Status</th>${crmUrl ? "<th>PowerCRM</th>" : ""}${COLUNAS.map(([n, , m]) => `<th${m ? ' class="m"' : ""}>${n}</th>`).join("")}</tr></thead>
      <tbody>${linhas}</tbody>
    </table></div>
    <p class="dica">Clique em uma célula para copiar o valor. <span class="so-celular">No celular aparecem só as colunas principais; abra a linha para ver tudo.</span></p>
    <p class="vazio" id="sem-busca" hidden>Nenhuma cotação com esse texto. Apague a busca para ver todas.</p>`
    : `<div class="vazio"><p>${filtro ? "Nenhuma cotação com esse status." : "Nenhum pedido ainda. Quando alguém pedir cotação no site, ele aparece aqui."}</p>
      ${filtro ? '<a class="bt" href="/painel">Ver todas</a>' : '<a class="bt" href="/" target="_blank" rel="noopener">Abrir o site</a>'}</div>`}
  </main>
  ${aberta ? gaveta(aberta, q(""), salvo, crmUrl, { temLeitor, erroLeitura }) : ""}
</div>
<output class="aviso-copia" id="copiado" aria-live="polite"></output>
<script>
(() => {
  const aviso = document.getElementById("copiado");
  let t;
  const copiar = async (texto, el) => {
    try { await navigator.clipboard.writeText(texto); } catch { aviso.textContent = "O navegador bloqueou a cópia. Selecione o texto e copie à mão."; aviso.classList.add("on"); return; }
    aviso.textContent = "Copiado: " + texto.slice(0, 60); aviso.classList.add("on");
    el.classList.add("ok"); clearTimeout(t);
    t = setTimeout(() => { aviso.classList.remove("on"); el.classList.remove("ok"); }, 1600);
  };
  document.addEventListener("click", (e) => {
    const b = e.target.closest(".cp, [data-copiar]");
    if (b) copiar(b.dataset.copiar || b.textContent, b);
  });
  document.getElementById("busca").addEventListener("input", (e) => {
    const termo = e.target.value.trim().toLowerCase();
    let achou = 0;
    document.querySelectorAll("tbody tr").forEach((tr) => { tr.hidden = Boolean(termo) && !tr.textContent.toLowerCase().includes(termo); achou += !tr.hidden; });
    const vazio = document.getElementById("sem-busca");
    if (vazio) vazio.hidden = achou > 0;
  });
  // a leitura leva de 10 a 60 segundos: avisa e trava o botão
  document.querySelectorAll("form[data-lendo]").forEach((f) => f.addEventListener("submit", () => {
    const b = f.querySelector("button"); b.disabled = true; b.textContent = "Lendo os documentos, pode levar até um minuto...";
  }));
  // valores alterados e não salvos: avisa antes de sair da cotação aberta
  const form = document.querySelector(".gaveta form[data-valores]");
  if (form) {
    let sujo = false;
    form.addEventListener("input", () => { sujo = true; });
    form.addEventListener("submit", () => { sujo = false; });
    addEventListener("beforeunload", (e) => { if (sujo) e.preventDefault(); });
  }
})();
</script>`);
}

export function paginaPerfil({ nome, whatsapp, senhaTrocada, erros = {}, salvo = "" }) {
  const aviso = { dados: "Dados salvos.", senha: "Senha trocada. Os outros aparelhos que estavam conectados vão precisar entrar de novo." }[salvo];
  const erro = (k) => (erros[k] ? `<p class="erro" id="erro-${k}" role="alert">${esc(erros[k])}</p>` : "");
  const inv = (k) => (erros[k] ? ` aria-invalid="true" aria-describedby="erro-${k}"` : "");
  return moldura("Perfil", "perfil", `
<main class="perfil" id="conteudo">
  <h1>Perfil</h1>
  ${aviso ? `<p class="ok-msg" role="status">${aviso}</p>` : ""}
  <form method="post" action="/painel/perfil" class="cartao">
    <h2>Seus dados</h2>
    <p class="ajuda">Aparecem na página da cotação e na mensagem enviada ao cliente.</p>
    <label for="nome">Nome</label>
    <input id="nome" name="nome" type="text" autocomplete="name" required maxlength="60" value="${esc(nome)}"${inv("nome")}>
    ${erro("nome")}
    <label for="whatsapp">Seu WhatsApp</label>
    <input id="whatsapp" name="whatsapp" type="tel" inputmode="tel" autocomplete="tel-national" placeholder="(84) 99999-9999" value="${esc(tel(whatsapp.replace(/^55/, "")))}"${inv("whatsapp")} aria-describedby="ajuda-zap${erros.whatsapp ? " erro-whatsapp" : ""}">
    <p class="ajuda" id="ajuda-zap">É para este número que vão os botões "Quero o plano" e "Chamar no WhatsApp" do site. Sem ele, esses botões não aparecem.</p>
    ${erro("whatsapp")}
    <button class="bt bt-p">Salvar dados</button>
  </form>
  <form method="post" action="/painel/perfil/senha" class="cartao">
    <h2>Trocar a senha do painel</h2>
    <p class="ajuda">${senhaTrocada ? "" : "Hoje a senha é a que foi configurada no servidor. "}A nova senha precisa ter pelo menos 8 caracteres.</p>
    ${campoSenha("atual", "Senha atual", "current-password", inv("atual"))}
    ${erro("atual")}
    ${campoSenha("nova", "Nova senha", "new-password", `minlength="8"${inv("nova")}`)}
    ${erro("nova")}
    ${campoSenha("repetir", "Repita a nova senha", "new-password", `minlength="8"${inv("repetir")}`)}
    ${erro("repetir")}
    <button class="bt bt-p">Trocar senha</button>
  </form>
</main>${VER_SENHA}`);
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
  return `<div class="docs-painel">
    ${plano ? `<p>Plano escolhido: <strong>${plano.nome}</strong></p>` : ""}
    <ul>${Object.entries(DOCS).map(([k, [nome]]) => `<li>${c.docs[k]
      ? `<a href="/painel/${esc(c.id)}/doc/${k}" target="_blank" rel="noopener">${nome}</a> <span>${esc(quando(c.docs[k].em))}</span>`
      : `${nome} <span>não enviado</span>`}</li>`).join("")}</ul>
    <form method="post" action="/painel/${esc(c.id)}/docs/apagar" onsubmit="return confirm('Apagar os documentos deste cliente? Não dá para desfazer.')"><button class="bt bt-perigo">Apagar documentos</button></form></div>`;
}

// Rótulos iguais aos das telas do PowerCRM, na ordem em que aparecem lá.
const LEITURA = [
  ["Condutor", "condutor", { nome: "Nome completo", cpf: "CPF", rg: "RG", orgaoExpedidor: "Órgão expedidor", cnh: "CNH", categoria: "Categoria", primeiraHabilitacao: "1ª habilitação", validadeCnh: "Validade da CNH", nascimento: "Nascimento" }],
  ["Veículo", "veiculo", { placa: "Placa", chassi: "Chassi", renavam: "Renavam", marcaModelo: "Marca e modelo", anoFabricacao: "Ano de fabricação", anoModelo: "Ano do modelo", cor: "Cor", combustivel: "Combustível", proprietario: "Proprietário", cpfCnpjProprietario: "CPF/CNPJ do proprietário" }],
  ["Endereço", "endereco", { cep: "CEP", logradouro: "Endereço", numero: "Número", complemento: "Complemento", bairro: "Bairro", cidade: "Cidade", uf: "Estado", titular: "Titular do comprovante" }],
];

function blocoLeitura(c, { temLeitor, erroLeitura }) {
  if (!c.docs) return "";
  const l = c.leitura;
  const botao = temLeitor
    ? `<form method="post" action="/painel/${esc(c.id)}/docs/ler" data-lendo><button class="bt${l ? "" : " bt-p"}">${l ? "Ler de novo" : "Ler documentos com IA"}</button></form>`
    : '<p class="ajuda">A leitura automática está desligada: falta configurar a chave da IA (ANTHROPIC_API_KEY) no servidor.</p>';
  return `<div class="leitura" id="leitura">
    ${erroLeitura ? `<p class="erro-msg" role="alert">${esc(erroLeitura)}</p>` : ""}
    ${l ? `<p class="ajuda">Lido em ${esc(quando(l.em))}. ${l.desatualizada ? "<strong>Chegou documento novo depois disso: leia de novo.</strong>" : "Confira com o documento antes de salvar no CRM."}</p>
    ${l.avisos?.length ? `<ul class="avisos">${l.avisos.map((a) => `<li>${esc(a)}</li>`).join("")}</ul>` : ""}
    ${LEITURA.map(([titulo, grupo, campos]) => `<h4>${titulo}</h4><dl class="lidos">${Object.entries(campos).map(([k, rotulo]) => { const v = esc(l[grupo]?.[k] || "");
      return `<div><dt>${rotulo}</dt><dd>${v ? `<button type="button" class="cp" title="Copiar">${v}</button>` : '<span class="nao-lido">não lido</span>'}</dd></div>`; }).join("")}</dl>`).join("")}` : ""}
    ${botao}
  </div>`;
}

function gaveta(c, voltar, salvo, crmUrl, leitura) {
  const v = c.valores || {};
  const veiculo = [c.marca, c.modelo, c.ano].filter(Boolean).join(" ");
  const tudo = COLUNAS.map(([n, f]) => `${n}: ${f(c) ?? ""}`).join("\n");
  const zap = c.whatsapp.length <= 11 ? "55" + c.whatsapp : c.whatsapp;
  return `<aside class="gaveta" aria-label="Cotação de ${esc(c.nome)}">
  <div class="gaveta-topo">
    <div><h2>${esc(c.nome)}</h2>${pilula(c)}</div>
    <a class="fechar" href="${voltar}">Fechar</a>
  </div>
  <dl class="resumo">
    <div><dt>Veículo</dt><dd>${esc(veiculo)}</dd></div>
    <div><dt>Placa</dt><dd>${esc(c.zeroKm ? "0 km" : c.placa || "sem placa")}</dd></div>
    <div><dt>Cidade</dt><dd>${esc(c.cidade)}</dd></div>
    <div><dt>WhatsApp</dt><dd><a href="https://wa.me/${esc(zap)}" target="_blank" rel="noopener">${esc(tel(c.whatsapp))}</a></dd></div>
    <div><dt>Pedido em</dt><dd>${esc(quando(c.ts))}</dd></div>
  </dl>

  <section>
    <h3><span class="passo">1</span> Cote no sistema da 21Go</h3>
    ${blocoCrm(c, crmUrl)}
    <button type="button" class="bt" data-copiar="${esc(tudo)}">Copiar todos os dados</button>
  </section>

  <section>
    <h3><span class="passo">2</span> Informe os valores</h3>
    ${salvo ? '<p class="ok-msg" role="status">Cotação salva.</p>' : ""}
    <form method="post" action="/painel/${esc(c.id)}" data-valores>
      <div class="valores">
        ${PLANOS.map((p) => `<label>${p.nome}<span class="rs"><input name="${p.chave}" inputmode="decimal" autocomplete="off" placeholder="0,00" value="${numero(v[p.chave])}"></span></label>`).join("")}
        <label>Taxa de ativação<span class="rs"><input name="ativacao" inputmode="decimal" autocomplete="off" placeholder="0,00" value="${numero(v.ativacao)}"></span></label>
      </div>
      <p class="ajuda">Deixe em branco o plano que não quiser oferecer.</p>
      <label class="bloco">Observação para o cliente<textarea name="obs" rows="3" maxlength="500" placeholder="Ex.: valor com rastreador incluso.">${esc(c.obs || "")}</textarea></label>
      <label class="bloco">Status<select name="status">${Object.entries(STATUS).map(([k, r]) => `<option value="${k}"${k === c.status ? " selected" : ""}>${r}</option>`).join("")}</select></label>
      <button class="bt bt-p">Salvar cotação</button>
    </form>
  </section>

  <section>
    <h3><span class="passo">3</span> Envie ao cliente</h3>
    ${c.valores ? `<div class="envio">
      <a class="bt bt-zap" href="/painel/${esc(c.id)}/enviar" target="_blank" rel="noopener">Enviar cotação no WhatsApp</a>
      <a class="bt" href="/c/${esc(c.id)}" target="_blank" rel="noopener">Ver a página do cliente</a>
      <p class="ajuda">${c.enviadaEm ? `Enviada em ${esc(quando(c.enviadaEm))}. ` : "Ainda não enviada. "}${c.vistaEm ? `Cliente abriu em ${esc(quando(c.vistaEm))}.` : c.enviadaEm ? "Cliente ainda não abriu." : ""}</p>
    </div>` : '<p class="ajuda">Salve pelo menos um valor no passo 2 para liberar o envio.</p>'}
  </section>

  <section>
    <h3><span class="passo">4</span> Receba os documentos</h3>
    ${blocoDocs(c) ? blocoDocs(c) + blocoLeitura(c, leitura) : '<p class="ajuda">O cliente envia CNH, documento do veículo e comprovante de residência pela página da cotação. Eles aparecem aqui.</p>'}
  </section>
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
  <p class="marca"><img src="/img/logo-21go.png" alt="21Go Proteção Veicular" width="118" height="52"><span>com ${esc(cfg.consultor)}, consultor em Natal</span></p>
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
  // Foto de celular chega com 4 a 8 MB: reduz para até 2400 px em JPEG. Se o navegador
  // não conseguir abrir a imagem, segue com o arquivo original.
  async function reduzir(arquivo) {
    if (!arquivo.type.startsWith("image/")) return arquivo;
    try {
      const img = await createImageBitmap(arquivo);
      const escala = Math.min(1, 2400 / Math.max(img.width, img.height));
      if (escala === 1 && arquivo.type === "image/jpeg" && arquivo.size < 3 * 1024 * 1024) return arquivo;
      const tela = document.createElement("canvas");
      tela.width = Math.round(img.width * escala); tela.height = Math.round(img.height * escala);
      tela.getContext("2d").drawImage(img, 0, 0, tela.width, tela.height);
      const blob = await new Promise((ok) => tela.toBlob(ok, "image/jpeg", 0.88));
      return blob || arquivo;
    } catch { return arquivo; }
  }
  document.querySelectorAll("[data-doc]").forEach((campo) => campo.addEventListener("change", async () => {
    let arquivo = campo.files[0];
    const st = document.getElementById("st-" + campo.dataset.doc);
    if (!arquivo) return;
    st.className = "";
    if (arquivo.type.startsWith("image/")) st.textContent = "Preparando a foto...";
    arquivo = await reduzir(arquivo);
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
