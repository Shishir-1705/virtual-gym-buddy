import React, { useState, useEffect } from "react";
import { motion } from "motion/react";
import { JournalEntry, GymBuddy } from "../types";
import { useAuth } from "../context/AuthContext";
import { Sparkles, Save, Heart, AlertTriangle, Smile, Zap, RefreshCw, BarChart2, MessageSquareText, TrendingUp, Trash2, Mic, MicOff, Keyboard, Info, X } from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as ChartTooltip,
  Legend
} from "recharts";

const MoodTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-slate-950/95 border border-slate-800 p-3 rounded-xl shadow-xl text-xs text-left min-w-[150px]">
        <p className="font-bold text-slate-200">{data.date}</p>
        <p className="text-[10px] text-amber-500 font-semibold mt-0.5">Mood: {data.sentiment}</p>
        <div className="mt-2.5 space-y-1">
          <div className="flex items-center justify-between text-[11px] gap-4">
            <span className="text-slate-400">Positivity Score:</span>
            <span className="font-mono font-bold text-emerald-400">{data.sentimentScore}/10</span>
          </div>
          <div className="flex items-center justify-between text-[11px] gap-4">
            <span className="text-slate-400">Stress Level:</span>
            <span className="font-mono font-bold text-violet-400">{data.stressLevel}/10</span>
          </div>
          <div className="flex items-center justify-between text-[11px] gap-4">
            <span className="text-slate-400">Fatigue Level:</span>
            <span className="font-mono font-bold text-amber-400">{data.fatigueLevel}/10</span>
          </div>
        </div>
        {data.entryText && (
          <p className="text-[10px] text-slate-400 border-t border-slate-850/50 pt-1.5 mt-2 italic line-clamp-2">
            "{data.entryText}"
          </p>
        )}
      </div>
    );
  }
  return null;
};

const parseJournalDate = (dateStr: string) => {
  try {
    const months: { [key: string]: number } = {
      jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
    };
    const parts = dateStr.toLowerCase().replace(",", "").split(" ");
    if (parts.length >= 2) {
      const monthStr = parts[0].substring(0, 3);
      const month = months[monthStr] !== undefined ? months[monthStr] : 5;
      const day = parseInt(parts[1], 10) || 1;
      return new Date(2026, month, day).getTime();
    }
  } catch (e) {
    // fall back
  }
  return 0;
};

interface JournalLoggerProps {
  selectedBuddy: GymBuddy;
  history: JournalEntry[];
  onAddJournal: (entry: JournalEntry) => void;
  onDeleteJournal?: (id: string) => void;
}

