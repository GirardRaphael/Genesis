import { useEffect, useRef, type RefObject } from "react";

export function useDialog(
  ref: RefObject<HTMLElement | null>,
  open: boolean,
  close: () => void,
) {
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    if (!open || !ref.current) return;
    const dialog = ref.current;
    const previous = document.activeElement as HTMLElement | null;
    const app = document.querySelector<HTMLElement>(".app-body");
    const sidebar = document.querySelector<HTMLElement>(".sidebar");
    if (app) app.inert = true;
    if (sidebar) sidebar.inert = true;
    const focusable = () => [
      ...dialog.querySelectorAll<HTMLElement>(
        'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), summary, [tabindex="0"]',
      ),
    ];
    (focusable()[0] || dialog).focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
      }
      if (event.key !== "Tab") return;
      const items = focusable(),
        first = items[0],
        last = items.at(-1);
      if (!first) {
        event.preventDefault();
        dialog.focus();
      } else if (
        event.shiftKey &&
        (document.activeElement === first || document.activeElement === dialog)
      ) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    dialog.addEventListener("keydown", keydown);
    return () => {
      dialog.removeEventListener("keydown", keydown);
      if (app) app.inert = false;
      if (sidebar) sidebar.inert = false;
      if (previous?.isConnected) previous.focus();
    };
  }, [open, ref]);
}
