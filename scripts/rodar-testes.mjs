// Executa a suíte de testes de integração (`tests/*.test.mts`) em qualquer SO (Windows/Linux/macOS)
// com --conditions=react-server para que `import "server-only"` funcione fora do Next.js.
import { spawnSync } from "node:child_process";

const env = { ...process.env, NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --conditions=react-server`.trim() };
const r = spawnSync("pnpm", ["exec", "tsx", "--test", "tests/fluxos-criticos.test.mts"], {
  stdio: "inherit",
  env,
  shell: true,
});
process.exit(r.status ?? 1);