export default function JournalLogger({ selectedBuddy, history, onAddJournal, onDeleteJournal }: JournalLoggerProps) {
  const { user } = useAuth();
  const [entryText, setEntryText] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [errMessage, setErrMessage] = useState<string | null>(null);
  const [journalConfirmModal, setJournalConfirmModal] = useState<{ id: string; date: string } | null>(null);

  // Dismiss delete modal on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && journalConfirmModal) {
        setJournalConfirmModal(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [journalConfirmModal]);

  // Speech Recognition States
  const [inputMode, setInputMode] = useState<"keyboard" | "voice">("keyboard");
  const [isListening, setIsListening] = useState(false);
  const [recognitionInstance, setRecognitionInstance] = useState<any>(null);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const [textBeforeListening, setTextBeforeListening] = useState("");

  const SpeechRecognitionAPI = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  const isSpeechSupported = !!SpeechRecognitionAPI;

  const startListening = () => {
    if (!isSpeechSupported) return;
    setSpeechError(null);
    setTextBeforeListening(entryText);
    
    try {
      const recognition = new SpeechRecognitionAPI();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = "en-US";

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onerror = (event: any) => {
        console.error("Speech recognition error:", event.error);
        if (event.error === "not-allowed") {
          setSpeechError("Microphone access denied. Please allow microphone permissions in your browser.");
        } else {
          setSpeechError(`Speech recognition error: ${event.error}`);
        }
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognition.onresult = (event: any) => {
        let sessionTranscript = "";
        for (let i = 0; i < event.results.length; i++) {
          sessionTranscript += event.results[i][0].transcript + " ";
        }
        
        setEntryText(() => {
          const base = textBeforeListening.trim();
          const spoken = sessionTranscript.trim();
          if (!base) return spoken;
          return `${base}\n${spoken}`;
        });
      };

      recognition.start();
      setRecognitionInstance(recognition);
    } catch (e: any) {
      setSpeechError(`Failed to initialize speech recognition: ${e.message}`);
    }
  };

  const stopListening = () => {
    if (recognitionInstance) {
      recognitionInstance.stop();
    }
    setIsListening(false);
  };

  // Clean up speech recognition on unmount
  React.useEffect(() => {
    return () => {
      if (recognitionInstance) {
        recognitionInstance.stop();
      }
    };
  }, [recognitionInstance]);

  // Sort entries chronologically for the Recharts line chart (up to last 30 entries representing the 30-day timeframe)
  const sortedHistory = [...history].sort((a, b) => {
    const timeA = parseJournalDate(a.date) || (a.id.startsWith("j-") && !isNaN(Number(a.id.substring(2))) ? Number(a.id.substring(2)) : 0);
    const timeB = parseJournalDate(b.date) || (b.id.startsWith("j-") && !isNaN(Number(b.id.substring(2))) ? Number(b.id.substring(2)) : 0);
    
    if (timeA === 0 && timeB === 0) {
      const idNumA = parseInt(a.id.replace("j-", ""), 10) || 0;
      const idNumB = parseInt(b.id.replace("j-", ""), 10) || 0;
      if (idNumA < 10 && idNumB < 10) {
        return idNumB - idNumA; // For initial mock IDs, smaller number means newer, so reverse them to get chronological
      }
      return idNumA - idNumB;
    }
    return timeA - timeB;
  });

  const handleSubmitJournal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!entryText.trim() || isAnalyzing) return;

    setIsAnalyzing(true);
    setErrMessage(null);

    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (user) {
        try {
          const idToken = await user.getIdToken();
          if (idToken) headers["Authorization"] = `Bearer ${idToken}`;
        } catch (tokenErr) {
          console.warn("Could not retrieve ID token:", tokenErr);
        }
      }

      const response = await fetch("/api/buddy/journal", {
        method: "POST",
        headers,
        body: JSON.stringify({
          journalText: entryText,
          buddyId: selectedBuddy.id
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.details || data.error || "Analysis failed.");
      }

      const newEntry: JournalEntry = {
        id: "j-" + Date.now(),
        date: new Date().toLocaleDateString([], { month: "short", day: "numeric" }),
        entryText: entryText,
        sentiment: data.sentiment || "Neutral",
        sentimentScore: data.sentimentScore || 5,
        fatigueLevel: data.fatigueLevel || 5,
        stressLevel: data.stressLevel || 5,
        motivationLevel: data.motivationLevel || 5,
        feedback: data.feedback || `Saved! Keep up the introspection.`
      };

      onAddJournal(newEntry);
      setEntryText("");
    } catch (err: any) {
      console.error("Journal submission error:", err);
      setErrMessage(err.message || "Failed to analyze sentiment. Is the Gemini API Key active?");
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Helper to color-code sentiment scores
  const getScoreColor = (score: number) => {
    if (score >= 7) return "bg-emerald-500/10 border-emerald-900/50 text-emerald-400";
    if (score >= 4) return "bg-amber-500/10 border-amber-900/50 text-amber-400";
    return "bg-red-500/10 border-red-900/50 text-red-400";
  };

  return (
    <div id="journal-tab-container" className="h-full bg-slate-950 p-4 space-y-5 overflow-y-auto scrollbar-thin">
      
      {/* Logger Input Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl">
        <div className="flex items-center space-x-2 mb-3">
          <div className={`p-1.5 rounded-lg bg-slate-950 text-emerald-400 shadow`}>
            <Heart className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-semibold text-slate-100 flex items-center space-x-1.5">
              <span>Mind-Body Daily Reflection</span>
              <span className="text-[8px] bg-emerald-500/10 text-emerald-400 font-bold px-1.5 py-0.5 rounded border border-emerald-950">
                SENTIMENT AI
              </span>
            </h3>
            <p className="text-[10px] text-slate-400 mt-0.5">Let {selectedBuddy.name} decode your stress, fatigue & motivational energy.</p>
          </div>
        </div>

        {/* Input Mode Selector */}
        <div className="flex items-center justify-between border-t border-b border-slate-850/50 py-2.5 mb-3.5">
          <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Input Mode</span>
          <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-850">
            <button
              type="button"
              onClick={() => {
                if (isListening) stopListening();
                setInputMode("keyboard");
              }}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all flex items-center space-x-1 cursor-pointer ${
                inputMode === "keyboard"
                  ? "bg-emerald-500 text-slate-950 shadow"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Keyboard className="w-3.5 h-3.5" />
              <span>Keyboard</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setInputMode("voice");
              }}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all flex items-center space-x-1 cursor-pointer ${
                inputMode === "voice"
                  ? "bg-emerald-500 text-slate-950 shadow"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Mic className="w-3.5 h-3.5" />
              <span>Voice Dictation</span>
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmitJournal} className="space-y-3.5">
          {inputMode === "keyboard" ? (
            <textarea
              value={entryText}
              onChange={(e) => setEntryText(e.target.value)}
              disabled={isAnalyzing}
              placeholder={`e.g. "Feeling really fatigued from leg day but proud I got 7 hours of sleep. Work is a bit overwhelming today though..."`}
              className="w-full h-24 bg-slate-950 border border-slate-850 focus:border-slate-700 rounded-xl p-3 text-xs text-slate-100 focus:outline-none placeholder-slate-500 leading-relaxed resize-none disabled:opacity-60"
            ></textarea>
          ) : (
            /* Voice Recording Mode Deck */
            <div className="space-y-3.5">
              {!isSpeechSupported ? (
                <div className="p-3.5 bg-amber-500/10 border border-amber-900/40 rounded-xl flex items-start space-x-2 text-[11px] text-amber-200 leading-relaxed">
                  <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold">Web Speech API is not supported in this browser.</p>
                    <p className="text-slate-400 mt-1">Please try using Google Chrome, Apple Safari, or Microsoft Edge for the voice dictation features.</p>
                  </div>
                </div>
              ) : (
                <div className="bg-slate-950 rounded-xl p-4 border border-slate-850 flex flex-col items-center justify-center text-center space-y-4 animate-fade-in relative overflow-hidden">
                  {/* Voice Soundwaves simulation */}
                  {isListening && (
                    <div className="absolute top-2 right-3 flex items-center space-x-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                      <span className="text-[8px] uppercase font-mono font-bold text-emerald-400">Recording</span>
                    </div>
                  )}

                  <div className="flex flex-col items-center">
                    <button
                      type="button"
                      onClick={isListening ? stopListening : startListening}
                      className={`w-16 h-16 rounded-full flex items-center justify-center transition-all cursor-pointer border ${
                        isListening
                          ? "bg-red-500 border-red-400 text-slate-950 shadow-lg shadow-red-500/20 animate-pulse scale-105"
                          : "bg-emerald-500 border-emerald-400 text-slate-950 hover:bg-emerald-400"
                      }`}
                    >
                      {isListening ? (
                        <MicOff className="w-7 h-7 stroke-[2.5]" />
                      ) : (
                        <Mic className="w-7 h-7 stroke-[2.5]" />
                      )}
                    </button>
                    <p className="text-[11px] font-bold text-slate-200 mt-3">
                      {isListening ? "Listening... Speak naturally" : "Click to Start Voice Reflection"}
                    </p>
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      {isListening ? "Recording in real-time. Tap again to stop." : "Your spoken words will automatically convert to text."}
                    </p>
                  </div>

                  {/* Animated audio equalizer wave when active */}
                  {isListening && (
                    <div className="flex items-center justify-center space-x-1 h-5 py-1">
                      {[1, 2, 3, 4, 5, 6, 7, 8].map((bar) => (
                        <motion.div
                          key={bar}
                          animate={{
                            height: [6, 16, 8, 20, 6][bar % 5]
                          }}
                          transition={{
                            repeat: Infinity,
                            duration: 0.4 + (bar * 0.08),
                            ease: "easeInOut"
                          }}
                          className="w-1 bg-emerald-400 rounded-full"
                        />
                      ))}
                    </div>
                  )}

                  {/* Speech Error Banner if any */}
                  {speechError && (
                    <div className="p-2.5 bg-red-950/40 border border-red-900/50 rounded-xl text-[10px] text-red-300 w-full text-left">
                      {speechError}
                    </div>
                  )}

                  {/* Live Transcribed Draft area */}
                  <div className="w-full text-left space-y-1.5">
                    <div className="flex justify-between items-center text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                      <span>Transcribed Draft</span>
                      {entryText.trim() && (
                        <button
                          type="button"
                          onClick={() => setEntryText("")}
                          className="text-red-400 hover:text-red-300 font-bold lowercase transition-all cursor-pointer"
                        >
                          clear draft
                        </button>
                      )}
                    </div>
                    <div className="w-full min-h-[60px] max-h-32 overflow-y-auto bg-slate-900 border border-slate-850 rounded-lg p-2.5 text-xs text-slate-300 leading-relaxed italic scrollbar-thin">
                      {entryText.trim() ? (
                        `"${entryText}"`
                      ) : (
                        <span className="text-slate-600 not-italic">No transcription captured yet. Speak, or toggle back to keyboard to write or edit.</span>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {errMessage && (
            <div className="p-3 bg-red-950/40 border border-red-900/50 rounded-xl text-xs text-red-200 flex items-start space-x-2">
              <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
              <p>{errMessage}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={!entryText.trim() || isAnalyzing || isListening}
            className={`w-full py-2.5 rounded-xl text-xs font-bold transition-all shadow flex items-center justify-center space-x-1.5 bg-gradient-to-r ${
              selectedBuddy.gradient
            } text-slate-950 hover:scale-[1.01] active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {isAnalyzing ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Companion analyzing emotional spectrum...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5 fill-slate-950" />
                <span>Log Reflection & Check Sentiment</span>
              </>
            )}
          </button>
        </form>
      </div>

      {/* Visual Sentiment Index Map */}
      {history.length > 0 && (
        <div className="bg-slate-900/40 border border-slate-850 rounded-2xl p-4">
          <div className="flex items-center space-x-2 mb-4">
            <BarChart2 className="w-4 h-4 text-slate-400" />
            <h4 className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Mind-Body Metrics Timeline</h4>
          </div>

          {/* Mini Interactive SVG Dashboard Sparklines */}
          <div className="grid grid-cols-3 gap-2.5 mb-2 text-center">
            <div className="bg-slate-950/80 border border-slate-850 p-2.5 rounded-xl">
              <span className="text-[8px] uppercase font-bold text-slate-500">Avg Positivity</span>
              <p className="text-sm font-mono font-bold text-emerald-400 mt-0.5">
                {(history.reduce((acc, curr) => acc + curr.sentimentScore, 0) / history.length).toFixed(1)}/10
              </p>
            </div>
            <div className="bg-slate-950/80 border border-slate-850 p-2.5 rounded-xl">
              <span className="text-[8px] uppercase font-bold text-slate-500">Avg Fatigue</span>
              <p className="text-sm font-mono font-bold text-amber-500 mt-0.5">
                {(history.reduce((acc, curr) => acc + curr.fatigueLevel, 0) / history.length).toFixed(1)}/10
              </p>
            </div>
            <div className="bg-slate-950/80 border border-slate-850 p-2.5 rounded-xl">
              <span className="text-[8px] uppercase font-bold text-slate-500">Avg Stress</span>
              <p className="text-sm font-mono font-bold text-violet-400 mt-0.5">
                {(history.reduce((acc, curr) => acc + curr.stressLevel, 0) / history.length).toFixed(1)}/10
              </p>
            </div>
          </div>

          {/* Sentiment & Mood Trend Line Chart */}
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="mt-4 bg-slate-950 p-3.5 rounded-xl border border-slate-900"
          >
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wide mb-3 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                <span>30-Day Sentiment & Mood Spectrum Trend</span>
              </span>
              <span className="text-slate-500 text-[8px] bg-slate-900 border border-slate-800 px-1.5 py-0.5 rounded">
                Last {history.length} Logs
              </span>
            </p>
            <div className="h-48 w-full pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={sortedHistory.slice(-30)}
                  margin={{ top: 5, right: 10, left: -25, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                  <XAxis
                    dataKey="date"
                    stroke="#64748b"
                    fontSize={9}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    stroke="#64748b"
                    fontSize={9}
                    tickLine={false}
                    axisLine={false}
                    domain={[0, 10]}
                    ticks={[0, 2, 4, 6, 8, 10]}
                  />
                  <ChartTooltip content={<MoodTooltip />} cursor={{ stroke: "#334155", strokeWidth: 1 }} />
                  <Legend 
                    verticalAlign="top" 
                    height={36} 
                    iconSize={8}
                    content={({ payload }) => (
                      <div className="flex items-center justify-center space-x-4 mb-2 text-[8px] text-slate-400 font-medium">
                        {payload?.map((entry: any, index: number) => (
                          <span key={`item-${index}`} className="flex items-center space-x-1">
                            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: entry.color }}></span>
                            <span>{entry.value}</span>
                          </span>
                        ))}
                      </div>
                    )}
                  />
                  <Line
                    type="monotone"
                    dataKey="sentimentScore"
                    name="Positivity"
                    stroke="#10b981"
                    strokeWidth={2}
                    dot={{ r: 3, strokeWidth: 1 }}
                    activeDot={{ r: 5, strokeWidth: 1, stroke: "#ffffff" }}
                  />
                  <Line
                    type="monotone"
                    dataKey="stressLevel"
                    name="Stress"
                    stroke="#8b5cf6"
                    strokeWidth={1.5}
                    strokeDasharray="4 4"
                    dot={{ r: 2 }}
                    activeDot={{ r: 4 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="fatigueLevel"
                    name="Fatigue"
                    stroke="#f59e0b"
                    strokeWidth={1.5}
                    strokeDasharray="3 3"
                    dot={{ r: 2 }}
                    activeDot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </motion.div>
        </div>
      )}

      {/* History Log */}
      <div className="space-y-3">
        <h4 className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Historical reflections</h4>
        {history.length === 0 ? (
          <div className="p-8 text-center bg-slate-900/30 border border-slate-850/60 rounded-2xl flex flex-col items-center justify-center space-y-4">
            <div className="w-20 h-20 relative flex items-center justify-center">
              <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-[0_0_12px_rgba(129,140,248,0.25)]">
                <defs>
                  <linearGradient id="bookGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#818cf8" />
                    <stop offset="100%" stopColor="#4f46e5" />
                  </linearGradient>
                  <linearGradient id="glowGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#c7d2fe" stopOpacity="0.4" />
                    <stop offset="100%" stopColor="#818cf8" stopOpacity="0" />
                  </linearGradient>
                  <linearGradient id="quillGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#f472b6" />
                    <stop offset="100%" stopColor="#ec4899" />
                  </linearGradient>
                </defs>
                {/* Glowing light rays */}
                <path d="M50,15 L50,5 M15,50 L5,50 M85,50 L95,50 M25,25 L18,18 M75,25 L82,18" stroke="#a5b4fc" strokeWidth="1.5" strokeLinecap="round" opacity="0.4" />
                
                {/* Swirling thoughts/ideas */}
                <path d="M 15 35 Q 35 20 50 35 T 85 35" fill="none" stroke="url(#glowGrad)" strokeWidth="2.5" strokeLinecap="round" />
                
                {/* Open Book */}
                {/* Left Page */}
                <path d="M50,75 C35,70 20,74 15,75 L15,40 C20,39 35,35 50,40 Z" fill="#0f172a" stroke="url(#bookGrad)" strokeWidth="1.5" strokeLinejoin="round" />
                {/* Right Page */}
                <path d="M50,75 C65,70 80,74 85,75 L85,40 C80,39 65,35 50,40 Z" fill="#0f172a" stroke="url(#bookGrad)" strokeWidth="1.5" strokeLinejoin="round" />
                
                {/* Page lines */}
                <path d="M22,48 L43,45 M22,54 L43,51 M22,60 L43,57 M22,66 L43,63" stroke="#312e81" strokeWidth="1.5" strokeLinecap="round" />
                <path d="M57,45 L78,48 M57,51 L78,54 M57,57 L78,60 M57,63 L78,66" stroke="#312e81" strokeWidth="1.5" strokeLinecap="round" />

                {/* Feather Quill */}
                <path d="M55,20 C57,22 62,35 52,48 L48,52 L50,45 C54,35 53,23 55,20" fill="url(#quillGrad)" />
                <path d="M48,52 L43,57" stroke="#ec4899" strokeWidth="1.5" strokeLinecap="round" />

                {/* Sparkling Stars */}
                <path d="M 32 24 L 33 27 L 36 28 L 33 29 L 32 32 L 31 29 L 28 28 L 31 27 Z" fill="#fef08a" opacity="0.9" />
                <circle cx="72" cy="22" r="1.5" fill="#60a5fa" />
                <circle cx="24" cy="56" r="1" fill="#f472b6" />
              </svg>
            </div>
            <p className="text-xs text-slate-400 max-w-[280px] mx-auto leading-relaxed">
              No reflections logged yet. Write down your mood, thoughts, and daily mental state above to start tracking your mindfulness trends!
            </p>
          </div>
        ) : (
          history.slice().reverse().map((j) => (
            <div key={j.id} className="bg-slate-900 border border-slate-800/80 rounded-xl p-4 space-y-3.5 hover:border-slate-700 transition-all">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-300 font-mono">{j.date}</span>
                
                {/* Sentiment Pill & Delete */}
                <div className="flex items-center space-x-2">
                  <span className={`text-[9px] font-bold px-2 py-0.5 rounded border ${getScoreColor(j.sentimentScore)}`}>
                    Sentiment: {j.sentiment}
                  </span>
                  {onDeleteJournal && (
                    <button
                      onClick={() => setJournalConfirmModal({ id: j.id, date: j.date })}
                      aria-label={`Delete reflection from ${j.date}`}
                      className="p-1 rounded bg-slate-950 border border-slate-850 text-red-400 hover:text-red-300 transition-all cursor-pointer"
                      title="Delete reflection"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              <p className="text-xs text-slate-300 italic leading-relaxed bg-slate-950 p-3 rounded-lg border border-slate-850/50">
                "{j.entryText}"
              </p>

              {/* Multi-metrics summary pills */}
              <div className="grid grid-cols-3 gap-2 text-center text-[9px] font-semibold">
                <div className="bg-slate-950 py-1 px-2 rounded border border-slate-850 flex items-center justify-between">
                  <span className="text-slate-500">MIND:</span>
                  <span className="text-emerald-400">{j.sentimentScore}/10</span>
                </div>
                <div className="bg-slate-950 py-1 px-2 rounded border border-slate-850 flex items-center justify-between">
                  <span className="text-slate-500">FATIGUE:</span>
                  <span className="text-amber-400">{j.fatigueLevel}/10</span>
                </div>
                <div className="bg-slate-950 py-1 px-2 rounded border border-slate-850 flex items-center justify-between">
                  <span className="text-slate-500">STRESS:</span>
                  <span className="text-violet-400">{j.stressLevel}/10</span>
                </div>
              </div>

              {/* Companion Response Card */}
              <div className={`pt-3 border-t border-slate-850/60 flex items-start space-x-2.5`}>
                <div className="text-lg p-1 bg-slate-950 rounded flex-shrink-0 border border-slate-800 shadow">
                  {selectedBuddy.avatarUrl}
                </div>
                <div className="flex-1">
                  <span className="text-[8px] font-extrabold uppercase text-slate-400 tracking-wide block mb-0.5 flex items-center space-x-1">
                    <MessageSquareText className="w-3 h-3 text-slate-500" />
                    <span>Response from {selectedBuddy.name}</span>
                  </span>
                  <p className="text-xs text-slate-200 font-medium leading-relaxed">
                    {j.feedback}
                  </p>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Non-blocking Reflection Delete Confirmation Modal */}
      {journalConfirmModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[110] flex items-center justify-center p-4 animate-fade-in select-none">
          <div role="dialog" aria-modal="true" aria-labelledby="journal-delete-title" className="bg-slate-900 border border-slate-800 rounded-2xl p-5 max-w-sm w-full space-y-4 shadow-2xl relative">
            <div className="flex items-start justify-between">
              <div className="flex items-center space-x-2 text-amber-500">
                <AlertTriangle className="w-5 h-5 text-amber-400" />
                <h4 id="journal-delete-title" className="font-bold text-sm text-slate-100">Delete Reflection?</h4>
              </div>
              <button
                onClick={() => setJournalConfirmModal(null)}
                aria-label="Close modal"
                className="text-slate-500 hover:text-slate-300 p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Are you sure you want to delete this reflection entry from {journalConfirmModal.date}? This action cannot be undone.
            </p>

            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setJournalConfirmModal(null)}
                className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-slate-950 border border-slate-850 text-slate-300 hover:text-slate-100 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (onDeleteJournal) {
                    onDeleteJournal(journalConfirmModal.id);
                  }
                  setJournalConfirmModal(null);
                }}
                className="px-4 py-1.5 rounded-xl text-xs font-bold bg-red-500 hover:bg-red-400 text-slate-950 transition-colors shadow cursor-pointer"
              >
                Delete Entry
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
