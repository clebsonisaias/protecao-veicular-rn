/** O mínimo que falha se o pedido de cotação ou o painel quebrarem. `npm run teste`. */
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";
import { criarApp, lerValor, validarLead } from "../servidor/app.js";

const pastas = [];
const pasta = () => { const d = mkdtempSync(join(tmpdir(), "pvrn-")); pastas.push(d); return d; };
after(() => pastas.forEach((d) => rmSync(d, { recursive: true, force: true })));
const mudo = { info() {}, warn() {} };

const OK = { nome: "Ana Souza", whatsapp: "(84) 99999-1234", placa: "abc-1d23", marca: "Hyundai", modelo: "HB20", ano: "2019", cidade: "Natal", tipo: "carro", app: "sim" };

test("validarLead aceita pedido completo e normaliza telefone e placa", () => {
  const { lead, erros } = validarLead(OK);
  assert.equal(erros, undefined);
  assert.equal(lead.whatsapp, "84999991234");
  assert.equal(lead.placa, "ABC1D23");
  assert.equal(lead.app, true);
  assert.equal(lead.leilao, false);
});

test("validarLead recusa nome só, telefone curto, ano, cidade, placa e e-mail inválidos", () => {
  const { erros } = validarLead({ ...OK, nome: "Ana", whatsapp: "123", ano: "1900", cidade: "Recife", placa: "12345", email: "ana@" });
  assert.ok(erros.nome && erros.whatsapp && erros.ano && erros.cidade && erros.placa && erros.email);
});

test("validarLead dispensa a placa de veículo 0 km", () => {
  const { lead, erros } = validarLead({ ...OK, placa: "", zeroKm: "sim" });
  assert.equal(erros, undefined);
  assert.equal(lead.zeroKm, true);
});

test("lerValor entende vírgula, ponto e milhar; recusa lixo", () => {
  assert.equal(lerValor("227,41"), 227.41);
  assert.equal(lerValor("227.41"), 227.41);
  assert.equal(lerValor("R$ 1.227,41"), 1227.41);
  assert.equal(lerValor(""), null);
  assert.equal(lerValor("abc"), null);
});

test("pedido de cotação, painel, envio e página do cliente de ponta a ponta", async () => {
  const { app, arquivo } = criarApp({ env: { DADOS_DIR: pasta(), PAINEL_SENHA: "s3nha", WHATSAPP: "5584999990000" }, log: mudo });
  const srv = app.listen(0);
  after(() => srv.close());
  const base = `http://127.0.0.1:${srv.address().port}`;
  const post = (b) => fetch(`${base}/api/leads`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) });
  const form = (caminho, corpo, cookie = "") => fetch(base + caminho, {
    method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded", cookie }, body: new URLSearchParams(corpo),
  });

  assert.equal((await post({ ...OK, site: "bot" })).status, 200);
  assert.ok(!existsSync(arquivo), "honeypot não pode gravar");
  assert.equal((await post({ nome: "x" })).status, 400);
  assert.equal((await post(OK)).status, 200);
  const [salva] = JSON.parse(readFileSync(arquivo, "utf8"));
  assert.equal(salva.modelo, "HB20");
  assert.equal(salva.status, "nova");

  // painel fechado sem login, senha errada não entra
  const semLogin = await fetch(`${base}/painel`, { redirect: "manual" });
  assert.equal(semLogin.status, 302);
  assert.equal(semLogin.headers.get("location"), "/painel/entrar");
  assert.equal((await fetch(`${base}/painel/planilha.csv`, { redirect: "manual" })).status, 302);
  assert.equal((await form(`/painel/${salva.id}`, { vip: "1" })).status, 302, "POST sem cookie vai pro login");
  assert.equal(JSON.parse(readFileSync(arquivo, "utf8"))[0].valores, undefined);
  assert.equal((await form("/painel/entrar", { senha: "errada" })).status, 401);
  assert.equal((await form("/painel/entrar", { senha: "s3nha" }, "", )).status, 302);
  const entrou = await form("/painel/entrar", { senha: "s3nha" });
  const cookie = entrou.headers.get("set-cookie").split(";")[0];
  assert.match(entrou.headers.get("set-cookie"), /HttpOnly/);

  const painel = await (await fetch(`${base}/painel?id=${salva.id}`, { headers: { cookie } })).text();
  assert.match(painel, /Ana Souza/);
  assert.match(painel, /ABC1D23/);

  // formulário vindo de outro site é recusado mesmo com cookie
  const deFora = await fetch(`${base}/painel/${salva.id}`, { method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded", cookie, origin: "https://malicioso.example" }, body: "vip=1" });
  assert.equal(deFora.status, 403);

  // antes dos valores a página do cliente não mostra preço nem conta como vista
  assert.match(await (await fetch(`${base}/c/${salva.id}`)).text(), /sendo montada/);
  assert.equal((await fetch(`${base}/c/naoexiste123`)).status, 404);

  assert.equal((await form(`/painel/${salva.id}`, { basico: "172,70", vip: "227,41", ativacao: "150", obs: "<b>oi</b>", status: "nova" }, cookie)).status, 302);
  const enviar = await fetch(`${base}/painel/${salva.id}/enviar`, { redirect: "manual", headers: { cookie } });
  const destino = decodeURIComponent(enviar.headers.get("location"));
  assert.match(destino, /^https:\/\/wa\.me\/5584999991234\?text=/);
  assert.match(destino, /VIP: R\$\s227,41 por mês/);
  assert.match(destino, new RegExp(`/c/${salva.id}`));

  const cliente = await (await fetch(`${base}/c/${salva.id}`)).text();
  assert.match(cliente, /227<small>,41/);
  assert.doesNotMatch(cliente, /Premium/, "plano sem valor não aparece");
  assert.doesNotMatch(cliente, /<b>oi<\/b>/, "observação é escapada");
  const depois = JSON.parse(readFileSync(arquivo, "utf8"))[0];
  assert.equal(depois.status, "enviada");
  assert.ok(depois.vistaEm, "abertura pelo cliente fica registrada");

  const csv = await (await fetch(`${base}/painel/planilha.csv`, { headers: { cookie } })).text();
  assert.match(csv, /"Ana Souza";"84999991234"/);
  assert.match(csv, /"227,41"/);

  assert.match(await (await fetch(`${base}/config.js`)).text(), /5584999990000/);
});

test("leads do site antigo viram cotações; sem senha o painel não existe", async () => {
  const dir = pasta();
  writeFileSync(join(dir, "leads.jsonl"), JSON.stringify({ ts: "2026-10-07T00:27:30.832Z", nome: "Lead Antigo", whatsapp: "84988887777", modelo: "Onix", ano: "2016", cidade: "Parnamirim", tipo: "carro" }) + "\n");
  const { app, arquivo } = criarApp({ env: { DADOS_DIR: dir }, log: mudo });
  const [antigo] = JSON.parse(readFileSync(arquivo, "utf8"));
  assert.equal(antigo.nome, "Lead Antigo");
  assert.match(antigo.id, /^[\w-]{12}$/);
  assert.ok(existsSync(join(dir, "leads.jsonl")), "o arquivo antigo fica como backup");

  const srv = app.listen(0);
  after(() => srv.close());
  assert.equal((await fetch(`http://127.0.0.1:${srv.address().port}/painel`, { redirect: "manual" })).status, 404);
});
