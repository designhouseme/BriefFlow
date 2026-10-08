# Logowanie i dane na Cloudflare

Opis tego, jak działa logowanie i co dokładnie BriefFlow zapisuje. Źródłem prawdy jest kod: `src/server/auth.ts`, `src/server/accounts.ts`, `src/server/account-quotas.ts`, `src/server/brief-agent.ts`, `src/server/emails.ts`, `src/server/ai.ts`. Zmiana w tych plikach oznacza zmianę tego dokumentu i polityki prywatności (`src/client/Legal.tsx`).

## Dwie role, dwa sposoby wejścia

| Kto | Jak wchodzi | Co może |
|---|---|---|
| Nadawca briefu | adres e-mail + 6-cyfrowy kod z maila, potem ciasteczko sesji | tworzy, edytuje, kończy i usuwa swoje briefy, dodaje logo, zapisuje szablony, wysyła polecenia do AI |
| Klient | link z tokenem `?k=…`, bez konta | odpowiada na pytania jednego briefu, wysyła brief |

Domyślnie można zalogować się dowolnym adresem e-mail. `ALLOWED_EMAIL_DOMAINS` pozwala opcjonalnie ograniczyć dostęp do wskazanych domen. Każdy adres ma osobne konto, bez zespołów i ról współpracowników.

Bezpłatne konto ma do **3 aktywnych briefów** oraz **10 poleceń AI w miesiącu kalendarzowym według Europe/Warsaw**. Aktywny brief nie ma `completedAt`. Wysłanie przez klienta lub zakończenie przez właściciela zwalnia miejsce, ale zachowuje odpowiedzi i działający link. Zakończony brief pozostaje do odczytu i edycji; nie ma osobnej operacji ponownego otwarcia. Do limitu AI liczy się poprawna odpowiedź dostawcy, także wyjaśnienie bez zmian; błąd, timeout lub wynik odrzucony po równoczesnej zmianie pytań nie zużywa limitu. Limity konta nie blokują odpowiadania klientom w już utworzonych briefach.

## Role w przetwarzaniu danych

Design House jest operatorem narzędzia oraz administratorem danych konta, kontaktu i bezpieczeństwa. Nadawca briefu określa cele zbierania danych swoich klientów i odpowiada za ich podstawę oraz obowiązek informacyjny. Gdy narzędzia używa inna agencja, nie można opisywać każdego briefu jako projektu realizowanego przez Design House. Przy projektach własnych Design House może występować także jako administrator odpowiedzi.

Techniczny opis poniżej nie dowodzi zawarcia umów powierzenia ani podstaw transferów międzynarodowych. Warunki powierzenia z nadawcami, umowy i konfiguracja dostawców oraz retencja poza bazą aplikacji wymagają potwierdzenia przez właściciela usługi. Do tego czasu regulamin i polityka pozostają oznaczone jako robocze.

## Logowanie kodem z maila

1. `POST /api/auth/start { email }`: adres jest normalizowany (małe litery, bez spacji) i sprawdzany względem dozwolonych domen. Konto to instancja `AccountStore` nazwana skrótem SHA-256 adresu, więc sam adres nie trafia do identyfikatorów.
2. Generujemy kod 6-cyfrowy. Zapisujemy **tylko skrót** `SHA-256(adres:kod)`, czas ważności 10 minut i licznik prób. Nowy kod unieważnia poprzednie. Limity: następny kod najwcześniej po 30 s, najwyżej 5 kodów na godzinę na adres.
3. Kod idzie mailem przez Resend, gdy ustawiono `RESEND_API_KEY`; bez tego sekretu przez Cloudflare Email Service. Lokalnie z `MAILPIT_URL` trafia do Mailpita.
4. `POST /api/auth/verify { email, code }`: najwyżej 5 prób na kod, porównanie w stałym czasie, kod działa raz.
5. Po poprawnym kodzie tworzymy losowy token sesji (32 znaki), zapisujemy **tylko jego skrót** i ustawiamy ciasteczko `dh_session`: `HttpOnly`, `SameSite=Lax`, `Secure` na HTTPS, ważne 30 dni. Wylogowanie usuwa sesję z bazy i czyści ciasteczko.

