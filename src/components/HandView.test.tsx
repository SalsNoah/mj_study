import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HandView } from './HandView';
import { tileLabel } from '@/domain/tiles';
import type { Meld, TileCode } from '@/domain/types';

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

const fullHand: TileCode[] = ['9m', '1m', '2m', '3m', '5m', '0m', '2p', '3p', '4p', '4s', '5s', '6s', '7z', '7z'];
const pon: Meld = {
  id: 'pon', type: 'pon', tiles: ['5p', '0p', '5p'],
  from: 'opposite', calledIndex: 1, addedIndex: null,
};

describe.each([true, false])('unified hand (tight=%s)', (tight) => {
  const row = () => host.querySelector(tight ? '.hand-strip' : '.hand-view__main > .tile-row')!;

  it.each([
    { name: 'legacy 13+1', concealed: fullHand.slice(0, 13), drawn: fullHand[13]! },
    { name: 'all 14 in concealed', concealed: fullHand, drawn: null },
    { name: 'legacy single tile', concealed: [], drawn: '0s' as TileCode },
    { name: 'empty hand', concealed: [], drawn: null },
  ])('renders $name in one row without changing its order or data', async ({ concealed, drawn }) => {
    const before = [...concealed];
    await act(async () => root.render(<HandView concealed={concealed} drawn={drawn} melds={[]} tight={tight} />));
    const expected = [...concealed, ...(drawn ? [drawn] : [])];
    expect([...row().children].map((tile) => tile.getAttribute('aria-label'))).toEqual(expected.map(tileLabel));
    expect(row().querySelectorAll(':scope > .tile-face')).toHaveLength(expected.length);
    expect(host.querySelector('.hand-view__drawn')).toBeNull();
    expect(host.innerHTML).not.toContain('ツモ');
    expect(concealed).toEqual(before);
  });

  it('preserves original click indices, repeated codes, red selection and marks', async () => {
    const onSelectConcealed = vi.fn();
    const onSelectDrawn = vi.fn();
    const onSelectCode = vi.fn();
    await act(async () => root.render(
      <HandView
        concealed={['5m', '0m', '5m']} drawn="0m" melds={[]} tight={tight}
        onSelectConcealed={onSelectConcealed} onSelectDrawn={onSelectDrawn} onSelectCode={onSelectCode}
        selectedCodes={new Set(['0m'])} marks={new Map([['0m', 'correct'], ['5m', 'wrong']])}
      />,
    ));
    const buttons = [...row().querySelectorAll<HTMLButtonElement>(':scope > button')];
    expect(buttons).toHaveLength(4);
    expect(buttons.map((button) => button.getAttribute('aria-pressed'))).toEqual(['false', 'true', 'false', 'true']);
    expect(buttons.map((button) => button.classList.contains('is-correct'))).toEqual([false, true, false, true]);
    expect(buttons.map((button) => button.classList.contains('is-wrong'))).toEqual([true, false, true, false]);
    await act(async () => { buttons[2]!.click(); buttons[3]!.click(); buttons[0]!.click(); buttons[1]!.click(); });
    expect(onSelectConcealed.mock.calls).toEqual([[2], [0], [1]]);
    expect(onSelectDrawn).toHaveBeenCalledTimes(1);
    expect(onSelectCode.mock.calls).toEqual([['5m'], ['0m'], ['5m'], ['0m']]);
  });

  it('makes every hand tile available to quiz selection and keeps melds separate', async () => {
    const onSelectCode = vi.fn();
    const onRemoveMeld = vi.fn();
    await act(async () => root.render(
      <HandView concealed={['1m']} drawn="0m" melds={[pon]} tight={tight}
        selectablePool="concealedDrawn" onSelectCode={onSelectCode} onRemoveMeld={onRemoveMeld} />,
    ));
    const buttons = [...row().querySelectorAll<HTMLButtonElement>('button')];
    expect(buttons).toHaveLength(2);
    expect(host.querySelector('.meld-view')?.getAttribute('aria-label')).toBe('ポン');
    expect(host.querySelectorAll('.meld-view .tile-face')).toHaveLength(3);
    expect(host.querySelectorAll('.meld-view .is-rotated')).toHaveLength(1);
    await act(async () => { buttons[0]!.click(); buttons[1]!.click(); });
    expect(onSelectCode.mock.calls).toEqual([['1m'], ['0m']]);
    await act(async () => host.querySelector<HTMLButtonElement>('.meld-btn')!.click());
    expect(onRemoveMeld).toHaveBeenCalledWith('pon');
    expect(onSelectCode).toHaveBeenCalledTimes(2);
  });

  it('does not make unrelated tiles interactive when only one legacy callback is supplied', async () => {
    const onSelectDrawn = vi.fn();
    await act(async () => root.render(
      <HandView concealed={['1m']} drawn="0m" melds={[]} tight={tight} onSelectDrawn={onSelectDrawn} />,
    ));
    expect(row().querySelectorAll(':scope > .tile-face')).toHaveLength(1);
    expect(row().querySelectorAll(':scope > button')).toHaveLength(1);
    await act(async () => row().querySelector<HTMLButtonElement>('button')!.click());
    expect(onSelectDrawn).toHaveBeenCalledTimes(1);
  });
});
