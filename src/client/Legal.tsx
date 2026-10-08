import { IconArrowLeft } from "@tabler/icons-react";
import type { ReactNode } from "react";
import { BrandLockup, Wordmark } from "./Brand";
import { REPO_URL } from "./links";
import { onLinkClick } from "./router";

// Regulamin i polityka prywatności BriefFlow. Opisują to, co aplikacja naprawdę robi (docs/dane-i-logowanie.md).
// Dokumenty opisują publiczne MVP. Status roboczy pozostaje do potwierdzenia zasad powierzenia,
// retencji u dostawców i transferów danych; zmiany kodu dotyczące danych wymagają nowej wersji.

export const COMPANY = {
  name: "Design House Maciej Recław",
  address: "ul. Rzemieślnicza 11, 83-400 Skorzewo, Polska",
  nip: "5911724998",
  regon: "540365924",
  email: "maciej@designhouse.me",
} as const;

const LEGAL_VERSION = { version: "0.2 (wersja robocza)", since: "8 października 2026 r." } as const;

function CompanyData({ role }: { role: string }) {
  return (
    <dl className="legal-company">
      <dt>{role}</dt>
      <dd>{COMPANY.name}</dd>
      <dt>Adres</dt>
      <dd>{COMPANY.address}</dd>
      <dt>NIP / REGON</dt>
      <dd>
        {COMPANY.nip} / {COMPANY.regon}
      </dd>
      <dt>E-mail</dt>
      <dd>
        <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a>
      </dd>
    </dl>
  );
}

type Section = { id: string; title: string; body: ReactNode };

