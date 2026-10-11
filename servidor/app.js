/**
 * Proteção Veicular RN: site + pedido de cotação + painel do consultor.
 *
 * Fábrica em vez de módulo com efeito colateral: o teste sobe o app com um
 * diretório de dados temporário e envs próprias.
 */

import express from "express";
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DOCS, PLANOS, STATUS, brl, csvCotacoes, paginaCotacao, paginaEntrar, paginaPainel, paginaPerfil } from "./paginas.js";

export const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIR_PUBLICO = join(RAIZ, "publico");

const CIDADES_RN = new Set([
  "Natal", "Parnamirim", "Mossoró", "São Gonçalo do Amarante", "Macaíba",
  "Ceará-Mirim", "Caicó", "Extremoz", "Nísia Floresta", "Outra cidade",
]);

// Os campos seguem o simulador oficial da 21Go: é de lá que sai o valor.
export function validarLead(b = {}) {
  const s = (v, max) => String(v ?? "").trim().slice(0, max);
  const nome = s(b.nome, 80);
  const whatsapp = s(b.whatsapp, 20).replace(/\D/g, "");
  const email = s(b.email, 120).toLowerCase();
  const zeroKm = b.zeroKm === "sim";
  const placa = zeroKm ? "" : s(b.placa, 10).toUpperCase().replace(/[^A-Z0-9]/g, "");
  const marca = s(b.marca, 40);
  const modelo = s(b.modelo, 80);
  const ano = s(b.ano, 4);
  const cidade = s(b.cidade, 40);
  const tipo = s(b.tipo, 12);
  const plano = s(b.plano, 20);
  // ids do catálogo do PowerCRM, quando o formulário conseguiu carregar as listas
  const id = (v) => (/^\d{1,7}$/.test(String(v ?? "")) ? String(v) : "");
  const marcaId = id(b.marcaId), modeloId = id(b.modeloId);
  const erros = {};
  if (nome.length < 2 || !/\s/.test(nome)) erros.nome = "Digite seu nome e sobrenome.";
  if (whatsapp.length < 10 || whatsapp.length > 13) erros.whatsapp = "WhatsApp com DDD, só números.";
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) erros.email = "E-mail inválido. Pode deixar em branco.";
  // antiga (ABC1234) e Mercosul (ABC1D23)
  if (!zeroKm && !/^[A-Z]{3}\d[A-Z0-9]\d{2}$/.test(placa)) erros.placa = "Placa no formato ABC1D23 ou ABC1234.";
  if (marca.length < 2) erros.marca = "Diga a marca do veículo.";
  if (modelo.length < 2) erros.modelo = "Diga o modelo do veículo.";
  const anoN = Number(ano);
  if (!/^\d{4}$/.test(ano) || anoN < 1980 || anoN > new Date().getFullYear() + 1) erros.ano = "Ano inválido.";
  if (!["carro", "moto", "utilitario"].includes(tipo)) erros.tipo = "Escolha o tipo.";
  if (!CIDADES_RN.has(cidade)) erros.cidade = "Escolha a cidade.";
  if (Object.keys(erros).length) return { erros };
  return {
    lead: {
      nome, whatsapp, email, placa, zeroKm, tipo, marca, modelo, ano, cidade,
      ...(marcaId && modeloId && { marcaId, modeloId }),
      plano: plano || null,
      app: b.app === "sim",
      leilao: b.leilao === "sim",
      temSeguro: b.temSeguro === "sim",
    },
  };
}

/** "227,41", "227.41" ou "1.227,41" viram número; vazio ou lixo vira null. */
export function lerValor(v) {
  let t = String(v ?? "").replace(/[^\d.,]/g, "");
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  const n = Number(t);
  return t && Number.isFinite(n) && n > 0 && n < 100000 ? Math.round(n * 100) / 100 : null;
}

