# BriefFlow

Brief z klientem bez formularzy do wypisywania. Strona startowa prowadzi od razu do aplikacji: osoba z agencji podaje adres firmowy, wpisuje 6 cyfr z maila i tworzy briefy. Każdy brief ma **link dla klienta**: klient klika odpowiedzi, może dać „Nie wiem” albo „Pomiń na razie” i wrócić później, bez zakładania konta.

Agencja i klient widzą zmiany na żywo, więc brief można wypełniać razem na spotkaniu albo wysłać klientowi.

## Uruchomienie

```bash
pnpm install
cp .dev.vars.example .dev.vars   # wpisz GEMINI_API_KEY (Google AI Studio), żeby działały polecenia AI
pnpm dev
```

Lokalnie nie trzeba się logować: aplikacja od razu wchodzi na konto deweloperskie (`dev@designhouse.me`, zmiana przez `DEV_EMAIL` w `.dev.vars`). Ta ścieżka nie trafia do buildu produkcyjnego. Bez klucza Gemini działa wszystko poza poleceniami AI.

### Podgląd maili (Mailpit)

```bash
docker run -d --name dh-mailpit -p 127.0.0.1:8025:8025 -p 127.0.0.1:1025:1025 axllent/mailpit
```

Z `MAILPIT_URL=http://127.0.0.1:8025` w `.dev.vars` maile z dev trafiają do Mailpita: http://127.0.0.1:8025. Przykład każdego szablonu wyślesz poleceniem `curl -X POST http://localhost:5173/api/dev/emails` (trasa istnieje tylko w dev). Szablony są w `src/server/emails.ts`.

## Wdrożenie

```bash
pnpm exec wrangler email sending enable designhouse.me   # raz: domena nadawcy kodów
pnpm exec wrangler secret put GEMINI_API_KEY
pnpm run deploy
```

- Nadawca kodów to `EMAIL_FROM` w `wrangler.jsonc` (domyślnie `brief@designhouse.me`); jego domena musi być włączona w Cloudflare Email Service.
- Zalogować się mogą tylko adresy z domen w `ALLOWED_EMAIL_DOMAINS` (domyślnie `designhouse.me`, kilka po przecinku, pusto = każdy).
- Na produkcji briefy i konta są przechowywane w UE (jurysdykcja Durable Objects `eu`). Lokalnie ta opcja jest wyłączona, bo lokalny runtime jej nie obsługuje.

## Jak to działa

Szczegóły logowania i pełna lista tego, co zapisujemy na Cloudflare: [docs/dane-i-logowanie.md](docs/dane-i-logowanie.md). Regulamin i polityka prywatności (wersje robocze do weryfikacji prawnej) są pod `/regulamin` i `/prywatnosc`.

- Logowanie: `POST /api/auth/start` wysyła 6-cyfrowy kod (ważny 10 minut, 5 prób, nowy najwcześniej po 30 s, najwyżej 5 na godzinę), `POST /api/auth/verify` ustawia ciasteczko sesji (`HttpOnly`, `SameSite=Lax`, 30 dni).
- Jedno konto = jedna instancja `AccountStore` (Durable Object z SQLite, nazwana skrótem adresu). Trzyma skróty kodów i sesji oraz listę briefów tej osoby.
- Jeden brief = jedna instancja Agenta (Cloudflare Agents SDK, Durable Object z SQLite). Stan briefu synchronizuje się przez WebSocket do wszystkich otwartych widoków. Każda zmiana stanu odświeża też wiersz briefu na koncie właściciela (tytuł, postęp, wysyłka).
- Rola wynika z tokenu. Klient ma token w linku. Agencja łączy się bez tokenu: Worker sprawdza sesję i własny origin, a token agencji dokleja po stronie serwera, więc nie trafia on do przeglądarki. Przeglądarka nie może nadpisać stanu: wszystkie zmiany idą przez metody `@callable` ze sprawdzeniem roli.
- Struktura briefu (sekcje → pola) jest zmieniana tylko przez funkcje z `src/shared/ops.ts`. Z tych samych funkcji korzysta edycja ręczna i AI.
- AI (`src/server/ai.ts`) dostaje opis briefu i polecenie agencji, a zmiany robi narzędziami (`add_field`, `update_field`, `move_field`, `add_section`…). Pola tekstowe wymagają uzasadnienia: domyślnie AI tworzy pytania do klikania. Każde polecenie AI to jeden krok do cofnięcia.

## Struktura

```
src/shared/types.ts        typy briefu, katalog typów pól
src/shared/ops.ts          operacje na strukturze, widoczność warunkowa, postęp
src/shared/templates.ts    szablony („Strona WWW”, pusty)
src/shared/account.ts      lista briefów na koncie agencji
src/server/index.ts        Worker: logowanie, lista i tworzenie briefów, dostęp, routing do Agenta
src/server/auth.ts         kody z maila, sesja w ciasteczku
src/server/accounts.ts     AccountStore: kody, sesje, briefy jednej osoby
src/server/brief-agent.ts  Agent briefu: role, odpowiedzi, edycja, cofanie, historia, AI
src/server/ai.ts           narzędzia i pętla poleceń AI
src/client/Landing.tsx     strona startowa z logowaniem
src/client/AppShell.tsx    aplikacja agencji: pasek ikon, lista briefów, panel
src/client/Home.tsx        nowy brief
src/client/BriefPage.tsx   brief w aplikacji (agencja) i pod linkiem klienta
src/client/ClientFlow.tsx  rozmowa klienta i „Twój brief”
public/brand/              znak (orb) i grafika do podglądu linku
```

## Znane ograniczenia (MVP)

- Ręczne zmiany pytań zrobione w trakcie działania polecenia AI zostaną nadpisane wynikiem AI.
- Pliki (logo, zdjęcia) nie są jeszcze wgrywane: pole „Materiał” zbiera status i link.
- Brak przypomnień mailowych i wykrywania luk przez AI.
- Brief widzi tylko osoba, która go utworzyła. Wspólnych briefów zespołu jeszcze nie ma.
- Limit kodów jest liczony na adres, nie na IP.

## Licencja

Kod jest udostępniony na licencji [Apache 2.0](LICENSE). Kto rozpowszechnia kod albo pracę na nim opartą, musi zachować plik [NOTICE](NOTICE) z informacją o autorstwie (Design House).

Licencja nie obejmuje nazwy i logo Design House (`public/brand/dh/`, `public/favicon.*`, `public/apple-touch-icon.png`). To znaki Design House; w forku podmień je na własne.
