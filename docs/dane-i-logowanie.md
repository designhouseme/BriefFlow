# Logowanie i dane na Cloudflare

Opis tego, jak działa logowanie i co dokładnie BriefFlow zapisuje. Źródłem prawdy jest kod: `src/server/auth.ts`, `src/server/accounts.ts`, `src/server/brief-agent.ts`, `src/server/emails.ts`, `src/server/ai.ts`. Zmiana w tych plikach oznacza zmianę tego dokumentu i polityki prywatności (`src/client/Legal.tsx`).

## Dwie role, dwa sposoby wejścia

| Kto | Jak wchodzi | Co może |
|---|---|---|
| Osoba z agencji | adres e-mail + 6-cyfrowy kod z maila, potem ciasteczko sesji | tworzy, edytuje i usuwa swoje briefy, wysyła polecenia do AI |
| Klient | link z tokenem `?k=…`, bez konta | odpowiada na pytania jednego briefu, wysyła brief |

Zalogować się mogą tylko adresy z domen w `ALLOWED_EMAIL_DOMAINS` (domyślnie `designhouse.me`).

## Logowanie kodem z maila

1. `POST /api/auth/start { email }`: adres jest normalizowany (małe litery, bez spacji) i sprawdzany względem dozwolonych domen. Konto to instancja `AccountStore` nazwana skrótem SHA-256 adresu, więc sam adres nie trafia do identyfikatorów.
2. Generujemy kod 6-cyfrowy. Zapisujemy **tylko skrót** `SHA-256(adres:kod)`, czas ważności 10 minut i licznik prób. Nowy kod unieważnia poprzednie. Limity: następny kod najwcześniej po 30 s, najwyżej 5 kodów na godzinę na adres.
3. Kod idzie mailem przez Cloudflare Email Service (lokalnie do Mailpita).
4. `POST /api/auth/verify { email, code }`: najwyżej 5 prób na kod, porównanie w stałym czasie, kod działa raz.
5. Po poprawnym kodzie tworzymy losowy token sesji (32 znaki), zapisujemy **tylko jego skrót** i ustawiamy ciasteczko `dh_session`: `HttpOnly`, `SameSite=Lax`, `Secure` na HTTPS, ważne 30 dni. Wylogowanie usuwa sesję z bazy i czyści ciasteczko.

Zabezpieczenia żądań:

- Zapisy (`POST`, `DELETE`) przyjmują tylko `application/json`, co przy innym originie wymusza preflight CORS, a ciasteczko ma `SameSite=Lax`.
- WebSocket agencji wymaga nagłówka `Origin` równego adresowi aplikacji (ciasteczko leci też z cudzych stron).
- Token agencji briefu nie trafia do przeglądarki: Worker sprawdza sesję i dokleja go do połączenia po stronie serwera.
- Przeglądarka nie może nadpisać stanu briefu; każda zmiana idzie przez metodę `@callable` ze sprawdzeniem roli.

Lokalnie (`pnpm dev`) aplikacja loguje się sama na konto deweloperskie (`DEV_EMAIL`). Ta ścieżka jest pod `import.meta.env.DEV` i nie ma jej w buildzie produkcyjnym; tak samo trasa `POST /api/dev/emails` i wysyłka do Mailpita.

## Co przechowujemy

Na produkcji oba rodzaje Durable Objects działają w jurysdykcji `eu`: dane są zapisane i przechowywane w Unii Europejskiej. Sam Worker (obsługa żądań) działa na serwerach Cloudflare najbliżej użytkownika.

### Konto osoby z agencji (`AccountStore`, SQLite)

| Tabela | Pola | Jak długo |
|---|---|---|
| `profile` | adres e-mail (jawnie) | dopóki istnieje konto |
| `codes` | skrót kodu, czas utworzenia i wygaśnięcia, liczba prób, czy użyty | kod wygasa po 10 min; wiersze starsze niż 24 h kasujemy przy kolejnej prośbie o kod |
| `sessions` | skrót tokenu sesji, czas utworzenia i wygaśnięcia | 30 dni; wygasłe kasujemy przy kolejnym logowaniu, wylogowanie kasuje od razu |
| `briefs` | id, tytuł, nazwa klienta, szablon, **token agencji i token klienta (jawnie)**, czasy, postęp, czas wysłania | dopóki brief nie zostanie usunięty |

Tokeny briefów leżą jawnie, bo to klucze dostępu, których serwer potrzebuje (link klienta, połączenie agencji). Konto nie jest dostępne z przeglądarki; woła je tylko Worker i agent briefu.

### Brief (`BriefAgent`, Agents SDK, SQLite)

| Gdzie | Co |
|---|---|
| stan agenta | tytuł, nazwa klienta, sekcje i pytania, **odpowiedzi klienta i agencji** (wartość, kto, kiedy), czas wysłania |
| `meta` | token agencji, token klienta, właściciel (skrót konta), adres aplikacji do linków w mailach |
| `history` | kopia pytań sprzed każdej zmiany struktury (do cofania): kto, kiedy, opis |
| `events` | dziennik zmian widoczny w „Historii”: kto, kiedy, opis, w tym treść odpowiedzi |

Usunięcie briefu w aplikacji kasuje całą instancję (wszystkie tabele i stan) oraz wiersz na liście konta.

### Poza Durable Objects

- **Logi Workers** (`observability.enabled`): Cloudflare przechowuje logi i ślady żądań (adres, czas, status, komunikaty z `console`) zgodnie z ustawieniami konta. Kodów logowania nie logujemy poza trybem dev.
- **Maile** (Cloudflare Email Service): adres odbiorcy, temat i treść, czyli kod logowania albo powiadomienie o wysłanym briefie.
- **AI** (Google Gemini, `src/server/ai.ts`): tylko gdy osoba z agencji wyśle polecenie dla AI. Do modelu idzie opis briefu: pytania i **odpowiedzi klienta**, oraz treść polecenia. Bez klucza `GEMINI_API_KEY` nic nie jest wysyłane.
- **Przeglądarka**: ciasteczko `dh_session` (tylko agencja) i wybór motywu w `localStorage` (`dh-theme`). Nie ma analityki ani ciasteczek reklamowych.

## Czego jeszcze nie ma

- Usunięcia konta z danymi logowania (da się usuwać briefy, konta nie). Do czasu dodania tej funkcji robimy to ręcznie na prośbę.
- Limitu prób logowania na adres IP (limity są na adres e-mail).
- Automatycznego kasowania starych briefów: brief żyje, dopóki agencja go nie usunie.
