/**
 * Proteção Veicular RN: site + pedido de cotação + painel do consultor.
 *
 * Fábrica em vez de módulo com efeito colateral: o teste sobe o app com um
 * diretório de dados temporário e envs próprias.
 */

import express from "express";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PLANOS, STATUS, brl, csvCotacoes, paginaCotacao, paginaEntrar, paginaPainel } from "./paginas.js";

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

const igual = (a, b) => {
  const x = Buffer.from(String(a ?? "")), y = Buffer.from(String(b ?? ""));
  return x.length === y.length && timingSafeEqual(x, y);
};
const lerCookie = (req, nome) =>
  (req.headers.cookie || "").split(/;\s*/).find((c) => c.startsWith(nome + "="))?.slice(nome.length + 1) || "";
const paraWa = (tel) => (tel.length <= 11 ? "55" + tel : tel);

export function criarApp({ env = process.env, log = console } = {}) {
  const dirDados = env.DADOS_DIR || join(RAIZ, "dados");
  mkdirSync(dirDados, { recursive: true });
  const banco = abrirCotacoes(dirDados);
  const achar = (id) => (/^[\w-]{12}$/.test(id) ? banco.lista.find((c) => c.id === id) : undefined);

  const cfg = {
    whatsapp: (env.WHATSAPP || "").replace(/\D/g, ""),
    simuladorUrl: env.SIMULADOR_URL || "",
  };

  // Painel: sem env nova em produção, a senha é o LEADS_TOKEN que já existe.
  const senha = env.PAINEL_SENHA || env.LEADS_TOKEN || "";
  const assinatura = senha ? createHmac("sha256", senha).update("painel").digest("hex") : "";
  const logado = (req) => Boolean(assinatura) && igual(lerCookie(req, "painel"), assinatura);

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

  // ---- painel do consultor ----
  const painel = express.Router();
  const tentativa = limitador(10);
  painel.use(express.urlencoded({ extended: false, limit: "16kb" }), (req, res, proximo) => {
    if (!senha) return res.status(404).end(); // sem senha configurada o painel não existe
    res.setHeader("Cache-Control", "no-store");
    // formulário vindo de outro site não entra (o cookie Lax já barra o resto)
    const origem = req.get("origin");
    if (req.method === "POST" && origem && URL.parse(origem)?.host !== req.get("host")) return res.status(403).end();
    proximo();
  });
  painel.get("/entrar", (req, res) => (logado(req) ? res.redirect("/painel") : res.type("html").send(paginaEntrar())));
  painel.post("/entrar", (req, res) => {
    if (!tentativa(req.ip)) return res.status(429).type("html").send(paginaEntrar("Muitas tentativas. Espere uma hora e tente de novo."));
    if (!igual(req.body.senha, senha)) return res.status(401).type("html").send(paginaEntrar("Senha incorreta."));
    res.cookie("painel", assinatura, { httpOnly: true, sameSite: "lax", secure: req.secure, maxAge: 30 * 86_400_000, path: "/" });
    res.redirect("/painel");
  });
  painel.use((req, res, proximo) => (logado(req) ? proximo() : res.redirect("/painel/entrar")));
  painel.get("/sair", (_req, res) => { res.clearCookie("painel", { path: "/" }); res.redirect("/painel/entrar"); });

  painel.get("/", (req, res) => {
    const filtro = Object.hasOwn(STATUS, req.query.status) ? req.query.status : "";
    res.type("html").send(paginaPainel({
      cotacoes: [...banco.lista].reverse(), filtro, aberta: achar(String(req.query.id || "")), salvo: req.query.salvo === "1",
    }));
  });
  painel.get("/planilha.csv", (_req, res) => {
    res.type("text/csv").setHeader("Content-Disposition", 'attachment; filename="cotacoes-21go.csv"');
    res.send(csvCotacoes([...banco.lista].reverse()));
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
    res.redirect(`https://wa.me/${paraWa(c.whatsapp)}?text=${encodeURIComponent(mensagemCotacao(c, link))}`);
  });
  app.use("/painel", painel);
  app.get("/leads", (_req, res) => res.redirect("/painel")); // endereço antigo da tabela

  app.use(express.static(DIR_PUBLICO, { maxAge: "1h", extensions: ["html"] }));
  return { app, cfg, arquivo: banco.arquivo };
}

export function mensagemCotacao(c, link) {
  const veiculo = [c.marca, c.modelo, c.ano].filter(Boolean).join(" ");
  return [
    `Olá, ${c.nome.split(" ")[0]}! Aqui é o Clebson, consultor 21Go.`,
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
