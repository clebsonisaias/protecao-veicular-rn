/** O mínimo que falha se o pedido de cotação ou o painel quebrarem. `npm run teste`. */
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";
import { criarApp, lerValor, tipoDoArquivo, validarLead } from "../servidor/app.js";

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

test("com CRM_FORM_URL: listas vêm do PowerCRM e o pedido é reenviado pra lá", async () => {
  const chamadas = [];
  let crmFora = false;
  const resposta = (dado, status = 200) => ({ ok: status < 400, status, json: async () => dado });
  const buscar = async (url, opcoes = {}) => {
    chamadas.push({ url, corpo: opcoes.body && JSON.parse(opcoes.body) });
    if (url.includes("/cb/?type=1")) return resposta([{ id: 38, text: "Hyundai", lixo: null }]);
    if (url.includes("/bmy/?cb=38")) return resposta([{ id: 32000, text: "Zero KM" }, { id: 2019, text: "2019" }]);
    if (url.includes("/cmby/?cb=38&cy=2019")) return resposta([{ id: 9400, text: "HB20 1.0" }]);
    if (url.includes("/city/ct?st=20")) return resposta([{ id: 3770, text: "Natal" }]);
    if (url.includes("/frmByCd?code=FORM123")) return resposta({ companyHash: "hash1", pipelineColumnId: 1, leadSourceId: 1584, leadSubSourceId: null, funnelStageId: null });
    if (url.endsWith("/svQttnDynmcFrm")) return crmFora ? resposta({ success: false, message: "fora do ar" }) : resposta({ success: true, qttnCd: "QT1", isPlan: 1, planPriority: 1 });
    return resposta({}, 404);
  };
  const { app, arquivo } = criarApp({ env: { DADOS_DIR: pasta(), PAINEL_SENHA: "s3nha", CRM_FORM_URL: "https://cotacao.me/FORM123?id=CONS9" }, log: mudo, buscar });
  const srv = app.listen(0);
  after(() => srv.close());
  const base = `http://127.0.0.1:${srv.address().port}`;
  const post = (b) => fetch(`${base}/api/leads`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) });
  const salvas = () => JSON.parse(readFileSync(arquivo, "utf8"));
  const esperarCrm = async (i) => { for (let n = 0; n < 100 && !salvas()[i]?.crm; n++) await new Promise((r) => setTimeout(r, 10)); return salvas()[i]; };

  assert.deepEqual(await (await fetch(`${base}/api/veiculos?tipo=carro`)).json(), [{ id: 38, text: "Hyundai" }]);
  assert.deepEqual(await (await fetch(`${base}/api/veiculos?marca=38`)).json(), [{ id: 2019, text: "2019" }], "Zero KM sai da lista de anos");
  assert.deepEqual(await (await fetch(`${base}/api/veiculos?marca=38&ano=2019`)).json(), [{ id: 9400, text: "HB20 1.0" }]);
  assert.equal((await fetch(`${base}/api/veiculos?marca=../x`)).status, 400);

  assert.equal((await post({ ...OK, marcaId: "38", modeloId: "9400", leilao: "sim" })).status, 200);
  const enviada = await esperarCrm(0);
  assert.equal(enviada.crm.ok, true);
  assert.equal(enviada.crm.link, "https://app.powercrm.com.br/compareTables?h=QT1");
  const { corpo } = chamadas.find((c) => c.url.endsWith("/svQttnDynmcFrm"));
  assert.deepEqual(
    { ...corpo, utmParameters: undefined },
    { companyHash: "hash1", formCode: "FORM123", leadSource: "1584", pipelineColumn: "1", companyUserCode: "CONS9", clientName: "Ana Souza",
      clientPhone: "(84) 99999-1234", clientCity: "3770", vehiclePlate: "ABC1D23", vehicleType: "1", vehicleBranch: "38", vehicleModel: "9400",
      vehicleYear: "2019", vehicleIsWork: true, observation: "Leilão ou remarcado", utmParameters: undefined },
  );

  // texto livre (listas não carregaram) e CRM fora do ar: o pedido fica salvo e o painel mostra o motivo
  assert.equal((await post(OK)).status, 200);
  assert.match((await esperarCrm(1)).crm.erro, /texto livre/);
  crmFora = true;
  assert.equal((await post({ ...OK, marcaId: "38", modeloId: "9400" })).status, 200);
  assert.equal((await esperarCrm(2)).crm.erro, "fora do ar");

  // reenviar pelo painel quando o CRM volta; a já enviada não duplica
  const entrou = await fetch(`${base}/painel/entrar`, { method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "senha=s3nha" });
  const cookie = entrou.headers.get("set-cookie").split(";")[0];
  const reenviar = (id) => fetch(`${base}/painel/${id}/crm`, { method: "POST", redirect: "manual", headers: { cookie } });
  crmFora = false;
  const antes = chamadas.filter((c) => c.url.endsWith("/svQttnDynmcFrm")).length;
  await reenviar(salvas()[2].id);
  await reenviar(salvas()[0].id);
  assert.equal(salvas()[2].crm.ok, true);
  assert.equal(chamadas.filter((c) => c.url.endsWith("/svQttnDynmcFrm")).length, antes + 1);
  assert.match(await (await fetch(`${base}/painel?id=${salvas()[1].id}`, { headers: { cookie } })).text(), /Não entrou no PowerCRM/);
});

