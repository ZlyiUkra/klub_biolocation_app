// What counts as ONE bare mail address (T108 of specs/001-self-hosted-club-site; the settings route of T110 takes the
// same function for the feedback recipient, so there is one rule and not two that drift).
//
// Decisions that would otherwise look like mistakes:
// - It is strict on purpose. The recipient is where the club's messages and its confirmation codes go, and the sender
//   is the server's own mailbox: neither is a place for a display name, a comment, a list, a quoted string or a
//   non-ASCII name, all of which the address parser of a mail library accepts and which are where its advisories were
//   (nodemailer's 2025-2026 fixes: operator characters inside an address, line breaks reaching a header). Text this
//   function refuses never reaches the library.
// - The shape is RFC 5321's, narrowed: an unquoted local part of at most 64 characters made of the "atext" characters
//   and dots between them, a domain of at least two letters-digits-hyphen labels of at most 63, the whole at most 254
//   characters (the table `mail_queue.to_address` allows 254). A domain that is an address literal (`[1.2.3.4]`) or a
//   name with all-digit top label is refused. An address in an international spelling is refused too: say so to the
//   owner when it matters, and add it here, once, with its test.
// - It answers a boolean and never says why. The caller picks the sentence its audience gets (a field error for the
//   superuser, a line in the queue's error column for the worker).

const atext = "[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+";
const localPart = new RegExp(`^${atext}(?:\\.${atext})*$`);
const domainLabel = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/;

/** The longest address, in characters (RFC 5321 path length less the angle brackets). */
export const maxAddressChars = 254;

/** True when `value` is one bare address of the shape above; anything else, a non-string included, is false. */
export function isBareAddress(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (value.length < 3 || value.length > maxAddressChars) return false;
  const at = value.indexOf("@");
  // Exactly one "@", with something before it.
  if (at < 1 || at !== value.lastIndexOf("@")) return false;
  const local = value.slice(0, at);
  const labels = value.slice(at + 1).split(".");
  if (local.length > 64 || !localPart.test(local)) return false;
  if (labels.length < 2 || !labels.every((label) => domainLabel.test(label))) {
    return false;
  }
  // An all-digit last label is a dotted number, not a name.
  const last = labels[labels.length - 1] ?? "";
  return !/^[0-9]+$/.test(last);
}
