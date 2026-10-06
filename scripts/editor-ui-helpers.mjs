import { expect } from '@playwright/test';

/** Open the editor notes through the real control without assuming their initial state. */
export async function openEditorNotes(page) {
  const notes = page.locator('.editor-notes');
  if (!(await notes.evaluate(element => element.open))) {
    await page.locator('.editor-notes > summary').click();
  }
  await expect(notes).toHaveJSProperty('open', true);
}
