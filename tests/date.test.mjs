import test from "node:test";
import assert from "node:assert/strict";
import { getLocalDateInputValue } from "../shared/date.js";

test("local date input value uses the local calendar date", () => {
  assert.equal(getLocalDateInputValue(new Date(2026, 10, 5)), "2026-11-05");
  assert.equal(getLocalDateInputValue(new Date(2026, 0, 9)), "2026-01-09");
});
