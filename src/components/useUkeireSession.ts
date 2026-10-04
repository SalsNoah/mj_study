import { useId, useMemo, useState } from 'react';
import { analyzeHand, type AnalysisHand } from '@/domain/ukeire';
import { adjustUkeire, remainingLimits, remainingSessionKey, type RemainingOverrides } from '@/domain/remaining';

export function useUkeireSession(input: AnalysisHand, problemId?: string) {
  const { concealed, drawn, melds, doraIndicators } = input;
  const key = remainingSessionKey(input, problemId);
  const panelId = useId();
  const [saved, setSaved] = useState({ key, overrides: {} as RemainingOverrides, open: false });
  // Adjust during render so a changed position can never use the previous supply.
  // The editor itself stays mounted, preserving focus while entering tiles.
  const session = saved.key === key ? saved : { key, overrides: {}, open: false };
  if (saved.key !== key) setSaved(session);
  const raw = useMemo(() => analyzeHand({ concealed, drawn, melds, doraIndicators }), [concealed, drawn, melds, doraIndicators]);
  const limits = useMemo(() => raw.status === 'ready' ? remainingLimits({ concealed, drawn, melds, doraIndicators }) : [], [raw, concealed, drawn, melds, doraIndicators]);
  const analysis = raw.status === 'ready' ? {
    ...raw,
    current: raw.current ? adjustUkeire(raw.current, session.overrides, limits) : null,
    discards: raw.discards.map((row) => adjustUkeire(row, session.overrides, limits)),
  } : raw;
  return {
    key, panelId, analysis, limits, overrides: session.overrides, open: session.open,
    setOverrides: (overrides: RemainingOverrides) => setSaved((previous) => ({ ...previous, key, overrides })),
    toggle: () => setSaved((previous) => ({ ...previous, key, open: !previous.open })),
  };
}

export type UkeireSession = ReturnType<typeof useUkeireSession>;
