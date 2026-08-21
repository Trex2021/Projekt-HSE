import assert from "node:assert/strict";
import test from "node:test";

import {
  CHECKLIST_CONTROL_COUNT,
  CHECKLIST_SECTORS,
  CHECKLIST_TEMPLATE_COUNT,
  CHECKLISTS,
  filterChecklists,
  normalizeChecklistText,
} from "../lib/hse-checklists.ts";

test("ships a broad, categorized HSE checklist library", () => {
  assert.equal(CHECKLIST_SECTORS.length, 14);
  assert.ok(CHECKLIST_TEMPLATE_COUNT >= 151);
  assert.ok(CHECKLIST_CONTROL_COUNT >= 1_134);

  const ids = new Set(CHECKLISTS.map((template) => template.id));
  assert.equal(ids.size, CHECKLISTS.length, "checklist ids must be unique");

  for (const sector of CHECKLIST_SECTORS) {
    const templates = CHECKLISTS.filter((template) => template.sector === sector.id);
    assert.ok(templates.length >= 6, `${sector.name} should have practical coverage`);
  }

  for (const template of CHECKLISTS) {
    assert.ok(template.name.trim().length > 2);
    assert.ok(template.activity.trim().length > 2);
    assert.ok(template.description.trim().length > 2);
    assert.ok(template.keywords.length >= 3);
    assert.ok(template.items.length >= 5);
    assert.equal(template.sectors[0], template.sector);
    assert.equal(new Set(template.sectors).size, template.sectors.length);
    assert.equal(
      new Set(template.items).size,
      template.items.length,
      `${template.id} should not repeat a control`,
    );
  }
});

test("includes every supplied construction checklist and all 188 source controls", () => {
  const suppliedIds = [
    "construction-kitchen-inspection",
    "construction-pantry-inspection",
    "construction-restroom-inspection",
    "construction-climber",
    "construction-powered-saw",
    "construction-rebar-bending-cutting",
    "construction-spg-installation",
    "construction-stair-stringer-removal",
    "construction-gas-air-cylinders",
    "construction-angle-grinder",
  ];
  const supplied = CHECKLISTS.filter((template) => suppliedIds.includes(template.id));

  assert.equal(supplied.length, suppliedIds.length);
  assert.equal(supplied.reduce((total, template) => total + template.items.length, 0), 188);
  assert.ok(supplied.every((template) => template.sector === "construction"));
  assert.ok(supplied.every((template) => template.sectors.includes("construction")));
});

test("includes the second supplied construction set and all 133 source controls", () => {
  const suppliedCounts = new Map([
    ["construction-lifeline-inspection", 7],
    ["construction-air-compressor", 16],
    ["construction-electrical-panel-inspection", 12],
    ["construction-scaffold-inspection", 13],
    ["construction-mobile-scaffold-inspection", 12],
    ["construction-warehouse-inspection", 17],
    ["construction-material-hoist", 17],
    ["construction-generator-inspection", 15],
    ["construction-alimak", 14],
    ["construction-fuel-tanks", 10],
  ]);
  const supplied = CHECKLISTS.filter((template) => suppliedCounts.has(template.id));

  assert.equal(supplied.length, suppliedCounts.size);
  assert.equal(supplied.reduce((total, template) => total + template.items.length, 0), 133);
  assert.ok(supplied.every((template) => template.sector === "construction"));
  assert.ok(supplied.every((template) => template.sectors.includes("construction")));
  for (const template of supplied) {
    assert.equal(template.items.length, suppliedCounts.get(template.id), template.id);
  }
});

test("includes the third supplied construction set and all 70 actionable controls", () => {
  const suppliedCounts = new Map([
    ["construction-forklift-inspection", 18],
    ["construction-water-resources", 8],
    ["construction-concrete-cutting", 11],
    ["construction-fire-extinguisher-register", 11],
    ["construction-corrective-action-followup", 8],
    ["construction-safety-harness-inspection", 9],
    ["construction-scaffold-planks", 5],
  ]);
  const supplied = CHECKLISTS.filter((template) => suppliedCounts.has(template.id));

  assert.equal(supplied.length, suppliedCounts.size);
  assert.equal(supplied.reduce((total, template) => total + template.items.length, 0), 70);
  assert.ok(supplied.every((template) => template.sector === "construction"));
  assert.ok(supplied.every((template) => template.sectors.includes("construction")));
  for (const template of supplied) {
    assert.equal(template.items.length, suppliedCounts.get(template.id), template.id);
  }
});

test("keeps legacy templates compatible with saved inspection records", () => {
  for (const id of ["ppe", "electrical", "scaffold", "hose-reel"]) {
    assert.ok(CHECKLISTS.some((template) => template.id === id));
  }
  const ppe = CHECKLISTS.find((template) => template.id === "ppe");
  assert.ok(ppe?.items.includes("کلاه ایمنی سالم و دارای بند مناسب است"));
});

test("normalizes Persian search and combines activity and sector filters", () => {
  assert.equal(normalizeChecklistText("  ايمنيِ برق  "), "ایمنی برق");

  const electrical = filterChecklists(CHECKLISTS, "ايمني برق");
  assert.ok(electrical.some((template) => template.id === "electrical"));

  const forklift = filterChecklists(CHECKLISTS, "لیفت تراک", "lifting-logistics");
  assert.ok(forklift.some((template) => template.id === "forklift"));
  assert.ok(forklift.every((template) => template.sectors.includes("lifting-logistics")));

  const crossSectorGrinder = filterChecklists(CHECKLISTS, "سنگ فرز", "manufacturing");
  assert.ok(
    crossSectorGrinder.some((template) => template.id === "construction-angle-grinder"),
  );

  const crossSectorPanel = filterChecklists(CHECKLISTS, "تابلو برق کارگاهی", "healthcare");
  assert.ok(
    crossSectorPanel.some(
      (template) => template.id === "construction-electrical-panel-inspection",
    ),
  );

  const crossSectorWarehouse = filterChecklists(CHECKLISTS, "انبار کارگاهی", "agriculture");
  assert.ok(
    crossSectorWarehouse.some(
      (template) => template.id === "construction-warehouse-inspection",
    ),
  );

  const crossSectorForklift = filterChecklists(CHECKLISTS, "بازرسی دستگاه لیفتراک", "manufacturing");
  assert.ok(
    crossSectorForklift.some(
      (template) => template.id === "construction-forklift-inspection",
    ),
  );

  const crossSectorExtinguisher = filterChecklists(
    CHECKLISTS,
    "بازرسی کپسول های اطفای حریق",
    "office-public",
  );
  assert.ok(
    crossSectorExtinguisher.some(
      (template) => template.id === "construction-fire-extinguisher-register",
    ),
  );

  const constructionTemplates = filterChecklists(CHECKLISTS, "", "construction");
  assert.ok(
    constructionTemplates.some((template) => template.id === "construction-kitchen-inspection"),
  );

  const noCrossSectorResult = filterChecklists(
    CHECKLISTS,
    "بیمارستان",
    "construction",
  );
  assert.deepEqual(noCrossSectorResult, []);
});
