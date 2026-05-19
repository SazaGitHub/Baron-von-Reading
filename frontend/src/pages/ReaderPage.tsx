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
  const [selectedVoice, setSelectedVoice] = createSignal<SpeechSynthesisVoice | null>(null);
  const [availableVoices, setAvailableVoices] = createSignal<SpeechSynthesisVoice[]>([]);

  // Phonetic dict state
  const [phonetic, { refetch: refetchPhonetic }] = createResource(getPhoneticDict);
  const [newWord, setNewWord] = createSignal("");
  const [newPhonetic, setNewPhonetic] = createSignal("");

  // Load available voices
  createEffect(() => {
    const updateVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      setAvailableVoices(voices);
      if (!selectedVoice() && voices.length > 0) {
        setSelectedVoice(voices[0]);
      }
    };
    updateVoices();
    window.speechSynthesis.onvoiceschanged = updateVoices;
  });

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
  const total = () => sentences().length;

  const playTtsWithXtts = async (text: string) => {
    if (playing()) return;
    setTtsError(null);
    setPlaying(true);
    try {
      const blob = await synthesize(text, settings.speed);
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
      setTimeout(() => playTtsWithBrowser(text), 500);
    }
  };

  const playTtsWithBrowser = (text: string) => {
    if (playing()) return;
    if (typeof window.speechSynthesis === "undefined") {
      setTtsError("Your browser does not support speech synthesis");
      return;
    }
    setUseFallback(true);
    setTtsError(null);
    setPlaying(true);
    const processedText = applyPhonetic(text, phonetic() ?? []);
    const utter = new SpeechSynthesisUtterance(processedText);
    utter.rate = settings.speed;
    if (selectedVoice()) {
      utter.voice = selectedVoice();
    }
    utter.onend = () => setPlaying(false);
    utter.onerror = () => {
      setPlaying(false);
      setTtsError("Speech synthesis failed");
    };
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utter);
  };

  const playTts = async (text: string) => {
    await playTtsWithXtts(text);
  };

  const stopTts = () => {
    if (useFallback()) {
      window.speechSynthesis.cancel();
    }
    setPlaying(false);
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

  const selectSentence = async (index: number) => {
    setSentenceIndex(index);
    await patchProgress(fileId, index).catch(() => {});
  };

  const bgColor = () => (settings.theme === "dark" ? "#1a1a2e" : "#fafafa");
  const fgColor = () => (settings.theme === "dark" ? "#e0e0e0" : "#1a1a1a");
  const panelBg = () => (settings.theme === "dark" ? "#16213e" : "#fff");
  const highlightBg = () => (settings.theme === "dark" ? "#0f3460" : "#e3f2fd");

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
                const s = { ...settings, theme: settings.theme === "dark" ? ("light" as const) : ("dark" as const) };
                setSettings(s);
                await putSettings(s).catch(() => {});
              }}
              style={{ padding: "0.3rem 0.8rem", "border-radius": "6px", border: "1px solid #aaa", cursor: "pointer", background: panelBg(), color: fgColor() }}
            >
              {settings.theme === "dark" ? "☀️ Light" : "🌙 Dark"}
            </button>
          </div>

          {/* Voice selection */}
          <div>
            <label style={{ "font-size": "0.85rem", display: "block", "margin-bottom": "0.3rem" }}>Voice</label>
            <select
              value={selectedVoice()?.name ?? ""}
              onChange={(e) => {
                const voice = availableVoices().find((v) => v.name === e.currentTarget.value);
                if (voice) setSelectedVoice(voice);
              }}
              style={{ padding: "0.3rem 0.6rem", "border-radius": "4px", border: "1px solid #aaa", background: panelBg(), color: fgColor() }}
            >
              <For each={availableVoices()}>
                {(voice) => <option value={voice.name}>{voice.name}</option>}
              </For>
            </select>
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
                  <div style={{ display: "flex", "justify-content": "space-between", "align-items": "center", "font-size": "0.85rem", padding: "0.2rem 0" }}>
                    <span><strong>{entry.word}</strong> → {entry.phonetic}</span>
                    <button
                      onClick={() => removePhonetic(entry.word)}
                      style={{ background: "none", border: "none", color: "#e74c3c", cursor: "pointer" }}
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

      {/* Main reading area - Full text view */}
      <div style={{ "max-width": "900px", margin: "0 auto", padding: "2rem 1.5rem" }}>
        <Show when={book.loading}>
          <p>Loading book…</p>
        </Show>

        <Show when={!book.loading && sentences().length > 0}>
          {ttsError() && <p style={{ color: "#e74c3c", "font-size": "0.85rem", "margin-bottom": "1rem", "padding": "0.5rem", background: "rgba(231, 76, 60, 0.1)", "border-radius": "4px" }}>{ttsError()}</p>}

          {/* Full text display with clickable sentences */}
          <div
            style={{
              background: panelBg(),
              padding: "1.5rem",
              "border-radius": "8px",
              "line-height": "1.8",
              "font-size": `${settings.fontSize}px`,
              "margin-bottom": "1.5rem",
              "white-space": "pre-wrap",
              "word-wrap": "break-word",
            }}
          >
            <For each={sentences()}>
              {(sentence, idx) => {
                const isSelected = idx() === sentenceIndex();
                return (
                  <span
                    onClick={() => selectSentence(idx())}
                    style={{
                      cursor: "pointer",
                      padding: "0.1rem 0.2rem",
                      background: isSelected ? highlightBg() : "transparent",
                      "border-radius": isSelected ? "3px" : "0px",
                      "transition": "all 0.15s",
                    }}
                    title="Click to read from here"
                  >
                    {sentence}{" "}
                  </span>
                );
              }}
            </For>
          </div>

          {/* Read & Control buttons */}
          <div style={{ display: "flex", "justify-content": "center", gap: "0.8rem", "margin-top": "1rem" }}>
            <button
              onClick={playing() ? stopTts : () => playTts(sentences()[sentenceIndex()] || "")}
              style={{
                padding: "0.7rem 1.6rem",
                "border-radius": "8px",
                border: "none",
                background: playing() ? "#888" : "#e94560",
                color: "white",
                cursor: "pointer",
                "font-size": "1rem",
              }}
            >
              {playing() ? "⏹ Stop" : "▶ Read"}
            </button>
          </div>

          {/* Progress info */}
          <p style={{ "text-align": "center", color: "#888", "margin-top": "1rem", "font-size": "0.9rem" }}>
            Reading from: Sentence {sentenceIndex() + 1} of {total()}
          </p>
        </Show>

        <Show when={!book.loading && sentences().length === 0}>
          <p style={{ color: "#888" }}>This book has no readable content.</p>
        </Show>
      </div>
    </div>
  );
}
