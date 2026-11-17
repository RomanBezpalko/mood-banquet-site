import test from "node:test";
import assert from "node:assert/strict";
import {
  formatUaPhone,
  normalizeUaPhone,
  sanitizeUaPhoneDigits,
  toUaE164,
} from "../shared/ua-phone.js";

test("Ukrainian phone input keeps only nine national digits", () => {
  assert.equal(sanitizeUaPhoneDigits("671234567"), "671234567");
  assert.equal(sanitizeUaPhoneDigits("+380 67 123 45 67"), "671234567");
  assert.equal(sanitizeUaPhoneDigits("+380 067 123 45 67"), "671234567");
  assert.equal(sanitizeUaPhoneDigits("0671234567"), "671234567");
  assert.equal(sanitizeUaPhoneDigits("67ab123-45-67xyz"), "671234567");
  assert.equal(sanitizeUaPhoneDigits("671234567890"), "671234567");
});

test("E.164 conversion requires exactly nine national digits", () => {
  assert.equal(toUaE164("671234567"), "+380671234567");
  assert.equal(toUaE164("67123456"), "");
  assert.equal(toUaE164("6712345678"), "");
  assert.equal(toUaE164(""), "");
});

test("server accepts Ukrainian numbers and rejects incomplete or non-phone input", () => {
  assert.equal(normalizeUaPhone("+380 67 123 45 67"), "+380671234567");
  assert.equal(normalizeUaPhone("+380 067 123 45 67"), "+380671234567");
  assert.equal(normalizeUaPhone("0671234567"), "+380671234567");
  assert.equal(normalizeUaPhone("671234567"), "+380671234567");
  assert.equal(normalizeUaPhone("+380 67 123 45"), "");
  assert.equal(normalizeUaPhone("+380 67 123 45 678"), "");
  assert.equal(normalizeUaPhone("+380 67 ABC 45 67"), "");
  assert.equal(normalizeUaPhone("+48 67 123 45 67"), "");
});

test("display format retains the fixed country prefix", () => {
  assert.equal(formatUaPhone("671234567"), "+380 67 123 45 67");
  assert.equal(formatUaPhone(""), "+380");
});
