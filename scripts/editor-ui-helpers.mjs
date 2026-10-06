import { expect } from '@playwright/test';

/** Open the editor notes through the real control without assuming their initial state. */
export async function openEditorNotes(page) {
  const notes = page.locator('.editor-notes');
  if (!(await notes.evaluate(element => element.open))) {
    await page.locator('.editor-notes > summary').click();
  }
  await expect(notes).toHaveJSProperty('open', true);
}

/** Explicitly abandon synthetic drafts when a layout fixture moves to its next screen.
 * Behavioral Save/Discard/Stay coverage lives in validate-unsaved-ui.mjs.
 */
export async function discardFixtureDraft(page) {
  const prompt = page.getByRole('dialog', { name: '変更を保存しますか？', exact: true });
  if (await prompt.isVisible()) {
    await prompt.getByRole('button', { name: '保存せずに移動', exact: true }).click();
    await expect(prompt).toHaveCount(0);
  }
}
