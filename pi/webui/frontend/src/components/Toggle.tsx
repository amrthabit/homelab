import { type Component, type JSX } from "solid-js";

export const ToggleCard: Component<{
  label: string;
  desc: string;
  on: boolean;
  onClick: () => void;
}> = (props) => (
  <button
    onClick={props.onClick}
    class={`text-left p-4 rounded-lg border bg-[var(--color-card)] hover:border-[var(--color-accent)] transition cursor-pointer w-full grid grid-cols-[1fr_auto] gap-1 ${
      props.on ? "border-[var(--color-up)]" : "border-[var(--color-border)]"
    }`}
  >
    <span class="font-semibold col-start-1">{props.label}</span>
    <span class={`font-mono font-semibold col-start-2 row-start-1 ${props.on ? "text-[var(--color-up)]" : "text-[var(--color-down)]"}`}>
      {props.on ? "ON" : "OFF"}
    </span>
    <span class="text-xs text-[var(--color-muted)] col-span-2 row-start-2">{props.desc}</span>
  </button>
);

export const MiniToggle: Component<{
  on: boolean;
  forced?: boolean;
  onClick: () => void;
  title?: string;
}> = (props) => (
  <button
    onClick={(e) => {
      e.stopPropagation();
      props.onClick();
    }}
    title={props.title}
    class={`font-mono text-xs font-semibold py-1 w-14 rounded border cursor-pointer hover:brightness-125 ${
      props.on
        ? "border-[var(--color-up)] text-[var(--color-up)]"
        : "border-[var(--color-down)] text-[var(--color-down)]"
    } ${props.forced ? "border-dashed opacity-70" : ""}`}
  >
    {props.on ? "ON" : "OFF"}
  </button>
);
