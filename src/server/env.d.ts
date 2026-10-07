// Sekret ustawiany przez .dev.vars lokalnie i `wrangler secret put GEMINI_API_KEY` na produkcji (klucz z Google AI Studio).
// Opcjonalny: bez niego działa wszystko poza poleceniami AI.
// DEV_EMAIL: tylko lokalnie, adres konta, na które aplikacja loguje się sama (domyślnie dev@designhouse.me).
// MAILPIT_URL: tylko lokalnie, adres Mailpita (np. http://127.0.0.1:8025); maile idą tam zamiast do Email Service.
declare namespace Cloudflare {
  interface Env {
    GEMINI_API_KEY?: string;
    DEV_EMAIL?: string;
    MAILPIT_URL?: string;
  }
}
interface Env {
  GEMINI_API_KEY?: string;
  DEV_EMAIL?: string;
  MAILPIT_URL?: string;
}
