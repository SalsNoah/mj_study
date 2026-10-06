import { StrictMode, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useDecorativeMotion } from './useDecorativeMotion';

let host: HTMLDivElement;
let root: Root;
let visibility: DocumentVisibilityState;
function Probe() { useDecorativeMotion(); return <button>操作</button>; }
beforeEach(() => {
  visibility = 'visible';
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const paused = () => document.documentElement.hasAttribute('data-motion-paused');
async function change(next: DocumentVisibilityState) {
  await act(async () => { visibility = next; document.dispatchEvent(new Event('visibilitychange')); });
}
it('pauses on hidden and resumes on visible without replacing a focused control', async () => {
  await act(async () => root.render(<Probe />));
  const button = host.querySelector('button')!; button.focus();
  expect(paused()).toBe(false);
  await change('hidden'); expect(paused()).toBe(true); expect(document.activeElement).toBe(button);
  await change('visible'); expect(paused()).toBe(false); expect(document.activeElement).toBe(button);
});
it('starts paused in a hidden document and keeps listening through StrictMode remounts', async () => {
  visibility = 'hidden';
  await act(async () => root.render(<StrictMode><Probe /></StrictMode>));
  expect(paused()).toBe(true);
  await change('visible'); expect(paused()).toBe(false);
  await change('hidden'); expect(paused()).toBe(true);
});
it('removes the listener and root marker after unmount', async () => {
  await act(async () => root.render(<Probe />));
  await change('hidden'); expect(paused()).toBe(true);
  await act(async () => root.render(null)); expect(paused()).toBe(false);
  await change('visible'); await change('hidden'); expect(paused()).toBe(false);
});
