import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AppProvider } from '@/app/store';
import { EditorPage } from './EditorPage';
import { putImportDraft } from '@/features/import/draft';
import { emptyContext, emptyStore, STORAGE_KEY } from '@/domain/types';
import { createLegacySampleProblems as createSampleProblems } from '@/data/legacySamples';

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  localStorage.clear();
  sessionStorage.clear();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

async function mount(path = '/') {
  await act(async () => root.render(
    <AppProvider><MemoryRouter initialEntries={[path]}><Routes>
      <Route path="/" element={<EditorPage />} />
      <Route path="/edit/:id" element={<EditorPage />} />
      <Route path="/problems/:id" element={<div>saved</div>} />
    </Routes></MemoryRouter></AppProvider>,
  ));
}
const field = (label: string) => [...host.querySelectorAll<HTMLInputElement>('.ctx-score input')]
  .find(el => el.getAttribute('aria-label')!.startsWith(`${label}の点数`))!;
const button = (text: string) => [...host.querySelectorAll<HTMLButtonElement>('button')]
  .find(el => el.textContent?.trim() === text)!;
const suffix = (label: string) => field(label).parentElement!.querySelector('.score-suffix')!;
const reset = (label: string) => host.querySelector<HTMLButtonElement>(`button[aria-label="${label}の未反映入力を戻す"]`)!;
async function click(el: HTMLElement) { await act(async () => el.click()); }
async function focus(el: HTMLElement) { await act(async () => el.focus()); }
async function blur(label: string) { await act(async () => field(label).blur()); }
async function input(label: string, value: string) {
  const el = field(label);
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
async function addHand() {
  await click(host.querySelector<HTMLElement>('.tile-palette button[aria-label="一萬"]')!);
  await click(host.querySelector<HTMLElement>('.hand-stage--pick button[aria-label="一萬"]')!);
}
const saved = () => JSON.parse(localStorage.getItem(STORAGE_KEY)!).problems[0];
function seedScores(scores: ReturnType<typeof emptyContext>['scores']) {
  const store = emptyStore();
  const p = createSampleProblems().problems[0]!;
  store.problems = [{ ...p, id: 'old', context: { ...p.context, scores } }];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}
function expectNoModeToggle() {
  expect(button('詳細入力')).toBeUndefined();
  expect(button('3桁＋00に戻す')).toBeUndefined();
}

it('has one score UI with fixed sibling suffixes and saves zero, maximum prefix, blank and negative scores', async () => {
  await mount();
  expectNoModeToggle();
  expect(field('東').value).toBe('250');
  expect([...host.querySelectorAll('.score-suffix')].map(el => el.textContent)).toEqual(['00', '00', '00', '00']);
  for (const label of ['東', '南', '西', '北']) {
    expect(field(label).nextElementSibling).toBe(suffix(label));
    expect(suffix(label).getAttribute('aria-hidden')).toBe('true');
    expect(field(label).getAttribute('aria-label')).toContain('百点単位');
  }
  await input('東', '0');
  await input('南', '999');
  await input('西', '');
  await input('北', '-25');
  expect(suffix('西').getAttribute('data-empty')).toBe('true');
  expect(suffix('東').hasAttribute('data-empty')).toBe(false);
  await addHand();
  await click(button('保存'));
  expect(saved().context.scores).toEqual({ east: 0, south: 99900, west: null, north: -2500 });
});

it('keeps invalid drafts visible without truncation or saving the last-valid value', async () => {
  await mount();
  await addHand();
  await input('東', '275');
  await focus(field('東'));
  for (const invalid of ['25000', '-', '1.5', '1e2', '1000', '+1', ' 1', '１']) {
    await input('東', invalid);
    expect(field('東').value).toBe(invalid);
    expect(field('東').getAttribute('aria-invalid')).toBe('true');
    expect(suffix('東').textContent).toBe('00');
    expectNoModeToggle();
    await click(button('保存'));
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  }
  await input('東', '275');
  await click(button('保存'));
  expect(saved().context.scores.east).toBe(27500);
});

it('preserves unedited legacy remainders and large or negative values without a detail mode', async () => {
  const scores = { east: 12345, south: -25000, west: 100000, north: -100000 };
  seedScores(scores);
  await mount('/edit/old');
  expect(['東', '南', '西', '北'].map(label => field(label).value)).toEqual(['12345', '-250', '100000', '-100000']);
  expect(['東', '南', '西', '北'].map(label => suffix(label).textContent)).toEqual(['点', '00', '点', '点']);
  expectNoModeToggle();
  for (const label of ['東', '西', '北']) expect(field(label).getAttribute('aria-label')).toContain('そのまま');
  await click(button('保存'));
  expect(saved().context.scores).toEqual(scores);
});

it('creates exact remainder and boundary scores only through the explicit full-point action', async () => {
  await mount();
  await addHand();
  for (const [label, draft, action] of [
    ['東', '99999', '99,999点として反映'],
    ['南', '200000', '200,000点として反映'],
    ['西', '-100000', '-100,000点として反映'],
  ]) {
    await focus(field(label));
    await input(label, draft);
    expect(field(label).value).toBe(draft);
    expect(field(label).getAttribute('aria-invalid')).toBe('true');
    expect(suffix(label).textContent).toBe('00');
    await blur(label);
    expect(field(label).value).toBe(draft);
    expect(field(label).getAttribute('aria-invalid')).toBe('true');
    await click(button('保存'));
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    const adopt = button(action);
    expect(adopt.getAttribute('aria-label')).toBe(`${label}の点数を${action}`);
    await focus(adopt);
    await click(adopt);
    expect(field(label).value).toBe(draft);
    expect(field(label).getAttribute('aria-invalid')).toBe('false');
    expect(suffix(label).textContent).toBe('点');
    expect(document.activeElement).toBe(field(label));
  }
  expectNoModeToggle();
  await click(button('保存'));
  expect(saved().context.scores).toEqual({ east: 99999, south: 200000, west: -100000, north: 25000 });
});

it('keeps the exact multiplier stable while focused and compacts only on blur', async () => {
  seedScores({ east: 12345, south: null, west: null, north: null });
  await mount('/edit/old');
  await focus(field('東'));
  for (const draft of ['1', '12', '123', '1230', '12300']) {
    await input('東', draft);
    expect(field('東').value).toBe(draft);
    expect(field('東').getAttribute('aria-label')).toContain('そのまま');
    expect(suffix('東').textContent).toBe('点');
    expect(document.activeElement).toBe(field('東'));
  }
  await blur('東');
  expect(field('東').value).toBe('123');
  expect(field('東').getAttribute('aria-label')).toContain('百点単位');
  expect(suffix('東').textContent).toBe('00');
  await focus(field('東'));
  await input('東', '1000');
  await blur('東');
  expect(field('東').value).toBe('1000');
  expect(field('東').getAttribute('aria-invalid')).toBe('true');
  expect(suffix('東').textContent).toBe('00');
  await input('東', '123');
  await click(button('保存'));
  expect(saved().context.scores.east).toBe(12300);
});

it.each([
  ['99900', '999', 99900],
  ['-99900', '-999', -99900],
  ['0', '0', 0],
  ['', '', null],
] as const)('normalizes raw %s to compact %s on blur without confusing zero and blank', async (raw, compact, value) => {
  seedScores({ east: 12345, south: null, west: null, north: null });
  await mount('/edit/old');
  await focus(field('東'));
  await input('東', raw);
  expect(field('東').value).toBe(raw);
  expect(suffix('東').textContent).toBe('点');
  await blur('東');
  expect(field('東').value).toBe(compact);
  expect(suffix('東').textContent).toBe('00');
  expect(suffix('東').hasAttribute('data-empty')).toBe(value === null);
  await click(button('保存'));
  expect(saved().context.scores.east).toBe(value);
});

it('preserves new exact values during editing and does not normalize non-hundreds on blur', async () => {
  await mount();
  await addHand();
  await input('東', '100000');
  await click(button('100,000点として反映'));
  expect(document.activeElement).toBe(field('東'));
  await input('東', '100');
  expect(field('東').value).toBe('100');
  expect(suffix('東').textContent).toBe('点');
  await input('東', '105');
  await blur('東');
  expect(field('東').value).toBe('105');
  expect(suffix('東').textContent).toBe('点');
  await click(button('保存'));
  expect(saved().context.scores.east).toBe(105);
});

it('preserves OCR score remainders, zero, blank, negative and indicator data', async () => {
  const scores = { east: 25150, south: 0, west: null, north: -1200 };
  putImportDraft({ concealed: ['1m'], melds: [], doraIndicators: ['2m'], context: { ...emptyContext(), scores } });
  await mount();
  expect(['東', '南', '西', '北'].map(label => field(label).value)).toEqual(['25150', '0', '', '-12']);
  expect(suffix('東').textContent).toBe('点');
  expectNoModeToggle();
  await click(button('保存'));
  expect(saved().context.scores).toEqual(scores);
  expect(saved().doraIndicators).toEqual(['2m']);
});

it('explicitly adopts full points or restores the prior valid value and keeps keyboard focus usable', async () => {
  await mount();
  await addHand();
  await input('東', '300');
  await input('東', '25000');
  const adopt = button('25,000点として反映');
  expect(adopt.getAttribute('aria-label')).toBe('東の点数を25,000点として反映');
  await focus(adopt);
  await click(adopt);
  expect(field('東').value).toBe('250');
  expect(document.activeElement).toBe(field('東'));
  await input('東', '251');
  expect(field('東').value).toBe('251');
  await input('南', '275');
  await input('南', '1.5');
  await focus(reset('南'));
  await click(reset('南'));
  expect(field('南').value).toBe('275');
  expect(document.activeElement).toBe(field('南'));
  await input('南', '276');
  await click(button('保存'));
  expect(saved().context.scores).toMatchObject({ east: 25100, south: 27600 });
});

it('restores blank and zero separately and removes each error without adopting invalid full points', async () => {
  await mount();
  await addHand();
  await input('東', '');
  await input('南', '0');
  for (const label of ['東', '南']) {
    await input(label, '200001');
    expect(field(label).getAttribute('aria-describedby')).toBe(label === '東' ? 'score-east-error' : 'score-south-error');
    expect(button('200,001点として反映')).toBeUndefined();
  }
  expect(reset('東').textContent).toBe('未設定に戻す');
  expect(reset('南').textContent).toBe('0点に戻す');
  await focus(reset('東'));
  await click(reset('東'));
  expect(field('東').value).toBe('');
  expect(document.activeElement).toBe(field('東'));
  expect(suffix('東').getAttribute('data-empty')).toBe('true');
  expect(host.querySelectorAll('.score-input-error')).toHaveLength(1);
  await focus(reset('南'));
  await click(reset('南'));
  expect(field('南').value).toBe('0');
  expect(document.activeElement).toBe(field('南'));
  expect(suffix('南').hasAttribute('data-empty')).toBe(false);
  expect(host.querySelectorAll('.score-input-error')).toHaveLength(0);
  await click(button('保存'));
  expect(saved().context.scores).toMatchObject({ east: null, south: 0 });
});

it('preserves invalid OCR values visibly and blocks save until every score is corrected', async () => {
  putImportDraft({ concealed: ['1m'], melds: [], doraIndicators: [], context: {
    ...emptyContext(), scores: { east: 200001, south: -100001, west: 1.5, north: null },
  } });
  await mount();
  expect(['東', '南', '西'].map(label => field(label).value)).toEqual(['200001', '-100001', '1.5']);
  for (const label of ['東', '南', '西']) {
    expect(field(label).getAttribute('aria-invalid')).toBe('true');
    expect(field(label).getAttribute('aria-label')).toContain('そのまま');
    expect(suffix(label).textContent).toBe('点');
  }
  expectNoModeToggle();
  expect(host.querySelectorAll('.score-input-error')).toHaveLength(3);
  await click(button('保存'));
  expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  await input('東', '200000');
  await input('南', '-100000');
  await click(button('保存'));
  expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  expect(field('西').value).toBe('1.5');
  await input('西', '100');
  await click(button('保存'));
  expect(saved().context.scores).toEqual({ east: 200000, south: -100000, west: 100, north: null });
});
