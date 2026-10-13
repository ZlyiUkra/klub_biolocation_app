// Added 2026-09-30 at the owner's request: a click on a link to the page the visitor is already on
// loads nothing. Used by the header's sign-in icon (AuthButton.astro) and the Account menu item
// (Menu.astro, both the bar and the panel), so the rule has one home.
//
// Only the path is compared. The sign-in page may carry ?next= (where to go after the sign-in) and
// Clerk's step after the # (the code entry, for instance), and a reload to the bare address would
// lose both, along with what was typed into the form, and start Clerk again; so there the click
// simply does nothing. On the account page the owner wants the click to bring Clerk's card back
// to its first tab, and that too needs no load: the card is mounted with routing "hash", and
// Clerk's own hash router goes to the first tab by setting location.hash to "" and follows the
// hashchange event (HashRouter in @clerk/ui 1.36.0), so the same assignment here does what a
// click on the card's first tab does. The sign-up page is not affected: the icon there leads to
// the sign-in page, a different page, and the owner kept that navigation.
//
// A click that opens a new tab or window (a modifier key, a button other than the main one) is
// never held back: it leaves this page as it is.
import { site } from "../config";

/**
 * Keeps a plain click on `link` from loading the page on show again.
 * @returns true when the click was handled here and the caller should do nothing more with it.
 */
export function stayOnPage(
  event: MouseEvent,
  link: HTMLAnchorElement,
): boolean {
  if (
    event.button !== 0 ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey ||
    event.altKey
  ) {
    return false;
  }
  if (link.pathname !== location.pathname) return false;
  event.preventDefault();
  if (location.pathname === site.auth.account && location.hash !== "") {
    location.hash = "";
  }
  return true;
}
