import assert from "node:assert/strict";
import test from "node:test";
import { findStaleMetaTemplateIds } from "./whatsapp.controller.js";

test("template sync removes Meta-deleted cache rows but keeps drafts", () => {
  const metaRows = [{ name: "active", language: "en_US" }];
  const localRows = [
    { id: "1", template_id: "m1", name: "active", language: "en_US", status: "APPROVED" },
    { id: "2", template_id: "m2", name: "deleted", language: "en_US", status: "PENDING" },
    { id: "3", template_id: null, name: "draft", language: "en_US", status: "DRAFT" },
  ];

  assert.deepEqual(findStaleMetaTemplateIds(metaRows, localRows), ["2"]);
});

test("template sync matches names and languages case-insensitively and trims whitespace", () => {
  const metaRows = [{ name: "Welcome", language: "en_US" }];
  const localRows = [
    { id: "1", template_id: "m1", name: " welcome ", language: " EN_us ", status: "APPROVED" },
    { id: "2", template_id: "m2", name: "stale", language: "en_US", status: "REJECTED" },
  ];

  assert.deepEqual(findStaleMetaTemplateIds(metaRows, localRows), ["2"]);
});
