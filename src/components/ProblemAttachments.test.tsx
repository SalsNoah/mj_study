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

it('edits the image role without changing image bytes and limits both roles to three total', async () => {
  const changed = vi.fn();
  function Editor() {
    const [attachments, setAttachments] = useState([legacy, question, explanation]);
    return <AttachmentEditor attachments={attachments} onChange={(next) => { changed(next); setAttachments(next); }} onImage={vi.fn()} sessionKey="editor" />;
  }
  await render(<Editor />);
  const selects = host.querySelectorAll('select');
  expect(selects[0]!.value).toBe('explanation');
  expect(selects[1]!.value).toBe('explanation');
  expect([...selects[1]!.options].map((option) => option.text)).toEqual(['問題に表示（回答前も表示）', '解説に表示']);
  const input = host.querySelector<HTMLInputElement>('input[type="file"]')!;
  expect(input.disabled).toBe(true);
  await act(async () => {
    selects[1]!.value = 'question';
    selects[1]!.dispatchEvent(new Event('change', { bubbles: true }));
  });
  expect(changed.mock.lastCall![0][0]).toEqual({ ...legacy, role: 'question' });
  await click(button('画像 3 を削除'));
  expect(input.disabled).toBe(false);
  expect(host.querySelectorAll('.attachment-editor__item')).toHaveLength(2);
});

it('passes the selected display role with an uploaded image and resets it for a different problem', async () => {
  const onImage = vi.fn();
  const page = (sessionKey: string) => <AttachmentEditor attachments={[]} onChange={vi.fn()} onImage={onImage} sessionKey={sessionKey} />;
  await render(page('a'));
  const select = host.querySelector('select')!;
  await act(async () => {
    select.value = 'question';
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  const input = host.querySelector<HTMLInputElement>('input[type="file"]')!;
  const file = new File(['image'], 'conditions.png', { type: 'image/png' });
  Object.defineProperty(input, 'files', { value: [file] });
  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
  expect(onImage).toHaveBeenCalledWith(file, 'question');
  await render(page('b'));
  expect(host.querySelector('select')!.value).toBe('explanation');
});
