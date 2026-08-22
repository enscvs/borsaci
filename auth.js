"use strict";

const crypto = require("crypto");
const bcrypt = require("bcryptjs");

const SESSION_COOKIE_NAME = "__Host-borsaci_session";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILED_LOGINS = 5;

function parseCookies(header) {
  return Object.fromEntries(
    String(header || "")
      .split(";")
      .map(value => value.trim())
      .filter(Boolean)
      .map(value => {
        const separator = value.indexOf("=");
        if (separator < 0) return [value, ""];
        return [
          value.slice(0, separator),
          decodeURIComponent(value.slice(separator + 1)),
        ];
      })
  );
}

function createAuthService({
  passwordHash,
  sessionSecret,
  sessionTtlMs = SESSION_TTL_MS,
  now = () => Date.now(),
} = {}) {
  const sessions = new Map();
  const failedAttempts = new Map();

  function configured() {
    return Boolean(passwordHash && sessionSecret);
  }

  function sign(sessionId) {
    return crypto
      .createHmac("sha256", sessionSecret)
      .update(sessionId)
      .digest("base64url");
  }

  function createToken(sessionId) {
    return `${sessionId}.${sign(sessionId)}`;
  }

  function parseToken(token) {
    const [sessionId, signature, extra] =
      String(token || "").split(".");

    if (!sessionId || !signature || extra) {
      return null;
    }

    const expected = sign(sessionId);
    const supplied = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);

    if (
      supplied.length !== expectedBuffer.length ||
      !crypto.timingSafeEqual(supplied, expectedBuffer)
    ) {
      return null;
    }

    return sessionId;
  }

  function cleanExpired() {
    const timestamp = now();

    for (const [id, session] of sessions) {
      if (session.expiresAt <= timestamp) {
        sessions.delete(id);
      }
    }

    for (const [ip, attempts] of failedAttempts) {
      const recent =
        attempts.filter(
          value => value > timestamp - LOGIN_WINDOW_MS
        );

      if (recent.length) {
        failedAttempts.set(ip, recent);
      } else {
        failedAttempts.delete(ip);
      }
    }
  }

  function getSession(token) {
    if (!configured()) return null;

    cleanExpired();

    const sessionId = parseToken(token);
    const session =
      sessionId
        ? sessions.get(sessionId)
        : null;

    if (!session || session.expiresAt <= now()) {
      if (sessionId) sessions.delete(sessionId);
      return null;
    }

    return {
      id: sessionId,
      ...session,
    };
  }

  function getSessionFromRequest(req) {
    const cookies =
      parseCookies(req?.headers?.cookie);

    return getSession(
      cookies[SESSION_COOKIE_NAME]
    );
  }

  function createSession() {
    if (!configured()) {
      throw new Error("Authentication is not configured.");
    }

    cleanExpired();

    const id =
      crypto.randomBytes(32).toString("base64url");

    const csrfToken =
      crypto.randomBytes(32).toString("base64url");

    const expiresAt =
      now() + sessionTtlMs;

    sessions.set(
      id,
      {
        csrfToken,
        expiresAt,
      }
    );

    return {
      token: createToken(id),
      csrfToken,
      expiresAt,
    };
  }

  function revokeSession(token) {
    const sessionId = parseToken(token);
    if (sessionId) {
      sessions.delete(sessionId);
    }
  }

  function loginAllowed(ip) {
    cleanExpired();

    return (
      (failedAttempts.get(ip) || [])
        .length < MAX_FAILED_LOGINS
    );
  }

  function recordFailedLogin(ip) {
    cleanExpired();

    const attempts =
      failedAttempts.get(ip) || [];

    attempts.push(now());
    failedAttempts.set(ip, attempts);
  }

  function clearFailedLogins(ip) {
    failedAttempts.delete(ip);
  }

  async function verifyPassword(password) {
    if (!configured()) return false;

    try {
      return await bcrypt.compare(
        String(password || ""),
        passwordHash
      );
    } catch {
      return false;
    }
  }

  function sessionCookie(token) {
    return [
      `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
      "Path=/",
      "HttpOnly",
      "Secure",
      "SameSite=Strict",
      `Max-Age=${Math.floor(sessionTtlMs / 1000)}`,
    ].join("; ");
  }

  function clearSessionCookie() {
    return [
      `${SESSION_COOKIE_NAME}=`,
      "Path=/",
      "HttpOnly",
      "Secure",
      "SameSite=Strict",
      "Max-Age=0",
    ].join("; ");
  }

  return {
    configured,
    getSession,
    getSessionFromRequest,
    createSession,
    revokeSession,
    loginAllowed,
    recordFailedLogin,
    clearFailedLogins,
    verifyPassword,
    sessionCookie,
    clearSessionCookie,
    cookieName: SESSION_COOKIE_NAME,
  };
}

module.exports = {
  createAuthService,
  parseCookies,
  SESSION_COOKIE_NAME,
  SESSION_TTL_MS,
  LOGIN_WINDOW_MS,
  MAX_FAILED_LOGINS,
};