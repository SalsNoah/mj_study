import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SampleCatalogSettings, type SampleUpdatePreview } from './SampleCatalogSettings';

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
const preview: SampleUpdatePreview = { candidates: [{ id: 'old-1', title: '旧サンプル候補' }], additions: 10, preservedEdited: 1 };
const backups = [{ id: 'backup-1', createdAt: '2026-10-05T00:00:00Z', restoredAt: null, removedCount: 1, addedCount: 10 }];
const button = (text: string) => [...host.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === text)!;
async function mount(options: { backupError?: string; additions?: number; restored?: boolean } = {}) {
  const onApply = vi.fn(() => ({ ok: true as const }));
  const onRestore = vi.fn(() => ({ ok: true as const }));
  const onExportBackup = vi.fn(() => ({ ok: true as const, text: '{"original":true}' }));
  await act(async () => root.render(<SampleCatalogSettings preview={{ ...preview, additions: options.additions ?? 10 }}
    backups={backups.map((b) => ({ ...b, restoredAt: options.restored ? b.createdAt : null }))}
    backupError={options.backupError ?? null} onApply={onApply} onRestore={onRestore} onExportBackup={onExportBackup} />));
  return { onApply, onRestore, onExportBackup };
}
it('starts with every legacy candidate unselected and labels the add-only action', async () => {
  const { onApply } = await mount();
  expect(host.querySelector<HTMLInputElement>('input')!.checked).toBe(false);
  expect(host.textContent).toContain('編集したサンプル 1 題はそのまま残します');
  await act(async () => button('旧問題を残して10題を追加').click());
  expect(onApply).toHaveBeenCalledWith([]);
});
it('passes only explicitly selected IDs and clears successful selections', async () => {
  const { onApply } = await mount();
  await act(async () => host.querySelector<HTMLInputElement>('input')!.click());
  await act(async () => button('旧1題を削除して10題を追加').click());
  expect(onApply).toHaveBeenCalledWith(['old-1']);
  expect(host.querySelector<HTMLInputElement>('input')!.checked).toBe(false);
});
it('blocks mutation when backup recovery information cannot be read', async () => {
  const { onApply } = await mount({ backupError: '更新前バックアップを読み取れません' });
  expect(button('旧問題を残して10題を追加').disabled).toBe(true);
  expect(host.querySelector('[role="alert"]')!.textContent).toBe('更新前バックアップを読み取れません');
  await act(async () => button('旧問題を残して10題を追加').click());
  expect(onApply).not.toHaveBeenCalled();
});
it('offers restoration of the selected snapshot and prevents repeated restoration', async () => {
  const { onRestore } = await mount();
  await act(async () => button('更新前の問題を復元').click());
  expect(onRestore).toHaveBeenCalledWith('backup-1');
  expect(host.textContent).toContain('更新後に編集・学習した問題は残しています');
  await mount({ restored: true });
  expect(button('復元済み').disabled).toBe(true);
});
it('does not offer a redundant update when the catalog is complete and nothing is selected', async () => {
  const { onApply } = await mount({ additions: 0 });
  expect(button('この10題は追加済み').disabled).toBe(true);
  await act(async () => button('この10題は追加済み').click());
  expect(onApply).not.toHaveBeenCalled();
});
it('labels a later legacy-only cleanup as deletion without promising new additions', async () => {
  const { onApply } = await mount({ additions: 0 });
  await act(async () => host.querySelector<HTMLInputElement>('input')!.click());
  await act(async () => button('選択した旧1題を削除').click());
  expect(onApply).toHaveBeenCalledWith(['old-1']);
  expect(host.textContent).toContain('未編集・未学習の問題を取り除き、旧問題を戻します');
});
