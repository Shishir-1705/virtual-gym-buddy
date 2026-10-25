import { test, describe } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import app from "../server";

describe("API Security & Middleware Integration", () => {
  describe("Security Headers", () => {
    test("sets protective security headers via Helmet and custom middleware", async () => {
      const res = await request(app).get("/api/buddy/chat");

      // Verify X-Content-Type-Options
      assert.equal(res.headers["x-content-type-options"], "nosniff");

      // Verify X-Frame-Options
      assert.equal(res.headers["x-frame-options"], "SAMEORIGIN");

      // Verify Content Security Policy
      const csp = res.headers["content-security-policy"];
      assert.ok(csp, "CSP header should be present");
      assert.ok(csp.includes("default-src 'self'"), "CSP should include default-src 'self'");
      assert.ok(csp.includes("object-src 'none'"), "CSP should prohibit plugins via object-src 'none'");

      // Verify Strict-Transport-Security is not set in non-HTTPS dev/test
      assert.equal(res.headers["strict-transport-security"], undefined);
    });
  });

  describe("Payload Limits and JSON Syntax Validation", () => {
    test("rejects malformed JSON syntax with HTTP 400", async () => {
      const res = await request(app)
        .post("/api/buddy/chat")
        .set("Content-Type", "application/json")
        .send("{ this is invalid json : true ");

      assert.equal(res.status, 400);
      assert.equal(res.body.error, "Invalid JSON payload syntax");
    });

    test("rejects oversized request bodies exceeding 256kb with HTTP 413", async () => {
      // Create a payload larger than 256kb
      const hugeString = "x".repeat(300 * 1024);
      const res = await request(app)
        .post("/api/buddy/chat")
        .set("Content-Type", "application/json")
        .send(JSON.stringify({ hugeString }));

      assert.equal(res.status, 413);
      assert.equal(res.body.error, "Request payload exceeds size limit");
    });
  });

  describe("Endpoint Request Validation (/api/buddy/*)", () => {
    test("POST /api/buddy/chat rejects empty payload with 400", async () => {
      const res = await request(app)
        .post("/api/buddy/chat")
        .send({});

      assert.equal(res.status, 400);
      assert.equal(res.body.error, "Validation Error");
      assert.ok(Array.isArray(res.body.details));
      assert.ok(res.body.details.length > 0);
    });

    test("POST /api/buddy/chat rejects invalid coach persona with 400", async () => {
      const res = await request(app)
        .post("/api/buddy/chat")
        .send({
          messages: [{ role: "user", content: "Hey coach" }],
          buddyId: "invalid_coach"
        });

      assert.equal(res.status, 400);
      assert.equal(res.body.error, "Validation Error");
      assert.ok(res.body.details.some((d: { path: string }) => d.path.includes("buddyId")));
    });

    test("POST /api/buddy/journal rejects empty body with 400", async () => {
      const res = await request(app)
        .post("/api/buddy/journal")
        .send({});

      assert.equal(res.status, 400);
      assert.equal(res.body.error, "Validation Error");
      assert.ok(res.body.details.some((d: { path: string }) => d.path.includes("journalText")));
    });

    test("POST /api/buddy/generate-workout rejects invalid duration with 400", async () => {
      const res = await request(app)
        .post("/api/buddy/generate-workout")
        .send({ durationMinutes: 1 }); // Under 5 minutes minimum

      assert.equal(res.status, 400);
      assert.equal(res.body.error, "Validation Error");
    });

    test("POST /api/buddy/generate-diet-plan rejects out-of-range physiological stats with 400", async () => {
      const res = await request(app)
        .post("/api/buddy/generate-diet-plan")
        .send({ weightKg: 10 }); // Under 20 kg minimum

      assert.equal(res.status, 400);
      assert.equal(res.body.error, "Validation Error");
    });

    test("POST /api/buddy/generate-remaining-meals rejects invalid calorie values with 400", async () => {
      const res = await request(app)
        .post("/api/buddy/generate-remaining-meals")
        .send({ remainingCalories: 50000 }); // Exceeds 10,000 max

      assert.equal(res.status, 400);
      assert.equal(res.body.error, "Validation Error");
    });
  });

  describe("Information Leakage Prevention", () => {
    test("error responses never contain server stack traces or secret keys", async () => {
      const res = await request(app)
        .post("/api/buddy/chat")
        .send({
          messages: [{ role: "user", content: "" }]
        });

      const bodyStr = JSON.stringify(res.body);
      assert.ok(!bodyStr.includes("GEMINI_API_KEY"), "Should never expose GEMINI_API_KEY");
      assert.ok(!bodyStr.includes("at Object.<anonymous>"), "Should not expose stack trace");
      assert.ok(!bodyStr.includes("node:internal"), "Should not expose node internal paths");
    });
  });

  describe("Rate Limiting Headers & Thresholds", () => {
    test("attaches standard rate limit headers to AI endpoints", async () => {
      const res = await request(app)
        .post("/api/buddy/chat")
        .send({});

      assert.ok(res.headers["ratelimit-limit"] !== undefined, "ratelimit-limit should be present");
      assert.ok(res.headers["ratelimit-remaining"] !== undefined, "ratelimit-remaining should be present");
    });

    test("returns HTTP 429 when rate limit threshold is exceeded", async () => {
      let hit429 = false;
      for (let i = 0; i < 65; i++) {
        const res = await request(app).post("/api/buddy/chat").send({});
        if (res.status === 429) {
          hit429 = true;
          assert.equal(res.status, 429);
          assert.ok(res.body.error.includes("Too many requests"));
          assert.ok(res.body.retryAfterSeconds > 0);
          break;
        }
      }
      assert.ok(hit429, "Expected to trigger HTTP 429 after exceeding limit");
    });
  });
});
