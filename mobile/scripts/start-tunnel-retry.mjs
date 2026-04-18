import { spawn } from "node:child_process";

const maxRetries = Number(process.env.EXPO_TUNNEL_RETRIES ?? "8");
const retryDelayMs = Number(process.env.EXPO_TUNNEL_RETRY_DELAY_MS ?? "3000");

const knownTransientErrors = [
  "failed to start tunnel",
  "session closed",
  "remote gone away",
  "Cannot read properties of undefined (reading 'body')",
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function startWithRetry() {
  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    const output = [];
    const child = spawn("cmd.exe", ["/c", "npx expo start --tunnel --clear"], {
      stdio: ["inherit", "pipe", "pipe"],
      shell: false,
    });

    const relay = (chunk) => {
      const text = chunk.toString();
      output.push(text);
      process.stdout.write(text);
    };

    const relayErr = (chunk) => {
      const text = chunk.toString();
      output.push(text);
      process.stderr.write(text);
    };

    child.stdout.on("data", relay);
    child.stderr.on("data", relayErr);

    const exitCode = await new Promise((resolve) => {
      child.on("exit", (code) => resolve(code ?? 1));
    });

    const merged = output.join("");
    const transient = knownTransientErrors.some((keyword) => merged.includes(keyword));

    if (exitCode === 0) {
      process.exit(0);
    }

    if (!transient || attempt >= maxRetries) {
      process.exit(exitCode);
    }

    console.log(`\n[retry ${attempt}/${maxRetries}] tunnel 启动失败，${retryDelayMs}ms 后重试...`);
    await sleep(retryDelayMs);
  }
}

void startWithRetry();
