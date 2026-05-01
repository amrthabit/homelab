import { createSignal, createEffect, Show, type Component, type JSX } from "solid-js";
import { ChevronRight } from "lucide-solid";

const STORAGE_PREFIX = "homelab.section.open.";

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function readPersisted(key: string, fallback: boolean): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    return raw === null ? fallback : raw === "1";
  } catch {
    return fallback;
  }
}

function writePersisted(key: string, value: boolean) {
  try {
    localStorage.setItem(STORAGE_PREFIX + key, value ? "1" : "0");
  } catch {}
}

export const Section: Component<{
  title: string;
  /** Override key for storage. Defaults to slug(title). */
  storageKey?: string;
  icon?: JSX.Element;
  defaultOpen?: boolean;
  collapsible?: boolean;
  right?: JSX.Element;
  children: JSX.Element;
}> = (props) => {
  const isCollapsible = props.collapsible ?? true;
  const key = () => props.storageKey ?? slug(props.title);
  const [open, setOpen] = createSignal(
    isCollapsible ? readPersisted(key(), props.defaultOpen ?? true) : true,
  );

  createEffect(() => {
    if (isCollapsible) writePersisted(key(), open());
  });

  return (
    <section class="mb-6">
      <header
        class={`flex items-center justify-between mb-2 ${isCollapsible ? "cursor-pointer select-none" : ""}`}
        onClick={() => isCollapsible && setOpen(!open())}
      >
        <div class="flex items-center gap-2 text-xs uppercase tracking-wide text-[var(--color-muted)]">
          <Show when={isCollapsible}>
            <ChevronRight
              size={14}
              class={`transition-transform ${open() ? "rotate-90" : ""}`}
            />
          </Show>
          {props.icon}
          <h2>{props.title}</h2>
        </div>
        <Show when={props.right}>{props.right}</Show>
      </header>
      <div class={`grid transition-[grid-template-rows] duration-200 ease-out ${open() ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
        <div class="overflow-hidden">{props.children}</div>
      </div>
    </section>
  );
};
