/**
 * Runs in the browser before the app becomes interactive: errors that no
 * error page catches (an event handler, a timer, a promise nobody awaited)
 * are reported to the API's log too (see lib/reportError.ts). Errors while
 * rendering are reported by the error pages themselves (app/error.tsx,
 * app/global-error.tsx).
 */
import { reportError } from "./lib/reportError";

try {
  window.addEventListener("error", (event) => {
    // Without an error object (a cross-origin script), there is nothing to go on.
    if (event.error) reportError("window", event.error);
  });
  window.addEventListener("unhandledrejection", (event) => {
    reportError("promise", event.reason);
  });
} catch {}