Zabezpieczenia żądań:

- Zapisy JSON przyjmują `application/json`; upload logo używa surowego PNG/JPEG/WebP. Zapisy na koncie i operacje na briefach sprawdzają własny `Origin`, a ciasteczko ma `SameSite=Lax`.
- WebSocket agencji wymaga nagłówka `Origin` równego adresowi aplikacji (ciasteczko leci też z cudzych stron).
- Token agencji briefu nie trafia do przeglądarki: Worker sprawdza sesję i dokleja go do połączenia po stronie serwera.
- Przeglądarka nie może nadpisać stanu briefu; każda zmiana idzie przez metodę `@callable` ze sprawdzeniem roli.

Lokalnie (`pnpm dev`) aplikacja loguje się sama na konto deweloperskie (`DEV_EMAIL`). Ta ścieżka jest pod `import.meta.env.DEV` i nie ma jej w buildzie produkcyjnym; tak samo trasa `POST /api/dev/emails` i wysyłka do Mailpita.

## Co przechowujemy

Na produkcji oba rodzaje Durable Objects działają w jurysdykcji `eu`: dane są zapisane i przechowywane w Unii Europejskiej. Sam Worker (obsługa żądań) działa na serwerach Cloudflare najbliżej użytkownika.

### Konto nadawcy briefu (`AccountStore`, SQLite)

| Tabela | Pola | Jak długo |
|---|---|---|
| `profile` | adres e-mail (jawnie), opcjonalne logo konta (PNG/JPEG/WebP, do 512 KiB) | dopóki istnieje konto; logo można usunąć w aplikacji |
| `templates` | nazwa, opis, sekcje i pytania własnego szablonu, czasy utworzenia i zmiany | dopóki szablon lub konto nie zostaną usunięte; odpowiedzi klienta nie są zapisywane w szablonie |
| `codes` | skrót kodu, czas utworzenia i wygaśnięcia, liczba prób, czy użyty | kod wygasa po 10 min; wiersze starsze niż 24 h kasujemy przy kolejnej prośbie o kod |
| `sessions` | skrót tokenu sesji, czas utworzenia i wygaśnięcia | 30 dni; wygasłe kasujemy przy kolejnym logowaniu, wylogowanie kasuje od razu |
| `briefs` | id, tytuł, nazwa klienta, szablon, **token agencji i token klienta (jawnie)**, czasy, postęp, czas wysłania | dopóki brief nie zostanie usunięty |
| `brief_reservations` | id briefu, identyfikator operacji tworzenia i czas wygaśnięcia; tymczasowo zajmuje miejsce w limicie | rezerwacja wygasa po 3 min; wygasłe zapisy są kasowane przy sprawdzaniu lub zmianie wykorzystania limitu |
| `ai_usage` | identyfikator polecenia, id briefu, miesiąc Europe/Warsaw, stan `reserved` / `used`, czas wygaśnięcia rezerwacji | rezerwacje wygasają po 3 min i są kasowane przy operacjach na limicie; użyte polecenia pozostają do usunięcia konta, a starsze miesiące nie zajmują obecnego limitu |

Konto zapisuje też wykorzystanie limitu AI i rezerwacje poleceń. Liczba aktywnych briefów wynika z listy briefów oraz braku czasu zakończenia; zakończenie nie jest usunięciem ani blokadą dostępu. `/api/me` oraz `GET /api/account/usage` zwracają wykorzystanie limitów i czas odnowienia AI. Trwająca operacja tymczasowo rezerwuje miejsce, aby jednoczesne prośby nie przekroczyły limitu.

Tokeny briefów leżą jawnie, bo to klucze dostępu, których serwer potrzebuje (link klienta, połączenie agencji). Konto nie jest dostępne z przeglądarki; woła je tylko Worker i agent briefu.

### Brief (`BriefAgent`, Agents SDK, SQLite)

