// Sekret ustawiany przez .dev.vars lokalnie i `wrangler secret put GEMINI_API_KEY` na produkcji (klucz z Google AI Studio).
// Opcjonalny: bez niego działa wszystko poza poleceniami AI.
// DEV_EMAIL: tylko lokalnie, adres konta, na które aplikacja loguje się sama (domyślnie dev@designhouse.me).
declare namespace Cloudflare {
  interface Env {
    GEMINI_API_KEY?: string;
    DEV_EMAIL?: string;
  }
}
interface Env {
  GEMINI_API_KEY?: string;
  DEV_EMAIL?: string;
}
