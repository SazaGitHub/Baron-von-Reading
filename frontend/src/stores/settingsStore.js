import { createStore } from "solid-js/store";
import { getSettings, putSettings } from "../lib/api";
const LOCAL_STORAGE_KEY = "baron-settings-cache";
const defaultSettings = {
    speed: 1,
    theme: "light",
    fontSize: 16,
    ttsEngine: "browser",
};
// Try to load from localStorage for immediate UI response
const getInitialSettings = () => {
    try {
        const cached = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (cached) {
            return { ...defaultSettings, ...JSON.parse(cached) };
        }
    }
    catch (e) {
        console.warn("Failed to load settings from localStorage", e);
    }
    return { ...defaultSettings };
};
const [settings, setSettings] = createStore(getInitialSettings());
export async function loadSettings() {
    try {
        const data = await getSettings();
        setSettings(data);
        // Sync cache with server truth
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(data));
    }
    catch {
        // use defaults or cached if not logged in yet
    }
}
export async function saveSettings(newSettings) {
    const updated = { ...settings, ...newSettings };
    setSettings(updated);
    // Save to localStorage for instant persistence on reload
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
    // Save to server
    await putSettings(updated).catch(err => {
        console.error("Failed to save settings to server", err);
    });
}
export { settings, setSettings };
