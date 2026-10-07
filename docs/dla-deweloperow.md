# BriefFlow dla deweloperów

Jak uruchomić, wdrożyć i rozwijać BriefFlow. Opis produktu jest w [README](../README.md), a szczegóły logowania i danych w [dane-i-logowanie.md](dane-i-logowanie.md).

## Uruchomienie

Potrzebujesz Node.js i pnpm.

```bash
pnpm install
cp .dev.vars.example .dev.vars   # wpisz GEMINI_API_KEY (Google AI Studio), żeby działały polecenia AI
pnpm dev
```

Lokalnie nie trzeba się logować: aplikacja od razu wchodzi na konto deweloperskie (`dev@designhouse.me`, zmiana przez `DEV_EMAIL` w `.dev.vars`). Ta ścieżka nie trafia do buildu produkcyjnego. Bez klucza Gemini działa wszystko poza poleceniami AI.

Przydatne polecenia: `pnpm typecheck` (TypeScript), `pnpm types` (typy wiązań z `wrangler.jsonc`), `pnpm build`.

### Podgląd maili (Mailpit)

```bash
docker run -d --name dh-mailpit -p 127.0.0.1:8025:8025 -p 127.0.0.1:1025:1025 axllent/mailpit
```

Z `MAILPIT_URL=http://127.0.0.1:8025` w `.dev.vars` maile z dev trafiają do Mailpita: http://127.0.0.1:8025. Przykład każdego szablonu wyślesz poleceniem `curl -X POST http://localhost:5173/api/dev/emails` (trasa istnieje tylko w dev). Szablony są w `src/server/emails.ts`.

## Wdrożenie

BriefFlow działa na Cloudflare Workers.

```bash
pnpm exec wrangler email sending enable designhouse.me   # raz: domena nadawcy kodów
pnpm exec wrangler secret put GEMINI_API_KEY
pnpm run deploy
```

- Aplikacja działa pod https://briefflow.designhouse.me (domena własna Workera, `routes` w `wrangler.jsonc`). Rekord DNS i certyfikat Cloudflare tworzy przy pierwszym wdrożeniu; adres workers.dev i podglądy wersji są wyłączone, bo ciasteczko sesji, sprawdzanie `Origin` i linki w mailach zakładają jeden origin.
- Na produkcji briefy i konta są przechowywane w UE (jurysdykcja Durable Objects `eu`). Lokalnie ta opcja jest wyłączona, bo lokalny runtime jej nie obsługuje.

### Konfiguracja

| Zmienna | Gdzie | Do czego |
|---|---|---|
| `GEMINI_API_KEY` | sekret (`wrangler secret put`), lokalnie `.dev.vars` | polecenia AI; bez klucza okno poleceń jest wyłączone |
| `EMAIL_FROM` | `vars` w `wrangler.jsonc` | nadawca kodów i powiadomień (domyślnie `brief@designhouse.me`); jego domena musi być włączona w Cloudflare Email Service |
| `ALLOWED_EMAIL_DOMAINS` | `vars` w `wrangler.jsonc` | kto może się zalogować: domeny po przecinku (domyślnie `designhouse.me`), pusto = każdy adres |
| `DEV_EMAIL` | `.dev.vars` | konto deweloperskie w `pnpm dev` |
| `MAILPIT_URL` | `.dev.vars` | maile z dev idą do Mailpita zamiast do Cloudflare Email Service |

## Architektura

```mermaid
flowchart LR
  agency["Agencja<br/>(sesja w ciasteczku)"] --> worker["Worker<br/>logowanie, briefy, dostęp"]
  client["Klient<br/>(link z tokenem)"] --> worker
  worker --> accounts[("AccountStore<br/>Durable Object, SQLite<br/>kody, sesje, lista briefów")]
  worker -- WebSocket --> brief[("BriefAgent<br/>Durable Object, SQLite<br/>pytania, odpowiedzi, historia")]
  brief -- "wiersz briefu na liście" --> accounts
  brief -- "polecenia AI" --> gemini["Gemini"]
  worker -- "kody logowania" --> mail["Cloudflare Email Service"]
  brief -- "brief wysłany" --> mail
```

Regulamin i polityka prywatności (wersje robocze do weryfikacji prawnej) są pod `/regulamin` i `/prywatnosc` (`src/client/Legal.tsx`).

