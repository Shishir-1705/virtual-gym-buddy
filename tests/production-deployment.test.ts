import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import app from "../server";

describe("Production Deployment Readiness & Health Checks", () => {
  describe("Health Check Endpoints (/health & /api/health)", () => {
    it("GET /health returns HTTP 200 with sanitized status details", async () => {
      const res = await request(app).get("/health");
      assert.equal(res.status, 200);
      assert.equal(res.body.status, "ok");
      assert.ok(typeof res.body.timestamp === "string");
      assert.ok(typeof res.body.uptime === "number");

      // Verify no secrets or sensitive environment info leaked
      assert.equal(res.body.env, undefined);
      assert.equal(res.body.GEMINI_API_KEY, undefined);
      assert.equal(res.body.firebase, undefined);
      assert.equal(res.body.config, undefined);
      assert.equal(res.body.process, undefined);
    });

    it("GET /api/health returns HTTP 200 with identical health payload", async () => {
      const res = await request(app).get("/api/health");
      assert.equal(res.status, 200);
      assert.equal(res.body.status, "ok");
      assert.ok(!isNaN(Date.parse(res.body.timestamp)));
    });

    it("health endpoints are accessible without authentication", async () => {
      const res = await request(app)
        .get("/api/health")
        .set("Authorization", "Bearer invalid-garbage-token");
      // Health endpoint is mounted before auth/rate limiters, should still respond 200
      assert.equal(res.status, 200);
      assert.equal(res.body.status, "ok");
    });
  });

  describe("API Routing & Fallback Isolation", () => {
    it("GET /api returns HTTP 404 JSON error instead of HTML", async () => {
      const res = await request(app).get("/api");
      assert.equal(res.status, 404);
      assert.deepEqual(res.body, { error: "API endpoint not found" });
      assert.ok(res.headers["content-type"].includes("application/json"));
    });

    it("GET /api/nonexistent returns HTTP 404 JSON error", async () => {
      const res = await request(app).get("/api/nonexistent");
      assert.equal(res.status, 404);
      assert.deepEqual(res.body, { error: "API endpoint not found" });
    });

    it("POST /api/random/sub/path returns HTTP 404 JSON error", async () => {
      const res = await request(app)
        .post("/api/random/sub/path")
        .send({ test: "data" });
      assert.equal(res.status, 404);
      assert.deepEqual(res.body, { error: "API endpoint not found" });
    });
  });

  describe("CORS Configuration & Origin Validation", () => {
    const originalAllowedOrigins = process.env.ALLOWED_ORIGINS;

    before(() => {
      process.env.ALLOWED_ORIGINS = "https://gymbuddy.example.com, https://app.trusted.io";
    });

    after(() => {
      if (originalAllowedOrigins !== undefined) {
        process.env.ALLOWED_ORIGINS = originalAllowedOrigins;
      } else {
        delete process.env.ALLOWED_ORIGINS;
      }
    });

    it("attaches CORS headers for an explicitly allowed origin", async () => {
      const res = await request(app)
        .get("/api/health")
        .set("Origin", "https://gymbuddy.example.com");

      assert.equal(res.status, 200);
      assert.equal(res.headers["access-control-allow-origin"], "https://gymbuddy.example.com");
      assert.equal(res.headers["access-control-allow-credentials"], "true");
    });

    it("handles OPTIONS preflight for allowed origin with 204", async () => {
      const res = await request(app)
        .options("/api/buddy/chat")
        .set("Origin", "https://gymbuddy.example.com")
        .set("Access-Control-Request-Method", "POST");

      assert.equal(res.status, 204);
      assert.equal(res.headers["access-control-allow-origin"], "https://gymbuddy.example.com");
    });

    it("does NOT attach CORS allow headers for unlisted origins", async () => {
      const res = await request(app)
        .get("/api/health")
        .set("Origin", "https://malicious-attacker-site.com");

      assert.equal(res.status, 200);
      assert.equal(res.headers["access-control-allow-origin"], undefined);
    });
  });

  describe("Static File Protection & Server Artifact Isolation", () => {
    it("strictly blocks direct HTTP access to /server.cjs with 404", async () => {
      const res = await request(app).get("/server.cjs");
      assert.equal(res.status, 404);
      assert.deepEqual(res.body, { error: "Not found" });
    });

    it("strictly blocks direct HTTP access to /server.cjs.map with 404", async () => {
      const res = await request(app).get("/server.cjs.map");
      assert.equal(res.status, 404);
      assert.deepEqual(res.body, { error: "Not found" });
    });

    it("blocks any arbitrary .cjs file request from static serving", async () => {
      const res = await request(app).get("/sub/nested/secret.cjs");
      assert.equal(res.status, 404);
      assert.deepEqual(res.body, { error: "Not found" });
    });
  });

  describe("Reverse Proxy & Trust Proxy Configuration", () => {
    it("respects trust proxy setting when enabled", () => {
      // In tests, if TRUST_PROXY is set or isProd, trust proxy is enabled
      const trustProxyValue = app.get("trust proxy");
      assert.ok(trustProxyValue !== undefined);
    });
  });
});
