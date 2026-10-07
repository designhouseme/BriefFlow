# DH Briefing

Brief z klientem bez formularzy do wypisywania. Agencja tworzy brief jednym kliknięciem i dostaje dwa linki:

- **link agencji**: edycja pytań, polecenia dla AI, historia zmian, cofanie,
- **link klienta**: klient klika odpowiedzi, może dać „Nie wiem” albo „Pomiń na razie” i wrócić później.

Obie strony widzą zmiany na żywo, więc brief można wypełniać razem na spotkaniu albo wysłać klientowi.

## Uruchomienie

```bash
pnpm install
cp .dev.vars.example .dev.vars   # wpisz GEMINI_API_KEY (Google AI Studio), żeby działały polecenia AI
pnpm dev
```

Bez klucza działa wszystko poza oknem poleceń AI.

## Wdrożenie

```bash
pnpm exec wrangler secret put GEMINI_API_KEY
pnpm run deploy
```

Na produkcji briefy są przechowywane w UE (jurysdykcja Durable Objects `eu`). Lokalnie ta opcja jest wyłączona, bo lokalny runtime jej nie obsługuje.

## Jak to działa

- Jeden brief = jedna instancja Agenta (Cloudflare Agents SDK, Durable Object z SQLite). Stan briefu synchronizuje się przez WebSocket do wszystkich otwartych linków.
- Rola wynika z tokenu w linku. Tokeny leżą w SQL Agenta, nie w stanie, więc klient nie widzi linku agencji. Przeglądarka nie może nadpisać stanu: wszystkie zmiany idą przez metody `@callable` ze sprawdzeniem roli.
- Struktura briefu (sekcje → pola) jest zmieniana tylko przez funkcje z `src/shared/ops.ts`. Z tych samych funkcji korzysta edycja ręczna i AI.
- AI (`src/server/ai.ts`) dostaje opis briefu i polecenie agencji, a zmiany robi narzędziami (`add_field`, `update_field`, `move_field`, `add_section`…). Pola tekstowe wymagają uzasadnienia, bo domyślnie AI tworzy pytania do klikania. Każde polecenie AI to jeden krok do cofnięcia.

## Struktura

```
src/shared/types.ts       typy briefu, katalog typów pól
src/shared/ops.ts         operacje na strukturze, widoczność warunkowa, postęp
src/shared/templates.ts   szablony („Strona WWW”, pusty)
src/server/index.ts       Worker: tworzenie briefu, sprawdzenie linku, routing do Agenta
src/server/brief-agent.ts Agent briefu: role, odpowiedzi, edycja, cofanie, historia, AI
src/server/ai.ts          narzędzia i pętla poleceń AI
src/client/               React: strona startowa i widok briefu
```

## Znane ograniczenia (MVP)

- Ręczne zmiany pytań zrobione w trakcie działania polecenia AI zostaną nadpisane wynikiem AI.
- Pliki (logo, zdjęcia) nie są jeszcze wgrywane: pole „Materiał” zbiera status i link.
- Brak przypomnień mailowych i wykrywania luk przez AI.
- Kto zgubi link agencji, traci dostęp do edycji briefu.