/** Tipo real do arquivo pelos primeiros bytes; o nome e o content-type vêm do cliente e não valem. */
export function tipoDoArquivo(b) {
  if (!Buffer.isBuffer(b) || b.length < 12) return null;
  const txt = (i, f) => b.toString("latin1", i, f);
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { ext: "jpg", mime: "image/jpeg" };
  if (txt(0, 8) === "\x89PNG\r\n\x1a\n") return { ext: "png", mime: "image/png" };
  if (txt(0, 5) === "%PDF-") return { ext: "pdf", mime: "application/pdf" };
  if (txt(0, 4) === "RIFF" && txt(8, 12) === "WEBP") return { ext: "webp", mime: "image/webp" };
  if (txt(4, 8) === "ftyp" && /^(heic|heix|hevc|mif1|msf1)$/.test(txt(8, 12))) return { ext: "heic", mime: "image/heic" };
  return null;
}

const novoId = () => randomBytes(9).toString("base64url");

// ponytail: um JSON regravado inteiro a cada mudança. Basta pra um consultor;
// trocar por SQLite quando passar de alguns milhares de cotações.
function abrirCotacoes(dir) {
  const arquivo = join(dir, "cotacoes.json");
  const antigo = join(dir, "leads.jsonl");
  let lista = [];
  const salvar = () => {
    writeFileSync(arquivo + ".tmp", JSON.stringify(lista));
    renameSync(arquivo + ".tmp", arquivo);
  };
  if (existsSync(arquivo)) lista = JSON.parse(readFileSync(arquivo, "utf8"));
  else if (existsSync(antigo)) {
    // leads do site antigo (sem id, placa nem marca) entram como cotações novas
    lista = readFileSync(antigo, "utf8").split("\n").filter(Boolean)
      .map((l) => ({ id: novoId(), status: "nova", ...JSON.parse(l) }));
    salvar();
  }
  return { arquivo, lista, salvar };
}

function limitador(max) {
  // ponytail: em memória por IP, basta pra um site de consultor.
  const porIp = new Map();
  return (ip) => {
    const agora = Date.now();
    const lista = (porIp.get(ip) || []).filter((t) => agora - t < 3_600_000);
    lista.push(agora);
    porIp.set(ip, lista);
    return lista.length <= max;
  };
}

const CRM = "https://app.powercrm.com.br";
const TIPO_CRM = { carro: "1", utilitario: "1", moto: "2" };
const ESTADO_RN = 20;

/**
 * PowerCRM pelo formulário público do consultor (o mesmo de cotacao.me): não
 * exige token, que só o administrador da 21Go consegue gerar. `formUrl` é o
 * link do consultor, ex.: https://cotacao.me/P4lp6EOp?id=vrXbXyyq
 */