test("sem CRM_FORM_URL as listas não existem e nada sai do servidor", async () => {
  const buscar = async () => { throw new Error("não devia chamar"); };
  const { app, arquivo } = criarApp({ env: { DADOS_DIR: pasta() }, log: mudo, buscar });
  const srv = app.listen(0);
  after(() => srv.close());
  const base = `http://127.0.0.1:${srv.address().port}`;
  assert.equal((await fetch(`${base}/api/veiculos?tipo=carro`)).status, 404);
  assert.equal((await fetch(`${base}/api/leads`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(OK) })).status, 200);
  assert.equal(JSON.parse(readFileSync(arquivo, "utf8"))[0].crm, undefined);
});

test("documentos: cliente envia pelo link, só o painel abre, e dá para apagar", async () => {
  const { app, arquivo } = criarApp({ env: { DADOS_DIR: pasta(), PAINEL_SENHA: "s3nha" }, log: mudo });
  const srv = app.listen(0);
  after(() => srv.close());
  const base = `http://127.0.0.1:${srv.address().port}`;
  await fetch(`${base}/api/leads`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(OK) });
  const salva = () => JSON.parse(readFileSync(arquivo, "utf8"))[0];
  const { id } = salva();
  const jpg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(40, 7)]);
  const enviar = (tipo, corpo, q = "") => fetch(`${base}/c/${id}/doc/${tipo}${q}`, { method: "PUT", body: corpo });

  assert.equal(tipoDoArquivo(jpg).ext, "jpg");
  assert.equal(tipoDoArquivo(Buffer.from("%PDF-1.7 conteudo qualquer")).ext, "pdf");
  assert.equal(tipoDoArquivo(Buffer.from("<script>alert(1)</script>")), null);

  assert.equal((await enviar("cnh", jpg)).status, 409, "sem cotação pronta não aceita documento");
  const entrou = await fetch(`${base}/painel/entrar`, { method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "senha=s3nha" });
  const cookie = entrou.headers.get("set-cookie").split(";")[0];
  const painelPost = (caminho, corpo = "") => fetch(base + caminho, { method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded", cookie }, body: corpo });
  await painelPost(`/painel/${id}`, "vip=227,41&status=enviada");

  assert.equal((await enviar("cnh", Buffer.from("<script>alert(1)</script>"))).status, 415);
  assert.equal((await enviar("../../x", jpg)).status, 404);
  assert.equal((await enviar("passaporte", jpg)).status, 404);
  assert.equal((await fetch(`${base}/c/naoexiste123/doc/cnh`, { method: "PUT", body: jpg })).status, 404);
  assert.equal((await enviar("cnh", jpg, "?plano=vip")).status, 200);
  assert.equal((await enviar("cnh", Buffer.from("%PDF-1.7 conteudo qualquer"))).status, 200, "reenvio substitui");
  assert.equal(salva().status, "documentos");
  assert.equal(salva().planoEscolhido, "vip");
  assert.equal(salva().docs.cnh.ext, "pdf");

  assert.match(await (await fetch(`${base}/c/${id}`)).text(), /Recebido em/);
  assert.equal((await fetch(`${base}/painel/${id}/doc/cnh`, { redirect: "manual" })).status, 302, "sem login não abre documento");
  const aberto = await fetch(`${base}/painel/${id}/doc/cnh`, { headers: { cookie } });
  assert.equal(aberto.status, 200);
  assert.equal(aberto.headers.get("content-type"), "application/pdf");
  assert.equal(aberto.headers.get("content-security-policy"), "sandbox");
  assert.match(await aberto.text(), /^%PDF-/);
  assert.equal((await fetch(`${base}/painel/${id}/doc/veiculo`, { headers: { cookie } })).status, 404);

  await painelPost(`/painel/${id}/docs/apagar`);
  assert.equal(salva().docs, undefined);
  assert.equal((await fetch(`${base}/painel/${id}/doc/cnh`, { headers: { cookie } })).status, 404);
});

