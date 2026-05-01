import { createSignal, Show, type Component, type JSX } from "solid-js";
import { ChevronRight } from "lucide-solid";

export const Section: Component<{
  title: string;
  icon?: JSX.Element;
  defaultOpen?: boolean;
  collapsible?: boolean;
  right?: JSX.Element;
  children: JSX.Element;
}> = (props) => {
  const [open, setOpen] = createSignal(props.defaultOpen ?? true);
  const isCollapsible = props.collapsible ?? true;

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
