# Proteção Veicular RN

Site de vendas de proteção veicular **21Go** para Natal e todo o RN, operado por consultor independente (Clebson Isaias). O cliente pede a cotação no site, o pedido cai numa planilha no painel, você calcula no sistema da 21Go, digita os valores e devolve pelo WhatsApp com o link de uma página própria da cotação.

Stack: HTML/CSS/JS direto, servido por Node + Express. Zero build.

```bash
npm install
npm run dev        # http://localhost:3000 (lê .env se existir)
npm run teste      # node --test
```

## Como a cotação anda

1. Cliente preenche em 3 passos (placa, veículo, contato) → `POST /api/leads` grava com status **Nova** e avisa no Telegram.
   Com `CRM_FORM_URL`, o pedido também é enviado ao PowerCRM pelo mesmo endereço que o formulário do cotacao.me usa (`app.powercrm.com.br/svQttnDynmcFrm`, sem token). Se o CRM recusar ou estiver fora do ar, o pedido continua salvo e o painel mostra o motivo, com botão para reenviar. "Outra cidade" e pedidos em texto livre não têm código no CRM e ficam para preenchimento à mão.
2. `/painel` (senha): planilha com as colunas na ordem do simulador oficial. Clicar numa célula copia o valor. "Baixar planilha" gera CSV para Excel/Sheets.
3. "Abrir" numa linha: digite o valor de cada plano e a taxa de ativação, salve, e clique em **Enviar cotação no WhatsApp**. Isso marca como **Cotação enviada** e abre a conversa do cliente com a mensagem e o link prontos.
4. O cliente abre `/c/<id>` (link privado, fora do Google), vê os planos com os valores e clica em "Quero o plano X", que cai no seu WhatsApp. O painel mostra "cliente abriu".
5. Na mesma página o cliente envia os três documentos para fechar (CNH, documento do veículo, comprovante de residência), em foto ou PDF de até 10 MB. A linha vira **Documentos recebidos** e os arquivos abrem só pelo painel. "Apagar documentos" remove os arquivos do servidor: use depois de cadastrar no CRM.
6. Feche a linha como **Fechou** ou **Perdeu**.

## Variáveis de ambiente

| Var | Obrigatória | Para quê |
|---|---|---|
| `WHATSAPP` | não | Pode ser definido em **Perfil** no painel, que tem prioridade. Seu número, só dígitos com 55+DDD (ex.: `5584999990000`). Sem ela os botões "Quero o plano" e "Chamar no WhatsApp" somem. |
| `PAINEL_SENHA` | sim, na primeira vez | Senha inicial do `/painel` (ou o `LEADS_TOKEN` antigo). Depois que você troca a senha em **Perfil**, vale a nova e esta env é ignorada. Sem nenhuma senha o painel some (404). |
| `CRM_FORM_URL` | recomendada | Seu link de cotação do PowerCRM (`https://cotacao.me/<formulário>?id=<seu código>`). Com ela, marca/ano/modelo viram listas do catálogo da 21Go e cada pedido entra sozinho no seu CRM. Sem ela o site funciona em texto livre e nada é enviado. |
| `ANTHROPIC_API_KEY` | não | Liga a leitura automática dos documentos no painel (Claude Opus 5.5 lê CNH, documento do veículo e comprovante e devolve os campos do CRM). Sem ela o botão não aparece. Cada leitura é cobrada na conta da Anthropic. |
| `SIMULADOR_URL` | não | Link oficial do consultor na 21Go (`https://simule.21go.online/<seu-slug>`), guardado pra uso futuro. |
| `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` | não | Aviso instantâneo de pedido novo no Telegram, com link direto pro painel. |
| `DADOS_DIR` | no Docker já vem | Pasta do `cotacoes.json`. **Tem de ser volume persistente** no Coolify. |
| `PORT` | não | Padrão 3000. |

## Onde mexer