test("perfil: troca de senha derruba a antiga e o cookie antigo; nome e WhatsApp passam a valer", async () => {
  const dir = pasta();
  const subir = () => { const { app } = criarApp({ env: { DADOS_DIR: dir, PAINEL_SENHA: "senha-da-env" }, log: mudo }); const srv = app.listen(0); after(() => srv.close()); return `http://127.0.0.1:${srv.address().port}`; };
  const base = subir();
  const form = (b, caminho, corpo, cookie = "") => fetch(b + caminho, { method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded", cookie }, body: new URLSearchParams(corpo) });
  const entrar = async (b, senha) => { const r = await form(b, "/painel/entrar", { senha }); return { status: r.status, cookie: r.headers.get("set-cookie")?.split(";")[0] }; };

  const { cookie } = await entrar(base, "senha-da-env");
  assert.equal((await fetch(`${base}/painel/perfil`, { redirect: "manual" })).status, 302, "perfil exige login");
  assert.match(await (await fetch(`${base}/painel/perfil`, { headers: { cookie } })).text(), /Trocar a senha/);

  assert.equal((await form(base, "/painel/perfil", { nome: "Clebson Silva", whatsapp: "(84) 98888-7777" }, cookie)).status, 302);
  assert.match(await (await fetch(`${base}/config.js`)).text(), /"whatsapp":"5584988887777"/);
  assert.equal((await form(base, "/painel/perfil", { nome: "C", whatsapp: "123" }, cookie)).status, 400);

  assert.equal((await form(base, "/painel/perfil/senha", { atual: "errada", nova: "nova-senha-1", repetir: "nova-senha-1" }, cookie)).status, 401);
  assert.equal((await form(base, "/painel/perfil/senha", { atual: "senha-da-env", nova: "curta", repetir: "curta" }, cookie)).status, 400);
  assert.equal((await form(base, "/painel/perfil/senha", { atual: "senha-da-env", nova: "nova-senha-1", repetir: "outra-coisa" }, cookie)).status, 400);
  const trocou = await form(base, "/painel/perfil/senha", { atual: "senha-da-env", nova: "nova-senha-1", repetir: "nova-senha-1" }, cookie);
  assert.equal(trocou.status, 302);
  const novoCookie = trocou.headers.get("set-cookie").split(";")[0];
  assert.equal((await fetch(`${base}/painel`, { redirect: "manual", headers: { cookie } })).status, 302, "cookie antigo deixa de valer");
  assert.equal((await fetch(`${base}/painel`, { redirect: "manual", headers: { cookie: novoCookie } })).status, 200);
  assert.equal((await entrar(base, "senha-da-env")).status, 401, "a senha da env deixa de valer");
  assert.doesNotMatch(readFileSync(join(dir, "painel.json"), "utf8"), /nova-senha-1/, "a senha não fica gravada em texto");

  // sobrevive a reinício do servidor (deploy)
  const base2 = subir();
  assert.equal((await entrar(base2, "nova-senha-1")).status, 302);
  assert.equal((await entrar(base2, "senha-da-env")).status, 401);
  assert.match(await (await fetch(`${base2}/config.js`)).text(), /Clebson Silva/);
});
