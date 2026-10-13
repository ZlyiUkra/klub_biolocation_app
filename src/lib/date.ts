// Added 2026-10-12 for formatMonthDay() (two interface languages). Not imported from src/i18n/lang.ts: the backend
// compiles this file (T162) and cannot reach the config that file reads. The shape is the same as that file's Phrase
// (a string per language), written out here so this file stays free of the site's configuration.
type Phrase = { ru: string; en: string };

// Changed 2026-10-10 (T162): exported, because the backend cuts a list by year in the database and has to use the
// same fixed offset that formatYear() applies below (one home for what year a date belongs to).
export const FRONT_MATTER_OFFSET_MINUTES = 180;

function shifted(date: Date): Date {
  return new Date(date.getTime() + FRONT_MATTER_OFFSET_MINUTES * 60_000);
}

export function formatIsoDate(date: Date): string {
  const d = shifted(date);
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${d.getUTCFullYear()}-${month}-${day}`;
}

// English month abbreviations, hard-coded rather than taken from Intl: Hugo renders the
// English strings here (hugo.toml sets no defaultContentLanguage), and Intl output depends
// on the build machine's ICU data.
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

// Added 2026-10-12 with the two interface languages: the Russian abbreviations, hard-coded for the
// same reason as the English ones above. Genitive, as a Russian date reads ("05 мая").
// camelCase, the house rule for new names (CLAUDE.md, open question 1 about the older ones).
const monthsRu = [
  "янв",
  "фев",
  "мар",
  "апр",
  "мая",
  "июн",
  "июл",
  "авг",
  "сен",
  "окт",
  "ноя",
  "дек",
];

// Changed 2026-10-12: the date of a list card in both languages, the day first in Russian ("05
// мая") and second in English ("May 05", Hugo's "Jan 02" layout as before). It returned the English
// string: return `${MONTHS[d.getUTCMonth()]} ${String(d.getUTCDate()).padStart(2, "0")}`;
export function formatMonthDay(date: Date): Phrase {
  const d = shifted(date);
  const day = String(d.getUTCDate()).padStart(2, "0");
  return {
    ru: `${day} ${monthsRu[d.getUTCMonth()]}`,
    en: `${MONTHS[d.getUTCMonth()]} ${day}`,
  };
}

export function formatYear(date: Date): string {
  return String(shifted(date).getUTCFullYear());
}

// Added 2026-10-10 (T162): the instants a year begins and ends at, in the site's fixed offset, so that a database
// can select "the entries of 2025" with a range on the date (which an index serves) and still agree with
// formatYear() on every entry. `from` is inclusive, `to` is exclusive (the first instant of the next year).
export function yearRange(year: number): { from: Date; to: Date } {
  const offsetMs = FRONT_MATTER_OFFSET_MINUTES * 60_000;
  return {
    from: new Date(Date.UTC(year, 0, 1) - offsetMs),
    to: new Date(Date.UTC(year + 1, 0, 1) - offsetMs),
  };
}

export function formatDateTime(date: Date): string {
  const d = shifted(date);
  const pad = (n: number) => String(n).padStart(2, "0");
  const offset = Math.abs(FRONT_MATTER_OFFSET_MINUTES);
  const sign = FRONT_MATTER_OFFSET_MINUTES < 0 ? "-" : "+";
  const time = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
  return `${formatIsoDate(date)}T${time}${sign}${pad(Math.floor(offset / 60))}:${pad(offset % 60)}`;
}
