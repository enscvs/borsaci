"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");

const {
  createAuthService,
  SESSION_COOKIE_NAME,
} = require("../auth");

test("sessions are signed, expire, and can be revoked", async () => {
  let now = 1_000;
  const hash = await bcrypt.hash("correct horse battery staple", 4);
  const auth = createAuthService({
    passwordHash: hash,
    sessionSecret: "a sufficiently long test secret for signing",
    sessionTtlMs: 100,
    now: () => now,
  });

  assert.equal(
    await auth.verifyPassword("wrong password"),
    false
  );
  assert.equal(
    await auth.verifyPassword("correct horse battery staple"),
    true
  );

  const session = auth.createSession();
  const request = {
    headers: {
      cookie: `${SESSION_COOKIE_NAME}=${encodeURIComponent(session.token)}`,
    },
  };

  assert.equal(
    auth.getSessionFromRequest(request).csrfToken,
    session.csrfToken
  );

  now += 101;
  assert.equal(
    auth.getSessionFromRequest(request),
    null
  );

  const second = auth.createSession();
  auth.revokeSession(second.token);

  assert.equal(
    auth.getSession(second.token),
    null
  );
});

test("failed logins are rate limited after five attempts", () => {
  const auth = createAuthService({
    passwordHash: "$2b$04$Lgfq8Dbtd.mP/.WvJe12GeapMJz0B6txQFZQAXrvhTmeqHzDpY5kS",
    sessionSecret: "a sufficiently long test secret for signing",
  });
  const ip = "203.0.113.10";

  for (let attempt = 0; attempt < 5; attempt += 1) {
    assert.equal(auth.loginAllowed(ip), true);
    auth.recordFailedLogin(ip);
  }

  assert.equal(auth.loginAllowed(ip), false);
  auth.clearFailedLogins(ip);
  assert.equal(auth.loginAllowed(ip), true);
});
