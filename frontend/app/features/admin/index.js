import { initializeApiClientController } from './api-client-controller.js';
import { initializeRuntimeController } from './runtime-controller.js';
import { initializeSettingsController } from './settings-controller.js';

export function initializeAdminController({ setStatus }) {
  const settings = initializeSettingsController({ setStatus });
  initializeApiClientController(settings);
  const runtime = initializeRuntimeController({
    refreshRuntimeAvailability: settings.refreshRuntimeAvailability,
    setSettingsSection: settings.setSettingsSection,
    settingsForm: settings.settingsForm,
  });
  settings.setSettingsOpenedHandler(runtime.resumeRuntimeInstallation);
}
