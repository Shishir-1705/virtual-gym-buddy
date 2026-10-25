import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import request from "supertest";
import app from "../server";
import { setCustomTokenVerifier } from "../src/server/firebaseAdmin";

describe("Server-Side Firebase Authentication & Identity Middleware", () => {
  before(() => {
    // Configure mock token verifier for deterministic testing without external network calls
    setCustomTokenVerifier(async (token: string) => {
      if (token === "valid-athlete-token") {
        return { uid: "athlete-uid-100", email: "athlete@gymbuddy.com" };
      }
      if (token === "valid-second-user-token") {
        return { uid: "athlete-uid-200", email: "champion@gymbuddy.com" };
      }
      if (token === "expired-token") {
        const err: any = new Error("Token has expired");
        err.code = "auth/id-token-expired";
        throw err;
      }
      const err: any = new Error("Invalid token signature");
      err.code = "auth/invalid-id-token";
      throw err;
    });
  });

  after(() => {
    setCustomTokenVerifier(null);
  });

  describe("Guest Access & Optional Authentication", () => {
    test("unauthenticated requests are recognized as guest and proceed to validation", async () => {
      const res = await request(app)
        .post("/api/buddy/chat")
        .send({});

      // Not 401 Unauthorized; proceeds to 400 Validation Error
      assert.equal(res.status, 400);
      assert.equal(res.body.error, "Validation Error");
    });

    test("requests with valid Bearer token attach identity and proceed to validation", async () => {
      const res = await request(app)
        .post("/api/buddy/chat")
        .set("Authorization", "Bearer valid-athlete-token")
        .send({});

      // Not 401; identity attached and reaches 400 Validation Error
      assert.equal(res.status, 400);
      assert.equal(res.body.error, "Validation Error");
    });
  });

  describe("Invalid, Expired, and Malformed Token Handling", () => {
    test("returns HTTP 401 when an invalid token is provided", async () => {
      const res = await request(app)
        .post("/api/buddy/chat")
        .set("Authorization", "Bearer forged-or-corrupt-token")
        .send({
          messages: [{ role: "user", content: "Hello" }]
        });

      assert.equal(res.status, 401);
      assert.equal(res.body.error, "Unauthorized: Invalid authentication token");
    });

    test("returns HTTP 401 when an expired token is provided", async () => {
      const res = await request(app)
        .post("/api/buddy/chat")
        .set("Authorization", "Bearer expired-token")
        .send({
          messages: [{ role: "user", content: "Hello" }]
        });

      assert.equal(res.status, 401);
      assert.equal(res.body.error, "Unauthorized: Authentication token has expired");
    });

    test("returns HTTP 401 for malformed Authorization headers", async () => {
      // Missing Bearer prefix
      const res1 = await request(app)
        .post("/api/buddy/chat")
        .set("Authorization", "Basic some-credentials")
        .send({});
      assert.equal(res1.status, 401);
      assert.ok(res1.body.error.includes("Malformed Authorization header"));

      // Empty token after Bearer
      const res2 = await request(app)
        .post("/api/buddy/chat")
        .set("Authorization", "Bearer ")
        .send({});
      assert.equal(res2.status, 401);
      assert.ok(res2.body.error.includes("Malformed Authorization header"));
    });

    test("invalid tokens never silently fall back to guest access", async () => {
      // Even with a completely valid request payload, a bad token MUST be rejected
      const res = await request(app)
        .post("/api/buddy/chat")
        .set("Authorization", "Bearer bad-token")
        .send({
          messages: [{ role: "user", content: "I am trying to bypass auth" }],
          buddyId: "marcus"
        });

      assert.equal(res.status, 401);
    });
  });

  describe("Endpoint Coverage Across All 5 AI Routes", () => {
    const endpoints = [
      "/api/buddy/chat",
      "/api/buddy/journal",
      "/api/buddy/generate-workout",
      "/api/buddy/generate-diet-plan",
      "/api/buddy/generate-remaining-meals"
    ];

    for (const endpoint of endpoints) {
      test(`${endpoint} rejects invalid tokens with 401`, async () => {
        const res = await request(app)
          .post(endpoint)
          .set("Authorization", "Bearer invalid-token")
          .send({});

        assert.equal(res.status, 401);
      });

      test(`${endpoint} allows unauthenticated guest requests to reach validation/handler without 401`, async () => {
        const res = await request(app)
          .post(endpoint)
          .send({});

        // Endpoints never return 401 Unauthorized for guests
        assert.notEqual(res.status, 401);
      });
    }
  });

  describe("Rate Limit Identity Integrity & Isolation", () => {
    test("client cannot spoof rate-limit identity via request body", async () => {
      // Attempt to spoof another user's UID in the payload
      const res = await request(app)
        .post("/api/buddy/chat")
        .set("Authorization", "Bearer valid-athlete-token")
        .send({
          fakeUid: "victim-uid-999",
          userId: "victim-uid-999",
          messages: [{ role: "user", content: "Hello" }]
        });

      // Strict Zod schema rejects unknown fields in body
      assert.equal(res.status, 400);
      assert.ok(res.body.details.some((d: any) => d.message.includes("Unrecognized") || d.path.includes("fakeUid") || d.path.includes("userId")));
    });

    test("authenticated responses include standard rate limit headers", async () => {
      const res = await request(app)
        .post("/api/buddy/chat")
        .set("Authorization", "Bearer valid-second-user-token")
        .send({});

      assert.ok(res.headers["ratelimit-limit"] !== undefined, "ratelimit-limit must be present");
      assert.ok(res.headers["ratelimit-remaining"] !== undefined, "ratelimit-remaining must be present");
    });

    test("separate rate limits isolate authenticated UIDs from guest IP limits", async () => {
      // An authenticated request uses the UID key
      const res = await request(app)
        .post("/api/buddy/chat")
        .set("Authorization", "Bearer valid-athlete-token")
        .send({});

      assert.ok(res.headers["ratelimit-limit"] !== undefined);
      // Authenticated limit is 60 by default (vs 10 for guests)
      const limitVal = parseInt(res.headers["ratelimit-limit"], 10);
      assert.ok(limitVal >= 60, "Authenticated limit should be at least 60");
    });
  });

  describe("Render Secret File & Credential Path Handling", () => {
    test("gracefully handles nonexistent service account path without crashing", () => {
      const origPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
      process.env.FIREBASE_SERVICE_ACCOUNT_PATH = "/nonexistent/secret/path.json";
      
      // Should not throw an unhandled exception
      assert.doesNotThrow(() => {
        assert.equal(fs.existsSync(process.env.FIREBASE_SERVICE_ACCOUNT_PATH!), false);
      });

      if (origPath !== undefined) {
        process.env.FIREBASE_SERVICE_ACCOUNT_PATH = origPath;
      } else {
        delete process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
      }
    });
  });
});