- **Logowanie:** `POST /api/auth/start` wysyła 6-cyfrowy kod (ważny 10 minut, 5 prób, nowy najwcześniej po 30 s, najwyżej 5 na godzinę), `POST /api/auth/verify` ustawia ciasteczko sesji (`HttpOnly`, `SameSite=Lax`, 30 dni).
- **Konto:** jedno konto = jedna instancja `AccountStore` (Durable Object z SQLite, nazwana skrótem adresu). Trzyma skróty kodów i sesji oraz listę briefów tej osoby.
- **Brief:** jeden brief = jedna instancja Agenta (Cloudflare Agents SDK, Durable Object z SQLite). Stan briefu synchronizuje się przez WebSocket do wszystkich otwartych widoków. Każda zmiana stanu odświeża też wiersz briefu na koncie właściciela (tytuł, postęp, wysyłka).
- **Role:** rola wynika z tokenu. Klient ma token w linku. Agencja łączy się bez tokenu: Worker sprawdza sesję i własny origin, a token agencji dokleja po stronie serwera, więc nie trafia on do przeglądarki. Przeglądarka nie może nadpisać stanu: wszystkie zmiany idą przez metody `@callable` ze sprawdzeniem roli.
- **Struktura briefu** (sekcje → pola) jest zmieniana tylko przez funkcje z `src/shared/ops.ts`. Z tych samych funkcji korzysta edycja ręczna i AI.
- **AI** (`src/server/ai.ts`) dostaje opis briefu i polecenie agencji, a zmiany robi narzędziami (`add_field`, `update_field`, `move_field`, `add_section`…). Pola tekstowe wymagają uzasadnienia: domyślnie AI tworzy pytania do klikania. Każde polecenie AI to jeden krok do cofnięcia.

### Stos

TypeScript, React 19 i Vite po stronie klienta; Cloudflare Workers, Durable Objects z SQLite i Agents SDK na serwerze; Gemini (`@google/genai`) do poleceń AI; Cloudflare Email Service do maili. Krój Atkinson Hyperlegible Next, ikony Tabler.

## Struktura

```
src/shared/types.ts        typy briefu, katalog typów pól
src/shared/ops.ts          operacje na strukturze, widoczność warunkowa, postęp
src/shared/flow.ts         kolejność pytań w rozmowie klienta
src/shared/checks.ts       kontrole przed startem: Baza, flagi, wycena
src/shared/templates.ts    szablony („Strona WWW”, pusty)
src/shared/account.ts      lista briefów na koncie agencji
src/server/index.ts        Worker: logowanie, lista i tworzenie briefów, dostęp, routing do Agenta
src/server/auth.ts         kody z maila, sesja w ciasteczku
src/server/accounts.ts     AccountStore: kody, sesje, briefy jednej osoby
src/server/brief-agent.ts  Agent briefu: role, odpowiedzi, edycja, cofanie, historia, AI
src/server/ai.ts           narzędzia i pętla poleceń AI
src/server/emails.ts       szablony maili i wysyłka (Cloudflare Email Service, Mailpit w dev)
src/client/Landing.tsx     strona startowa z logowaniem
src/client/AppShell.tsx    aplikacja agencji: pasek ikon, lista briefów, panel
src/client/Home.tsx        nowy brief
src/client/BriefPage.tsx   brief w aplikacji (agencja) i pod linkiem klienta
src/client/ClientFlow.tsx  rozmowa klienta i „Twój brief”
public/brand/              znak (orb) i grafika do podglądu linku
docs/media/                animacje do README
design/film/               źródło animacji (kompozycja HTML, render do MP4 i WebP)
```

## Animacje w README

Animacje w `docs/media/` powstają z `design/film/index.html`: każda klatka to funkcja czasu, a ekrany korzystają z CSS aplikacji i z kart wygenerowanych z jej komponentów (`gen-data.tsx` → `data.js`). Do renderu potrzebne są Node.js, ffmpeg, Python z Pillow i Chromium.

```bash
cd design/film
node render.mjs --src index.html --params "only=klient" --out klient.mp4   # także: kula, agencja
python3 webp.py out/klient.mp4 ../../docs/media/klient.webp 1000 20 85
```

`index.html` otwarty w przeglądarce odtwarza film na żywo (`?only=klient` pokazuje jedną pętlę, `?t=5` jedną klatkę). Po zmianie szablonu, kart albo ikon odśwież `data.js` poleceniem z nagłówka `gen-data.tsx`.

## Znane ograniczenia (MVP)

- Ręczne zmiany pytań zrobione w trakcie działania polecenia AI zostaną nadpisane wynikiem AI.
- Pliki (logo, zdjęcia) nie są jeszcze wgrywane: pole „Materiał” zbiera status i link.
- Brak przypomnień mailowych i wykrywania luk przez AI.
- Brief widzi tylko osoba, która go utworzyła. Wspólnych briefów zespołu jeszcze nie ma.
- Limit kodów jest liczony na adres, nie na IP.

## Licencja

Kod jest udostępniony na licencji [Apache 2.0](../LICENSE). Kto rozpowszechnia kod albo pracę na nim opartą, musi zachować plik [NOTICE](../NOTICE) z informacją o autorstwie (Design House).

Licencja nie obejmuje nazwy i logo Design House (`public/brand/dh/`, `public/favicon.*`, `public/apple-touch-icon.png`). To znaki Design House; w forku podmień je na własne.
