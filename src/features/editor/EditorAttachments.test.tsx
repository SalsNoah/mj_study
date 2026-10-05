import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AppProvider } from '@/app/store';
import { createLegacySampleProblems } from '@/data/legacySamples';
import { emptyStore, STORAGE_KEY, type Attachment } from '@/domain/types';
import { compressImageFile } from '@/export/renderTiles';
import { EditorPage } from './EditorPage';

vi.mock('@/export/renderTiles', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/export/renderTiles')>(),
  compressImageFile: vi.fn(),
}));

let host: HTMLDivElement;
let root: Root;
const legacy: Attachment = { id: 'legacy', dataUrl: 'data:image/png;base64,AQ==', width: 1, height: 1 };
const question: Attachment = { id: 'question', role: 'question', dataUrl: 'data:image/png;base64,Ag==', width: 1, height: 1 };
const uploaded = { ok: true as const, dataUrl: 'data:image/png;base64,Aw==', width: 1, height: 1 };

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.mocked(compressImageFile).mockReset();
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

async function mount(attachments: Attachment[]) {
  const store = emptyStore();
  store.problems = [{ ...createLegacySampleProblems().problems[0]!, id: 'edit-images', attachments }];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  await act(async () => root.render(
    <AppProvider><MemoryRouter initialEntries={['/edit/edit-images']}><Routes>
      <Route path="/edit/:id" element={<EditorPage />} />
      <Route path="/problems/:id" element={<div>saved</div>} />
    </Routes></MemoryRouter></AppProvider>,
  ));
}
const imageInput = (label: string) => host.querySelector<HTMLInputElement>(`.attachment-editor__section[aria-label="${label}"] input`)!;
const save = () => host.querySelector<HTMLButtonElement>('.editor-save')!;
const savedAttachments = (): Attachment[] => JSON.parse(localStorage.getItem(STORAGE_KEY)!).problems[0].attachments;
function chooseFile(input: HTMLInputElement) {
  Object.defineProperty(input, 'files', { configurable: true, value: [new File(['image'], 'photo.png', { type: 'image/png' })] });
  input.dispatchEvent(new Event('change', { bubbles: true }));
}
async function click(label: string) {
  await act(async () => host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!.click());
}

it.each(['問題画像', '解説画像'])('blocks saving during a %s upload and preserves moves and deletions when compression finishes', async (label) => {
  let finishUpload!: (result: Awaited<ReturnType<typeof compressImageFile>>) => void;
  vi.mocked(compressImageFile).mockImplementation(() => new Promise((resolve) => { finishUpload = resolve; }));
  await mount([legacy, question]);
  await act(async () => {
    chooseFile(imageInput(label));
    save().click();
  });
  expect(save().disabled).toBe(true);
  expect(savedAttachments()).toEqual([legacy, question]);
  expect(imageInput('問題画像').disabled).toBe(true);
  expect(imageInput('解説画像').disabled).toBe(true);
  await click('画像 1 を問題用へ移す');
  await click('画像 2 を削除');
  await act(async () => finishUpload(uploaded));
  expect(save().disabled).toBe(false);
  expect(imageInput('問題画像').disabled).toBe(false);
  expect(imageInput('解説画像').disabled).toBe(false);
  await act(async () => save().click());
  expect(savedAttachments()).toEqual([
    { ...legacy, role: 'question' },
    expect.objectContaining({ role: label === '問題画像' ? 'question' : 'explanation', dataUrl: uploaded.dataUrl, width: 1, height: 1 }),
  ]);
  expect(host.textContent).toBe('saved');
});

it('releases both sections after a validation failure and saves a retried explanation image', async () => {
  vi.mocked(compressImageFile).mockResolvedValueOnce({ ok: false, reason: 'JPEG / PNG / WebP の画像を選んでください。' }).mockResolvedValueOnce(uploaded);
  await mount([question]);
  await act(async () => chooseFile(imageInput('解説画像')));
  expect(host.textContent).toContain('JPEG / PNG / WebP の画像を選んでください。');
  expect(imageInput('問題画像').disabled).toBe(false);
  expect(imageInput('解説画像').disabled).toBe(false);
  expect(save().disabled).toBe(false);
  expect(savedAttachments()).toEqual([question]);
  await act(async () => chooseFile(imageInput('解説画像')));
  expect(host.textContent).not.toContain('JPEG / PNG / WebP の画像を選んでください。');
  await act(async () => save().click());
  expect(savedAttachments()).toEqual([
    question,
    expect.objectContaining({ role: 'explanation', dataUrl: uploaded.dataUrl }),
  ]);
});
