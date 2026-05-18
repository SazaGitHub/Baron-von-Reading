import { createStore } from "solid-js/store";
import { getSettings, putSettings, type Settings } from "../lib/api";

const defaultSettings: Settings = {
  speed: 1,
  theme: "light",
  fontSize: 16,
};

const [settings, setSettings] = createStore<Settings>({ ...defaultSettings });

export async function loadSettings(): Promise<void> {
  const data = await getSettings();
  setSettings(data);
}

export async function saveSettings(): Promise<void> {
  await putSettings({ ...settings });
}

export { settings, setSettings };
