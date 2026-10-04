import type { KeyboardEvent } from 'react';

type Tab<T extends string> = { value: T; label: string };

/** A small, keyboard-accessible switcher. Panels stay mounted to preserve drafts. */
export function ViewTabs<T extends string>({ id, label, value, onChange, tabs }: {
  id: string; label: string; value: T; onChange: (value: T) => void; tabs: readonly Tab<T>[];
}) {
  const move = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length
      : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length
        : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : null;
    if (next === null) return;
    event.preventDefault();
    onChange(tabs[next]!.value);
    const buttons = event.currentTarget.parentElement!.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    buttons[next]?.focus();
  };
  return <div className="view-tabs" role="tablist" aria-label={label}>
    {tabs.map((tab, index) => <button key={tab.value} id={`${id}-tab-${tab.value}`} type="button" role="tab"
      aria-controls={`${id}-panel-${tab.value}`} aria-selected={value === tab.value} tabIndex={value === tab.value ? 0 : -1}
      onClick={() => onChange(tab.value)} onKeyDown={(event) => move(event, index)}>{tab.label}</button>)}
  </div>;
}

export function viewPanelProps(id: string, value: string, selected: string) {
  return { id: `${id}-panel-${value}`, role: 'tabpanel' as const, 'aria-labelledby': `${id}-tab-${value}`, hidden: value !== selected };
}
