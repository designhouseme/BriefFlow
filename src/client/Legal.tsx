import { IconArrowLeft } from "@tabler/icons-react";
import type { ReactNode } from "react";
import { BrandLockup, Wordmark } from "./Brand";
import { REPO_URL } from "./links";
import { onLinkClick } from "./router";

// Regulamin i polityka prywatności BriefFlow. Opisują to, co aplikacja naprawdę robi (docs/dane-i-logowanie.md).
// To wersje robocze do sprawdzenia przez prawnika; zmiana kodu, który dotyka danych, oznacza zmianę tych tekstów
// i nową wersję w LEGAL_VERSION.

export const COMPANY = {
  name: "Design House Maciej Recław",
  address: "ul. Rzemieślnicza 11, 83-400 Skorzewo, Polska",
  nip: "5911724998",
  regon: "540365924",
  email: "maciej@designhouse.me",
} as const;

const LEGAL_VERSION = { version: "0.1 (wersja robocza)", since: "7 października 2026 r." } as const;

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
    title: "Administrator danych",
    body: (
      <>
        <CompanyData role="Administrator" />
        <p>
          Polityka dotyczy aplikacji BriefFlow, w której Design House przygotowuje briefy projektów z klientami. W sprawach
          danych osobowych pisz na <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a>.
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
          <strong>Osoby z Design House</strong>, które logują się do aplikacji i tworzą briefy.
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
            <strong>Logowanie osób z Design House</strong>: adres e-mail, skrót jednorazowego kodu z maila i skrót tokenu
            sesji. Samych kodów i tokenów sesji nie przechowujemy.
          </li>
          <li>
            <strong>Treść briefu</strong>: odpowiedzi na pytania, czas każdej odpowiedzi i informacja, czy odpowiedział klient,
            czy Design House. Odpowiedzi mogą zawierać dane osobowe, które klient sam wpisze, na przykład nazwę firmy, adres
            czy link do plików. Prosimy, by w briefie nie podawać danych szczególnych kategorii (np. o zdrowiu).
          </li>
          <li>
            <strong>Historia zmian briefu</strong>: kto i kiedy odpowiedział albo zmienił pytania.
          </li>
          <li>
            <strong>Dane techniczne</strong>: przy każdym żądaniu serwery Cloudflare przetwarzają adres IP, czas, adres
            podstrony i typ przeglądarki. Są potrzebne, żeby aplikacja działała i była chroniona przed nadużyciami.
          </li>
        </ul>
        <p>Nie używamy analityki, ciasteczek reklamowych ani profilowania.</p>
      </>
    ),
  },
  {
    id: "cele",
    title: "Cele i podstawy prawne",
    body: (
      <ul>
        <li>
          <strong>Przygotowanie oferty i realizacja projektu</strong> na podstawie briefu: działania na żądanie klienta przed
          zawarciem umowy i wykonanie umowy (art. 6 ust. 1 lit. b RODO). Gdy klient wypełnia brief w imieniu firmy,
          podstawą jest też nasz prawnie uzasadniony interes w kontakcie z tą firmą (art. 6 ust. 1 lit. f RODO).
        </li>
        <li>
          <strong>Logowanie i bezpieczeństwo aplikacji</strong>, zapobieganie nadużyciom oraz dochodzenie lub obrona
          roszczeń: prawnie uzasadniony interes (art. 6 ust. 1 lit. f RODO).
        </li>
        <li>
          <strong>Powiadomienie e-mailem</strong>, że klient wysłał brief: prawnie uzasadniony interes w sprawnej obsłudze
          projektu (art. 6 ust. 1 lit. f RODO).
        </li>
      </ul>
    ),
  },
  {
    id: "odbiorcy",
    title: "Komu powierzamy dane",
    body: (
      <>
        <ul>
          <li>
            Cloudflare, Inc.: hosting aplikacji, przechowywanie briefów i kont oraz wysyłka maili (kody logowania,
            powiadomienia).
          </li>
          <li>
            Google (Gemini API): tylko gdy osoba z Design House użyje polecenia dla AI, które zmienia pytania briefu. Do
            modelu trafia wtedy opis briefu, w tym odpowiedzi klienta, i treść polecenia. AI nie odpowiada za klienta.
          </li>
          <li>dostawca naszej poczty e-mail: korespondencja;</li>
          <li>doradcy prawni, księgowi i techniczni, gdy jest to potrzebne.</li>
        </ul>
        <p>Nie sprzedajemy danych i nie przekazujemy ich innym firmom do ich własnego marketingu.</p>
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
        Google może przetwarzać dane wysłane do Gemini poza EOG. Korzystamy wtedy z mechanizmów RODO: decyzji Komisji
        Europejskiej (EU-US Data Privacy Framework) albo standardowych klauzul umownych, zależnie od dostawcy.
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
          Brief z odpowiedziami i historią: do czasu jego usunięcia przez Design House, a w zakresie potrzebnym do
          realizacji projektu i obrony roszczeń przez czas przedawnienia roszczeń.
        </li>
        <li>Konto osoby z Design House: do zakończenia współpracy albo na prośbę o usunięcie.</li>
        <li>Logi techniczne: przez okres ustawiony w Cloudflare, nie dłużej niż jest to potrzebne do bezpieczeństwa.</li>
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
          Możesz też złożyć skargę do Prezesa Urzędu Ochrony Danych Osobowych (ul. Stawki 2, 00-193 Warszawa, uodo.gov.pl).
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
          <strong>dh_session</strong>: ciasteczko sesji osoby z Design House, niezbędne do logowania, ważne 30 dni. Klient go
          nie dostaje.
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
    body: <p>Gdy zmieni się to, co aplikacja robi z danymi, zmienimy tę politykę i jej wersję u góry strony.</p>,
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
          Regulamin określa zasady korzystania z aplikacji BriefFlow, w której Design House przygotowuje z
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
          <strong>Osoby z Design House</strong> logują się adresem e-mail w domenie Design House i jednorazowym kodem z maila.
          Tworzą briefy, zmieniają pytania i wysyłają klientom linki.
        </li>
        <li>
          <strong>Klienci</strong> wchodzą przez link otrzymany od Design House i odpowiadają na pytania jednego briefu. Klient
          nie zakłada konta i nie płaci za korzystanie z BriefFlow.
        </li>
      </ul>
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
        <li>Wysłanie briefu nie jest zawarciem umowy. Brief służy przygotowaniu oferty i projektu.</li>
      </ul>
    ),
  },
  {
    id: "ai",
    title: "Polecenia dla AI",
    body: (
      <p>
        Osoby z Design House mogą zmieniać pytania briefu poleceniem dla AI (model Google Gemini). AI zmienia tylko zestaw
        pytań i tylko na polecenie; nie odpowiada za klienta i nie zmienia jego odpowiedzi. Każde polecenie można cofnąć.
      </p>
    ),
  },
  {
    id: "techniczne",
    title: "Wymagania techniczne",
    body: (
      <p>
        Wystarczy aktualna przeglądarka z włączonym JavaScriptem i połączenie z internetem, na komputerze albo telefonie.
        Osoby z Design House potrzebują dostępu do skrzynki, na którą przychodzi kod logowania.
      </p>
    ),
  },
  {
    id: "dostepnosc",
    title: "Dostępność i odpowiedzialność",
    body: (
      <p>
        Dbamy o to, żeby BriefFlow działał bez przerw, ale mogą zdarzyć się przerwy techniczne, w tym po stronie Cloudflare.
        Odpowiedzi zapisane przed przerwą zostają w briefie. Nie odpowiadamy za skutki udostępnienia linku do briefu
        osobom trzecim przez osobę, która go otrzymała.
      </p>
    ),
  },
  {
    id: "reklamacje",
    title: "Reklamacje",
    body: (
      <p>
        Uwagi i reklamacje dotyczące działania BriefFlow wysyłaj na <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a>.
        Odpowiadamy w ciągu 14 dni.
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
      <p>
        Zasady przetwarzania danych opisuje <a href="/prywatnosc" onClick={(e) => onLinkClick(e, "/prywatnosc")}>polityka prywatności</a>.
      </p>
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
