"use client";
import { useRef } from "react";

type Tab = { id: string; label: string };

/** One visible panel, with keyboard navigation and a single tab stop. */
export default function SectionTabs({
  id,
  label,
  tabs,
  value,
  onChange,
}: {
  id: string;
  label: string;
  tabs: Tab[];
  value: string;
  onChange: (value: string) => void;
}) {
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  return (
    <div className="section-tabs" role="tablist" aria-label={label}>
      {tabs.map((tab, index) => (
        <button
          key={tab.id}
          ref={(button) => {
            buttons.current[index] = button;
          }}
          id={`${id}-${tab.id}-tab`}
          role="tab"
          aria-selected={value === tab.id}
          aria-controls={`${id}-${tab.id}-panel`}
          tabIndex={value === tab.id ? 0 : -1}
          onClick={() => onChange(tab.id)}
          onKeyDown={(event) => {
            let next = index;
            if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
            else if (event.key === "ArrowLeft")
              next = (index + tabs.length - 1) % tabs.length;
            else if (event.key === "Home") next = 0;
            else if (event.key === "End") next = tabs.length - 1;
            else return;
            event.preventDefault();
            onChange(tabs[next].id);
            buttons.current[next]?.focus();
          }}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
