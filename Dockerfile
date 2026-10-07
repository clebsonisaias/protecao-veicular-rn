# Sem etapa de build, de proposito: HTML/CSS/JS direto, Express so serve.
# O Coolify injeta toda env var como build ARG (inclusive NODE_ENV); aqui e
# inofensivo porque nao ha devDependency nem compilacao.
FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY servidor/ ./servidor/
COPY publico/  ./publico/

# Os leads sao o unico estado: este diretorio TEM de ser volume persistente
# no Coolify, senao a lista some no proximo deploy. Ver README.
ENV DADOS_DIR=/app/dados
RUN mkdir -p /app/dados && chown -R node:node /app/dados

USER node
EXPOSE 3000
CMD ["node", "servidor/servidor.js"]
