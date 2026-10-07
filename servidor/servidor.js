import { criarApp } from "./app.js";

const PORTA = Number(process.env.PORT ?? 3000);
const { app, cfg } = criarApp();
const servidor = app.listen(PORTA, () => {
  console.log(`[site] porta ${PORTA} · whatsapp ${cfg.whatsapp ? "ok" : "AUSENTE (placeholder no site)"}`);
});
const encerrar = () => servidor.close(() => process.exit(0));
process.on("SIGTERM", encerrar);
process.on("SIGINT", encerrar);
