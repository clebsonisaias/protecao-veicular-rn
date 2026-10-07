# Proteção Veicular RN

Site de vendas de proteção veicular **21Go** para Natal e todo o RN, operado por consultor independente (Clebson Isaias). Página única com simulador próprio: o lead é gravado no servidor **e** o WhatsApp abre com a mensagem pronta.

Stack: HTML/CSS/JS direto, servido por Node + Express. Zero build.

```bash
npm install
npm run dev        # http://localhost:3000 (lê .env se existir)
npm run teste      # node --test
```

## Variáveis de ambiente

| Var | Obrigatória | Para quê |
|---|---|---|
| `WHATSAPP` | sim, pra converter | Número que recebe os leads, só dígitos com 55+DDD (ex.: `5584999990000`). Sem ela, o site grava o lead e diz "vou te chamar", mas não abre o WhatsApp. |
| `LEADS_TOKEN` | recomendada | Libera `GET /leads?token=...` (tabela dos leads). Sem ela a rota some (404). |
| `SIMULADOR_URL` | não | Link oficial do consultor na 21Go (`https://simule.21go.online/<seu-slug>`), fica guardado pra uso futuro. |
| `EQUIPE_URL` | não | Link de recrutamento (`https://equipe.21go.online/<seu-slug>`). Se existir, o botão "Quero ser consultor" aponta pra ele; senão vai pro WhatsApp. |
| `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` | não | Aviso instantâneo de lead novo no Telegram (best-effort, 3 s de timeout). |
| `DADOS_DIR` | no Docker já vem | Pasta do `leads.jsonl`. **Tem de ser volume persistente** no Coolify. |
| `PORT` | não | Padrão 3000. |

## Onde mexer

- Textos, preços e planos: tudo em `publico/index.html` (seção `<!-- ===== PLANOS ===== -->`). Preços são exemplo HB20 2022, copiados de 21go.site em 06/10/2026. Quando a 21Go mudar a tabela, atualize ali e no rodapé.
- Cidades do select: `publico/index.html` **e** `CIDADES_RN` em `servidor/app.js` (o servidor valida).
- Cores e fontes: tokens no topo de `publico/site.css`.
- Ilustração do herói: SVG inline em `index.html`. Para trocar por foto, substitua o bloco `.heroi-art` por `<img>` com `alt`.

## Leads

- Arquivo: `DADOS_DIR/leads.jsonl` (uma linha JSON por lead, com data, IP e user-agent).
- Tabela: `https://SEU-DOMINIO/leads?token=SEU_LEADS_TOKEN`, mais recente primeiro, com link direto pro WhatsApp do lead.
- Anti-spam: honeypot (campo `site`) + limite de 10 envios por IP por hora.

## Checklist de lançamento

1. [ ] **Cadastro na 21Go**: `https://equipe.21go.online` (ou pelo link de um consultor). Treinamento online às terças e quartas, 20h. Cadastro liberado em até 48 h após aprovação.
2. [ ] **Pegar o slug** dos seus links (`simule.21go.online/<slug>` e `equipe.21go.online/<slug>`) e setar `SIMULADOR_URL` / `EQUIPE_URL`.
3. [ ] **Confirmar com a 21Go** antes de anunciar: atendem RN? vistoria por vídeo vale fora do RJ? rede de guincho e oficinas credenciadas em Natal e interior? Ajustar a FAQ "Atende fora de Natal?" com a resposta real.
4. [ ] **Setar `WHATSAPP`** no Coolify e redeployar.
5. [ ] **Foto do consultor**: hoje é um avatar com iniciais (`.avatar`). Trocar por `<img>` quando tiver foto.
6. [ ] **Fotos reais** (opcional): herói, motorista de app, moto. Morphix estava sem créditos em 06/10/2026.
7. [ ] **Domínio próprio**: sugestões `protecaoveicularrn.com.br`, `21gorn.com.br`. Ordem obrigatória: DNS apontando pro IP → adicionar em Domains no Coolify → redeploy → certificado. Depois trocar `canonical`, `og:image`, `sitemap.xml`, `robots.txt` e o JSON-LD.
8. [ ] **Conferir o Reclame Aqui** no dia (nota 7,9 e 80% resolvidas em 06/10/2026) antes de citar número em qualquer post.

## Como trazer gente pro site (fora do código)

- Google Perfil de Empresa como "Consultor de proteção veicular em Natal".
- Grupos de WhatsApp/Facebook de motoristas de Uber e 99 em Natal e Parnamirim (perfil que o seguro recusa e a 21Go aceita).
- Instagram com os materiais que a 21Go fornece no treinamento, sempre com link pro site (não direto pro WhatsApp: o site grava o lead).
- Conteúdo local tipo "seguradora recusou meu carro em Natal, e agora?" (o blog do 21go.site mostra os temas que rankeiam).

## Deploy (Coolify, VPS 170.82.252.195)

Dockerfile sem build. Volume persistente em `/app/dados`. Porta 3000. Ver a nota de memória do projeto pra UUIDs.

## Aviso legal que o site carrega

Site de consultor independente. A 21GO Associação de Proteção Patrimonial (CNPJ 40.902.817/0001-70) é associação mutualista regulamentada pela Lei Complementar 213/2025. Proteção veicular não é seguro.
