// Sekret ustawiany przez .dev.vars lokalnie i `wrangler secret put GEMINI_API_KEY` na produkcji (klucz z Google AI Studio).
// Opcjonalny: bez niego działa wszystko poza poleceniami AI.
declare namespace Cloudflare {
  interface Env {
    GEMINI_API_KEY?: string;
  }
}
interface Env {
  GEMINI_API_KEY?: string;
}
