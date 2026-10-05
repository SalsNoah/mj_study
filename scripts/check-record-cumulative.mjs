import { expect } from '@playwright/test';

// Compare the actual plotted coordinates and accessible table, using fixture
// totals rather than the application's aggregation implementation.
export async function assertCumulativeRecordChart(panel, expectedTotals) {
  await expect(panel.locator('[role="img"]')).toHaveAttribute('aria-label', /累計/);
  await expect(panel.locator('table caption')).toContainText('累計');
  const values = await panel.locator('tbody tr').evaluateAll(rows => rows.map(row =>
    [...row.querySelectorAll('td')].map(cell => Number(cell.textContent.replaceAll(',', '')))));
  const totals = await panel.locator('tfoot td').evaluateAll(cells => cells.map(cell =>
    Number(cell.textContent.replaceAll(',', ''))));
  expect(totals).toEqual(expectedTotals);
  expect(values.at(-1)).toEqual(expectedTotals);
  for (const [index, row] of values.entries()) {
    expect(row).toHaveLength(3);
    for (const [field, value] of row.entries()) {
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(index ? values[index - 1][field] : 0);
    }
  }
  const ceiling = Number((await panel.locator('.records-chart__y-axis > span').first().innerText()).replaceAll(',', ''));
  const lines = await panel.locator('polyline').evaluateAll(elements => elements.map(el =>
    el.getAttribute('points').trim().split(/\s+/).map(pair => pair.split(',').map(Number))));
  expect(lines).toHaveLength(3);
  for (const [field, points] of lines.entries()) {
    expect(points).toHaveLength(values.length);
    for (const [index, [x, y]] of points.entries()) {
      expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true);
      expect(y).toBeCloseTo(160 - values[index][field] * 160 / ceiling, 5);
    }
  }
  return { first: values[0], last: values.at(-1), totals, rows: values.length, tableMatchesPlot: true };
}
