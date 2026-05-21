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
  getChapter,
  getProgress,
  patchProgress,
  synthesize,
  getTtsStatus,
  getPhoneticDict,
  upsertPhonetic,
  deletePhonetic,
  putSettings,
  type BookChapterMeta,
} from "../lib/api";
import { settings, setSettings } from "../stores/settingsStore";
import { getCachedAudio, setCachedAudio, clearTtsCache } from "../lib/tts-cache"; 

const PARAGRAPHS_PER_PAGE = 25;

function splitSentences(text: string): string[] {
  if (text === "<hr />" || text.startsWith("[H") || text.includes("<a ")) return [text];
  return text.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 0);
}

function cleanTextForTts(text: string): string {
  if (text === "<hr />") return "";
  let clean = text.replace(/^\[H[1-6]\]/i, "");
  clean = clean.replace(/<[^>]*>?/gm, "");
  return clean.trim();
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function applyPhoneticDict(text: string, dict: { word: string; phonetic: string }[]): string {
  let result = text;
  const sortedDict = [...dict].sort((a, b) => b.word.length - a.word.length);     
  for (const { word, phonetic } of sortedDict) {
    if (!word.trim()) continue;
    const escaped = escapeRegex(word);
    const re = new RegExp(`(?<![a-zA-Z0-9'])${escaped}(?![a-zA-Z0-9'])`, "gi");   
    result = result.replace(re, phonetic);
  }
  return result;
}

export default function ReaderPage() {
  const params = useParams<{ fileId: string }>();
  const navigate = useNavigate();
  const fileId = decodeURIComponent(params.fileId);

  const [ttsStatus, { refetch: refetchTtsStatus }] = createResource(getTtsStatus);
  let scrollContainer: HTMLDivElement | undefined;

  const [book] = createResource(() => getBook(fileId));
  const [initialProgress] = createResource(() => getProgress(fileId));
  const [chapterIndex, setChapterIndex] = createSignal(0);
  const [pageIndex, setPageIndex] = createSignal(0);
  const [playing, setPlaying] = createSignal(false);
  const [showSettings, setShowSettings] = createSignal(false);
  const [showPhonetic, setShowPhonetic] = createSignal(false);
  const [showSidebar, setShowSidebar] = createSignal(true);
  const [selectedVoice, setSelectedVoice] = createSignal<SpeechSynthesisVoice | null>(null);
  const [availableVoices, setAvailableVoices] = createSignal<SpeechSynthesisVoice[]>([]);
  const [activeSentence, setActiveSentence] = createSignal<[number, number] | null>(null);
  const [pendingHash, setPendingHash] = createSignal<string | null>(null);        

  const chapters = (): BookChapterMeta[] => book()?.chapters ?? [];
  const [currentChapterResource] = createResource(
    () => ({ fileId, chapterId: chapterIndex() }),
    ({ fileId, chapterId }) => getChapter(fileId, chapterId)
  );
  const currentChapter = () => currentChapterResource();

  const paragraphs = (): string[] => currentChapter()?.paragraphs ?? [];
  const totalPagesInChapter = () => Math.ceil(paragraphs().length / PARAGRAPHS_PER_PAGE);
  const currentPageParagraphs = () => {
    const start = pageIndex() * PARAGRAPHS_PER_PAGE;
    return paragraphs().slice(start, start + PARAGRAPHS_PER_PAGE);
  };

  const goToChapter = async (idx: number) => {
    const clamped = Math.max(0, Math.min(idx, chapters().length - 1));
    setChapterIndex(clamped);
    setPageIndex(0);
    if (scrollContainer) scrollContainer.scrollTo({ top: 0, behavior: 'instant' });
    saveProgress();
  };

  const goToPage = async (idx: number) => {
    stopTts();
    if (idx < 0) {
      if (chapterIndex() > 0) { setChapterIndex(chapterIndex() - 1); setPageIndex(0); }
    } else if (idx >= totalPagesInChapter()) {
      if (chapterIndex() < chapters().length - 1) { setChapterIndex(chapterIndex() + 1); setPageIndex(0); }
    } else {
      setPageIndex(idx);
    }
    if (scrollContainer) scrollContainer.scrollTo({ top: 0, behavior: 'instant' });
    saveProgress();
  };

  const saveProgress = async () => {
    const total = chapterIndex() * 1000 + pageIndex();
    await patchProgress(fileId, total).catch(() => {});
  };

  let currentAudio: HTMLAudioElement | null = null;
  let playbackId = 0;
  const audioCache = new Map<string, Promise<Blob> | Blob>();

  const fetchAudio = async (text: string): Promise<Blob> => {
    if (settings.ttsEngine === "browser") throw new Error("Using browser engine");
    const cacheKey = `${text}|${settings.speed}|${settings.voice || "af_sarah"}`; 
    const cached = audioCache.get(cacheKey);
    if (cached) return await cached;
    const persistent = await getCachedAudio(cacheKey).catch(() => null);
    if (persistent) { audioCache.set(cacheKey, persistent); return persistent; }
    const promise = synthesize(text, settings.speed, settings.voice);
    audioCache.set(cacheKey, promise);
    try {
      const blob = await promise;
      audioCache.set(cacheKey, blob);
      setCachedAudio(cacheKey, blob).catch(() => {});
      return blob;
    } catch (err) { audioCache.delete(cacheKey); throw err; }
  };

  const prefetchSentences = (pIdx: number, sIdx: number, sentences: string[][], depth = 5) => {
    if (settings.ttsEngine === "browser") return;
    let count = 0, currP = pIdx, currS = sIdx + 1;
    if (currP === -1) { currP = 0; currS = 0; }
    while (count < depth && currP < sentences.length) {
      if (currS >= sentences[currP].length) { currP++; currS = 0; continue; }
      const rawText = sentences[currP][currS];
      const textToRead = cleanTextForTts(rawText);
      if (textToRead) {
        const dict = phonetic() ?? [];
        const processedText = applyPhoneticDict(textToRead, dict);
        fetchAudio(processedText).catch(() => {});
      }
      currS++; count++;
    }
  };

  const playSentence = async (pIdx: number, sIdx: number, sentences: string[][]) => {
    if (!playing()) return;
    const currentId = ++playbackId;
    const rawText = sentences[pIdx][sIdx];
    if (rawText === "<hr />") {
      await new Promise(r => setTimeout(r, 200));
      if (playbackId !== currentId || !playing()) return;
      nextSentence(pIdx, sIdx, sentences);
      return;
    }
    const textToRead = cleanTextForTts(rawText);
    if (!textToRead) { nextSentence(pIdx, sIdx, sentences); return; }
    const dict = phonetic() ?? [];
    const processedText = applyPhoneticDict(textToRead, dict);
    setActiveSentence([pIdx, sIdx]);

    setTimeout(() => {
      const activeEl = document.querySelector(`[data-p-idx="${pIdx}"][data-s-idx="${sIdx}"]`);
      if (activeEl && scrollContainer) {
        const rect = activeEl.getBoundingClientRect();
        const containerRect = scrollContainer.getBoundingClientRect();
        const relativeTop = rect.top - containerRect.top + scrollContainer.scrollTop;
        const middle = relativeTop - (scrollContainer.clientHeight / 2) + (rect.height / 2);
        scrollContainer.scrollTo({ top: middle, behavior: "smooth" });
      }
    }, 100);

    prefetchSentences(pIdx, sIdx, sentences, 5);
    window.speechSynthesis.cancel();
    if (!settings.ttsEngine || settings.ttsEngine === "browser") {
      playTtsWithBrowser(processedText, currentId, () => { if (playbackId === currentId) nextSentence(pIdx, sIdx, sentences); });
      return;
    }
    try {
      const blob = await fetchAudio(processedText);
      if (playbackId !== currentId || !playing()) return;
      if (currentAudio) { currentAudio.pause(); currentAudio.src = ""; }
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      currentAudio = audio;
      audio.onended = () => {
        URL.revokeObjectURL(url);
        if (playbackId !== currentId || !playing()) return;
        setTimeout(() => { if (playbackId === currentId) nextSentence(pIdx, sIdx, sentences); }, 150);
      };
      await audio.play();
      if (playbackId !== currentId || !playing()) { audio.pause(); audio.src = ""; }
    } catch (err) {
      if (playbackId !== currentId || !playing()) return;
      playTtsWithBrowser(textToRead, currentId, () => { if (playbackId === currentId) nextSentence(pIdx, sIdx, sentences); });
    }
  };

  const nextSentence = async (pIdx: number, sIdx: number, sentences: string[][]) => {
    if (!playing()) return;
    let nextP = pIdx, nextS = sIdx + 1;
    if (nextS >= sentences[pIdx].length) { nextP++; nextS = 0; }
    if (nextP < sentences.length) {
      playSentence(nextP, nextS, sentences);
    } else {
      const nextPg = pageIndex() + 1;
      if (nextPg < totalPagesInChapter()) { setPageIndex(nextPg); setActiveSentence(null); saveProgress();
      } else if (chapterIndex() < chapters().length - 1) { setChapterIndex(chapterIndex() + 1); setPageIndex(0); setActiveSentence(null); saveProgress();
      } else { stopTts(); }
    }
  };

  let lastEffectId = 0;
  createEffect(() => {
    const isPlaying = playing(), isActive = activeSentence(), ch = currentChapter();
    if (isPlaying && isActive === null && ch) {
      const effectId = ++lastEffectId;
      const sentences = currentPageParagraphs().map(splitSentences);
      if (sentences.length > 0) {
        setTimeout(() => { if (effectId === lastEffectId && playing() && activeSentence() === null) playSentence(0, 0, sentences); }, 50);
      }
    }
  });

  const playCurrentPage = () => {
    if (playing()) { stopTts(); return; }
    const sentences = currentPageParagraphs().map(splitSentences);
    setPlaying(true);
    const active = activeSentence();
    if (active) playSentence(active[0], active[1], sentences);
    else playSentence(0, 0, sentences);
  };

  const stopTts = () => {
    playbackId++; setPlaying(false);
    if (currentAudio) { currentAudio.pause(); currentAudio.src = ""; currentAudio = null; }
    window.speechSynthesis.cancel();
  };

  const playTtsWithBrowser = (text: string, currentId: number, onEnd?: () => void) => {
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = settings.speed;
    if (selectedVoice()) utter.voice = selectedVoice();
    utter.onend = () => { if (playing() && playbackId === currentId) onEnd && setTimeout(onEnd, 250); };
    utter.onerror = () => { if (playing() && playbackId === currentId) onEnd && onEnd(); };
    window.speechSynthesis.speak(utter);
  };

  const handleLinkClick = (e: MouseEvent) => {
    const anchor = (e.target as HTMLElement).closest("a");
    if (anchor && anchor.dataset.href) {
      e.preventDefault();
      const [file, hash] = anchor.dataset.href.split("#");
      const idx = chapters().findIndex((c) => c.id === file || c.id.endsWith("/" + file));
      if (idx !== -1) {
        if (hash) setPendingHash(hash);
        if (idx === chapterIndex()) {
          const ch = currentChapter();
          if (ch && hash) {
            const pIdx = ch.paragraphs.findIndex(p => p.includes(`id="${hash}"`));
            if (pIdx !== -1) {
              setPageIndex(Math.floor(pIdx / PARAGRAPHS_PER_PAGE));
              setTimeout(() => { if (scrollContainer) { const el = document.getElementById(hash); if (el) { const rect = el.getBoundingClientRect(); const containerRect = scrollContainer.getBoundingClientRect(); scrollContainer.scrollTo({ top: rect.top - containerRect.top + scrollContainer.scrollTop - 100, behavior: "smooth" }); } } }, 150);
            }
            setPendingHash(null);
          }
        } else { goToChapter(idx); }
      }
    }
  };

  const handleSentenceClick = (pIdx: number, sIdx: number) => {
    stopTts();
    const sentences = currentPageParagraphs().map(splitSentences);
    setPlaying(true);
    playSentence(pIdx, sIdx, sentences);
  };

  createEffect(() => {
    const ch = currentChapter();
    const hash = pendingHash();
    if (ch && hash) {
      const pIdx = ch.paragraphs.findIndex(p => p.includes(`id="${hash}"`));
      if (pIdx !== -1) {
        setPageIndex(Math.floor(pIdx / PARAGRAPHS_PER_PAGE));
        setTimeout(() => { if (scrollContainer) { const el = document.getElementById(hash); if (el) { const rect = el.getBoundingClientRect(); const containerRect = scrollContainer.getBoundingClientRect(); scrollContainer.scrollTo({ top: rect.top - containerRect.top + scrollContainer.scrollTop - 100, behavior: "smooth" }); } } }, 150);
      }
      setPendingHash(null);
    }
  });

  const [phonetic, { refetch: refetchPhonetic }] = createResource(getPhoneticDict);
  const [newWord, setNewWord] = createSignal("");
  const [newPhonetic, setNewPhonetic] = createSignal("");

  createEffect(() => {
    const updateVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      setAvailableVoices(voices);
      if (!selectedVoice() && voices.length > 0) setSelectedVoice(voices[0]);     
    };
    updateVoices();
    window.speechSynthesis.onvoiceschanged = updateVoices;
  });

  let initialized = false;
  createEffect(() => {
    const p = initialProgress();
    const b = book();
    if (p && b && !initialized) {
      initialized = true;
      const total = p.sentenceIndex;
      const cIdx = Math.floor(total / 1000);
      const pIdx = total % 1000;
      setChapterIndex(Math.max(0, Math.min(cIdx, b.chapters.length - 1)));        
      setPageIndex(pIdx);
    }
  });

  createEffect(() => {
    const ch = currentChapter();
    if (ch) {
      const maxPages = Math.ceil(ch.paragraphs.length / PARAGRAPHS_PER_PAGE);     
      if (pageIndex() >= maxPages) setPageIndex(Math.max(0, maxPages - 1));       
    }
  });

  const statusInterval = setInterval(refetchTtsStatus, 2000);
  onCleanup(() => { stopTts(); clearInterval(statusInterval); });

  const addPhonetic = async () => {
    const w = newWord().trim(), p = newPhonetic().trim();
    if (!w || !p) return;
    await upsertPhonetic(w, p);
    setNewWord(""); setNewPhonetic(""); refetchPhonetic();
  };

  const removePhonetic = async (word: string) => { await deletePhonetic(word); refetchPhonetic(); };

  const bgColor = () => { if (settings.theme === "amoled") return "#000000"; if (settings.theme === "dark") return "#0f172a"; return "#faf9f6"; };
  const fgColor = () => { if (settings.theme === "amoled") return "#ffffff"; if (settings.theme === "dark") return "#f1f5f9"; return "#2c2c2c"; };
  const panelBg = () => { if (settings.theme === "amoled") return "#121212"; if (settings.theme === "dark") return "#1e293b"; return "#f5f2eb"; };
  const accentColor = () => "#38bdf8";
  const highlightColor = () => { if (settings.theme === "light") return "rgba(56, 189, 248, 0.2)"; return "rgba(56, 189, 248, 0.25)"; };
  const nextTheme = () => { if (settings.theme === "light") return "dark"; if (settings.theme === "dark") return "amoled"; return "light"; };
  const themeLabel = () => { if (settings.theme === "light") return "🍦 Cream"; if (settings.theme === "dark") return "🌙 Blue"; return "🌑 Amoled"; };

  return (
    <div style={{ 
      display: "flex", "flex-direction": "column", height: "100vh",
      background: bgColor(), color: fgColor(), "font-family": "Inter, sans-serif", 
      transition: "all 0.2s", overflow: "hidden"
    }}>
      <style>{`
        .book-link:hover { background: rgba(56, 189, 248, 0.1) !important; border-bottom: 2px solid #38bdf8 !important; }
        .sentence-clickable { cursor: pointer; border-radius: 3px; transition: background 0.3s ease; }
        .sentence-clickable:hover { background: rgba(56, 189, 248, 0.1) !important; }
        .sidebar-item:hover { background: rgba(56, 189, 248, 0.05) !important; }
        .progress-slider { -webkit-appearance: none; width: 100%; height: 4px; background: rgba(0,0,0,0.1); border-radius: 2px; outline: none; }
        .progress-slider::-webkit-slider-thumb { -webkit-appearance: none; height: 16px; width: 16px; border-radius: 50%; background: #38bdf8; cursor: pointer; box-shadow: 0 1px 3px rgba(0,0,0,0.3); border: none; }
      `}</style>
      
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Sidebar */}
        <div style={{
          width: showSidebar() ? "300px" : "0px", overflow: "hidden",
          transition: "width 0.3s ease", background: panelBg(),
          "border-right": settings.theme === "light" ? "1px solid #e2e8f0" : "1px solid #334155",
          height: "100%", "overflow-y": "auto", "flex-shrink": 0, "z-index": 105
        }}>
          <div style={{ padding: "1rem" }}>
            <h3 style={{ "font-size": "0.8rem", opacity: 0.5, "text-transform": "uppercase", "letter-spacing": "0.1em", "margin-bottom": "1rem" }}>Chapters</h3>
            <For each={chapters()}>{(ch, idx) => (
              <>
                <div onClick={() => goToChapter(idx())} class="sidebar-item"
                  style={{
                    padding: "0.8rem 0.8rem", "border-radius": "6px", cursor: "pointer", "font-size": "0.9rem",
                    background: chapterIndex() === idx() ? "rgba(56, 189, 248, 0.15)" : "transparent",
                    color: chapterIndex() === idx() ? accentColor() : fgColor(),
                    display: "flex", gap: "0.8rem", "align-items": "flex-start", transition: "all 0.2s"
                  }}
                >
                  <span style={{ opacity: 0.4, "font-size": "0.8rem", "margin-top": "0.1rem" }}>{idx() + 1}</span>
                  <span style={{ "word-break": "break-word", "font-weight": chapterIndex() === idx() ? "600" : "400" }}>{ch.title || `Chapter ${idx() + 1}`}</span>
                </div>
                <Show when={idx() < chapters().length - 1}>
                  <div style={{ height: "1px", background: fgColor(), opacity: 0.15, margin: "0.2rem 0.8rem" }} />
                </Show>
              </>
            )}</For>
          </div>
        </div>

        {/* Content Scroll Container */}
        <div ref={scrollContainer} style={{ flex: 1, "overflow-y": "auto", position: "relative" }}>
          <div style={{ display: "flex", "align-items": "center", padding: "0.8rem 1.5rem", background: panelBg(), "box-shadow": "0 1px 3px rgba(0,0,0,0.1)", gap: "0.8rem", "border-bottom": settings.theme === "light" ? "1px solid #e2e8f0" : "1px solid #334155", position: "sticky", top: 0, "z-index": 110 }}>
            <button onClick={() => setShowSidebar(!showSidebar())} style={{ background: "none", border: "none", cursor: "pointer", "font-size": "1.2rem", padding: "0.4rem" }}>{showSidebar() ? "⬅️" : "📑"}</button>
            <button onClick={() => navigate("/")} style={{ background: "none", border: "none", cursor: "pointer", "font-size": "1rem", color: accentColor(), "font-weight": "600" }}>Library</button>
            <span style={{ flex: 1, "font-size": "0.9rem", opacity: 0.6, overflow: "hidden", "white-space": "nowrap", "text-overflow": "ellipsis" }}>
              {fileId}
              <Show when={ttsStatus() && ttsStatus()?.status !== "ready" && settings.ttsEngine === "kokoro"}>
                <span style={{ "margin-left": "1rem", color: accentColor(), "font-weight": "600", "font-size": "0.8rem", background: "rgba(56, 189, 248, 0.1)", padding: "0.2rem 0.6rem", "border-radius": "10px" }}>
                  {ttsStatus()?.status === "downloading" ? `📥 Downloading Kokoro: ${ttsStatus()?.progress}%` : "⚙️ Finalizing Kokoro..."}
                </span>
              </Show>
            </span>
            <button onClick={() => setShowSettings(!showSettings())} style={{ background: "none", border: "none", cursor: "pointer", "font-size": "1.3rem", opacity: 0.8 }}>⚙️</button>
            <Show when={ttsStatus() && ttsStatus()?.status !== "ready" && settings.ttsEngine === "kokoro"}>
              <div style={{ position: "absolute", bottom: "-1px", left: 0, height: "2px", background: accentColor(), width: `${ttsStatus()?.progress}%`, transition: "width 0.5s ease", "z-index": 10 }}></div>
            </Show>
          </div>

          <Show when={showSettings()}>
            <div style={{ background: panelBg(), padding: "1.2rem 1.5rem", display: "flex", gap: "2rem", "flex-wrap": "wrap", "align-items": "flex-end", "border-bottom": settings.theme === "light" ? "1px solid #e2e8f0" : "1px solid #334155", position: "sticky", top: "56px", "z-index": 109 }}>
              <div>
                <label style={{ "font-size": "0.8rem", display: "block", "margin-bottom": "0.4rem", opacity: 0.7 }}>Speed: {settings.speed.toFixed(1)}x</label>
                <input type="range" min="0.5" max="2" step="0.1" value={settings.speed} onInput={async (e) => { const s = { ...settings, speed: parseFloat(e.currentTarget.value) }; setSettings(s); await putSettings(s).catch(() => {}); }} style={{ width: "120px" }} />
              </div>
              <div>
                <label style={{ "font-size": "0.8rem", display: "block", "margin-bottom": "0.4rem", opacity: 0.7 }}>Size: {settings.fontSize}px</label>
                <input type="range" min="12" max="36" step="1" value={settings.fontSize} onInput={async (e) => { const s = { ...settings, fontSize: parseInt(e.currentTarget.value, 10) }; setSettings(s); await putSettings(s).catch(() => {}); }} style={{ width: "120px" }} />
              </div>
              <div>
                <button onClick={async () => { const nt = nextTheme(); const s = { ...settings, theme: nt as any }; setSettings(s); await putSettings(s).catch(() => {}); }} style={{ padding: "0.5rem 1rem", "border-radius": "8px", border: `1px solid ${settings.theme === "light" ? "#cbd5e1" : "#334155"}`, background: "transparent", color: fgColor(), cursor: "pointer", "font-weight": "600" }}>Theme: {themeLabel()}</button>
              </div>
              <div>
                <label style={{ "font-size": "0.8rem", display: "block", "margin-bottom": "0.4rem", opacity: 0.7 }}>TTS Engine:</label>
                <div style={{ display: "flex", gap: "0.4rem", background: bgColor(), padding: "0.2rem", "border-radius": "8px", border: `1px solid ${settings.theme === "light" ? "#cbd5e1" : "#334155"}` }}>
                  <button onClick={async () => { const s = { ...settings, ttsEngine: "browser" as const }; setSettings(s); await putSettings(s).catch(() => {}); stopTts(); }} style={{ flex: 1, padding: "0.4rem 0.8rem", border: "none", "border-radius": "6px", background: (!settings.ttsEngine || settings.ttsEngine === "browser") ? accentColor() : "transparent", color: (!settings.ttsEngine || settings.ttsEngine === "browser") ? "#0f172a" : fgColor(), cursor: "pointer", "font-size": "0.85rem", "font-weight": "600" }}>Browser</button>
                  <button onClick={async () => { const s = { ...settings, ttsEngine: "kokoro" as const }; setSettings(s); await putSettings(s).catch(() => {}); stopTts(); }} style={{ flex: 1, padding: "0.4rem 0.8rem", border: "none", "border-radius": "6px", background: settings.ttsEngine === "kokoro" ? accentColor() : "transparent", color: settings.ttsEngine === "kokoro" ? "#0f172a" : fgColor(), cursor: "pointer", "font-size": "0.85rem", "font-weight": "600" }}>Kokoro</button>
                </div>
              </div>
              <Show when={settings.ttsEngine === "kokoro"}>
                <div>
                  <label style={{ "font-size": "0.8rem", display: "block", "margin-bottom": "0.4rem", opacity: 0.7 }}>Kokoro Voice:</label>
                  <select value={settings.voice || ""} onChange={async (e) => { const v = e.currentTarget.value; const s = { ...settings, voice: v }; setSettings(s); await putSettings(s).catch(() => {}); audioCache.clear(); clearTtsCache().catch(() => {}); }} style={{ padding: "0.5rem", "border-radius": "8px", border: `1px solid ${settings.theme === "light" ? "#cbd5e1" : "#334155"}`, background: panelBg(), color: fgColor() }}>
                    <option value="">Default (Sarah)</option>
                    <optgroup label="American (Female)">
                      <option value="af_sarah">Sarah</option>
                      <option value="af_heart">Heart</option>
                      <option value="af_alloy">Alloy</option>
                      <option value="af_aoede">Aoede</option>
                      <option value="af_bella">Bella</option>
                      <option value="af_jessica">Jessica</option>
                      <option value="af_kore">Kore</option>
                      <option value="af_nicole">Nicole</option>
                      <option value="af_nova">Nova</option>
                      <option value="af_river">River</option>
                      <option value="af_sky">Sky</option>
                    </optgroup>
                    <optgroup label="American (Male)">
                      <option value="am_adam">Adam</option>
                      <option value="am_echo">Echo</option>
                      <option value="am_eric">Eric</option>
                      <option value="am_fenrir">Fenrir</option>
                      <option value="am_liam">Liam</option>
                      <option value="am_michael">Michael</option>
                      <option value="am_onyx">Onyx</option>
                      <option value="am_puck">Puck</option>
                      <option value="am_santa">Santa</option>
                    </optgroup>
                    <optgroup label="British (Female)">
                      <option value="bf_alice">Alice</option>
                      <option value="bf_emma">Emma</option>
                      <option value="bf_isabella">Isabella</option>
                      <option value="bf_lily">Lily</option>
                    </optgroup>
                    <optgroup label="British (Male)">
                      <option value="bm_daniel">Daniel</option>
                      <option value="bm_fable">Fable</option>
                      <option value="bm_george">George</option>
                      <option value="bm_lewis">Lewis</option>
                    </optgroup>
                    <optgroup label="Japanese">
                      <option value="jf_alpha">Alpha (F)</option>
                      <option value="jf_gongitsune">Gongitsune (F)</option>
                      <option value="jf_nezumi">Nezumi (F)</option>
                      <option value="jf_tebukuro">Tebukuro (F)</option>
                      <option value="jm_kumo">Kumo (M)</option>
                    </optgroup>
                    <optgroup label="Mandarin Chinese">
                      <option value="zf_xiaobei">Xiaobei (F)</option>
                      <option value="zf_xiaoni">Xiaoni (F)</option>
                      <option value="zf_xiaoxiao">Xiaoxiao (F)</option>
                      <option value="zf_xiaoyi">Xiaoyi (F)</option>
                      <option value="zm_yunjian">Yunjian (M)</option>
                      <option value="zm_yunxi">Yunxi (M)</option>
                      <option value="zm_yunxia">Yunxia (M)</option>
                      <option value="zm_yunyang">Yunyang (M)</option>
                    </optgroup>
                    <optgroup label="Spanish">
                      <option value="ef_dora">Dora (F)</option>
                      <option value="em_alex">Alex (M)</option>
                      <option value="em_santa">Santa (M)</option>
                    </optgroup>
                    <optgroup label="French">
                      <option value="ff_siwis">Siwis (F)</option>
                    </optgroup>
                    <optgroup label="Hindi">
                      <option value="hf_alpha">Alpha (F)</option>
                      <option value="hf_beta">Beta (F)</option>
                      <option value="hm_omega">Omega (M)</option>
                      <option value="hm_psi">Psi (M)</option>
                    </optgroup>
                    <optgroup label="Italian">
                      <option value="if_sara">Sara (F)</option>
                      <option value="im_nicola">Nicola (M)</option>
                    </optgroup>
                    <optgroup label="Brazilian Portuguese">
                      <option value="pf_dora">Dora (F)</option>
                      <option value="pm_alex">Alex (M)</option>
                      <option value="pm_santa">Santa (M)</option>
                    </optgroup>
                  </select>
                </div>
              </Show>
              <Show when={!settings.ttsEngine || settings.ttsEngine === "browser"}>
                <div>
                  <label style={{ "font-size": "0.8rem", display: "block", "margin-bottom": "0.4rem", opacity: 0.7 }}>Browser Voice:</label>
                  <select value={selectedVoice()?.name ?? ""} onChange={(e) => { const v = availableVoices().find(v => v.name === e.currentTarget.value); if (v) setSelectedVoice(v); }} style={{ padding: "0.5rem", "border-radius": "8px", border: `1px solid ${settings.theme === "light" ? "#cbd5e1" : "#334155"}`, background: panelBg(), color: fgColor() }}>
                    <For each={availableVoices()}>{(v) => <option value={v.name}>{v.name}</option>}</For>
                  </select>
                </div>
              </Show>
              <button onClick={() => setShowPhonetic(!showPhonetic())} style={{ padding: "0.5rem 1rem", "border-radius": "8px", border: `1px solid ${accentColor()}`, color: accentColor(), background: "transparent", cursor: "pointer", "font-weight": "600" }}>Dictionary</button>
            </div>
            <Show when={showPhonetic()}>
              <div style={{ background: panelBg(), padding: "1.5rem", margin: "1rem 1.5rem", "border-radius": "12px", border: `1px solid ${accentColor()}44`, "box-shadow": "0 4px 12px rgba(0,0,0,0.1)" }}>
                <h3 style={{ margin: "0 0 1rem 0", "font-size": "0.9rem", color: accentColor(), "text-transform": "uppercase", "letter-spacing": "0.05em" }}>Phonetic Dictionary</h3>
                <div style={{ display: "flex", gap: "0.6rem", "margin-bottom": "1rem" }}>
                  <input type="text" placeholder="Word" value={newWord()} onInput={(e) => setNewWord(e.currentTarget.value)} style={{ flex: 1, padding: "0.6rem", "border-radius": "6px", border: `1px solid ${settings.theme === "light" ? "#cbd5e1" : "#334155"}`, background: bgColor(), color: fgColor() }} />
                  <input type="text" placeholder="Sounds like" value={newPhonetic()} onInput={(e) => setNewPhonetic(e.currentTarget.value)} style={{ flex: 1, padding: "0.6rem", "border-radius": "6px", border: `1px solid ${settings.theme === "light" ? "#cbd5e1" : "#334155"}`, background: bgColor(), color: fgColor() }} />
                  <button onClick={addPhonetic} style={{ padding: "0.6rem 1.5rem", background: accentColor(), color: "#0f172a", border: "none", "border-radius": "6px", cursor: "pointer", "font-weight": "700" }}>Add</button>
                </div>
                <div style={{ display: "grid", "grid-template-columns": "repeat(auto-fill, minmax(180px, 1fr))", gap: "0.5rem", "max-height": "160px", "overflow-y": "auto" }}>
                  <For each={phonetic() ?? []}>{(e) => (
                    <div style={{ display: "flex", "justify-content": "space-between", padding: "0.4rem 0.8rem", background: "rgba(0,0,0,0.05)", "border-radius": "6px", "font-size": "0.85rem" }}>
                      <span><strong>{e.word}</strong> → {e.phonetic}</span>
                      <button onClick={() => removePhonetic(e.word)} style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer" }}>×</button>
                    </div>
                  )}</For>
                </div>
              </div>
            </Show>
          </Show>

          <div style={{ "max-width": "850px", margin: "0 auto", padding: "3rem 1.5rem 10rem" }}>
            <Show when={book.loading || currentChapterResource.loading}><p style={{ opacity: 0.6, "text-align": "center" }}>Loading...</p></Show>
            <Show when={!book.loading && !currentChapterResource.loading && chapters().length > 0}>
              <div onClick={handleLinkClick} style={{ "line-height": "1.8", "font-size": `${settings.fontSize}px`, "font-family": "Georgia, serif" }}>
                <Show when={pageIndex() === 0}>
                  <h1 innerHTML={currentChapterResource()?.title || `Chapter ${chapterIndex() + 1}`} style={{ "text-align": "center", "margin-bottom": "4rem", "font-weight": "300", "font-style": "italic", opacity: 0.9, "font-size": "2.2em" }} />
                </Show>
                <For each={currentPageParagraphs()}>{(para, pIdx) => {
                  if (para === "<hr />") return <div style={{ "text-align": "center", "margin": "3rem 0", "letter-spacing": "0.6em", opacity: 0.4 }}>***</div>;
                  const hMatch = para.match(/^\[H([1-6])\](.*)/i);
                  if (hMatch) return <div innerHTML={hMatch[2]} style={{ "text-align": "center", "margin": "2.5rem 0 1.5rem", "font-weight": "700", "font-size": `${1.4 - (parseInt(hMatch[1])*0.1)}em`, opacity: 0.9 }} />;
                  const sentences = splitSentences(para);
                  return (
                    <p style={{ "text-indent": (pIdx() === 0 && pageIndex() === 0) ? "0" : "1.8em", "margin": "0", "text-align": "justify" }}>
                      <For each={sentences}>{(sentence, sIdx) => (
                        <span data-p-idx={pIdx()} data-s-idx={sIdx()} innerHTML={sentence + " "} onClick={() => handleSentenceClick(pIdx(), sIdx())} class="sentence-clickable" style={{ background: (activeSentence()?.[0] === pIdx() && activeSentence()?.[1] === sIdx()) ? highlightColor() : "transparent" }} />
                      )}</For>
                    </p>
                  );
                }}</For>
              </div>
            </Show>
          </div>
        </div>
      </div>

      <Show when={!book.loading && chapters().length > 0}>
        <div style={{ background: panelBg(), "border-top": settings.theme === "light" ? "1px solid #e2e8f0" : "1px solid #334155", padding: "1.2rem 2rem", "box-shadow": "0 -4px 12px rgba(0,0,0,0.15)", "z-index": 120 }}>
          <div style={{ width: "100%", "margin-bottom": "1rem", position: "relative" }}>
            <input type="range" min="0" max={chapters().length > 0 ? (chapters().length - 1) * 100 + 99 : 100} value={chapterIndex() * 100 + Math.floor((pageIndex() / (totalPagesInChapter() || 1)) * 100)} onInput={(e) => { const val = parseInt(e.currentTarget.value, 10); const newCh = Math.floor(val / 100); const newPgPct = val % 100; if (newCh !== chapterIndex()) { goToChapter(newCh); } else { const totalPgs = totalPagesInChapter(); const newPg = Math.floor((newPgPct / 100) * totalPgs); setPageIndex(newPg); saveProgress(); } }} class="progress-slider" />
          </div>
          <div style={{ display: "flex", "justify-content": "space-between", "align-items": "center", "max-width": "1000px", margin: "0 auto", width: "100%" }}>
            <div style={{ flex: 1, "font-size": "0.85rem", opacity: 0.6, "font-weight": "500" }}>Chapter {chapterIndex() + 1} • Page {pageIndex() + 1}</div>
            <div style={{ display: "flex", "align-items": "center", gap: "2rem" }}>
              <button onClick={() => goToPage(pageIndex() - 1)} style={{ background: "none", border: "none", cursor: "pointer", "font-size": "0.9rem", color: fgColor(), opacity: 0.7, "font-weight": "600" }}>Previous Page</button>
              <button onClick={playCurrentPage} style={{ width: "56px", height: "56px", "border-radius": "50%", border: "none", background: playing() ? "#64748b" : accentColor(), color: playing() ? "#fff" : "#0f172a", cursor: "pointer", "font-size": "1.4rem", display: "flex", "align-items": "center", "justify-content": "center", "box-shadow": "0 4px 10px rgba(0,0,0,0.2)" }}>{playing() ? "⏹" : "▶"}</button>
              <button onClick={() => goToPage(pageIndex() + 1)} style={{ background: "none", border: "none", cursor: "pointer", "font-size": "0.9rem", color: fgColor(), opacity: 0.7, "font-weight": "600" }}>Next Page</button>
            </div>
            <div style={{ flex: 1 }} />
          </div>
        </div>
      </Show>
    </div>
  );
}
