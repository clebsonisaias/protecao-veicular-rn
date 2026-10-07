/** O mínimo que falha se a captura quebrar. `npm run teste`. */
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";
import { criarApp, validarLead } from "../servidor/app.js";

const DIR = mkdtempSync(join(tmpdir(), "pvrn-"));
after(() => rmSync(DIR, { recursive: true, force: true }));

const OK = { nome: "Ana Souza", whatsapp: "(84) 99999-1234", modelo: "HB20", ano: "2019", cidade: "Natal", tipo: "carro", app: "sim" };

test("validarLead aceita lead completo e normaliza o telefone", () => {
  const { lead, erros } = validarLead(OK);
  assert.equal(erros, undefined);
  assert.equal(lead.whatsapp, "84999991234");
  assert.equal(lead.app, true);
  assert.equal(lead.leilao, false);
});

test("validarLead recusa nome só, telefone curto, ano e cidade inválidos", () => {
  const { erros } = validarLead({ ...OK, nome: "Ana", whatsapp: "123", ano: "1900", cidade: "Recife" });
  assert.ok(erros.nome && erros.whatsapp && erros.ano && erros.cidade);
});

test("POST /api/leads grava; honeypot não grava; /leads exige token", async () => {
  const { app, arquivo } = criarApp({ env: { DADOS_DIR: DIR, LEADS_TOKEN: "t0k", WHATSAPP: "5584999990000" }, log: { info() {}, warn() {} } });
  const srv = app.listen(0);
  const base = `http://127.0.0.1:${srv.address().port}`;
  const post = (b) => fetch(`${base}/api/leads`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) });

  assert.equal((await post({ ...OK, site: "bot" })).status, 200);
  assert.ok(!existsSync(arquivo), "honeypot não pode gravar");

  assert.equal((await post({ nome: "x" })).status, 400);
  assert.equal((await post(OK)).status, 200);
  const linhas = readFileSync(arquivo, "utf8").trim().split("\n");
  assert.equal(linhas.length, 1);
  assert.equal(JSON.parse(linhas[0]).modelo, "HB20");

  assert.equal((await fetch(`${base}/leads`)).status, 404);
  const r = await fetch(`${base}/leads?token=t0k`);
  assert.equal(r.status, 200);
  assert.match(await r.text(), /Ana Souza/);

  const cfg = await (await fetch(`${base}/config.js`)).text();
  assert.match(cfg, /5584999990000/);
  srv.close();
});