function LegalPage({ title, sections, other }: { title: string; sections: Section[]; other: { href: string; label: string } }) {
  return (
    <div className="site legal">
      <header className="site-nav">
        <a className="brand" href="/" aria-label="Design House BriefFlow, strona główna" onClick={(e) => onLinkClick(e, "/")}>
          <BrandLockup />
        </a>
        <a className="btn legal-back" href="/" onClick={(e) => onLinkClick(e, "/")}>
          <IconArrowLeft size={17} aria-hidden /> Strona główna
        </a>
      </header>
      <main className="legal-main">
        <h1>{title}</h1>
        <p className="legal-meta">
          Wersja {LEGAL_VERSION.version}, obowiązuje od {LEGAL_VERSION.since}
        </p>
        <p className="legal-draft">Wersja robocza. Tekst czeka na weryfikację prawną i może się jeszcze zmienić.</p>
        <nav className="legal-toc" aria-label="Spis treści">
          <ol>
            {sections.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`}>{s.title}</a>
              </li>
            ))}
          </ol>
        </nav>
        {sections.map((s, i) => (
          <section key={s.id} id={s.id} className="legal-section" aria-labelledby={`${s.id}-t`}>
            <h2 id={`${s.id}-t`}>
              {i + 1}. {s.title}
            </h2>
            {s.body}
          </section>
        ))}
        <p className="legal-other">
          Zobacz też: <a href={other.href} onClick={(e) => onLinkClick(e, other.href)}>{other.label}</a>
        </p>
      </main>
      <footer className="site-foot">
        <a className="foot-brand" href="https://designhouse.me" aria-label="Design House">
          <Wordmark />
        </a>
        <span>BriefFlow to narzędzie Design House. Briefy przechowujemy w UE.</span>
      </footer>
    </div>
  );
}

const PRIVACY: Section[] = [
  {
    id: "administrator",
    title: "Kto odpowiada za dane",
    body: (
      <>
        <CompanyData role="Operator BriefFlow i administrator danych konta" />
        <p>
          Design House odpowiada za dane potrzebne do prowadzenia konta, bezpieczeństwa aplikacji i obsługi kontaktu.
          W sprawach tych danych pisz na <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a>.
        </p>
        <p>
          O celu zbierania odpowiedzi w briefie decyduje osoba lub firma, która go wysłała. Gdy brief dotyczy jej projektu,
          to ona odpowiada za dane swoich klientów; BriefFlow udostępnia jej narzędzie do ich zapisania i obsługi.
          Jeśli brief wysłało Design House dla własnego projektu, administratorem tych odpowiedzi jest Design House.
          Pytania o wykorzystanie odpowiedzi w projekcie kieruj do nadawcy briefu.
        </p>
      </>
    ),
  },
  {
    id: "kogo",
    title: "Kogo dotyczą dane",
    body: (
      <ul>
        <li>
          <strong>Osoby wysyłające briefy</strong>, które logują się do aplikacji i tworzą briefy.
        </li>
        <li>
          <strong>Klienci</strong>, którzy wypełniają brief z otrzymanego linku. Klient nie zakłada konta.
        </li>
      </ul>
    ),
  },
  {
    id: "dane",
    title: "Jakie dane przetwarzamy",
    body: (
      <>
        <ul>
          <li>
            <strong>Logowanie osób wysyłających briefy</strong>: adres e-mail, skrót jednorazowego kodu z maila i skrót tokenu
            sesji. W bazie aplikacji zapisujemy skróty, a nie same kody i tokeny sesji. Kod jest też treścią wysyłanego maila.
          </li>
          <li>
            <strong>Treść briefu</strong>: tytuł, nazwa klienta, sekcje i pytania, odpowiedzi, czas każdej odpowiedzi i informacja, czy odpowiedział klient,
            czy osoba wysyłająca brief. Odpowiedzi mogą zawierać dane osobowe, które klient sam wpisze, na przykład nazwę firmy, adres
            czy link do plików. Prosimy, by w briefie nie podawać danych szczególnych kategorii (np. o zdrowiu).
          </li>
          <li>
            <strong>Zapis zmian briefu</strong>: kto i kiedy odpowiedział albo zmienił pytania, opisy zmian i kopie pytań potrzebne
            do cofania. Opisy mogą zawierać treść odpowiedzi. Rozbudowanego widoku historii nie ma w aplikacji.
          </li>
          <li>
            <strong>Ustawienia konta</strong>: opcjonalne logo nadawcy oraz własne szablony sekcji i pytań. Materiały klienta pozostają linkami do plików.
          </li>
          <li><strong>Wykorzystanie usługi</strong>: liczba aktywnych briefów i licznik poleceń AI w danym miesiącu, potrzebne do obsługi limitów konta.</li>
          <li>
            <strong>Dane techniczne</strong>: przy każdym żądaniu serwery Cloudflare przetwarzają adres IP, czas, adres
            podstrony i typ przeglądarki. Są potrzebne, żeby aplikacja działała i była chroniona przed nadużyciami.
          </li>
        </ul>
        <p>
          Nie używamy analityki ani ciasteczek reklamowych. Nie podejmujemy decyzji wywołujących skutki prawne na podstawie
          automatycznej oceny odpowiedzi. Wydruk PDF i kopiowanie podsumowania odbywają się w przeglądarce; pobrana kopia
          pozostaje u osoby eksportującej.
        </p>
      </>
    ),
  },
  {
    id: "cele",
    title: "Cele i podstawy prawne",
    body: (
      <>
      <ul>
        <li>
          <strong>Prowadzenie konta i udostępnianie funkcji BriefFlow</strong>, w tym zapis briefów, szablonów i logo,
          wysyłka kodów logowania i powiadomienie o wysłanym briefie: wykonanie umowy o korzystanie z narzędzia
          (art. 6 ust. 1 lit. b RODO).
        </li>
        <li>
          <strong>Bezpieczeństwo aplikacji</strong>, kontrola limitów, zapobieganie nadużyciom oraz dochodzenie lub obrona
          roszczeń: prawnie uzasadniony interes (art. 6 ust. 1 lit. f RODO).
        </li>
        <li>
          <strong>Obsługa wiadomości i reklamacji</strong>: wykonanie umowy, gdy kontakt dotyczy konta, oraz prawnie
          uzasadniony interes w udzieleniu odpowiedzi i wyjaśnieniu zgłoszenia (art. 6 ust. 1 lit. b lub f RODO).
        </li>
      </ul>
      <p>
        Adres e-mail jest niezbędny do utworzenia i używania konta. Logo i własne szablony są opcjonalne. Klient może
        pominąć pytanie lub zaznaczyć „Nie wiem”. Podstawę wykorzystania odpowiedzi do oferty lub projektu określa
        nadawca briefu i powinien poinformować o niej swojego klienta.
      </p>
      </>
    ),
  },
  {
    id: "odbiorcy",
    title: "Komu powierzamy dane",
    body: (
      <>
        <ul>
          <li>
            Cloudflare, Inc.: hosting aplikacji i przechowywanie briefów oraz kont.
          </li>
          <li>
            Resend: wysyłka kodów logowania i powiadomień o wysłanym briefie, obejmująca adres odbiorcy, temat i treść wiadomości.
            Powiadomienie zawiera nazwę briefu, klienta i stan odpowiedzi, bez pełnego zestawu odpowiedzi. Konfiguracja
            aplikacji pozwala też używać Cloudflare Email Service jako alternatywnego transportu maili.
          </li>
          <li>
            Google (Gemini API): tylko gdy osoba wysyłająca brief użyje polecenia dla AI, które zmienia pytania briefu. Do
            modelu trafia wtedy opis briefu, w tym odpowiedzi klienta, i treść polecenia. AI nie odpowiada za klienta.
          </li>
          <li>dostawca naszej poczty e-mail: korespondencja;</li>
          <li>doradcy prawni, księgowi i techniczni, gdy jest to potrzebne.</li>
        </ul>
        <p>
          Odpowiedzi widzi właściciel konta oraz każda osoba, która ma działający link do tego briefu. Logo nadawcy widzą
          także klienci korzystający z tego linku. Nie sprzedajemy danych i nie przekazujemy ich innym firmom do ich
          własnego marketingu.
        </p>
      </>
    ),
  },
  {
    id: "eog",
    title: "Gdzie są dane",
    body: (
      <p>
        Briefy i konta są zapisane i przechowywane w Unii Europejskiej (jurysdykcja UE w Cloudflare Durable Objects).
        Same żądania obsługują serwery Cloudflare najbliżej użytkownika, także poza Europejskim Obszarem Gospodarczym, a
        dostawcy wysyłki maili i Google mogą przetwarzać przekazane im dane poza EOG. Sam zapis briefu w UE nie oznacza,
        że każda operacja odbywa się wyłącznie w UE. Zasady transferów oraz retencji u tych dostawców wymagają jeszcze
        potwierdzenia dla konfiguracji tej usługi; dlatego dokument pozostaje wersją roboczą.
      </p>
    ),
  },
  {
    id: "okres",
    title: "Jak długo przechowujemy dane",
    body: (
      <ul>
        <li>Kod logowania: ważny 10 minut; zapis usuwamy najpóźniej przy kolejnej prośbie o kod po 24 godzinach.</li>
        <li>Sesja logowania: 30 dni albo do wylogowania.</li>
        <li>
          Brief z odpowiedziami i zapisem zmian: do usunięcia przez właściciela konta. Zakończenie briefu zwalnia miejsce
          w limicie, ale nie usuwa danych i nie wyłącza linku klienta. Nie kasujemy automatycznie starych briefów.
        </li>
        <li>Logo i własne szablony: do ich usunięcia w aplikacji albo usunięcia konta.</li>
        <li>Rejestr wykorzystanych poleceń AI: do usunięcia konta. Poprzednie miesiące nie wpływają na aktualny limit. Tymczasowe rezerwacje operacji wygasają po 3 minutach i są czyszczone przy kolejnych operacjach na limicie.</li>
        <li>Konto osoby wysyłającej briefy: do usunięcia na prośbę właściciela wysłaną na adres kontaktowy powyżej. Nie ma jeszcze przycisku usunięcia całego konta.</li>
        <li>Logi techniczne i kopie wiadomości u dostawców: okres zależy od ustawień i warunków dostawcy; nie oznacza to dodatkowego archiwum briefów w aplikacji.</li>
        <li>Kopie pobrane jako PDF lub skopiowane z podsumowania: zgodnie z zasadami osoby, która je pobrała. Usunięcie briefu nie usuwa takich kopii.</li>
      </ul>
    ),
  },
  {
    id: "prawa",
    title: "Twoje prawa",
    body: (
      <>
        <p>
          Masz prawo dostępu do danych, ich sprostowania, usunięcia, ograniczenia przetwarzania, przeniesienia oraz
          sprzeciwu wobec przetwarzania opartego na prawnie uzasadnionym interesie. Napisz na{" "}
          <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a>.
        </p>
        <p>
          Gdy sprawa dotyczy odpowiedzi w briefie wysłanym przez inną firmę, zwróć się także do nadawcy, który decyduje
          o ich wykorzystaniu. Możesz złożyć skargę do Prezesa Urzędu Ochrony Danych Osobowych
          (ul. Stanisława Moniuszki 1A, 00-014 Warszawa). Informacje: <a href="https://uodo.gov.pl/p/kontakt">uodo.gov.pl</a>.
        </p>
      </>
    ),
  },
  {
    id: "cookies",
    title: "Ciasteczka i pamięć przeglądarki",
    body: (
      <ul>
        <li>
          <strong>dh_session</strong>: ciasteczko sesji osoby wysyłającej briefy, niezbędne do logowania, ważne 30 dni. Klient go
          nie potrzebuje, żeby wypełniać brief. Jeżeli wcześniej zalogował się jako nadawca, przeglądarka może nadal mieć tę sesję.
        </li>
        <li>
          <strong>dh-theme</strong> w pamięci przeglądarki: wybrany jasny albo ciemny motyw. Nie jest wysyłany do nas.
        </li>
      </ul>
    ),
  },
  {
    id: "zmiany",
    title: "Zmiany polityki",
    body: <p>Gdy zmieni się zakres przetwarzania danych, zaktualizujemy tę politykę, datę i wersję u góry strony.</p>,
  },
];

const TERMS: Section[] = [
  {
    id: "uslugodawca",
    title: "Usługodawca",
    body: (
      <>
        <CompanyData role="Usługodawca" />
        <p>
          Regulamin określa zasady korzystania z aplikacji BriefFlow, w której osoby wysyłające briefy przygotowują z
          klientami briefy projektów.
        </p>
      </>
    ),
  },
  {
    id: "kto",
    title: "Kto korzysta z BriefFlow",
    body: (
      <ul>
        <li>
          <strong>Osoby wysyłające briefy</strong> logują się adresem e-mail i jednorazowym kodem z maila.
          Tworzą briefy, zmieniają pytania i wysyłają klientom linki.
        </li>
        <li>
          <strong>Klienci</strong> wchodzą przez link otrzymany od osoby wysyłającej brief i odpowiadają na pytania jednego briefu. Klient
          nie zakłada konta i nie płaci za korzystanie z BriefFlow.
        </li>
      </ul>
    ),
  },
  {
    id: "zakres",
    title: "Zakres bezpłatnej wersji",
    body: (
      <>
        <p>
          BriefFlow pozwala tworzyć briefy, edytować sekcje i pytania, zbierać odpowiedzi przez link klienta oraz
          korzystać z własnego logo i szablonów. Odpowiedzi można skopiować lub wydrukować w układzie A4 i zapisać
          jako PDF w przeglądarce. Materiały klienta podaje się linkami; nie są wgrywane do BriefFlow.
        </p>
        <ul>
          <li>
            Jedno konto może mieć do <strong>3 aktywnych briefów</strong>. Aktywny brief nie został jeszcze zakończony
            przez właściciela ani wysłany przyciskiem „Gotowe” przez klienta. Zakończone briefy nadal można czytać
            i edytować; nie zajmują miejsca w tym limicie. Zakończenie nie unieważnia linku klienta.
          </li>
          <li>
            Konto ma do <strong>10 poleceń AI na miesiąc kalendarzowy</strong>, liczony według czasu w Warszawie.
            Do limitu zalicza się poprawna odpowiedź AI, także wyjaśnienie bez zmiany pytań. Błąd, przekroczenie czasu
            lub wynik odrzucony z powodu równoczesnej zmiany pytań nie zużywa polecenia. Trwające polecenie zajmuje
            tymczasowo miejsce w limicie.
          </li>
          <li>Jedno konto należy do jednego adresu e-mail. Nie ma zespołów, ról współpracowników ani wspólnego konta agencji.</li>
          <li>Link klientowi wysyłasz sam. Aplikacja nie wysyła zaproszeń ani automatycznych przypomnień.</li>
        </ul>
        <p>Bezpłatna wersja nie wymaga karty płatniczej. Większy zakres lub wdrożenie dla agencji wymagają osobnych ustaleń.</p>
      </>
    ),
  },
  {
    id: "konto",
    title: "Założenie konta i zakończenie korzystania",
    body: (
      <>
        <p>
          Konto jest dostępne dla osoby mającej dostęp do podanej skrzynki e-mail. Po pierwszym poprawnym
          wpisaniu kodu można korzystać z aplikacji. Regulamin jest dostępny bez logowania; można zapisać go
          lub wydrukować za pomocą przeglądarki.
        </p>
        <p>
          W każdej chwili możesz się wylogować, usunąć własne briefy, logo i szablony albo zakończyć korzystanie
          z narzędzia. Aby usunąć całe konto, napisz z jego adresu e-mail na <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a>.
          Wylogowanie nie usuwa danych, a usunięcie briefu wyłącza dostęp do niego dla klienta.
        </p>
      </>
    ),
  },
  {
    id: "zasady",
    title: "Zasady korzystania",
    body: (
      <ul>
        <li>
          Link do briefu działa jak klucz: każdy, kto go ma, może zobaczyć i zmienić odpowiedzi. Nie udostępniaj go osobom,
          które nie powinny brać udziału w briefie.
        </li>
        <li>Odpowiedzi zapisują się od razu. Do briefu można wracać tym samym linkiem i zmieniać odpowiedzi.</li>
        <li>„Nie wiem” i „Pomiń na razie” są pełnoprawnymi odpowiedziami; pominięte pytania można uzupełnić później.</li>
        <li>
          Nie wpisuj w briefie treści bezprawnych ani danych szczególnych kategorii (np. o zdrowiu). Wpisuj dane, do których
          podania masz prawo.
        </li>
        <li>Wgrywaj tylko logo, do którego używania masz prawo. Nie podawaj w briefach haseł, kodów dostępu ani danych kart płatniczych.</li>
        <li>Nie obchodź limitów ani zabezpieczeń i nie używaj aplikacji do rozsyłania niezamówionych wiadomości.</li>
        <li>Wysłanie briefu nie jest zawarciem umowy. Brief służy przygotowaniu oferty i projektu.</li>
      </ul>
    ),
  },
  {
    id: "ai",
    title: "Polecenia dla AI",
    body: (
      <>
      <p>
        Osoby wysyłające briefy mogą zmieniać pytania briefu poleceniem dla AI (model Google Gemini). AI zmienia tylko zestaw
        pytań i tylko na polecenie; nie odpowiada za klienta i nie zmienia jego odpowiedzi. Ostatnią zmianę pytań można cofnąć.
      </p>
      <p>
        Do modelu trafia treść polecenia i opis bieżącego briefu, obejmujący pytania oraz odpowiedzi.
        Korzystaj z AI tylko wtedy, gdy możesz przekazać te dane dostawcy modelu. Przejrzyj wynik przed wysłaniem
        briefu klientowi. Po wykorzystaniu limitu nadal możesz edytować pytania ręcznie.
      </p>
      </>
    ),
  },
  {
    id: "techniczne",
    title: "Wymagania techniczne",
    body: (
      <p>
        Wystarczy aktualna przeglądarka z włączonym JavaScriptem i połączenie z internetem, na komputerze albo telefonie.
        Osoby wysyłające briefy potrzebują dostępu do skrzynki, na którą przychodzi kod logowania. Logowanie wymaga
        obsługi ciasteczka sesji. Eksport PDF wymaga funkcji drukowania lub zapisu do PDF w przeglądarce.
      </p>
    ),
  },
  {
    id: "dostepnosc",
    title: "Dostępność i odpowiedzialność",
    body: (
      <p>
        Mogą wystąpić przerwy techniczne albo niedostępność wysyłki maili i AI. Nie gwarantujemy nieprzerwanej dostępności
        ani konkretnego czasu dostarczenia wiadomości. Sprawdzaj komunikaty o zapisie i połączeniu; odpowiedź wymagająca
        ponownego wysłania może nie być jeszcze zapisana. Możesz zachować własną kopię briefu przez eksport.
        Dbaj o bezpieczeństwo skrzynki logowania i linków klienta. Te postanowienia nie wyłączają odpowiedzialności,
        której nie można ograniczyć na podstawie obowiązujących przepisów.
      </p>
    ),
  },
  {
    id: "reklamacje",
    title: "Reklamacje",
    body: (
      <p>
        Uwagi i reklamacje dotyczące działania BriefFlow wysyłaj na <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a>.
        Podaj adres konta, opisz problem i wskaż, jakiej pomocy potrzebujesz. Nie przesyłaj kodu logowania ani linku
        klienta, jeśli nie jest potrzebny do wyjaśnienia sprawy. Odpowiadamy w ciągu 14 dni od otrzymania reklamacji.
      </p>
    ),
  },
  {
    id: "kod",
    title: "Kod źródłowy i znaki",
    body: (
      <p>
        Kod BriefFlow jest udostępniony na licencji Apache 2.0 (<a href={REPO_URL}>repozytorium</a>), z obowiązkiem
        zachowania informacji o autorstwie z pliku NOTICE. Licencja nie obejmuje nazwy i logo Design House.
      </p>
    ),
  },
  {
    id: "dane",
    title: "Dane osobowe",
    body: (
      <>
      <p>
        Zasady przetwarzania danych opisuje <a href="/prywatnosc" onClick={(e) => onLinkClick(e, "/prywatnosc")}>polityka prywatności</a>.
      </p>
      <p>
        Jeśli używasz BriefFlow do zbierania danych swoich klientów, odpowiadasz za podstawę ich pozyskania,
        przekazanie klientom informacji o przetwarzaniu oraz zasady używania materiałów. Udostępnienie narzędzia
        nie zastępuje obowiązków administratora ani ustalenia warunków powierzenia danych.
      </p>
      </>
    ),
  },
  {
    id: "koncowe",
    title: "Postanowienia końcowe",
    body: (
      <p>
        Regulamin podlega prawu polskiemu. O zmianach informujemy, zmieniając wersję u góry strony. Regulamin nie
        ogranicza praw, które przysługują konsumentom na podstawie przepisów.
      </p>
    ),
  },
];

export function PrivacyPage() {
  return <LegalPage title="Polityka prywatności" sections={PRIVACY} other={{ href: "/regulamin", label: "Regulamin" }} />;
}

export function TermsPage() {
  return <LegalPage title="Regulamin" sections={TERMS} other={{ href: "/prywatnosc", label: "Polityka prywatności" }} />;
}
