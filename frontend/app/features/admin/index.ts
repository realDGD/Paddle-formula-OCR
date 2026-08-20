import { initializeApiClientController } from './api-client-controller.ts';
import { initializeRuntimeController } from './runtime-controller.ts';
import { initializeSettingsController } from './settings-controller.ts';
import type { StatusSetter } from '../../types.ts';

export function initializeAdminController({ setStatus }: { setStatus: StatusSetter }) {
  const settings = initializeSettingsController({ setStatus });
  initializeApiClientController(settings);
  const runtime = initializeRuntimeController({
    refreshRuntimeAvailability: settings.refreshRuntimeAvailability,
    setSettingsSection: settings.setSettingsSection,
    settingsForm: settings.settingsForm,
  });
  settings.setSettingsOpenedHandler(runtime.resumeRuntimeInstallation);
}
