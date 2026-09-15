import Alpine from 'alpinejs';
import { ignoreCancelledAlpineTransitions } from './shared/alpineTransitions.js';
import { mergeAdminModules } from './admin/merge.js';
import { createOfficeI18n } from './i18n/officeI18n.js';
import { createOfficeCoreView } from './modules/office/coreView.js';
import { createOfficeMatchesView } from './modules/office/matchesView.js';
import { createOfficeNotificationsView } from './modules/office/notificationsView.js';
import { createOfficePlayersView } from './modules/office/playersView.js';
import { createOfficeQuickInfoView } from './modules/office/quickInfoView.js';
import { createOfficeScheduleView } from './modules/office/scheduleView.js';
import { createOfficeAutoScheduleView } from './modules/office/autoScheduleView.js';
import { createOfficeSseView } from './modules/office/sseView.js';
import { createOfficePathView } from './modules/office/officePathView.js';
import { createOfficeDrawsView } from './modules/office/drawsView.js';
import { createOfficeScheduleNotesView } from './modules/office/scheduleNotesView.js';
import { createOfficeKnockoutBoardView } from './modules/office/knockoutBoardView.js';
import { createOfficeTourView } from './modules/office/tourView.js';
import './main.css';
import './styles/office.css';
import './styles/tailwind-office.css';

window.Alpine = Alpine;

const nativeFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const response = await nativeFetch(input, init);
  const url = typeof input === 'string' ? input : input?.url || '';
  if (!/\/api\/office\/\d+\//.test(url) || /\/(auth|meta)(\?|$)/.test(url)) return response;
  if (response.status === 401) {
    window.dispatchEvent(new CustomEvent('office-session-expired'));
  } else if (response.status === 403) {
    const body = await response.clone().json().catch(() => ({}));
    if (/session|sesj/i.test(String(body.error || ''))) {
      window.dispatchEvent(new CustomEvent('office-session-expired'));
    }
  }
  return response;
};

// Preserve getters (isAuthenticated, officeMatches, …) — object spread would freeze them.
Alpine.data('officeApp', () => mergeAdminModules(
  createOfficeI18n(),
  createOfficeCoreView(),
  createOfficeSseView(),
  createOfficeNotificationsView(),
  createOfficeQuickInfoView(),
  createOfficeMatchesView(),
  createOfficeAutoScheduleView(),
  createOfficeScheduleView(),
  createOfficePlayersView(),
  createOfficePathView(),
  createOfficeDrawsView(),
  createOfficeScheduleNotesView(),
  createOfficeKnockoutBoardView(),
  createOfficeTourView(),
));

ignoreCancelledAlpineTransitions();
Alpine.start();
