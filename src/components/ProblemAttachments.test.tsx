import { act, useState, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Attachment } from '@/domain/types';
import { AttachmentEditor } from './AttachmentEditor';
import { ExplanationAttachments, QuestionAttachments } from './ProblemAttachments';

let host: HTMLDivElement;
let root: Root;
const question: Attachment = { id: 'question', role: 'question', dataUrl: 'data:image/png;base64,AQ==', width: 1, height: 1 };
const explanation: Attachment = { id: 'explanation', role: 'explanation', dataUrl: 'data:image/png;base64,Ag==', width: 1, height: 1 };
const legacy: Attachment = { id: 'legacy', dataUrl: 'data:image/png;base64,Aw==', width: 1, height: 1 };
const invalid = { ...legacy, id: 'invalid', role: 'unexpected', dataUrl: 'data:image/png;base64,BA==' } as unknown as Attachment;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function render(element: ReactElement) { await act(async () => root.render(element)); }
async function click(element: Element) { await act(async () => (element as HTMLElement).click()); }
function button(label: string, scope: ParentNode = document) {
  const found = [...scope.querySelectorAll<HTMLButtonElement>('button')].find((element) => element.textContent === label || element.getAttribute('aria-label') === label);
  if (!found) throw new Error(`Missing button: ${label}`);
  return found;
}
async function key(key: string, shiftKey = false) {
  await act(async () => document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true })));
}
function imageInput(role: 'question' | 'explanation') {
  return host.querySelector<HTMLInputElement>(`.attachment-editor__section[aria-label="${role === 'question' ? '問題画像' : '解説画像'}"] input[type="file"]`)!;
}
function chooseFile(input: HTMLInputElement, file: File | null) {
  Object.defineProperty(input, 'files', { configurable: true, value: file ? [file] : [] });
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

it('mounts only explicitly designated question images before revealing the explanation', async () => {
  const attachments = [question, explanation, legacy, invalid];
  const page = (visible: boolean) => <>
    <QuestionAttachments attachments={attachments} sessionKey="a" />
    <ExplanationAttachments attachments={attachments} sessionKey="a" visible={visible} />
  </>;
  await render(page(false));
  expect([...host.querySelectorAll('img')].map((image) => image.src)).toEqual([question.dataUrl]);
  expect(host.innerHTML).not.toContain(explanation.dataUrl);
  expect(host.innerHTML).not.toContain(legacy.dataUrl);
  expect(host.innerHTML).not.toContain(invalid.dataUrl);
  await render(page(true));
  expect(host.querySelectorAll('img')).toHaveLength(4);
  await click(button('解説画像 1 を拡大'));
  expect(document.querySelector('[role="dialog"] img')?.getAttribute('src')).toBe(explanation.dataUrl);
  await render(page(false));
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect([...host.querySelectorAll('img')].map((image) => image.src)).toEqual([question.dataUrl]);
});

it('traps keyboard focus, allows original-size scrolling, and restores focus for each dismissal', async () => {
  await render(<><button>前の操作</button><QuestionAttachments attachments={[question]} sessionKey="a" /><button>次の操作</button></>);
  const opener = button('問題画像 1 を拡大');
  opener.focus();
  const originalOverflow = document.body.style.overflow;
  await click(opener);
  let dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
  const close = button('閉じる', dialog);
  expect(document.activeElement).toBe(close);
  expect(dialog.getAttribute('aria-modal')).toBe('true');
  expect(document.body.style.overflow).toBe('hidden');
  await key('Tab', true);
  expect(document.activeElement).toBe(dialog.querySelector('[tabindex="0"]'));
  await key('Tab');
  expect(document.activeElement).toBe(close);
  button('次の操作').focus();
  expect(document.activeElement).toBe(close);
  await click(button('原寸で表示', dialog));
  expect(dialog.querySelector('.is-full-size')).not.toBeNull();
  await click(button('画面に合わせる', dialog));
  expect(dialog.querySelector('.is-full-size')).toBeNull();
  await click(dialog.querySelector('img')!);
  expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  await key('Escape');
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(document.activeElement).toBe(opener);
  expect(document.body.style.overflow).toBe(originalOverflow);
  await click(opener);
  await click(document.querySelector('.attachment-viewer-backdrop')!);
  expect(document.activeElement).toBe(opener);
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  await click(opener);
  dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
  await click(button('閉じる', dialog));
  expect(document.activeElement).toBe(opener);
  expect(document.querySelector('[role="dialog"]')).toBeNull();
});

it('closes the image when moving to another problem or returning to an earlier one', async () => {
  const page = (sessionKey: string) => <QuestionAttachments attachments={[question]} sessionKey={sessionKey} />;
  await render(page('a'));
  await click(button('問題画像 1 を拡大'));
  await render(page('b'));
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  await render(page('a'));
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(document.body.style.overflow).not.toBe('hidden');
});

it('groups legacy and unknown roles as explanation images until explicitly moved', async () => {
  await render(<AttachmentEditor attachments={[question, legacy, invalid]} onChange={vi.fn()} onImage={vi.fn()} sessionKey="editor" />);
  const sectionImages = (label: string) => [...host.querySelectorAll<HTMLImageElement>(`.attachment-editor__section[aria-label="${label}"] img`)].map(image => image.src);
  expect(sectionImages('問題画像')).toEqual([question.dataUrl]);
  expect(sectionImages('解説画像')).toEqual([legacy.dataUrl, invalid.dataUrl]);
  expect(host.querySelector('select')).toBeNull();
  expect(host.textContent).not.toContain('追加する画像の表示先');
  expect(host.textContent).toContain('回答前にも表示');
  expect(imageInput('question').labels![0].textContent).toBe('問題画像を追加');
  expect(imageInput('explanation').labels![0].textContent).toBe('解説画像を追加');
});

it('moves and previews images without changing bytes, preserves focus, and limits both sections to three total', async () => {
  const changed = vi.fn();
  const onImage = vi.fn();
  function Editor() {
    const [attachments, setAttachments] = useState([legacy, question, explanation]);
    return <AttachmentEditor attachments={attachments} onChange={(next) => { changed(next); setAttachments(next); }} onImage={onImage} sessionKey="editor" />;
  }
  await render(<Editor />);
  expect(imageInput('question').disabled).toBe(true);
  expect(imageInput('explanation').disabled).toBe(true);
  expect(host.textContent).toContain('画像は合計3枚までです。');
  const file = new File(['image'], 'fourth.png', { type: 'image/png' });
  await act(async () => {
    chooseFile(imageInput('question'), file);
    chooseFile(imageInput('explanation'), file);
  });
  expect(onImage).not.toHaveBeenCalled();
  await click(button('画像 1 を問題用へ移す'));
  expect(changed.mock.lastCall![0][0]).toEqual({ ...legacy, role: 'question' });
  expect(document.activeElement).toBe(button('画像 1 を解説用へ移す'));
  expect(button('画像 1 を拡大').closest('.attachment-editor__section')?.getAttribute('aria-label')).toBe('問題画像');
  await click(button('画像 1 を拡大'));
  expect(document.querySelector('[role="dialog"] img')?.getAttribute('src')).toBe(legacy.dataUrl);
  await click(button('閉じる'));
  await click(button('画像 1 を解説用へ移す'));
  expect(changed.mock.lastCall![0][0]).toEqual({ ...legacy, role: 'explanation' });
  expect(document.activeElement).toBe(button('画像 1 を問題用へ移す'));
  await click(button('画像 3 を削除'));
  expect(imageInput('question').disabled).toBe(false);
  expect(imageInput('explanation').disabled).toBe(false);
  expect(host.querySelectorAll('.attachment-editor__item')).toHaveLength(2);
});

it('takes the upload role directly from each section and ignores cancelling the file picker', async () => {
  const onImage = vi.fn();
  await render(<AttachmentEditor attachments={[]} onChange={vi.fn()} onImage={onImage} sessionKey="a" />);
  const file = new File(['image'], 'conditions.png', { type: 'image/png' });
  await act(async () => chooseFile(imageInput('question'), null));
  expect(onImage).not.toHaveBeenCalled();
  for (const role of ['question', 'explanation'] as const) {
    await act(async () => chooseFile(imageInput(role), file));
    expect(onImage.mock.lastCall).toEqual([file, role]);
    expect(imageInput(role).value).toBe('');
  }
  expect(onImage).toHaveBeenCalledTimes(2);
});

it('locks both upload sections immediately and allows retry after a rejected upload', async () => {
  let rejectUpload!: (error: Error) => void;
  const onImage = vi.fn().mockImplementationOnce(() => new Promise<void>((_resolve, reject) => { rejectUpload = reject; }));
  await render(<AttachmentEditor attachments={[]} onChange={vi.fn()} onImage={onImage} sessionKey="a" />);
  const file = new File(['image'], 'conditions.png', { type: 'image/png' });
  await act(async () => {
    chooseFile(imageInput('question'), file);
    chooseFile(imageInput('explanation'), file);
  });
  expect(onImage).toHaveBeenCalledTimes(1);
  expect(onImage).toHaveBeenCalledWith(file, 'question');
  expect(imageInput('question').disabled).toBe(true);
  expect(imageInput('explanation').disabled).toBe(true);
  expect(host.textContent).toContain('画像を準備中…');
  await act(async () => rejectUpload(new Error('Read failed')));
  expect(imageInput('question').disabled).toBe(false);
  expect(imageInput('explanation').disabled).toBe(false);
  expect(host.textContent).toContain('画像を追加できませんでした。もう一度お試しください。');
  await act(async () => chooseFile(imageInput('explanation'), file));
  expect(onImage).toHaveBeenLastCalledWith(file, 'explanation');
  expect(onImage).toHaveBeenCalledTimes(2);
  expect(host.textContent).not.toContain('画像を追加できませんでした');
});

it('keeps validation feedback visible and resets local upload state for another problem', async () => {
  let finishUpload!: () => void;
  const onImage = vi.fn().mockImplementationOnce(() => new Promise<void>((resolve) => { finishUpload = resolve; }));
  const page = (sessionKey: string) => <AttachmentEditor attachments={[]} onChange={vi.fn()} onImage={onImage} imageMessage="画像を読み込めませんでした" sessionKey={sessionKey} />;
  await render(page('a'));
  const file = new File(['image'], 'conditions.png', { type: 'image/png' });
  await act(async () => chooseFile(imageInput('explanation'), file));
  expect(imageInput('question').disabled).toBe(true);
  await render(page('b'));
  expect(imageInput('question').disabled).toBe(false);
  expect(imageInput('explanation').disabled).toBe(false);
  expect(host.textContent).toContain('画像を読み込めませんでした');
  await act(async () => finishUpload());
  expect(host.textContent).not.toContain('画像を準備中…');
});
