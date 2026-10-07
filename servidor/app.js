/**
 * Proteção Veicular RN: site estático + captura de lead.
 *
 * Fábrica em vez de módulo com efeito colateral: o teste sobe o app com um
 * diretório de dados temporário e envs próprias.
 */

import express from "express";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIR_PUBLICO = join(RAIZ, "publico");

const CIDADES_RN = new Set([
  "Natal", "Parnamirim", "Mossoró", "São Gonçalo do Amarante", "Macaíba",
  "Ceará-Mirim", "Caicó", "Extremoz", "Nísia Floresta", "Outra cidade",
]);

export function validarLead(b = {}) {
  const s = (v, max) => String(v ?? "").trim().slice(0, max);
  const nome = s(b.nome, 80);
  const whatsapp = s(b.whatsapp, 20).replace(/\D/g, "");
  const modelo = s(b.modelo, 80);
  const ano = s(b.ano, 4);
  const cidade = s(b.cidade, 40);
  const tipo = s(b.tipo, 12);
  const plano = s(b.plano, 20);
  const erros = {};
  if (nome.length < 2 || !/\s/.test(nome)) erros.nome = "Digite seu nome e sobrenome.";
  if (whatsapp.length < 10 || whatsapp.length > 13) erros.whatsapp = "WhatsApp com DDD, só números.";
  if (modelo.length < 2) erros.modelo = "Diga o modelo do veículo.";
  const anoN = Number(ano);
  if (!/^\d{4}$/.test(ano) || anoN < 1980 || anoN > new Date().getFullYear() + 1) erros.ano = "Ano inválido.";
  if (!["carro", "moto", "utilitario"].includes(tipo)) erros.tipo = "Escolha o tipo.";
  if (!CIDADES_RN.has(cidade)) erros.cidade = "Escolha a cidade.";
  if (Object.keys(erros).length) return { erros };
  return {
    lead: {
      nome, whatsapp, modelo, ano, cidade, tipo,
      plano: plano || null,
      app: b.app === "sim",
      leilao: b.leilao === "sim",
      temSeguro: b.temSeguro === "sim",
    },
  };
}

export function criarApp({ env = process.env, log = console } = {}) {
  const dirDados = env.DADOS_DIR || join(RAIZ, "dados");
  mkdirSync(dirDados, { recursive: true });
  const arquivo = join(dirDados, "leads.jsonl");

  const cfg = {
    whatsapp: (env.WHATSAPP || "").replace(/\D/g, ""),
    simuladorUrl: env.SIMULADOR_URL || "",
    equipeUrl: env.EQUIPE_URL || "",
  };

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

  // ponytail: limitador em memória por IP, basta pra um site de consultor.
  const porIp = new Map();
  function permitido(ip) {
    const agora = Date.now();
    const lista = (porIp.get(ip) || []).filter((t) => agora - t < 3_600_000);
    lista.push(agora);
    porIp.set(ip, lista);
    return lista.length <= 10;
  }

  app.post("/api/leads", express.json({ limit: "16kb" }), (req, res) => {
    const ip = req.ip;
    if (req.body?.site) return res.json({ ok: true }); // honeypot: finge sucesso
    if (!permitido(ip)) return res.status(429).json({ erro: "Muitas tentativas. Tente mais tarde." });
    const { lead, erros } = validarLead(req.body);
    if (erros) return res.status(400).json({ erros });
    const linha = { ts: new Date().toISOString(), ip, ua: String(req.get("user-agent") || "").slice(0, 160), ...lead };
    appendFileSync(arquivo, JSON.stringify(linha) + "\n");
    log.info(`[lead] ${lead.nome} · ${lead.modelo} ${lead.ano} · ${lead.cidade}`);
    avisarTelegram(env, linha).catch((e) => log.warn(`[telegram] ${e.message}`));
    res.json({ ok: true });
  });

  app.get("/leads", (req, res) => {
    if (!env.LEADS_TOKEN || req.query.token !== env.LEADS_TOKEN) return res.status(404).end();
    const leads = existsSync(arquivo)
      ? readFileSync(arquivo, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)).reverse()
      : [];
    res.type("html").setHeader("Cache-Control", "no-store").send(paginaLeads(leads));
  });

  app.use(express.static(DIR_PUBLICO, { maxAge: "1h", extensions: ["html"] }));
  return { app, cfg, arquivo };
}

async function avisarTelegram(env, l) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return;
  const texto = [
    "🚗 Novo lead no site",
    `Nome: ${l.nome}`, `WhatsApp: ${l.whatsapp}`,
    `Veículo: ${l.tipo} ${l.modelo} ${l.ano}`, `Cidade: ${l.cidade}`,
    `App: ${l.app ? "sim" : "não"} · Leilão: ${l.leilao ? "sim" : "não"} · Tem seguro: ${l.temSeguro ? "sim" : "não"}`,
    l.plano ? `Plano de interesse: ${l.plano}` : null,
  ].filter(Boolean).join("\n");
  await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text: texto }),
    signal: AbortSignal.timeout(3000),
  });
}

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function paginaLeads(leads) {
  const linhas = leads.map((l) => `<tr>
    <td>${esc(l.ts.slice(0, 16).replace("T", " "))}</td><td>${esc(l.nome)}</td>
    <td><a href="https://wa.me/55${esc(l.whatsapp.replace(/^55/, ""))}">${esc(l.whatsapp)}</a></td>
    <td>${esc(l.tipo)} ${esc(l.modelo)} ${esc(l.ano)}</td><td>${esc(l.cidade)}</td>
    <td>${l.app ? "app " : ""}${l.leilao ? "leilão " : ""}${l.temSeguro ? "tem seguro" : ""}</td><td>${esc(l.plano || "")}</td>
  </tr>`).join("");
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex"><title>Leads (${leads.length})</title>
<style>body{font:14px/1.5 system-ui;margin:16px;color:#0f172a}table{border-collapse:collapse;width:100%}th,td{text-align:left;padding:6px 8px;border-bottom:1px solid #e2e8f0;vertical-align:top}th{background:#f6f8fb}a{color:#15803d}</style>
</head><body><h1>Leads do site (${leads.length})</h1><table><thead><tr><th>Quando</th><th>Nome</th><th>WhatsApp</th><th>Veículo</th><th>Cidade</th><th>Perfil</th><th>Plano</th></tr></thead><tbody>${linhas}</tbody></table></body></html>`;
}
