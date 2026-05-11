import assert from "node:assert/strict";
import { test } from "node:test";
import { layoutForTerminal, pageBudgetForLayout, type TuiPageMode } from "../src/tui/App.js";

test("TUI layout adapts to narrow and short terminals", () => {
  const tiny = layoutForTerminal(50, 18);
  assert.equal(tiny.tiny, true);
  assert.equal(tiny.sideBySide, false);
  assert.equal(tiny.messageLimit, 2);
  assert.equal(tiny.weekStyle, "bar");

  const wide = layoutForTerminal(140, 42);
  assert.equal(wide.tiny, false);
  assert.equal(wide.sideBySide, true);
  assert.equal(wide.weekStyle, "full");
  assert.equal(wide.showMessageDetails, true);
});

test("TUI page budget always fits in the terminal page", () => {
  const cases: Array<[number, number, boolean, TuiPageMode, number]> = [
    [50, 18, false, "normal", 0],
    [50, 18, true, "select", 12],
    [60, 12, true, "select", 12],
    [80, 24, false, "directory", 80],
    [88, 24, false, "approval", 2],
    [96, 24, true, "slash", 8],
    [140, 42, true, "select", 12]
  ];
  for (const [columns, rows, pinnedLimits, mode, optionCount] of cases) {
    const layout = layoutForTerminal(columns, rows);
    const budget = pageBudgetForLayout(layout, { pinnedLimits, mode, optionCount });
    assert.equal(budget.totalRows, layout.rows, `${columns}x${rows} should consume exactly one fixed page`);
    assert.equal(budget.conversationRows, 0);
    assert.ok(budget.headerRows >= 3);
    assert.ok(budget.composerRows >= 3);
    if (mode === "directory") assert.ok(budget.composerRows <= 4);
  }
});
