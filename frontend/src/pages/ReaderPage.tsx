import {
  createSignal,
  createResource,
  Show,
  For,
  createEffect,
  onCleanup,
} from "solid-js";
import { useParams, useNavigate } from "@solidjs/router";
import {
  getBook,
  getProgress,
  patchProgress,
  synthesize,
  getPhoneticDict,
  upsertPhonetic,
  deletePhonetic,
  putSettings,
  type PhoneticEntry,
} from "../lib/api";
import { settings, setSettings } from "../stores/settingsStore";

export default function ReaderPage() {
  const params = useParams<{ fileId: string }>();
  const navigate = useNavigate();
  const fileId = decodeURIComponent(params.fileId);

  const [book] = createResource(() => getBook(fileId));
  const [initialProgress] = createResource(() => getProgress(fileId));

  const [sentenceIndex, setSentenceIndex] = createSignal(0);
  const [playing, setPlaying] = createSignal(false);
  const [showSettings, setShowSettings] = createSignal(false);
  const [ttsError, setTtsError] = createSignal<string | null>(null);
  const [useFallback, setUseFallback] = createSignal(false);

  // Phonetic dict state
  const [phonetic, { refetch: refetchPhonetic }] = createResource(getPhoneticDict);
  const [newWord, setNewWord] = createSignal("");
  const [newPhonetic, setNewPhonetic] = createSignal("");

  // Resume progress once both book and progress are loaded
  createEffect(() => {
    const p = initialProgress();
    if (p && book()) {
      setSentenceIndex(p.sentenceIndex);
    }
  });

  // Stop any in-progress speech on unmount
  onCleanup(() => {
    window.speechSynthesis.cancel();
  });

  // Apply phonetic dictionary substitutions to text before speaking
  const applyPhonetic = (text: string, dict: PhoneticEntry[]): string => {
    let result = text;
    for (const { word, phonetic } of dict) {
      const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      result = result.replace(new RegExp(`\\b${escaped}\\b`, "gi"), phonetic);
    }
    return result;
  };

  const sentences = () => book()?.sentences ?? [];
  const current = () => sentences()[sentenceIndex()] ?? "";
  const total = () => sentences().length;

  const goTo = async (index: number) => {
    const clamped = Math.max(0, Math.min(index, total() - 1));
    setSentenceIndex(clamped);
    await patchProgress(fileId, clamped).catch(() => {});
  };

  const playTtsWithXtts = async () => {
    if (playing() || !current()) return;
    setTtsError(null);
    setPlaying(true);
    try {
      const blob = await synthesize(current(), settings.speed);
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.onended = () => {
        setPlaying(false);
        URL.revokeObjectURL(url);
      };
      audio.onerror = () => {
        setPlaying(false);
        setTtsError("Audio playback failed");
        URL.revokeObjectURL(url);
      };
      await audio.play();
    } catch (err) {
      setPlaying(false);
      setTtsError(err instanceof Error ? err.message : "XTTS failed. Using browser TTS fallback...");
      // Fallback to browser SpeechSynthesis
      setTimeout(() => playTtsWithBrowser(), 500);
    }
  };

  const playTtsWithBrowser = () => {
    if (playing() || !current()) return;
    if (typeof window.speechSynthesis === "undefined") {
      setTtsError("Your browser does not support speech synthesis");
      return;
    }
    setUseFallback(true);
    setTtsError(null);
    setPlaying(true);
    const text = applyPhonetic(current(), phonetic() ?? []);
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = settings.speed;
    utter.onend = () => setPlaying(false);
    utter.onerror = () => {
      setPlaying(false);
      setTtsError("Speech synthesis failed");
    };
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utter);
  };

  const stopTts = () => {
    if (useFallback()) {
      window.speechSynthesis.cancel();
    }
    setPlaying(false);
  };

  const playTts = async () => {
    await playTtsWithXtts();
  };

  const addPhonetic = async () => {
    const w = newWord().trim();
    const p = newPhonetic().trim();
    if (!w || !p) return;
    await upsertPhonetic(w, p);
    setNewWord("");
    setNewPhonetic("");
    refetchPhonetic();
  };

  const removePhonetic = async (word: string) => {
    await deletePhonetic(word);
    refetchPhonetic();
  };

  const bgColor = () => (settings.theme === "dark" ? "#1a1a2e" : "#fafafa");
  const fgColor = () => (settings.theme === "dark" ? "#e0e0e0" : "#1a1a1a");
  const panelBg = () => (settings.theme === "dark" ? "#16213e" : "#fff");

  return (
    <div style={{ "min-height": "100vh", background: bgColor(), color: fgColor(), "font-family": "Georgia, serif", transition: "background 0.2s" }}>
      {/* Toolbar */}
      <div style={{ display: "flex", "align-items": "center", padding: "0.8rem 1.5rem", background: panelBg(), "box-shadow": "0 1px 4px rgba(0,0,0,0.1)", gap: "0.8rem" }}>
        <button onClick={() => navigate("/")} style={{ background: "none", border: "none", cursor: "pointer", "font-size": "1.1rem", color: fgColor() }}>
          ← Library
        </button>
        <span style={{ flex: 1, "font-size": "0.9rem", color: "#888", overflow: "hidden", "white-space": "nowrap", "text-overflow": "ellipsis" }}>
          {fileId}
        </span>
        <button
          onClick={() => setShowSettings(!showSettings())}
          style={{ background: "none", border: "none", cursor: "pointer", "font-size": "1.3rem" }}
          title="Settings"
        >
          ⚙️
        </button>
      </div>

      {/* Settings panel */}
      <Show when={showSettings()}>
        <div style={{ background: panelBg(), "border-bottom": "1px solid #ddd", padding: "1rem 1.5rem", display: "flex", gap: "2rem", "flex-wrap": "wrap", "align-items": "flex-start" }}>
          {/* Speed */}
          <div>
            <label style={{ "font-size": "0.85rem", display: "block", "margin-bottom": "0.3rem" }}>
              Speed: {settings.speed.toFixed(1)}×
            </label>
            <input
              type="range"
              min="0.5"
              max="2"
              step="0.1"
              value={settings.speed}
              onInput={async (e) => {
                const s = { ...settings, speed: parseFloat(e.currentTarget.value) };
                setSettings(s);
                await putSettings(s).catch(() => {});
              }}
            />
          </div>
          {/* Font size */}
          <div>
            <label style={{ "font-size": "0.85rem", display: "block", "margin-bottom": "0.3rem" }}>
              Font size: {settings.fontSize}px
            </label>
            <input
              type="range"
              min="12"
              max="36"
              step="1"
              value={settings.fontSize}
              onInput={async (e) => {
                const s = { ...settings, fontSize: parseInt(e.currentTarget.value, 10) };
                setSettings(s);
                await putSettings(s).catch(() => {});
              }}
            />
          </div>
          {/* Theme */}
          <div>
            <label style={{ "font-size": "0.85rem", display: "block", "margin-bottom": "0.3rem" }}>Theme</label>
            <button
              onClick={async () => {
                const s = { ...settings, theme: settings.theme === "dark" ? "light" as const : "dark" as const };
                setSettings(s);
                await putSettings(s).catch(() => {});
              }}
              style={{ padding: "0.3rem 0.8rem", "border-radius": "6px", border: "1px solid #aaa", cursor: "pointer", background: panelBg(), color: fgColor() }}
            >
              {settings.theme === "dark" ? "☀️ Light" : "🌙 Dark"}
            </button>
          </div>

          {/* Phonetic dictionary */}
          <div style={{ "min-width": "280px" }}>
            <label style={{ "font-size": "0.85rem", display: "block", "margin-bottom": "0.5rem", "font-weight": "bold" }}>
              Phonetic Dictionary
            </label>
            <div style={{ display: "flex", gap: "0.4rem", "margin-bottom": "0.5rem" }}>
              <input
                type="text"
                placeholder="word"
                value={newWord()}
                onInput={(e) => setNewWord(e.currentTarget.value)}
                style={{ flex: 1, padding: "0.3rem", "border-radius": "4px", border: "1px solid #aaa", background: panelBg(), color: fgColor() }}
              />
              <span style={{ "align-self": "center" }}>→</span>
              <input
                type="text"
                placeholder="pronunciation"
                value={newPhonetic()}
                onInput={(e) => setNewPhonetic(e.currentTarget.value)}
                style={{ flex: 1, padding: "0.3rem", "border-radius": "4px", border: "1px solid #aaa", background: panelBg(), color: fgColor() }}
              />
              <button onClick={addPhonetic} style={{ padding: "0.3rem 0.6rem", background: "#4a90e2", color: "white", border: "none", "border-radius": "4px", cursor: "pointer" }}>
                Add
              </button>
            </div>
            <div style={{ "max-height": "140px", "overflow-y": "auto" }}>
              <For each={phonetic() ?? []}>
                {(entry: PhoneticEntry) => (
                                    <div style={{ display: 'flex', 'justify-content': 'space-between', 'align-items': 'center', 'font-size': '0.85rem', padding: '0.2rem 0' }}>
                    <span><strong>{entry.word}</strong> → {entry.phonetic}</span>
                    <button
                      onClick={() => removePhonetic(entry.word)}
                      style={{ background: 'none', border: 'none', color: '#e74c3c', cursor: 'pointer' }}
                    >
                      ✕
                    </button>
                  </div>
                )}
              </For>
            </div>
          </div>
        </div>
      </Show>

      {/* Main reading area */}
      <div style={{ 'max-width': '720px', margin: '0 auto', padding: '3rem 1.5rem', 'text-align': 'center' }}>
        <Show when={book.loading}>
          <p>Loading book…</p>
        </Show>

        <Show when={!book.loading && total() > 0}>
          <p style={{ 'font-size': '0.85rem', color: '#888', 'margin-bottom': '1.5rem' }}>
            {sentenceIndex() + 1} / {total()}
          </p>

          <p style={{ 'font-size': `${settings.fontSize}px`, 'line-height': '1.7', 'margin-bottom': '2.5rem', 'min-height': '6rem' }}>
            {current()}
          </p>

          {ttsError() && <p style={{ color: '#e74c3c', 'font-size': '0.85rem', 'margin-bottom': '1rem' }}>{ttsError()}</p>}

          {/* Controls */}
          <div style={{ display: 'flex', 'justify-content': 'center', gap: '1rem', 'align-items': 'center' }}>
            <button
              onClick={() => goTo(sentenceIndex() - 1)}
              disabled={sentenceIndex() === 0}
              style={{ padding: '0.6rem 1.2rem', 'border-radius': '8px', border: '1px solid #aaa', cursor: sentenceIndex() === 0 ? 'not-allowed' : 'pointer', background: panelBg(), color: fgColor(), 'font-size': '1.1rem' }}
            >
              ◀ Prev
            </button>

            <button
              onClick={playing() ? stopTts : playTts}
              style={{ padding: '0.7rem 1.6rem', 'border-radius': '8px', border: 'none', background: playing() ? '#888' : '#e94560', color: 'white', cursor: 'pointer', 'font-size': '1.2rem' }}
            >
              {playing() ? '⏹ Stop' : '▶ Read'}
            </button>

            <button
              onClick={() => goTo(sentenceIndex() + 1)}
              disabled={sentenceIndex() >= total() - 1}
              style={{ padding: '0.6rem 1.2rem', 'border-radius': '8px', border: '1px solid #aaa', cursor: sentenceIndex() >= total() - 1 ? 'not-allowed' : 'pointer', background: panelBg(), color: fgColor(), 'font-size': '1.1rem' }}
            >
              Next ▶
            </button>
          </div>
        </Show>

        <Show when={!book.loading && total() === 0}>
          <p style={{ color: '#888' }}>This book has no readable content.</p>
        </Show>
      </div>
    </div>
  );
}
