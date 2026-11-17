/**
 * A hint that this browser is signed in, kept in a cookie on the site's own
 * domain so the server can render the right page from the first paint: the
 * home page shows a member their maps (not the landing page) without a flash.
 *
 * It is only a hint — it carries no identity and grants nothing. The real
 * session is the API's cookie; `AuthProvider` checks it on every load and
 * corrects the hint when the two disagree.
 */
export const SIGNED_IN_KEY = "atelier-signed-in";

export function rememberSignedIn(on: boolean) {
  if (typeof document === "undefined") return;
  document.cookie = on
    ? `${SIGNED_IN_KEY}=1; path=/; max-age=31536000; samesite=lax`
    : `${SIGNED_IN_KEY}=; path=/; max-age=0; samesite=lax`;
}
