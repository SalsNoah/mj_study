import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppProvider } from '@/app/store';
import { EditorPage } from '@/features/editor/EditorPage';
import { DetailPage } from '@/features/detail/DetailPage';
import { TestPage } from '@/features/test/TestPage';
import { decodeSharePayload } from '@/domain/share';
import { STORAGE_KEY, type Store } from '@/domain/types';
import { UkeirePanel } from './UkeirePanel';
import { parseHandNotation } from '@/domain/parse';

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
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
async function editRemaining(label: string, value: string) {
  const field = host.querySelector<HTMLInputElement>(`input[aria-label="${label}の残枚数"]`)!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(field, value);
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
function store(): Store { return JSON.parse(localStorage.getItem(STORAGE_KEY)!); }

describe('ukeire UI and existing study flows (jsdom; not a layout/browser test)', () => {
  it('updates on editing, saves unchanged fields, matches detail, preserves share and hides until answered', async () => {
    await act(async () => root.render(
      <AppProvider><MemoryRouter><Routes>
        <Route path="/" element={<EditorPage />} />
        <Route path="/problems/:id" element={<DetailPage />} />
      </Routes></MemoryRouter></AppProvider>,
    ));
    expect(host.querySelector('.ukeire-panel')!.textContent).toContain('現在0枚相当');
    for (const name of ['一萬','二萬','三萬','一筒','二筒','三筒','一索','二索','三索','四索','赤五索','五索','中']) {
      await click(host.querySelector<HTMLElement>(`.tile-palette button[aria-label="${name}"]`)!);
    }
    expect(host.querySelector('.ukeire-panel')!.textContent).toContain('13枚相当の現在');
    await click(host.querySelector<HTMLElement>('.tile-palette button[aria-label="中"]')!);
    expect(host.querySelectorAll('.ukeire-list > li')).toHaveLength(13);
    const editorRows = host.querySelector('.ukeire-list')!.textContent;
    await click(byText('戻す'));
    expect(host.querySelector('.ukeire-list')).toBeNull();
    await click(host.querySelector<HTMLElement>('.tile-palette button[aria-label="中"]')!);
    await click(byText('保存'));
    expect(host.querySelector('h1')!.textContent).toBe('無題の問題');
    expect(host.querySelector('.ukeire-list')!.textContent).toBe(editorRows);
    expect(store().problems).toHaveLength(1);
    expect(store().problems[0]!.drawn).toBeNull();
    expect(store().problems[0]!.concealed).toHaveLength(14);
    expect(store().problems[0]!.concealed).toContain('0s');
    const beforeAnalysisToggle = localStorage.getItem(STORAGE_KEY);
    await editRemaining('三索', '0');
    expect(host.querySelector('.ukeire-adjust-status')!.textContent).toContain('1種を手動');
    expect(localStorage.getItem(STORAGE_KEY)).toBe(beforeAnalysisToggle);
    await click(host.querySelector<HTMLElement>('.ukeire-panel summary')!);
    await click(host.querySelector<HTMLElement>('.ukeire-panel summary')!);
    expect(localStorage.getItem(STORAGE_KEY)).toBe(beforeAnalysisToggle);
    await click(byText('共有URLを生成'));
    const url = host.querySelector<HTMLTextAreaElement>('.share-box textarea')!.value;
    const decoded = decodeSharePayload(url.split('#share=')[1]!);
    expect(decoded.ok).toBe(true);
    expect(localStorage.getItem(STORAGE_KEY)).toBe(beforeAnalysisToggle);
    await click(byText('確認した'));
    expect(store().study[0]!.confirmationCount).toBe(1);
    await click(byText('取り消す'));
    expect(store().study[0]!.confirmationCount).toBe(0);

    await act(async () => root.unmount());
    root = createRoot(host);
    await act(async () => root.render(<AppProvider><MemoryRouter><TestPage /></MemoryRouter></AppProvider>));
    await click(byText('1 問でテスト開始'));
    expect(host.querySelector('.ukeire-panel')).toBeNull();
    await click(byText('解説を見る'));
    expect(host.querySelector('.ukeire-list')!.textContent).toBe(editorRows);
    expect(store().attempts).toHaveLength(1);
    expect(store().attempts[0]!.result).toBe('selfReview');
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
    expect(host.textContent).toContain('形上は有効・残り0枚：二索、白');
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
  });

  it('updates totals, distinguishes zero, rejects drafts and supports individual/all reset', async () => {
    const parsed = parseHandNotation('123m456m789p23s55z');
    if (!parsed.ok) throw new Error('fixture');
    await act(async () => root.render(<UkeirePanel concealed={parsed.tiles} drawn={null} melds={[]} doraIndicators={[]} />));
    expect(host.querySelectorAll('.remaining-grid input')).toHaveLength(34);
    expect(host.textContent).toContain('2種・8枚');
    await editRemaining('一索', '0');
    expect(host.textContent).toContain('1種・4枚');
    expect(host.querySelector('.ukeire-zero')!.textContent).toContain('一索（手動）');
    await editRemaining('四索', '2');
    expect(host.textContent).toContain('1種・2枚');
    expect(host.textContent).toContain('調整後残枚数');
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
    await click(host.querySelector<HTMLElement>('button[aria-label="一索の残枚数を自動に戻す"]')!);
    expect(host.textContent).toContain('2種・6枚');
    await editRemaining('四索','');
    await click(byText('すべて自動に戻す'));
    expect(host.textContent).toContain('2種・8枚');
    expect(host.querySelector('.remaining-error')).toBeNull();
    expect(host.querySelector<HTMLInputElement>('input[aria-label="四索の残枚数"]')!.value).toBe('4');
    expect(host.querySelector('.ukeire-adjust-status')!.textContent).toContain('すべて自動');
  });

  it('shares one adjustment between red and normal discard rows and retains structural shanten', async () => {
    const parsed = parseHandNotation('123m123p123s405s77z');
    if (!parsed.ok) throw new Error('fixture');
    await act(async () => root.render(<UkeirePanel concealed={parsed.tiles} drawn={null} melds={[]} doraIndicators={[]} />));
    const row = (name: string) => [...host.querySelectorAll('.ukeire-list > li')].find((el) => el.querySelector('.ukeire-discard')!.textContent!.includes(`${name}を切る`))!;
    const initialShanten = [...host.querySelectorAll('.ukeire-row__heading strong')].map(el=>el.textContent);
    await editRemaining('三索','0'); await editRemaining('六索','1');
    expect(row('赤五索').textContent).toContain('1種・1枚');
    expect(row('五索').textContent).toContain('1種・1枚');
    expect(host.querySelector('input[aria-label="赤五索の残枚数"]')).toBeNull();
    expect([...host.querySelectorAll('.ukeire-row__heading strong')].map(el=>el.textContent)).toEqual(initialShanten);
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
    expect(host.querySelector<HTMLInputElement>('input[aria-label="一索の残枚数"]')!.value).toBe('3');
    expect(host.querySelector('.ukeire-adjust-status')!.textContent).toContain('すべて自動');
    await editRemaining('一索','0');
    await act(async () => root.render(<UkeirePanel {...props} drawn="1z" sessionKey="one" />));
    expect(host.querySelector('.ukeire-adjust-status')!.textContent).toContain('すべて自動');
    await editRemaining('一索','0');
    await act(async () => root.render(<UkeirePanel {...props} drawn="1z" sessionKey="two" />));
    expect(host.querySelector('.ukeire-adjust-status')!.textContent).toContain('すべて自動');
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
});