- Textos, preços de exemplo e planos da página: `publico/index.html`. Preços são exemplo HB20 2022, copiados de 21go.site em 06/10/2026.
- Coberturas de cada plano na página da cotação: `PLANOS` em `servidor/paginas.js` (mantenha igual à página inicial).
- Colunas da planilha: `COLUNAS` em `servidor/paginas.js`.
- Cidades do select: `publico/index.html` **e** `CIDADES_RN` em `servidor/app.js` (o servidor valida).
- Cores e fontes (paleta da 21Go): tokens no topo de `publico/site.css` e `publico/painel.css`.

## Dados

- Arquivo: `DADOS_DIR/cotacoes.json` (lista com pedido, status, valores, data de envio e de abertura). Na primeira subida ele importa o `leads.jsonl` do site antigo, que fica como backup.
- Documentos: `DADOS_DIR/docs/<id>/` (no mesmo volume). O tipo do arquivo é conferido pelo conteúdo, não pelo nome. Os textos e a lista de documentos ficam em `DOCS`, em `servidor/paginas.js`.
- Perfil: `DADOS_DIR/painel.json` guarda nome, WhatsApp e o hash da senha trocada pelo painel (scrypt, nunca o texto). Esqueceu a senha? Apague esse arquivo no volume e reinicie: volta a valer a `PAINEL_SENHA`.
- Leitura por IA: `servidor/leitura.js`. Os campos e as instruções ficam ali (`Leitura` e `INSTRUCOES`); os rótulos do painel, em `LEITURA` em `servidor/paginas.js`. Os arquivos do cliente são enviados à API da Anthropic só quando você clica em "Ler documentos com IA".
- Anti-spam: honeypot (campo `site`) + limite de 10 pedidos por IP por hora. O login do painel tem o mesmo limite.

## Checklist de lançamento

1. [ ] **Cadastro na 21Go**: `https://equipe.21go.online` (ou pelo link de um consultor). Treinamento online às terças e quartas, 20h. Cadastro liberado em até 48 h após aprovação.
2. [ ] **Pegar o slug** do seu link (`simule.21go.online/<slug>`) e setar `SIMULADOR_URL`.
3. [ ] **Confirmar com a 21Go** antes de anunciar: atendem RN? vistoria por vídeo vale fora do RJ? rede de guincho e oficinas credenciadas em Natal e interior? Ajustar a FAQ "Atende fora de Natal?" com a resposta real.
4. [ ] **Setar `WHATSAPP`** no Coolify e redeployar.
5. [ ] **Definir `PAINEL_SENHA`** no Coolify (hoje o painel abre com o `LEADS_TOKEN`).
5. [ ] **Foto do consultor**: hoje é um avatar com iniciais (`.avatar`). Trocar por `<img>` quando tiver foto.
7. [ ] **Domínio próprio**: sugestões `protecaoveicularrn.com.br`, `21gorn.com.br`. Ordem obrigatória: DNS apontando pro IP → adicionar em Domains no Coolify → redeploy → certificado. Depois trocar `canonical`, `og:image`, `sitemap.xml`, `robots.txt` e o JSON-LD.
8. [ ] **Conferir o Reclame Aqui** no dia (nota 7,9 e 80% resolvidas em 06/10/2026) antes de citar número em qualquer post.

## Como trazer gente pro site (fora do código)

- Google Perfil de Empresa como "Consultor de proteção veicular em Natal".
- Grupos de WhatsApp/Facebook de motoristas de Uber e 99 em Natal e Parnamirim (perfil que o seguro recusa e a 21Go aceita).
- Instagram com os materiais que a 21Go fornece no treinamento, sempre com link pro site (não direto pro WhatsApp: o site grava o pedido).
- Conteúdo local tipo "seguradora recusou meu carro em Natal, e agora?" (o blog do 21go.site mostra os temas que rankeiam).

## Deploy (Coolify, VPS 170.82.252.195)

Dockerfile sem build. Volume persistente em `/app/dados`. Porta 3000. Ver a nota de memória do projeto pra UUIDs.

## Aviso legal que o site carrega

Site de consultor independente. A 21GO Associação de Proteção Patrimonial (CNPJ 40.902.817/0001-70) é associação mutualista regulamentada pela Lei Complementar 213/2025. Proteção veicular não é seguro.
