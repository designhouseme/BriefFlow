import { IconArrowLeft, IconArrowUp, IconKey, IconMail } from "@tabler/icons-react";
import { useEffect, useId, useRef, useState } from "react";
import { ApiError, startLogin, verifyLogin } from "./api";

/**
 * Logowanie agencji w tym samym pasku, co pole na dole aplikacji: adres, potem 6 cyfr z maila
 * w tym samym miejscu. Po poprawnym kodzie `onDone` przenosi do aplikacji. Może stać na stronie
 * kilka razy (hero i zakończenie), więc identyfikatory pól są unikalne.
 */
export function AuthForm({ onDone, autoFocus }: { onDone: (email: string) => void; autoFocus?: boolean }) {
  const uid = useId();
  const ids = { email: `${uid}-email`, code: `${uid}-code`, error: `${uid}-error`, note: `${uid}-note` };
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(0);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (wait <= 0) return;
    const timer = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(timer);
  }, [wait]);

  useEffect(() => {
    if (step === "code") codeRef.current?.focus();
  }, [step]);

  async function send(event?: React.FormEvent) {
    event?.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await startLogin(email);
      setDevCode(result.devCode ?? "");
      setCode("");
      setStep("code");
      setWait(30);
    } catch (e) {
      const retry = e instanceof ApiError ? Number(e.data.retryAfter) : 0;
      if (retry && step === "email") {
        // Kod już poszedł: przechodzimy do wpisywania zamiast blokować.
        setStep("code");
        setWait(retry);
      } else {
        setError((e as Error).message);
        if (retry) setWait(retry);
      }
    } finally {
      setBusy(false);
    }
  }

  async function verify(value = code) {
    if (busy || value.length !== 6) return;
    setBusy(true);
    setError("");
    try {
      const result = await verifyLogin(email, value);
      onDone(result.email);
    } catch (e) {
      setError((e as Error).message);
      setCode("");
      setBusy(false);
      codeRef.current?.focus();
    }
  }

  if (step === "email") {
    return (
      <form className="auth" onSubmit={send} noValidate>
        <div className="bar auth-bar">
          <span className="bar-lead tone-1" aria-hidden>
            <IconMail size={19} stroke={1.9} />
          </span>
          <label className="bar-field">
            <span className="visually-hidden">Adres e-mail</span>
            <input
              id={ids.email}
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="Twój adres e-mail"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus={autoFocus}
              required
              aria-invalid={Boolean(error) || undefined}
              aria-describedby={error ? ids.error : ids.note}
            />
          </label>
          <button className="btn-send" disabled={busy || !email.trim()}>
            <span className="btn-send-label">{busy ? "Wysyłam…" : "Wyślij kod"}</span>
            <span className="btn-send-icon" aria-hidden>
              <IconArrowUp size={18} stroke={2.4} />
            </span>
          </button>
        </div>
        {error ? (
          <p className="auth-error" id={ids.error} role="alert">
            {error}
          </p>
        ) : (
          <p className="auth-note" id={ids.note}>
            Logujesz się kodem z maila, bez hasła.
          </p>
        )}
      </form>
    );
  }

  return (
    <form
      className="auth"
      onSubmit={(e) => {
        e.preventDefault();
        verify();
      }}
      noValidate
    >
      <div className="bar auth-bar">
        <span className="bar-lead tone-3" aria-hidden>
          <IconKey size={19} stroke={1.9} />
        </span>
        <label className="bar-field">
          <span className="visually-hidden">Kod z maila wysłanego na {email}, 6 cyfr</span>
          <input
            id={ids.code}
            ref={codeRef}
            className="auth-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={6}
            placeholder="000000"
            value={code}
            onChange={(e) => {
              const digits = e.target.value.replace(/\D/g, "").slice(0, 6);
              setCode(digits);
              if (digits.length === 6) verify(digits);
            }}
            aria-invalid={Boolean(error) || undefined}
            aria-describedby={error ? ids.error : ids.note}
          />
        </label>
        <button className="btn-send" disabled={busy || code.length !== 6}>
          <span className="btn-send-label">{busy ? "Sprawdzam…" : "Zaloguj"}</span>
          <span className="btn-send-icon" aria-hidden>
            <IconArrowUp size={18} stroke={2.4} />
          </span>
        </button>
      </div>
      {error ? (
        <p className="auth-error" id={ids.error} role="alert">
          {error}
        </p>
      ) : (
        <p className="auth-note" id={ids.note}>
          Wpisz kod wysłany na <strong>{email}</strong>.
        </p>
      )}
      <div className="auth-actions">
        <button
          type="button"
          className="link-btn"
          onClick={() => {
            setStep("email");
            setError("");
          }}
        >
          <IconArrowLeft size={15} aria-hidden /> Zmień adres
        </button>
        <button type="button" className="link-btn" disabled={wait > 0 || busy} onClick={() => send()}>
          {wait > 0 ? `Wyślij ponownie za ${wait} s` : "Wyślij ponownie"}
        </button>
      </div>
      {devCode && (
        <p className="auth-dev">
          Tryb deweloperski, mail trafia do logu serwera.{" "}
          <button
            type="button"
            className="link-btn"
            onClick={() => {
              setCode(devCode);
              verify(devCode);
            }}
          >
            Wpisz kod {devCode}
          </button>
        </p>
      )}
    </form>
  );
}
