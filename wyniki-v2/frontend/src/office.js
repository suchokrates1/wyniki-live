import Alpine from 'alpinejs';
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
import './main.css';

window.Alpine = Alpine;

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
));

Alpine.start();
