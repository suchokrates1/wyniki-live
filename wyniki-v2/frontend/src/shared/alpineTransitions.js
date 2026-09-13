/**
 * Alpine rejects a transition's promise with { isFromCancelledTransition: true } when an element
 * is shown and hidden again before its x-transition finished (a dialog opened and closed quickly).
 * Nothing is wrong on the page; keep it out of the console as an "unhandled rejection".
 */
export function ignoreCancelledAlpineTransitions(target = window) {
  target.addEventListener('unhandledrejection', (event) => {
    if (event.reason && event.reason.isFromCancelledTransition) event.preventDefault();
  });
}
