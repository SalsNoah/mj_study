import { TestRouter as MemoryRouter } from '@/test/TestRouter';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppProvider } from '@/app/store';
import { EditorPage } from '@/features/editor/EditorPage';
import { DetailPage } from '@/features/detail/DetailPage';
import { TestPage } from '@/features/test/TestPage';
import { STORAGE_KEY, type Store } from '@/domain/types';
import { UkeirePanel } from './UkeirePanel';
import { analyzeHand } from '@/domain/ukeire';
import { tileLabel, tileSortKey } from '@/domain/tiles';
import { parseHandNotation } from '@/domain/parse';
import { createMeld } from '@/domain/melds';

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('confirm', () => true);
  localStorage.clear();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
function byText(text: string, selector = 'button'): HTMLElement {
  const element = [...host.querySelectorAll<HTMLElement>(selector)].find((el) => el.textContent?.trim() === text);
  if (!element) throw new Error(`Missing ${selector}: ${text}`);
  return element;
}
async function click(element: HTMLElement) { await act(async () => element.click()); }
async function selectRemaining(label: string) {
  const suit = label.endsWith('萬') ? '萬子' : label.endsWith('筒') ? '筒子' : label.endsWith('索') ? '索子' : '字牌';
  await click([...host.querySelectorAll<HTMLElement>('.remaining-suits button')].find(el => el.textContent!.startsWith(suit))!);
  await click(host.querySelector<HTMLElement>(`.remaining-tile[aria-label^="${label}、"]`)!);
}
async function editRemaining(label: string, value: string) {
  const toggle = host.querySelector<HTMLElement>('.remaining-toggle');
  if (toggle?.getAttribute('aria-expanded') === 'false') await click(toggle);
  await selectRemaining(label);
  const field = host.querySelector<HTMLInputElement>(`input[aria-label="${label}の残枚数"]`)!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(field, value);
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
function store(): Store { return JSON.parse(localStorage.getItem(STORAGE_KEY)!); }
function expectUncollapsed(element: Element) {
  expect(element.closest('[hidden], details:not([open])')).toBeNull();
}

describe('ukeire UI and existing study flows (jsdom; not a layout/browser test)', () => {
  it('updates on editing, saves unchanged fields, matches detail, keeps sharing retired and hides until answered', async () => {
    await act(async () => root.render(
      <AppProvider><MemoryRouter><Routes>
        <Route path="/" element={<EditorPage />} />
        <Route path="/problems/:id" element={<DetailPage />} />
      </Routes></MemoryRouter></AppProvider>,
    ));
    expect(host.querySelector('.ukeire-panel')!.textContent).toContain('13〜14枚で表示');
    expectUncollapsed(host.querySelector('.ukeire-panel [role="status"]')!);
    for (const name of ['一萬','二萬','三萬','一筒','二筒','三筒','一索','二索','三索','四索','赤五索','五索','中']) {
      await click(host.querySelector<HTMLElement>(`.tile-palette button[aria-label="${name}"]`)!);
    }
    expect(host.querySelector('.ukeire-panel')!.textContent).toContain('1シャンテン');
    expectUncollapsed(host.querySelector('.ukeire-panel .ukeire-row')!);
    expect(host.querySelector('.ukeire-expand')).toBeNull();
    await click(host.querySelector<HTMLElement>('.tile-palette button[aria-label="中"]')!);
    expect(host.querySelectorAll('.ukeire-list > li')).toHaveLength(13);
    expect(host.querySelectorAll('.ukeire-list > li:not([hidden])')).toHaveLength(3);
    expectUncollapsed(host.querySelector('.ukeire-title')!);
    for (const row of host.querySelectorAll('.ukeire-list > li:not([hidden])')) expectUncollapsed(row);
    const editorRows = host.querySelector('.ukeire-list')!.textContent;
    await click(host.querySelector<HTMLElement>('.ukeire-expand')!);
    expect(host.querySelectorAll('.ukeire-list > li:not([hidden])')).toHaveLength(13);
    await click(byText('戻す'));
    expect(host.querySelector('.ukeire-list')).toBeNull();
    await click(host.querySelector<HTMLElement>('.tile-palette button[aria-label="中"]')!);
    expect(host.querySelectorAll('.ukeire-list > li:not([hidden])')).toHaveLength(3);
    expect(host.querySelector('.ukeire-expand')!.getAttribute('aria-expanded')).toBe('false');
    await click(byText('正解を設定する', 'label').querySelector<HTMLInputElement>('input')!);
    await click(byText('保存'));
    expect(host.querySelector('h1')!.textContent).toBe('無題の問題');
    await click(byText('受入れ'));
    expect(host.querySelector('.ukeire-list')!.textContent).toBe(editorRows);
    for (const row of host.querySelectorAll('.ukeire-list > li:not([hidden])')) expectUncollapsed(row);
    expect(store().problems).toHaveLength(1);
    expect(store().problems[0]!.drawn).toBeNull();
    expect(store().problems[0]!.concealed).toHaveLength(14);
    expect(store().problems[0]!.concealed).toContain('0s');
    const beforeAnalysisToggle = localStorage.getItem(STORAGE_KEY);
    await editRemaining('三索', '0');
    expect(host.querySelector('.remaining-control .remaining-status')).not.toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toBe(beforeAnalysisToggle);
    await click(host.querySelector<HTMLElement>('.ukeire-expand')!);
    await click(host.querySelector<HTMLElement>('.ukeire-expand')!);
    expect(localStorage.getItem(STORAGE_KEY)).toBe(beforeAnalysisToggle);
    expect(host.textContent).not.toContain('共有URLを生成');
    expect(host.querySelector('.share-box')).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toBe(beforeAnalysisToggle);
    await click(byText('確認した'));
    expect(store().study[0]!.confirmationCount).toBe(1);
    await click(byText('取り消す'));
    expect(store().study[0]!.confirmationCount).toBe(0);

    await act(async () => root.unmount());
    root = createRoot(host);
    const quizData = store();
    quizData.problems[0]!.answerEnabled = true;
    quizData.problems[0]!.acceptedDiscards = ['7z'];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(quizData));
    await act(async () => root.render(<AppProvider><MemoryRouter><TestPage /></MemoryRouter></AppProvider>));
    await click(byText('1 問でテスト開始'));
    expect(host.querySelector('.ukeire-panel')).toBeNull();
    await click(host.querySelector<HTMLElement>('.hand-stage button[aria-label="中"]')!);
    await click(byText('回答する'));
    await click(byText('受入れ'));
    expect(host.querySelector('.ukeire-list')!.textContent).toBe(editorRows);
    for (const row of host.querySelectorAll('.ukeire-list > li:not([hidden])')) expectUncollapsed(row);
    expect(store().attempts).toHaveLength(1);
    expect(store().attempts[0]!.result).toBe('correct');
    const answeredStore = localStorage.getItem(STORAGE_KEY);
    expect(byText('残枚数').getAttribute('aria-expanded')).toBe('false');
    await click(byText('残枚数'));
    await editRemaining('三索', '0');
    expect(host.querySelector('.ukeire-list')!.textContent).not.toBe(editorRows);
    await click(byText('残枚数'));
    expect(byText('残枚数').getAttribute('aria-expanded')).toBe('false');
    await click(byText('残枚数'));
    expect(host.querySelector<HTMLInputElement>('input[aria-label="三索の残枚数"]')!.value).toBe('0');
    expect(localStorage.getItem(STORAGE_KEY)).toBe(answeredStore);
    expect(store().attempts).toHaveLength(1);
    await click(byText('理解できた'));
    expect(store().study[0]!.understanding).toBe('understood');
    await click(byText('結果を見る'));
    expect(host.querySelector('.ukeire-panel')).toBeNull();
    expect(store().attempts).toHaveLength(1);
  });
  it('renders exhausted waits explicitly and recomputes when indicators change', async () => {
    const parsed = parseHandNotation('123m456m789p22s55z');
    if (!parsed.ok) throw new Error('fixture');
    const props = { concealed: parsed.tiles, drawn: null, melds: [] };
    await act(async () => root.render(<UkeirePanel {...props} doraIndicators={['2s','2s','5z','5z']} />));
    expect(host.textContent).toContain('0種・0枚');
    expect(host.querySelectorAll('.ukeire-zero')).toHaveLength(2);
    expect([...host.querySelectorAll('.ukeire-zero')].map(el => el.textContent)).toEqual(['0枚', '0枚']);
    await act(async () => root.render(<UkeirePanel {...props} doraIndicators={[]} />));
    expect(host.textContent).toContain('2種・4枚');
    expect(host.querySelector('.ukeire-zero')).toBeNull();
  });
  it('invalid tile count replaces stale candidates with an explanation', async () => {
    const parsed = parseHandNotation('1111m234p567p789s');
    if (!parsed.ok) throw new Error('fixture');
    const props = { concealed: parsed.tiles, drawn: null, melds: [] };
    await act(async () => root.render(<UkeirePanel {...props} doraIndicators={[]} />));
    expect(host.textContent).toContain('33種・123枚');
    await act(async () => root.render(<UkeirePanel {...props} doraIndicators={['1m']} />));
    expect(host.textContent).toContain('5枚あります');
    expect(host.textContent).not.toContain('33種・123枚');
    expectUncollapsed(host.querySelector('[role="status"]')!);
    expect(host.querySelector('.ukeire-row, .ukeire-expand')).toBeNull();
  });

  it('updates totals, distinguishes zero, rejects drafts and supports individual/all reset', async () => {
    const parsed = parseHandNotation('123m456m789p23s55z');
    if (!parsed.ok) throw new Error('fixture');
    await act(async () => root.render(<UkeirePanel concealed={parsed.tiles} drawn={null} melds={[]} doraIndicators={[]} />));
    expect(host.querySelectorAll('.remaining-tile')).toHaveLength(9);
    expect(host.querySelectorAll('.remaining-panel input')).toHaveLength(1);
    expect(host.textContent).toContain('2種・8枚');
    await editRemaining('一索', '0');
    expect(host.textContent).toContain('1種・4枚');
    expect(host.querySelector('.ukeire-zero')!.textContent).toBe('0枚');
    await editRemaining('四索', '2');
    expect(host.textContent).toContain('1種・2枚');
    expect(host.querySelector('input[aria-label="四索の残枚数"]')!.closest('.remaining-control')!.textContent).toContain('手動');
    for (const invalid of ['5','','-1','1.5','x']) {
      await editRemaining('四索', invalid);
      expect(host.querySelector('.remaining-error')!.textContent).toContain('入力は未反映です（集計は2枚）');
      expect(host.textContent).toContain('1種・2枚');
    }
    await click(host.querySelector<HTMLElement>('button[aria-label="四索の残枚数を1枚減らす"]')!);
    expect(host.textContent).toContain('1種・1枚');
    expect(host.querySelector('.remaining-error')).toBeNull();
    await click(host.querySelector<HTMLElement>('button[aria-label="四索の残枚数を1枚増やす"]')!);
    expect(host.textContent).toContain('1種・2枚');
    await selectRemaining('一索');
    await click(host.querySelector<HTMLElement>('button[aria-label="一索の残枚数を自動に戻す"]')!);
    expect(host.textContent).toContain('2種・6枚');
    await editRemaining('四索','');
    await click(byText('すべて自動に戻す'));
    expect(host.textContent).toContain('2種・8枚');
    expect(host.querySelector('.remaining-error')).toBeNull();
    expect(host.querySelector<HTMLInputElement>('input[aria-label="四索の残枚数"]')!.value).toBe('4');
    expect([...host.querySelectorAll('.remaining-status')].every(el => el.textContent === '自動')).toBe(true);
  });

  it('uses one editor for all 34 tiles, retains values across suits and discards invalid drafts on selection', async () => {
    const parsed = parseHandNotation('123m456m789p23s55z');
    if (!parsed.ok) throw new Error('fixture');
    await act(async () => root.render(<UkeirePanel concealed={parsed.tiles} drawn={null} melds={[]} doraIndicators={[]} />));
    const seen = new Set<string>();
    for (const name of ['萬子', '筒子', '索子', '字牌']) {
      await click([...host.querySelectorAll<HTMLElement>('.remaining-suits button')].find(el => el.textContent === name)!);
      for (const tile of host.querySelectorAll('.remaining-tile')) seen.add(tile.getAttribute('aria-label')!.split('、')[0]!);
      expect(host.querySelectorAll('.remaining-panel input')).toHaveLength(1);
      expect(host.querySelectorAll('.remaining-tile[aria-pressed="true"]')).toHaveLength(1);
    }
    expect(seen.size).toBe(34);
    await editRemaining('一索', '0');
    expect(host.querySelector('.remaining-tile.is-manual')!.getAttribute('aria-label')).toBe('一索、残り0枚、手動');
    await editRemaining('四索', '2');
    await editRemaining('四索', 'x');
    expect(host.querySelector('.remaining-error')).not.toBeNull();
    await selectRemaining('一萬');
    expect(host.querySelector('.remaining-error')).toBeNull();
    const souzu = [...host.querySelectorAll('.remaining-suits button')].find(el => el.textContent!.startsWith('索子'))!;
    expect(souzu.getAttribute('aria-label')).toBe('索子、2種を調整中');
    await selectRemaining('四索');
    expect(host.querySelector<HTMLInputElement>('input[aria-label="四索の残枚数"]')!.value).toBe('2');
    await click(souzu as HTMLElement);
    expect(host.querySelector<HTMLInputElement>('input[aria-label="四索の残枚数"]')!.value).toBe('2');
    expect(host.textContent).toContain('1種・2枚');
    await click(byText('すべて自動に戻す'));
    expect(host.querySelector('.remaining-tile.is-manual')).toBeNull();
    expect(host.querySelector('.remaining-suit-count')).toBeNull();
  });

  it('shares one adjustment between red and normal discard rows and retains structural shanten', async () => {
    const parsed = parseHandNotation('123m123p123s405s77z');
    if (!parsed.ok) throw new Error('fixture');
    await act(async () => root.render(<UkeirePanel concealed={parsed.tiles} drawn={null} melds={[]} doraIndicators={[]} />));
    const row = (name: string) => [...host.querySelectorAll('.ukeire-list > li')].find((el) => el.querySelector('.ukeire-discard')!.getAttribute('aria-label') === `${name}を切る`)!;
    const shantens = () => Object.fromEntries([...host.querySelectorAll('.ukeire-list > li')].map(el => [el.querySelector('.ukeire-discard')!.getAttribute('aria-label'), el.querySelector('strong')!.textContent]));
    const initialShanten = shantens();
    await editRemaining('三索','0'); await editRemaining('六索','1');
    expect(row('赤五索').textContent).toContain('1種・1枚');
    expect(row('五索').textContent).toContain('1種・1枚');
    expect(host.querySelector('input[aria-label="赤五索の残枚数"]')).toBeNull();
    expect(shantens()).toEqual(initialShanten);
  });

  it('keeps the same session on reordering/re-render and resets on indicators, drawn and problem changes', async () => {
    const parsed = parseHandNotation('123m456m789p23s55z');
    if (!parsed.ok) throw new Error('fixture');
    const props = {concealed: parsed.tiles, drawn: null, melds: [], doraIndicators: []};
    await act(async () => root.render(<UkeirePanel {...props} sessionKey="one" />));
    await editRemaining('一索','0');
    await act(async () => root.render(<UkeirePanel {...{...props,title:'changed',concealed:[...parsed.tiles].reverse()}} sessionKey="one" />));
    expect(host.textContent).toContain('1種・4枚');
    expect(host.querySelector<HTMLInputElement>('input[aria-label="一索の残枚数"]')!.value).toBe('0');
    await act(async () => root.render(<UkeirePanel {...props} doraIndicators={['1s']} sessionKey="one" />));
    expect(host.textContent).toContain('2種・7枚');
    await selectRemaining('一索');
    expect(host.querySelector<HTMLInputElement>('input[aria-label="一索の残枚数"]')!.value).toBe('3');
    expect([...host.querySelectorAll('.remaining-status')].every(el => el.textContent === '自動')).toBe(true);
    await editRemaining('一索','0');
    await act(async () => root.render(<UkeirePanel {...props} drawn="1z" sessionKey="one" />));
    expect([...host.querySelectorAll('.remaining-status')].every(el => el.textContent === '自動')).toBe(true);
    await editRemaining('一索','0');
    await act(async () => root.render(<UkeirePanel {...props} drawn="1z" sessionKey="two" />));
    expect([...host.querySelectorAll('.remaining-status')].every(el => el.textContent === '自動')).toBe(true);
  });

  it('zero upper bound disables increment and rejects nonzero input', async () => {
    const parsed = parseHandNotation('1111m234p567p789s');
    if (!parsed.ok) throw new Error('fixture');
    await act(async () => root.render(<UkeirePanel concealed={parsed.tiles} drawn={null} melds={[]} doraIndicators={[]} />));
    expect(host.querySelector<HTMLButtonElement>('button[aria-label="一萬の残枚数を1枚増やす"]')!.disabled).toBe(true);
    expect(host.querySelector<HTMLButtonElement>('button[aria-label="一萬の残枚数を1枚減らす"]')!.disabled).toBe(true);
    await editRemaining('一萬','1');
    expect(host.querySelector('.remaining-error')!.textContent).toContain('上限0枚');
    expect(host.textContent).toContain('33種・123枚');
    await click(byText('すべて自動に戻す'));
    expect(host.querySelector<HTMLInputElement>('input[aria-label="一萬の残枚数"]')!.value).toBe('0');
    expect(host.querySelector('.remaining-error')).toBeNull();
  });

  it('places the editor toggle immediately after clear, preserves adjustments across repeated toggles and resets on position changes', async () => {
    await act(async () => root.render(<AppProvider><MemoryRouter><EditorPage /></MemoryRouter></AppProvider>));
    const toggle = () => host.querySelector<HTMLButtonElement>('.remaining-toggle')!;
    expect(byText('全消去').nextElementSibling).toBe(toggle());
    expect(toggle().disabled).toBe(true);
    for (const name of ['一萬','二萬','三萬','四萬','五萬','六萬','七筒','八筒','九筒','二索','三索','白','白']) {
      await click(host.querySelector<HTMLElement>(`.tile-palette button[aria-label="${name}"]`)!);
    }
    expect(toggle().disabled).toBe(false);
    const settings = () => document.getElementById(toggle().getAttribute('aria-controls')!)!;
    expect(settings().hidden).toBe(true);
    await click(toggle());
    expect(settings().hidden).toBe(false);
    expect(settings().closest('.tile-input')).not.toBeNull();
    expect(host.querySelector('.ukeire-panel .remaining-panel')).toBeNull();
    await editRemaining('一索', '0');
    expect(host.querySelector('.ukeire-total')!.textContent).toBe('1種・4枚');
    for (let i = 0; i < 3; i++) {
      await click(toggle()); expect(settings().hidden).toBe(true);
      await click(toggle()); expect(settings().hidden).toBe(false);
      expect(host.querySelector<HTMLInputElement>('input[aria-label="一索の残枚数"]')!.value).toBe('0');
    }
    await click(byText('理牌'));
    expect(settings().hidden).toBe(false);
    expect(host.querySelector<HTMLInputElement>('input[aria-label="一索の残枚数"]')!.value).toBe('0');
    await click(host.querySelector<HTMLElement>('.tile-palette button[aria-label="東"]')!);
    expect(settings().hidden).toBe(true);
    await click(toggle());
    await selectRemaining('一索');
    expect(host.querySelector<HTMLInputElement>('input[aria-label="一索の残枚数"]')!.value).toBe('4');
    await click(byText('戻す'));
    expect(host.querySelector('.ukeire-total')!.textContent).toBe('2種・8枚');
    expect(settings().hidden).toBe(true);
    await click(byText('全消去'));
    expect(toggle().disabled).toBe(true);
    expect(host.querySelector('.remaining-panel')).toBeNull();
  });

  it('shows the largest remaining totals within minimal shanten first, breaks ties by tile order and expands all candidates', async () => {
    const parsed = parseHandNotation('123m123p123s405s77z');
    if (!parsed.ok) throw new Error('fixture');
    const input = { concealed: parsed.tiles, drawn: null, melds: [], doraIndicators: [] };
    const expected = analyzeHand(input);
    if (expected.status !== 'ready') throw new Error('fixture');
    const ranked = [...expected.discards].sort((a, b) => a.shanten - b.shanten || b.total - a.total || tileSortKey(a.discard) - tileSortKey(b.discard));
    await act(async () => root.render(<UkeirePanel {...input} />));
    const visibleRows = () => [...host.querySelectorAll<HTMLElement>('.ukeire-list > li')].filter(row => !row.hidden);
    expect(visibleRows().map(row => row.querySelector('.ukeire-discard')!.getAttribute('aria-label'))).toEqual(ranked.slice(0, 3).map(row => `${tileLabel(row.discard)}を切る`));
    const topRows = visibleRows();
    topRows.forEach(expectUncollapsed);
    expect(host.querySelector('.ukeire-order')!.textContent).toBe('最小シャンテン内・枚数順');
    const expand = host.querySelector<HTMLElement>('.ukeire-expand')!;
    await click(expand);
    expect(visibleRows()).toHaveLength(ranked.length);
    expect(new Set(visibleRows().map(row => row.querySelector('.ukeire-discard')!.getAttribute('aria-label'))).size).toBe(ranked.length);
    expect(visibleRows().slice(0, 3)).toEqual(topRows);
    expect(expand.getAttribute('aria-expanded')).toBe('true');
    for (const row of visibleRows()) {
      const name = row.querySelector('.ukeire-discard')!.getAttribute('aria-label');
      const value = ranked.find(item => `${tileLabel(item.discard)}を切る` === name)!;
      expect(!!row.querySelector('.ukeire-retreat')).toBe(value.shanten > expected.currentShanten);
    }
    await click(expand);
    expect(visibleRows()).toHaveLength(3);
    expect(visibleRows()).toEqual(topRows);
    topRows.forEach(expectUncollapsed);
    await editRemaining('三索', '0');
    const totals = visibleRows().map(row => Number(row.querySelector('.ukeire-total')!.textContent!.match(/・(\d+)枚/)![1]));
    expect(totals).toEqual([...totals].sort((a, b) => b - a));
    await click(expand);
    await act(async () => root.render(<UkeirePanel {...input} sessionKey="another" />));
    expect(visibleRows()).toHaveLength(3);
    await act(async () => root.render(<UkeirePanel {...input} />));
    expect(visibleRows()).toHaveLength(3);
  });

  it('keeps only compact ukeire data and plain tenpai labels', async () => {
    const parsed = parseHandNotation('123m456m789p23s55z');
    if (!parsed.ok) throw new Error('fixture');
    await act(async () => root.render(<UkeirePanel concealed={parsed.tiles} drawn={null} melds={[]} doraIndicators={[]} />));
    expect(host.querySelector('h2.ukeire-title')!.textContent).toBe('受入れ');
    expectUncollapsed(host.querySelector('.ukeire-row')!);
    expect(host.querySelector('.ukeire-list, .ukeire-expand')).toBeNull();
    expect(host.querySelector('.ukeire-current')!.textContent).toBe('テンパイ');
    expect(host.querySelector('.ukeire-panel .hint')).toBeNull();
    expect(host.textContent).not.toMatch(/（0）|理論残枚数|四麻|通常形|七対子|国士|画面内|山残枚数|手動設定中|最善打牌|13枚相当/);
    await click(byText('残枚数'));
    expect(host.querySelector('.remaining-panel .hint')).toBeNull();
  });

  it('prefers tenpai even when a retreat has 32 effective tiles, and keeps that group after adjustment', async () => {
    const parsed = parseHandNotation('111234567m123p12s');
    if (!parsed.ok) throw new Error('fixture');
    await act(async () => root.render(<UkeirePanel concealed={parsed.tiles} drawn={null} melds={[]} doraIndicators={[]} />));
    const visible = () => [...host.querySelectorAll<HTMLElement>('.ukeire-list > li')].filter(row => !row.hidden);
    const names = () => visible().map(row => row.querySelector('.ukeire-discard')!.getAttribute('aria-label'));
    expect(names()).toEqual(['一萬を切る','四萬を切る','七萬を切る']);
    const retreat = [...host.querySelectorAll<HTMLElement>('.ukeire-list > li')].find(row => row.querySelector('.ukeire-discard')!.getAttribute('aria-label') === '二萬を切る')!;
    expect(retreat.hidden).toBe(true); expect(retreat.textContent).toContain('32枚');
    await editRemaining('三索','0');
    expect(names()).toEqual(['一索を切る','二索を切る','一萬を切る']);
    expect(visible().every(row => row.querySelector('strong')!.textContent === 'テンパイ')).toBe(true);
    await click(host.querySelector<HTMLElement>('.ukeire-expand')!);
    expect(retreat.hidden).toBe(false); expect(host.querySelector('.ukeire-order')!.textContent).toBe('シャンテン順・枚数順');
  });
  it('never fills a short minimum-shanten group with worse candidates', async () => {
    const parsed = parseHandNotation('123m456m789p23s155z');
    if (!parsed.ok) throw new Error('fixture');
    await act(async () => root.render(<UkeirePanel concealed={parsed.tiles} drawn={null} melds={[]} doraIndicators={[]} />));
    const visible = () => [...host.querySelectorAll<HTMLElement>('.ukeire-list > li')].filter(row => !row.hidden);
    expect(visible()).toHaveLength(1); expect(visible()[0]!.querySelector('.ukeire-discard')!.getAttribute('aria-label')).toBe('東を切る');
    await click(host.querySelector<HTMLElement>('.ukeire-expand')!); expect(visible()).toHaveLength(13);
    await click(host.querySelector<HTMLElement>('.ukeire-expand')!); expect(visible()).toHaveLength(1);
  });

  it.each([
    { concealed: '11m', melds: ['123p', '456p', '123s', '456s'], candidates: 1 },
    { concealed: '11222m', melds: ['123p', '456p', '123s'], candidates: 2 },
    { concealed: '11223m', melds: ['123p', '456p', '123s'], candidates: 3 },
  ])('shows all $candidates minimum-shanten candidates without an empty expansion', async ({ concealed, melds, candidates }) => {
    const hand = parseHandNotation(concealed);
    if (!hand.ok) throw new Error('fixture');
    const groups = melds.map(notation => {
      const tiles = parseHandNotation(notation);
      if (!tiles.ok) throw new Error('fixture');
      const result = createMeld('chi', tiles.tiles, 'left', 0);
      if (!result.ok) throw new Error('fixture');
      return result.meld;
    });
    await act(async () => root.render(<UkeirePanel concealed={hand.tiles} drawn={null} melds={groups} doraIndicators={[]} />));
    const rows = host.querySelectorAll('.ukeire-list > li');
    expect(rows).toHaveLength(candidates);
    for (const row of rows) {
      expectUncollapsed(row);
      expect(row.querySelector('strong')!.textContent).toBe('テンパイ');
    }
    expect(host.querySelector('.ukeire-expand')).toBeNull();
  });

});
