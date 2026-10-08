import { IconCheck, IconPhoto, IconTrash, IconUpload, IconX } from "@tabler/icons-react";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { removeAccountLogo, uploadAccountLogo } from "./account-logo-api";
import "./account-logo.css";

const MAX_LOGO_BYTES = 512 * 1024;
const MAX_LOGO_DIMENSION = 2048;
const LOGO_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

interface AccountLogoSettingsProps {
  logoUrl?: string;
  onSaved: (logoUrl?: string) => void;
  onClose: () => void;
  notify: (message: string) => void;
}

interface LogoDraft {
  file: File;
  url: string;
}

/** A real image preview also checks that a renamed or damaged file can be decoded. */
function checkImage(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      if (!image.naturalWidth || !image.naturalHeight) {
        reject(new Error("Ten plik nie zawiera poprawnego obrazu."));
      } else if (image.naturalWidth > MAX_LOGO_DIMENSION || image.naturalHeight > MAX_LOGO_DIMENSION) {
        reject(new Error("Logo może mieć maksymalnie 2048 × 2048 pikseli. Zmniejsz obraz i wybierz go ponownie."));
      } else {
        resolve();
      }
    };
    image.onerror = () => reject(new Error("Nie można odczytać tego obrazu. Wybierz poprawny plik PNG, JPG lub WebP."));
    image.src = url;
  });
}

/** Logo belongs to the sender's account and is shared across their briefs. */
export function AccountLogoSettings({ logoUrl, onSaved, onClose, notify }: AccountLogoSettingsProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const mounted = useRef(false);
  const close = useRef(onClose);
  close.current = onClose;
  const [draft, setDraft] = useState<LogoDraft | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<"checking" | "saving" | "removing" | null>(null);
  const headingId = useId();
  const descriptionId = useId();
  const hintId = useId();
  const errorId = useId();

  useEffect(() => {
    mounted.current = true;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const modal = dialog.current;
    modal?.showModal();
    closeButton.current?.focus();
    return () => {
      mounted.current = false;
      modal?.close();
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, []);

  useEffect(() => () => {
    if (draft) URL.revokeObjectURL(draft.url);
  }, [draft]);

  async function selectFile(file: File | undefined) {
    if (!file) return;
    setError("");
    if (!LOGO_TYPES.has(file.type)) {
      setError("Wybierz logo w formacie PNG, JPG lub WebP. Pliki SVG nie są obsługiwane.");
      return;
    }
    if (!file.size || file.size > MAX_LOGO_BYTES) {
      setError(file.size ? "Logo może ważyć maksymalnie 512 KB. Zmniejsz plik i wybierz go ponownie." : "Ten plik jest pusty. Wybierz inne logo.");
      return;
    }
    setBusy("checking");
    const url = URL.createObjectURL(file);
    try {
      await checkImage(url);
      if (!mounted.current) {
        URL.revokeObjectURL(url);
        return;
      }
      setDraft({ file, url });
    } catch (cause) {
      URL.revokeObjectURL(url);
      if (mounted.current) setError((cause as Error).message);
    } finally {
      if (mounted.current) setBusy(null);
    }
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!draft || busy) return;
    setError("");
    setBusy("saving");
    try {
      const result = await uploadAccountLogo(draft.file);
      onSaved(result.logoUrl);
      notify("Logo zostało zapisane.");
      if (mounted.current) close.current();
    } catch (cause) {
      if (mounted.current) setError((cause as Error).message);
      else notify((cause as Error).message);
    } finally {
      if (mounted.current) setBusy(null);
    }
  }

  async function remove() {
    if (!logoUrl || busy) return;
    setError("");
    setBusy("removing");
    try {
      await removeAccountLogo();
      onSaved(undefined);
      notify("Logo zostało usunięte.");
      if (mounted.current) close.current();
    } catch (cause) {
      if (mounted.current) setError((cause as Error).message);
      else notify((cause as Error).message);
    } finally {
      if (mounted.current) setBusy(null);
    }
  }

  const previewUrl = draft?.url ?? logoUrl;
  const busyLabel = busy === "checking" ? "Sprawdzanie obrazu…" : busy === "saving" ? "Zapisywanie logo…" : busy === "removing" ? "Usuwanie logo…" : "";

  return createPortal(
    <dialog
      ref={dialog}
      className="account-logo-dialog"
      aria-labelledby={headingId}
      aria-describedby={descriptionId}
      onCancel={(event) => {
        event.preventDefault();
        close.current();
      }}
    >
      <form className="account-logo-form" onSubmit={save} aria-busy={Boolean(busy)}>
        <header className="account-logo-header">
          <div>
            <h2 id={headingId}>Twoje logo</h2>
            <p id={descriptionId}>Pojawi się w briefach udostępnianych Twoim klientom.</p>
          </div>
          <button type="button" className="icon-btn" ref={closeButton} onClick={() => close.current()} aria-label="Zamknij ustawienia logo">
            <IconX size={20} aria-hidden />
          </button>
        </header>

        <div className={`account-logo-preview ${previewUrl ? "has-logo" : ""}`}>
          {previewUrl ? (
            <img src={previewUrl} alt={draft ? "Podgląd wybranego logo" : "Twoje zapisane logo"} />
          ) : (
            <div className="account-logo-empty">
              <IconPhoto size={30} stroke={1.5} aria-hidden />
              <span>Dodaj logo swojej firmy</span>
            </div>
          )}
        </div>

        <div className="account-logo-picker">
          <input
            ref={picker}
            type="file"
            accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
            hidden
            disabled={Boolean(busy)}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = "";
              void selectFile(file);
            }}
          />
          <button
            type="button"
            className="btn"
            disabled={Boolean(busy)}
            aria-describedby={`${hintId}${error ? ` ${errorId}` : ""}`}
            onClick={() => picker.current?.click()}
          >
            <IconUpload size={17} aria-hidden /> {previewUrl ? "Wybierz inne logo" : "Wybierz plik"}
          </button>
          <p id={hintId}>PNG, JPG lub WebP · do 512 KB · do 2048 × 2048 px</p>
        </div>

        {draft && (
          <div className="account-logo-selected">
            <span title={draft.file.name}>{draft.file.name}</span>
            <button type="button" className="icon-btn" disabled={Boolean(busy)} onClick={() => { setDraft(null); setError(""); }} aria-label="Odrzuć wybrany plik">
              <IconX size={16} aria-hidden />
            </button>
          </div>
        )}

        {error && <p className="error account-logo-error" id={errorId} role="alert">{error}</p>}
        <p className="account-logo-status" role="status" aria-live="polite">{busyLabel}</p>

        <footer className="account-logo-footer">
          {logoUrl && (
            <button type="button" className="btn btn-quiet account-logo-remove" disabled={Boolean(busy)} onClick={() => void remove()}>
              <IconTrash size={16} aria-hidden /> Usuń logo
            </button>
          )}
          <div className="account-logo-save">
            <button type="button" className="btn btn-quiet" onClick={() => close.current()}>Zamknij</button>
            <button type="submit" className="btn btn-primary" disabled={!draft || Boolean(busy)}>
              <IconCheck size={16} aria-hidden /> {busy === "saving" ? "Zapisywanie…" : "Zapisz logo"}
            </button>
          </div>
        </footer>
      </form>
    </dialog>,
    document.body,
  );
}
