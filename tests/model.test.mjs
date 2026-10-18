import { test } from "node:test";
import assert from "node:assert/strict";
import {
  quoteShipment,
  BARRELS_PER_CUBIC_METRE,
  cleanupScenario,
  normalizeState,
  decodeState,
  encodeState,
  filterWells,
  csv,
} from "../model.mjs";
const rate = {
  rate: 50,
  unit: "CAD/m3",
  effectiveFrom: "2026-05-01",
  effectiveTo: "2026-09-27",
};
test("A sourced rate remains a partial estimate, never an all-in total", () => {
  const q = quoteShipment(rate, 100, "m3", "2026-06-01");
  assert.equal(q.carrier, 5000);
  assert.equal(q.status, "partial");
  assert.match(q.reason, /not fully established/);
});
test("Barrels and cubic metres price the same physical shipment", () =>
  assert.ok(
    Math.abs(
      quoteShipment(rate, 100 * BARRELS_PER_CUBIC_METRE, "bbl", "2026-06-01")
        .carrier - 5000,
    ) < 1e-8,
  ));
test("Unknown and out-of-period rates cannot masquerade as zero cost", () => {
  assert.equal(quoteShipment(null, 100, "m3", "2026-06-01").carrier, undefined);
  assert.equal(
    quoteShipment(rate, 100, "m3", "2026-10-01").status,
    "out-of-period",
  );
});
test("Scenario adds an explicit government assumption without changing the base tariff", () => {
  const q = quoteShipment(rate, 100, "m3", "2026-06-01", 20, 3);
  assert.equal(q.carrier, 6000);
  assert.equal(q.governmentAssumption, 300);
  assert.equal(rate.rate, 50);
});
test("Orphan and abandoned filters are independent", () => {
  const wells = [
    {
      id: "a",
      orphanStatus: "designated",
      closureStatus: "abandoned",
      province: "SK",
    },
    {
      id: "b",
      orphanStatus: "unknown",
      closureStatus: "abandoned",
      province: "AB",
    },
  ];
  assert.equal(
    filterWells(
      wells,
      normalizeState({ orphan: "designated", closure: "abandoned" }),
    ).length,
    1,
  );
  assert.equal(
    filterWells(wells, normalizeState({ closure: "abandoned" })).length,
    2,
  );
});
test("Cleanup assumptions are bounded by the loaded eligible cohort and invalid intervals fail", () => {
  assert.deepEqual(
    {
      ...cleanupScenario(1000000, 50000, 100000, 12),
      budget: 0,
      costLow: 0,
      costHigh: 0,
    },
    {
      status: "assumption",
      low: 10,
      high: 12,
      eligible: 12,
      budget: 0,
      costLow: 0,
      costHigh: 0,
    },
  );
  assert.equal(cleanupScenario(100, 20, 10, 100).status, "invalid");
});
test("Shared state roundtrips and rejects malformed state", () => {
  const s = normalizeState({
    view: "wells",
    province: "SK",
    scenario: { tollChange: 50 },
  });
  assert.deepEqual(decodeState(encodeState(s)), s);
  assert.equal(decodeState("#v1=%E0"), null);
  assert.equal(normalizeState({ view: "bad", volume: -10 }).volume, 0);
});
test("CSV escapes quotes and spreadsheet formula injection", () => {
  assert.match(
    csv([{ id: "=SUM(A1)", name: 'a"b' }], ["id", "name"]),
    /"'=SUM/,
  );
  assert.match(csv([{ name: 'a"b' }], ["name"]), /a""b/);
});
test("Shared views preserve closure-budget mode and its inspectable cohort", () => {
  const s = normalizeState({
    view: "lab",
    labTab: "cleanup",
    cohort: "cleanup",
  });
  assert.equal(decodeState(encodeState(s)).labTab, "cleanup");
  assert.equal(decodeState(encodeState(s)).cohort, "cleanup");
});
test("Recorded event filter matches event dates, not inferred historic status", () => {
  const w = [
    {
      id: "a",
      province: "SK",
      orphanStatus: "designated",
      closureStatus: "abandoned",
      events: [
        { type: "orphan-designated", date: "2020-01-01" },
        { type: "abandoned", date: "2022-01-01" },
      ],
    },
  ];
  assert.equal(
    filterWells(
      w,
      normalizeState({ eventYear: "2020", eventType: "abandoned" }),
    ).length,
    0,
  );
  assert.equal(
    filterWells(
      w,
      normalizeState({ eventYear: "2022", eventType: "abandoned" }),
    ).length,
    1,
  );
});
test("A schedule without an end date is not indefinitely valid", () => {
  const dated = {
    ...rate,
    effectiveTo: null,
    currentness: { verifiedShipmentDate: "2026-05-01" },
  };
  assert.equal(
    quoteShipment(dated, 100, "m3", "2026-10-17").status,
    "unverified-date",
  );
  assert.equal(quoteShipment(dated, 100, "m3", "2026-05-01").status, "partial");
});

test("Invalid numeric drafts cannot become a free shipment or a negative government fee", () => {
  for (const volume of [NaN, -1, 1e10])
    assert.equal(
      quoteShipment(rate, volume, "m3", "2026-06-01").status,
      "invalid",
    );
  for (const fee of [NaN, -1, 10001])
    assert.equal(
      quoteShipment(rate, 100, "m3", "2026-06-01", 20, fee).status,
      "invalid",
    );
  for (const adjustment of [NaN, -101, 201])
    assert.equal(
      quoteShipment(rate, 100, "m3", "2026-06-01", adjustment).status,
      "invalid",
    );
  assert.equal(quoteShipment(rate, 0, "m3", "2026-06-01", 0, 0).carrier, 0);
});
test("Empty and out-of-range closure drafts are invalid rather than zero budgets", () => {
  assert.equal(cleanupScenario(NaN, 75000, 150000, 3547).status, "invalid");
  assert.equal(cleanupScenario(1e11, 75000, 150000, 3547).status, "invalid");
  assert.equal(cleanupScenario(5000000, NaN, 150000, 3547).status, "invalid");
  assert.equal(cleanupScenario(0, 75000, 150000, 3547).low, 0);
});
