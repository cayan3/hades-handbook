import { useId } from "react";
import { useDialog } from "./dialog.js";
import { SHORTCUTS } from "./keys.js";

/**
 * The command set written out, opened with `?` and by nothing else.
 *
 * No visible trigger anywhere, which is the whole of why it costs nothing: a
 * player who never touches a key never meets it, and one who does finds it where
 * every other page on the web keeps it. That is also why the list has to be
 * complete — it is the only place the bindings are stated.
 */
export interface ShortcutsProps {
  readonly onClose: () => void;
}

export function Shortcuts({ onClose }: ShortcutsProps) {
  const { ref, onKeyDown } = useDialog(onClose);
  const titleId = useId();

  return (
    <div
      className="sheet-scrim"
      onKeyDown={onKeyDown}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="sheet shortcuts" ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        {/* First in the document, so it is where focus lands and where Tab
            starts — the same place every other dialog here puts its way out. */}
        <button type="button" className="sheet__close" onClick={onClose}>
          Close
        </button>
        <h2 id={titleId}>Keyboard shortcuts</h2>
        <dl className="shortcuts__list">
          {SHORTCUTS.map((shortcut) => (
            <div key={shortcut.what} className="shortcuts__row">
              <dt>
                {shortcut.keys.map((key) => (
                  <kbd key={key}>{key}</kbd>
                ))}
              </dt>
              <dd>{shortcut.what}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