function clienteCrm(formUrl, buscar) {
  const u = URL.parse(formUrl || "");
  const formCode = u?.pathname.split("/").filter(Boolean).pop();
  const consultor = u?.searchParams.get("id");
  if (!formCode || !consultor) return null;

  // ponytail: cache em memória por 24h; marcas, modelos e cidades quase não mudam.
  const cache = new Map();
  async function json(url) {
    const tem = cache.get(url);
    if (tem && Date.now() - tem.em < 86_400_000) return tem.dado;
    const r = await buscar(url, { headers: { "content-type": "application/json" }, signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error(`PowerCRM respondeu ${r.status}`);
    const dado = await r.json();
    if (cache.size > 2000) cache.clear();
    cache.set(url, { em: Date.now(), dado });
    return dado;
  }
  const enxuto = (lista) => lista.map((x) => ({ id: x.id, text: x.text }));

  return {
    formUrl,
    async marcas(tipo) { return enxuto(await json(`${CRM}/cb/?type=${tipo}`)); },
    // 32000 é o "Zero KM" deles; aqui o 0 km já é a caixinha do passo da placa
    async anos(marca) { return enxuto(await json(`${CRM}/bmy/?cb=${marca}`)).filter((a) => a.id < 3000); },
    async modelos(marca, ano) { return enxuto(await json(`${CRM}/cmby/?cb=${marca}&cy=${ano}`)); },

    async enviar(c) {
      if (!c.marcaId || !c.modeloId) throw new Error("marca e modelo vieram em texto livre, sem o código do CRM");
      const cidades = await json(`https://utilities.powercrm.com.br/city/ct?st=${ESTADO_RN}`);
      const cidade = cidades.find((x) => x.text === c.cidade);
      if (!cidade) throw new Error(`cidade "${c.cidade}" não tem código no CRM`);
      const form = await json(`${CRM}/frmByCd?code=${formCode}`);
      const d = c.whatsapp.replace(/^55(?=\d{10,11}$)/, "");
      const extras = [c.zeroKm && "Veículo 0 km", c.leilao && "Leilão ou remarcado", c.temSeguro && "Tem seguro hoje", c.plano && `Interesse no plano ${c.plano}`].filter(Boolean).join(" · ");
      // mesmos nomes e formatos que o script.pwrcrm.js monta no navegador
      const corpo = {
        companyHash: form.companyHash, formCode,
        leadSource: String(form.leadSubSourceId || form.leadSourceId || ""),
        pipelineColumn: String(form.pipelineColumnId || ""),
        ...(form.funnelStageId && { funnelStage: String(form.funnelStageId) }),
        companyUserCode: consultor,
        clientName: c.nome,
        ...(c.email && { clientEmail: c.email }),
        clientPhone: d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`,
        clientCity: String(cidade.id),
        vehiclePlate: c.placa || "",
        vehicleType: TIPO_CRM[c.tipo],
        vehicleBranch: c.marcaId, vehicleModel: c.modeloId, vehicleYear: c.ano,
        vehicleIsWork: Boolean(c.app),
        ...(extras && { observation: extras }),
        utmParameters: { utm_source: "protecaoveicularrn" },
      };
      const r = await buscar(`${CRM}/svQttnDynmcFrm`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(corpo), signal: AbortSignal.timeout(12000) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.success) throw new Error(String(j.message || `PowerCRM respondeu ${r.status}`).slice(0, 200));
      // mesmo destino para onde o formulário deles mandaria o cliente
      const h = j.qttnCd;
      const link = j.redirecTo || (!h ? "" : j.isPlan == 1 ? `${CRM}/${j.specificTable || j.planPriority == 2 ? "newQuotation" : "compareTables"}?h=${h}`
        : j.isPlan > 0 ? `${CRM}/receivedQuotation?h=${h}` : "");
      return { codigo: h ? String(h) : "", link };
    },
  };
}

const igual = (a, b) => {
  const x = Buffer.from(String(a ?? "")), y = Buffer.from(String(b ?? ""));
  return x.length === y.length && timingSafeEqual(x, y);
};
const lerCookie = (req, nome) =>
  (req.headers.cookie || "").split(/;\s*/).find((c) => c.startsWith(nome + "="))?.slice(nome.length + 1) || "";
const paraWa = (tel) => (tel.length <= 11 ? "55" + tel : tel);

export function criarApp({ env = process.env, log = console, buscar = fetch } = {}) {
  const dirDados = env.DADOS_DIR || join(RAIZ, "dados");
  mkdirSync(dirDados, { recursive: true });
  const banco = abrirCotacoes(dirDados);
  const achar = (id) => (/^[\w-]{12}$/.test(id) ? banco.lista.find((c) => c.id === id) : undefined);

  // Perfil do consultor: o que ele muda pelo painel vale mais que as envs.
  const arqPerfil = join(dirDados, "painel.json");
  const perfil = existsSync(arqPerfil) ? JSON.parse(readFileSync(arqPerfil, "utf8")) : {};
  const salvarPerfil = () => { writeFileSync(arqPerfil + ".tmp", JSON.stringify(perfil)); renameSync(arqPerfil + ".tmp", arqPerfil); };

  const cfg = { simuladorUrl: env.SIMULADOR_URL || "" };
  const aplicarPerfil = () => {
    cfg.whatsapp = perfil.whatsapp || (env.WHATSAPP || "").replace(/\D/g, "");
    cfg.consultor = perfil.nome || "Clebson Isaias";
  };
  aplicarPerfil();

  const crm = clienteCrm(env.CRM_FORM_URL, buscar);
  // Nunca derruba o pedido: o resultado fica na cotação e aparece no painel.
  async function mandarAoCrm(c) {
    if (!crm) return;
    try {
      c.crm = { ok: true, em: new Date().toISOString(), ...(await crm.enviar(c)) };
    } catch (e) {
      c.crm = { ok: false, em: new Date().toISOString(), erro: e.message };
      log.warn(`[crm] ${c.nome}: ${e.message}`);
    }
    banco.salvar();
  }

  // Painel: sem env nova em produção, a senha é o LEADS_TOKEN que já existe.
  // Depois que o consultor troca a senha no Perfil, vale o hash gravado e a env é ignorada.
  const senhaEnv = env.PAINEL_SENHA || env.LEADS_TOKEN || "";
  const temPainel = () => Boolean(perfil.senhaHash || senhaEnv);
  const hashSenha = (texto, sal) => scryptSync(String(texto ?? ""), sal, 32).toString("hex");
  const senhaConfere = (texto) => (perfil.senhaHash ? igual(hashSenha(texto, perfil.sal), perfil.senhaHash) : Boolean(senhaEnv) && igual(texto, senhaEnv));
  // trocar a senha troca o segredo: os cookies antigos param de valer
  const assinatura = () => createHmac("sha256", perfil.segredo || senhaEnv).update("painel").digest("hex");
  const logado = (req) => temPainel() && igual(lerCookie(req, "painel"), assinatura());
  const darCookie = (req, res) => res.cookie("painel", assinatura(), { httpOnly: true, sameSite: "lax", secure: req.secure, maxAge: 30 * 86_400_000, path: "/" });

  const app = express();
  app.set("trust proxy", 1);
  app.disable("x-powered-by");

  app.use((_req, res, proximo) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    proximo();
  });

  app.get("/saude", (_req, res) => res.json({ ok: true, servico: "protecao-veicular-rn" }));

  // Config vem do servidor: trocar número/links não exige rebuild.
  app.get("/config.js", (_req, res) => {
    res.type("application/javascript").setHeader("Cache-Control", "no-store");
    res.send(`window.CFG=${JSON.stringify(cfg)};`);
  });

  app.get("/api/veiculos", async (req, res) => {
    if (!crm) return res.status(404).end(); // sem CRM o formulário fica em texto livre
    const n = (v) => (/^\d{1,7}$/.test(String(v ?? "")) ? String(v) : "");
    const marca = n(req.query.marca), ano = n(req.query.ano), tipo = TIPO_CRM[req.query.tipo];
    try {
      const lista = marca && ano ? await crm.modelos(marca, ano) : marca ? await crm.anos(marca) : tipo ? await crm.marcas(tipo) : null;
      if (!lista) return res.status(400).json({ erro: "Informe tipo, ou marca, ou marca e ano." });
      res.setHeader("Cache-Control", "public, max-age=3600").json(lista);
    } catch (e) {
      log.warn(`[crm] listas: ${e.message}`);
      res.status(502).json({ erro: "Lista indisponível." });
    }
  });

  const permitido = limitador(10);
  app.post("/api/leads", express.json({ limit: "16kb" }), (req, res) => {
    const ip = req.ip;
    if (req.body?.site) return res.json({ ok: true }); // honeypot: finge sucesso
    if (!permitido(ip)) return res.status(429).json({ erro: "Muitas tentativas. Tente mais tarde." });
    const { lead, erros } = validarLead(req.body);
    if (erros) return res.status(400).json({ erros });
    const cotacao = { id: novoId(), status: "nova", ts: new Date().toISOString(), ip, ua: String(req.get("user-agent") || "").slice(0, 160), ...lead };
    banco.lista.push(cotacao);
    banco.salvar();
    log.info(`[cotacao] ${lead.nome} · ${lead.marca} ${lead.modelo} ${lead.ano} · ${lead.cidade}`);
    avisarTelegram(env, cotacao, `${req.protocol}://${req.get("host")}`).catch((e) => log.warn(`[telegram] ${e.message}`));
    mandarAoCrm(cotacao);
    res.json({ ok: true });
  });

  // ---- página da cotação: o id aleatório é a chave, quem tem o link vê ----
  app.get("/c/:id", (req, res) => {
    const c = achar(req.params.id);
    if (!c) return res.status(404).type("html").send(paginaCotacao(null, cfg));
    if (c.valores && !c.vistaEm && !logado(req)) {
      c.vistaEm = new Date().toISOString();
      banco.salvar();
    }
    res.type("html").setHeader("Cache-Control", "no-store").send(paginaCotacao(c, cfg));
  });

  // ---- documentos para fechar (CNH, documento do veículo, comprovante) ----
  // O cliente envia pelo link da cotação; só o painel consegue abrir de volta.
  const dirDocs = join(dirDados, "docs");
  const apagarDoc = (id, tipo) => {
    const dir = join(dirDocs, id);
    if (existsSync(dir)) for (const f of readdirSync(dir)) if (f.startsWith(tipo + ".")) rmSync(join(dir, f));
  };
  const envioDoc = limitador(40);
  app.put("/c/:id/doc/:tipo", express.raw({ type: () => true, limit: "10mb" }), (req, res) => {
    const c = achar(req.params.id), tipo = req.params.tipo;
    if (!c || !Object.hasOwn(DOCS, tipo)) return res.status(404).json({ erro: "Cotação não encontrada." });
    if (!c.valores) return res.status(409).json({ erro: "A cotação ainda não está pronta." });
    if (!envioDoc(req.ip)) return res.status(429).json({ erro: "Muitos envios. Tente de novo mais tarde." });
    const arquivo = tipoDoArquivo(req.body);
    if (!arquivo) return res.status(415).json({ erro: "Envie uma foto (JPG, PNG) ou um PDF." });
    mkdirSync(join(dirDocs, c.id), { recursive: true });
    apagarDoc(c.id, tipo); // reenvio substitui o anterior
    writeFileSync(join(dirDocs, c.id, `${tipo}.${arquivo.ext}`), req.body);
    c.docs = { ...c.docs, [tipo]: { ext: arquivo.ext, mime: arquivo.mime, em: new Date().toISOString() } };
    if (PLANOS.some((p) => p.chave === req.query.plano)) c.planoEscolhido = req.query.plano;
    if (c.status === "nova" || c.status === "enviada") c.status = "documentos";
    banco.salvar();
    log.info(`[docs] ${c.nome}: ${tipo} (${Object.keys(c.docs).length} de ${Object.keys(DOCS).length})`);
    res.json({ ok: true });
  });

  // ---- painel do consultor ----
  const painel = express.Router();
  const tentativa = limitador(10);
  painel.use(express.urlencoded({ extended: false, limit: "16kb" }), (req, res, proximo) => {
    if (!temPainel()) return res.status(404).end(); // sem senha configurada o painel não existe
    res.setHeader("Cache-Control", "no-store");
    // formulário vindo de outro site não entra (o cookie Lax já barra o resto)
    const origem = req.get("origin");
    if (req.method === "POST" && origem && URL.parse(origem)?.host !== req.get("host")) return res.status(403).end();
    proximo();
  });
  painel.get("/entrar", (req, res) => (logado(req) ? res.redirect("/painel") : res.type("html").send(paginaEntrar())));
  painel.post("/entrar", (req, res) => {
    if (!tentativa(req.ip)) return res.status(429).type("html").send(paginaEntrar("Muitas tentativas. Espere uma hora e tente de novo."));
    if (!senhaConfere(req.body.senha)) return res.status(401).type("html").send(paginaEntrar("Senha incorreta."));
    darCookie(req, res);
    res.redirect("/painel");
  });
  painel.use((req, res, proximo) => (logado(req) ? proximo() : res.redirect("/painel/entrar")));
  painel.get("/sair", (_req, res) => { res.clearCookie("painel", { path: "/" }); res.redirect("/painel/entrar"); });

  // ---- perfil (antes das rotas /:id, senão "perfil" viraria id de cotação) ----
  const verPerfil = (res, extra = {}, status = 200) => res.status(status).type("html")
    .send(paginaPerfil({ nome: cfg.consultor, whatsapp: perfil.whatsapp || "", senhaTrocada: Boolean(perfil.senhaHash), ...extra }));
  painel.get("/perfil", (req, res) => verPerfil(res, { salvo: String(req.query.ok || "") }));
  painel.post("/perfil", (req, res) => {
    const nome = String(req.body.nome ?? "").trim().slice(0, 60);
    const d = String(req.body.whatsapp ?? "").replace(/\D/g, "");
    const erros = {};
    if (nome.length < 2) erros.nome = "Digite seu nome.";
    if (d && (d.length < 10 || d.length > 13)) erros.whatsapp = "Número com DDD, só dígitos. Ex.: (84) 99999-9999.";
    if (Object.keys(erros).length) return verPerfil(res, { erros, nome }, 400);
    perfil.nome = nome;
    perfil.whatsapp = d ? (d.length <= 11 ? "55" + d : d) : "";
    salvarPerfil(); aplicarPerfil();
    res.redirect("/painel/perfil?ok=dados");
  });
  painel.post("/perfil/senha", (req, res) => {
    const { atual, nova, repetir } = req.body;
    if (!tentativa(req.ip)) return verPerfil(res, { erros: { atual: "Muitas tentativas. Espere uma hora e tente de novo." } }, 429);
    if (!senhaConfere(atual)) return verPerfil(res, { erros: { atual: "A senha atual não confere." } }, 401);
    const erros = {};
    if (typeof nova !== "string" || nova.length < 8 || nova.length > 200) erros.nova = "A nova senha precisa ter de 8 a 200 caracteres.";
    else if (nova !== repetir) erros.repetir = "As duas senhas novas não são iguais.";
    if (Object.keys(erros).length) return verPerfil(res, { erros }, 400);
    perfil.sal = randomBytes(16).toString("hex");
    perfil.senhaHash = hashSenha(nova, perfil.sal);
    perfil.segredo = randomBytes(32).toString("hex");
    salvarPerfil();
    darCookie(req, res); // este aparelho continua dentro
    res.redirect("/painel/perfil?ok=senha");
  });

  painel.get("/", (req, res) => {
    const filtro = Object.hasOwn(STATUS, req.query.status) ? req.query.status : "";
    res.type("html").send(paginaPainel({
      cotacoes: [...banco.lista].reverse(), filtro, aberta: achar(String(req.query.id || "")), salvo: req.query.salvo === "1",
      crmUrl: crm?.formUrl || "",
    }));
  });
  painel.get("/planilha.csv", (_req, res) => {
    res.type("text/csv").setHeader("Content-Disposition", 'attachment; filename="cotacoes-21go.csv"');
    res.send(csvCotacoes([...banco.lista].reverse()));
  });
  painel.get("/:id/doc/:tipo", (req, res) => {
    const c = achar(req.params.id), doc = c?.docs?.[req.params.tipo];
    if (!doc || !Object.hasOwn(DOCS, req.params.tipo)) return res.status(404).end();
    // arquivo veio de fora: abre isolado, sem poder rodar script na origem do painel
    res.setHeader("Content-Security-Policy", "sandbox");
    res.setHeader("Content-Disposition", `inline; filename="${req.params.tipo}-${c.id}.${doc.ext}"`);
    res.type(doc.mime).sendFile(join(dirDocs, c.id, `${req.params.tipo}.${doc.ext}`));
  });
  painel.post("/:id/docs/apagar", (req, res) => {
    const c = achar(req.params.id);
    if (!c) return res.status(404).end();
    rmSync(join(dirDocs, c.id), { recursive: true, force: true });
    delete c.docs;
    banco.salvar();
    res.redirect(`/painel?id=${c.id}`);
  });
  painel.post("/:id/crm", async (req, res) => {
    const c = achar(req.params.id);
    if (!c) return res.status(404).end();
    if (!c.crm?.ok) await mandarAoCrm(c); // já enviada não duplica no CRM
    res.redirect(`/painel?id=${c.id}`);
  });
  painel.post("/:id", (req, res) => {
    const c = achar(req.params.id);
    if (!c) return res.status(404).end();
    const valores = {};
    for (const chave of [...PLANOS.map((p) => p.chave), "ativacao"]) {
      const n = lerValor(req.body[chave]);
      if (n !== null) valores[chave] = n;
    }
    c.valores = Object.keys(valores).length ? valores : undefined;
    c.obs = String(req.body.obs ?? "").trim().slice(0, 500) || undefined;
    if (Object.hasOwn(STATUS, req.body.status)) c.status = req.body.status;
    banco.salvar();
    res.redirect(`/painel?id=${c.id}&salvo=1`);
  });
  // Marca como enviada e leva pro WhatsApp do cliente com a mensagem pronta.
  painel.get("/:id/enviar", (req, res) => {
    const c = achar(req.params.id);
    if (!c?.valores) return res.redirect("/painel");
    if (c.status === "nova") c.status = "enviada";
    c.enviadaEm = new Date().toISOString();
    banco.salvar();
    const link = `${req.protocol}://${req.get("host")}/c/${c.id}`;
    res.redirect(`https://wa.me/${paraWa(c.whatsapp)}?text=${encodeURIComponent(mensagemCotacao(c, link, cfg.consultor))}`);
  });
  app.use("/painel", painel);
  app.get("/leads", (_req, res) => res.redirect("/painel")); // endereço antigo da tabela

  app.use(express.static(DIR_PUBLICO, { maxAge: "1h", extensions: ["html"] }));
  return { app, cfg, arquivo: banco.arquivo };
}

export function mensagemCotacao(c, link, consultor = "Clebson Isaias") {
  const veiculo = [c.marca, c.modelo, c.ano].filter(Boolean).join(" ");
  return [
    `Olá, ${c.nome.split(" ")[0]}! Aqui é ${consultor.split(" ")[0]}, consultor 21Go.`,
    `Sua cotação para o ${veiculo} ficou pronta:`,
    "",
    ...PLANOS.filter((p) => c.valores[p.chave]).map((p) => `${p.nome}: ${brl(c.valores[p.chave])} por mês`),
    c.valores.ativacao ? `Taxa de ativação: ${brl(c.valores.ativacao)}` : null,
    "",
    `Veja o que cada plano cobre e escolha o seu: ${link}`,
  ].filter((l) => l !== null).join("\n");
}

async function avisarTelegram(env, c, base) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return;
  const texto = [
    "🚗 Novo pedido de cotação",
    `Nome: ${c.nome}`, `WhatsApp: ${c.whatsapp}`,
    `Veículo: ${c.tipo} ${c.marca} ${c.modelo} ${c.ano} · ${c.zeroKm ? "0 km" : c.placa}`, `Cidade: ${c.cidade}`,
    `App: ${c.app ? "sim" : "não"} · Leilão: ${c.leilao ? "sim" : "não"} · Tem seguro: ${c.temSeguro ? "sim" : "não"}`,
    c.plano ? `Plano de interesse: ${c.plano}` : null,
    `${base}/painel?id=${c.id}`,
  ].filter(Boolean).join("\n");
  await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text: texto }),
    signal: AbortSignal.timeout(3000),
  });
}