| Gdzie | Co |
|---|---|
| stan agenta | tytuł, nazwa klienta, sekcje i pytania, **odpowiedzi klienta i agencji** (wartość, kto, kiedy), czas wysłania |
| `meta` | token agencji, token klienta, właściciel (skrót konta), adres aplikacji do linków w mailach |
| `history` | kopia pytań sprzed każdej zmiany struktury (do cofania): kto, kiedy, opis |
| `events` | wewnętrzny dziennik zmian: kto, kiedy, opis, w tym treść odpowiedzi; rozbudowany widok historii usunięto z interfejsu |

Usunięcie briefu w aplikacji kasuje całą instancję (wszystkie tabele i stan) oraz wiersz na liście konta.

Logo konta widzi właściciel i klient z ważnym linkiem do jego briefu. Materiały klienta pozostają linkami do plików poza aplikacją; BriefFlow nie pobiera ich automatycznie. Eksport PDF i kopiowanie podsumowania działają w przeglądarce, na urządzeniu osoby eksportującej. Osobny podgląd A4 zachowuje widoczne sekcje i pytania, statusy odpowiedzi, polskie znaki, logo i klikalne linki. PDF zapisuje użytkownik z systemowego okna drukowania, a nie serwer. Usunięcie briefu nie usuwa kopii wcześniej pobranych przez użytkownika.

### Poza Durable Objects

- **Logi Workers** (`observability.enabled`): Cloudflare przechowuje logi i ślady żądań (adres, czas, status, komunikaty z `console`) zgodnie z ustawieniami konta. Kodów logowania nie logujemy poza trybem dev.
- **Maile** (Resend lub Cloudflare Email Service): adres odbiorcy, temat i treść, czyli kod logowania albo powiadomienie o wysłanym briefie. Lokalny Mailpit ma pierwszeństwo w dev; klucz Resend pozostaje sekretem serwera.
- **AI** (Google Gemini, `src/server/ai.ts`): tylko gdy osoba z agencji wyśle polecenie dla AI. Do modelu idzie opis briefu: pytania i **odpowiedzi klienta**, oraz treść polecenia. Bez klucza `GEMINI_API_KEY` nic nie jest wysyłane.
- **Przeglądarka**: ciasteczko `dh_session` (tylko agencja) i wybór motywu w `localStorage` (`dh-theme`). Nie ma analityki ani ciasteczek reklamowych.

## Co wymaga potwierdzenia przed zdjęciem statusu roboczego dokumentów

- Warunki powierzenia danych nadawców korzystających z publicznej usługi oraz właściwe obowiązki Design House jako operatora.
- Obowiązujące umowy z Cloudflare, Resend i dostawcą Gemini, konfiguracja Gemini (w tym zasady używania treści przez dostawcę) oraz rzeczywiste podstawy transferów poza EOG. Samo `jurisdiction: "eu"` określa lokalizację zapisu Durable Objects, nie całość przetwarzania.
- Rzeczywisty czas przechowywania logów Workers i kopii maili u dostawcy; kod nie określa tych wartości. Nie obiecujemy zmyślonego czasu usunięcia ani zawarcia niepotwierdzonych umów.

Źródła do weryfikacji prawnej: [RODO, w szczególności art. 13 i 28](https://eur-lex.europa.eu/eli/reg/2016/679/oj), [ustawa o świadczeniu usług drogą elektroniczną, art. 8](https://eli.gov.pl/api/acts/DU/2024/1513/text.html), [aktualny kontakt do UODO](https://uodo.gov.pl/p/kontakt). Opis funkcji wynika z kodu; ten dokument nie potwierdza przeglądu przez prawnika.

## Czego jeszcze nie ma

- Usunięcia konta z danymi logowania (da się usuwać briefy, konta nie). Do czasu dodania tej funkcji robimy to ręcznie na prośbę.
- Limitu prób logowania na adres IP (limity są na adres e-mail).
- Automatycznego kasowania starych briefów: brief żyje, dopóki agencja go nie usunie.
