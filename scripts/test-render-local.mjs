import { spawn } from "node:child_process";
import http from "node:http";

const PORT = 3847;

console.log(`Starting Render local production test on port ${PORT}...`);

const serverProcess = spawn("node", ["dist/server.cjs"], {
  env: {
    ...process.env,
    NODE_ENV: "production",
    PORT: String(PORT),
    TRUST_PROXY: "true",
    FIREBASE_PROJECT_ID: "demo-gym-buddy",
  },
  stdio: ["ignore", "pipe", "pipe"],
});

let serverOutput = "";
serverProcess.stdout.on("data", (chunk) => {
  serverOutput += chunk.toString();
});
serverProcess.stderr.on("data", (chunk) => {
  serverOutput += chunk.toString();
});

function fetchPath(path, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      `http://127.0.0.1:${PORT}${path}`,
      options,
      (res) => {
        let body = "";
        res.on("data", (c) => (body += c.toString()));
        res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body }));
      }
    );
    req.on("error", reject);
    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

async function runTests() {
  // Wait up to 5s for server to start
  let ready = false;
  for (let i = 0; i < 20; i++) {
    try {
      const res = await fetchPath("/api/health");
      if (res.status === 200) {
        ready = true;
        break;
      }
    } catch {
      await new Promise((r) => setTimeout(r, 250));
    }
  }

  if (!ready) {
    console.error("Server failed to respond to /api/health within 5 seconds.");
    console.error("Server output:", serverOutput);
    serverProcess.kill();
    process.exit(1);
  }

  console.log("PASS: /api/health responded with 200 OK");

  // Test 1: Health check content
  const health = await fetchPath("/api/health");
  const healthJson = JSON.parse(health.body);
  if (healthJson.status !== "ok") {
    throw new Error(`Expected health status 'ok', got ${healthJson.status}`);
  }
  console.log("PASS: /api/health payload structure valid");

  // Test 2: Static SPA route
  const rootRes = await fetchPath("/");
  if (rootRes.status !== 200 || !rootRes.body.toLowerCase().includes("<!doctype html>")) {
    throw new Error(`Expected root HTML 200, got status ${rootRes.status}`);
  }
  console.log("PASS: Root / returns 200 with HTML SPA shell");

  // Test 3: Blocked source bundle (.cjs protection)
  const blockedRes = await fetchPath("/server.cjs");
  if (blockedRes.status !== 404) {
    throw new Error(`Expected 404 for /server.cjs, got ${blockedRes.status}`);
  }
  console.log("PASS: Protected server artifact /server.cjs returned 404");

  // Test 4: Rate limit & Guest validation on AI endpoint
  const guestRes = await fetchPath("/api/buddy/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Forwarded-For": "203.0.113.195",
    },
    body: JSON.stringify({}),
  });
  // Empty payload should fail validation with 400, not crash with 500
  if (guestRes.status !== 400) {
    throw new Error(`Expected 400 validation error for empty body, got ${guestRes.status}`);
  }
  if (!guestRes.headers["ratelimit-limit"]) {
    throw new Error("Expected rate limit header on AI endpoint");
  }
  console.log(`PASS: Guest AI endpoint returned 400 validation error with RateLimit limit ${guestRes.headers["ratelimit-limit"]}`);

  console.log("All Render local production smoke tests passed successfully!");

  serverProcess.kill("SIGTERM");
  await new Promise((r) => setTimeout(r, 500));
  process.exit(0);
}

runTests().catch((err) => {
  console.error("Smoke test failure:", err);
  serverProcess.kill();
  process.exit(1);
});
