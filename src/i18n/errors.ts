// What a visitor is told for each error code of the API, in both interface languages (T179 of
// specs/001-self-hosted-club-site; contracts/http-api.md, "Conventions"; spec FR-043 to FR-046).
//
// The server's own `message` is English, meant for logs and other clients, and a page never shows it: a page reads the
// stable `error` code of the answer and prints the text below for it in the language the page shows. A code this file
// does not know (a newer server than the page, a proxy's answer) gets `unknown`, a general sentence, never the raw
// code or the server's message.
//
// Decisions that would otherwise look like mistakes:
// - The record is over `ErrorCode` (src/lib/error-codes.ts, the one list the backend's type is derived from), so a code
//   added there without a text fails the type check; server/test/error-codes.test.ts also reads the source for every
//   code a route sends.
// - `Phrase` is written out here instead of imported from ./lang: that file reads the site's configuration, which the
//   backend cannot compile, and the backend's test imports this one. The shape is the same (a string per language).
// - These are the general sentences. A page that knows more says more (a wrong password, a taken login, a pause with
//   its countdown) and falls back to these only for what it has no sentence of its own for.
import { isErrorCode, type ErrorCode } from "../lib/error-codes.js";

type Phrase = { ru: string; en: string };

export const refusals: Record<ErrorCode, Phrase> = {
  cross_site: {
    ru: "Запрос отклонён: форма должна отправляться со страницы сайта.",
    en: "The request was refused: the form has to be sent from a page of this site.",
  },
  invalid_input: {
    ru: "Проверьте введённые данные и попробуйте ещё раз.",
    en: "Check what you entered and try again.",
  },
  unauthorized: {
    ru: "Нужно войти на сайт.",
    en: "You need to sign in.",
  },
  forbidden: {
    ru: "У вас нет прав на это действие.",
    en: "You have no right to do this.",
  },
  not_found: {
    ru: "Такой страницы или записи нет.",
    en: "There is no such page or entry.",
  },
  conflict: {
    ru: "Данные уже изменились. Обновите страницу и повторите.",
    en: "The data has changed in the meantime. Reload the page and try again.",
  },
  too_large: {
    ru: "Файл или запрос слишком большой.",
    en: "The file or the request is too large.",
  },
  unprocessable: {
    ru: "Эти данные не могут быть приняты.",
    en: "This data cannot be accepted.",
  },
  rate_limited: {
    ru: "Слишком много попыток. Повторите чуть позже.",
    en: "Too many attempts. Try again a little later.",
  },
  signed_out: {
    ru: "Нужно войти на сайт.",
    en: "You need to sign in.",
  },
  blocked: {
    ru: "Доступ к материалам сайта для этой учётной записи закрыт.",
    en: "Access to the site's materials is closed for this account.",
  },
  expired: {
    ru: "Срок доступа к этому материалу закончился.",
    en: "The access period of this material has ended.",
  },
  no_source: {
    ru: "Лекция ещё не подключена. Загляните позже.",
    en: "The lecture is not connected yet. Please come back later.",
  },
  unavailable: {
    ru: "Сервис сейчас недоступен. Попробуйте позже.",
    en: "The service is not available now. Please try again later.",
  },
  internal: {
    ru: "На сервере что-то пошло не так. Попробуйте ещё раз чуть позже.",
    en: "Something went wrong on the server. Please try again in a little while.",
  },
};

/** The sentence for a code not in the list above: a general one, never the raw code. */
export const unknownRefusal: Phrase = {
  ru: "Что-то пошло не так. Попробуйте ещё раз.",
  en: "Something went wrong. Please try again.",
};

/** The text for the `error` member of an answer's body; anything that is not a known code gets the general one. */
export function refusalOf(code: unknown): Phrase {
  return isErrorCode(code) ? refusals[code] : unknownRefusal;
}
