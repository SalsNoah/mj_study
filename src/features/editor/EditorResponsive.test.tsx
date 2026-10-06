import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AppProvider } from '@/app/store';
import { EditorPage } from '@/features/editor/EditorPage';
let host: HTMLDivElement; let root: Root; let wide = false;
const listeners = new Set<() => void>();
beforeEach(async () => {
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); localStorage.clear(); sessionStorage.clear(); wide = false; listeners.clear();
 vi.stubGlobal('matchMedia', () => ({ get matches() { return wide; }, addEventListener: (_: string, fn: () => void) => listeners.add(fn), removeEventListener: (_: string, fn: () => void) => listeners.delete(fn) }));
 host = document.createElement('div'); document.body.append(host); root = createRoot(host);
 await act(async () => root.render(<AppProvider><MemoryRouter><EditorPage /></MemoryRouter></AppProvider>));
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
async function resize(value: boolean) { await act(async () => { wide = value; listeners.forEach(listener => listener()); }); }
it('retains focus in the main score input when crossing narrow to wide', async () => {
 const field=host.querySelector<HTMLInputElement>('.ctx-score input')!;
 field.focus(); field.setSelectionRange(1, 2);
 expect(document.activeElement).toBe(field);
 await resize(true);
 expect(host.querySelector('.ctx-score input')).toBe(field);
 expect(document.activeElement).toBe(field);
 expect(field.selectionStart).toBe(1);
});
it('retains focus in the explanation when crossing wide to narrow', async () => {
 await resize(true);
 expect(host.querySelector<HTMLDetailsElement>('.editor-notes')!.open).toBe(true);
 const field=host.querySelector<HTMLTextAreaElement>('.editor-notes textarea')!;
 field.focus(); expect(document.activeElement).toBe(field);
 await resize(false);
 expect(host.querySelector('.editor-notes textarea')).toBe(field);
 expect(document.activeElement).toBe(field);
});
