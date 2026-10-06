import { afterEach, beforeEach, expect, it } from 'vitest';
import { attachmentRole, attachmentsForRole } from './attachments';
import { createLegacySampleProblems } from '@/data/legacySamples';
import { LocalStorageRepository } from '@/storage/repository';
import { emptyStore, type Attachment } from './types';
import { isContentRevisionChange } from './validate';

const images: Attachment[] = [
  { id: 'question', role: 'question', dataUrl: 'data:image/png;base64,AQ==', width: 1, height: 1 },
  { id: 'explanation', role: 'explanation', dataUrl: 'data:image/png;base64,Ag==', width: 1, height: 1 },
  { id: 'legacy', dataUrl: 'data:image/png;base64,Aw==', width: 1, height: 1 },
];
const repositories: LocalStorageRepository[] = [];
function repository(key: string) { const repo = new LocalStorageRepository(key); repositories.push(repo); return repo; }
beforeEach(() => localStorage.clear());
afterEach(() => { repositories.forEach((repo) => repo.dispose()); repositories.length = 0; });
function fixture() {
  const store = emptyStore();
  store.problems = [createLegacySampleProblems().problems[0]!];
  store.problems[0]!.attachments = structuredClone(images);
  return store;
}

it.each([undefined, null, '', 'Question', 'answer', false, 1, {}])('treats absent or unrecognized attachment role %s as explanation', (role) => {
  const image = { ...images[0]!, role } as unknown as Attachment;
  expect(attachmentRole(image)).toBe('explanation');
  expect(attachmentsForRole([image], 'question')).toEqual([]);
  expect(attachmentsForRole([image], 'explanation')).toEqual([image]);
});

it.each(['replace', 'merge'] as const)('keeps roles, legacy defaults, and image data across JSON %s and reload', (mode) => {
  const original = fixture();
  const repo = repository(mode);
  const restored = repo.importJson(emptyStore(), repo.exportJson(original), mode);
  expect(restored.ok).toBe(true);
  if (!restored.ok) return;
  const imageContent = (items: Attachment[]) => items.map(({ id: _id, ...rest }) => rest);
  expect(imageContent(restored.store.problems[0]!.attachments)).toEqual(imageContent(images));
  const loaded = repo.load();
  expect(loaded.ok).toBe(true);
  if (!loaded.ok) return;
  expect(imageContent(loaded.store.problems[0]!.attachments)).toEqual(imageContent(images));
  expect(attachmentsForRole(loaded.store.problems[0]!.attachments, 'question')).toHaveLength(1);
  expect(attachmentsForRole(loaded.store.problems[0]!.attachments, 'explanation')).toHaveLength(2);
});

it('duplicates all image roles with new IDs, without modifying the source or image data', () => {
  const original = fixture();
  const duplicated = repository('duplicate').duplicateProblem(original, original.problems[0]!.id);
  expect(duplicated.ok).toBe(true);
  if (!duplicated.ok) return;
  const copy = duplicated.store.problems.find((problem) => problem.id !== original.problems[0]!.id)!;
  expect(copy.attachments.map((image) => image.id)).not.toEqual(images.map((image) => image.id));
  expect(copy.attachments.map((image) => [image.role, image.dataUrl, image.width, image.height])).toEqual(images.map((image) => [image.role, image.dataUrl, image.width, image.height]));
  expect(original.problems[0]!.attachments).toEqual(images);
});

it('changes the content revision when an image moves into or out of the question, but not when a legacy role is made explicit', () => {
  const before = fixture().problems[0]!;
  const after = structuredClone(before);
  after.attachments[2]!.role = 'explanation';
  expect(isContentRevisionChange(before, after)).toBe(false);
  after.attachments[2]!.role = 'question';
  expect(isContentRevisionChange(before, after)).toBe(true);
  expect(isContentRevisionChange(after, before)).toBe(true);
});
