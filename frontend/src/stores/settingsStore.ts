import { createStore } from "solid-js/store";
import { getSettings, putSettings, type Settings } from "../lib/api";

const defaultSettings: Settings = {
  speed: 1,
  theme: "light",
  fontSize: 16,
};

const [settings, setSettings] = createStore<Settings>({ ...defaultSettings });

export async function loadSettings(): Promise<void> {
  try {
    const data = await getSettings();
    setSettings(data);
  } catch {
    // use defaults if not logged in yet
  }
}

export async function saveSettings(): Promise<void> {
  await putSettings({ speed: settings.speed, theme: settings.theme, fontSize: settings.fontSize });
}

export { settings, setSettings };
