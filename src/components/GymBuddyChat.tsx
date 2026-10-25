import React, { useState, useRef, useEffect } from "react";
import { GymBuddy, Message, UserStats } from "../types";
import { Send, Bot, User, Sparkles, AlertCircle, Dumbbell, ShieldAlert, HeartHandshake } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { saveCoachMessage } from "../services/firestoreService";

interface GymBuddyChatProps {
  selectedBuddy: GymBuddy;
  userStats: UserStats;
  todayWorkoutName: string;
  onAddCalories: (cals: number) => void;
  chatHistories?: Record<string, Message[]>;
  onUpdateChatHistories?: React.Dispatch<React.SetStateAction<Record<string, Message[]>>>;
}

const getInitialBuddyMessage = (buddy: GymBuddy): Message => ({
  id: `initial-${buddy.id}`,
  sender: "buddy",
  role: "model",
  content: buddy.id === "marcus"
    ? `Hey Champ! I'm Marcus, your virtual gym buddy. ${buddy.tagline} How are you feeling today? Ready to crush some goals?`
    : `Hey! I'm ${buddy.name}, your virtual gym buddy. ${buddy.tagline} Ready to lock in and progress today? What's our focus?`,
  timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
});

export default function GymBuddyChat({
  selectedBuddy,
  userStats,
  todayWorkoutName,
  onAddCalories,
  chatHistories,
  onUpdateChatHistories
}: GymBuddyChatProps) {
  const { user } = useAuth();
  // Fallback internal state if not controlled by parent
  const [localChatHistories, setLocalChatHistories] = useState<Record<string, Message[]>>(() => {
    if (chatHistories) return chatHistories;
    const cached = localStorage.getItem("vgb_chat_history");
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          return parsed;
        }
      } catch (e) {
        console.error("Failed to parse cached chat history", e);
      }
    }
    return {};
  });

  const activeHistories = chatHistories ?? localChatHistories;
  const messages = activeHistories[selectedBuddy.id] && activeHistories[selectedBuddy.id].length > 0
    ? activeHistories[selectedBuddy.id]
    : [getInitialBuddyMessage(selectedBuddy)];

  const updateBuddyMessages = (buddyId: string, nextMsgs: Message[]) => {
    if (onUpdateChatHistories) {
      onUpdateChatHistories((prev) => ({
        ...prev,
        [buddyId]: nextMsgs
      }));
    } else {
      setLocalChatHistories((prev) => {
        const next = { ...prev, [buddyId]: nextMsgs };
        try {
          localStorage.setItem("vgb_chat_history", JSON.stringify(next));
        } catch (e) {
          console.error("Failed to cache chat history", e);
        }
        return next;
      });
    }
  };

  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom when messages load/change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading, selectedBuddy.id]);

  // Clear transient error and input on buddy change
  useEffect(() => {
    setApiError(null);
    setInput("");
  }, [selectedBuddy.id]);

  const handleSendMessage = async (textToSend: string) => {
    if (!textToSend.trim() || isLoading) return;

    // Pin the coach ID at time of message dispatch to prevent race conditions if user switches coaches during generation
    const buddyIdAtSend = selectedBuddy.id;

    const userMsg: Message = {
      id: Date.now().toString(),
      sender: "user",
      role: "user",
      content: textToSend,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    };

    const nextMessages = [...messages, userMsg];
    updateBuddyMessages(buddyIdAtSend, nextMessages);
    setInput("");
    setIsLoading(true);
    setApiError(null);

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

      const response = await fetch("/api/buddy/chat", {
        method: "POST",
        headers,
        body: JSON.stringify({
          messages: nextMessages.map(m => ({ role: m.role, content: m.content })),
          buddyId: buddyIdAtSend,
          userContext: {
            streak: userStats.streak,
            goal: userStats.goal,
            waterMl: userStats.waterLoggedMl,
            todayWorkout: todayWorkoutName,
            mood: userStats.recentMood
          }
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.details || data.error || "Failed to communicate with Gym Buddy.");
      }

      const buddyMsg: Message = {
        id: (Date.now() + 1).toString(),
        sender: "buddy",
        role: "model",
        content: data.reply,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      };

      updateBuddyMessages(buddyIdAtSend, [...nextMessages, buddyMsg]);

      // If authenticated, persist conversation to Firestore
      if (user) {
        saveCoachMessage(user.uid, buddyIdAtSend, userMsg).catch(console.warn);
        saveCoachMessage(user.uid, buddyIdAtSend, buddyMsg).catch(console.warn);
      }
    } catch (err: any) {
      console.error("Chat error:", err);
      setApiError(err.message || "Unable to reach your gym buddy right now. Please check your connection or try again shortly.");
    } finally {
      setIsLoading(false);
    }
  };

  const starterPrompts = [
    { label: "Give me quick motivation", text: "I'm feeling really lazy and unmotivated to work out today. Push me!" },
    { label: "Check my hydration", text: `I've drank ${userStats.waterLoggedMl}ml of water today out of ${userStats.waterTargetMl}ml. Is that good?` },
    { label: "How do I optimize fat loss?", text: "Explain the best heart rate zone and nutrition approach for fat loss." },
    { label: "Explain push-up form", text: "Explain proper arm angle and body form to maximize chest load during a push-up." }
  ];

  return (
    <div id="chat-tab-container" className="flex flex-col h-full bg-slate-950">
      {/* Buddy Character Banner */}
      <div id="chat-buddy-banner" className={`p-4 border-b border-slate-800 ${selectedBuddy.chatHeaderBg} backdrop-blur-md flex items-center justify-between`}>
        <div className="flex items-center space-x-3">
          <div className={`w-11 h-11 rounded-full bg-gradient-to-tr ${selectedBuddy.gradient} flex items-center justify-center text-2xl shadow-inner relative ring-2 ring-slate-800`}>
            <span>{selectedBuddy.avatarUrl}</span>
            <span className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-slate-950 rounded-full"></span>
          </div>
          <div>
            <div className="flex items-center space-x-1.5">
              <h2 className="font-semibold text-slate-100">{selectedBuddy.name}</h2>
              <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700`}>
                Buddy
              </span>
            </div>
            <p className="text-xs text-slate-400 font-medium line-clamp-1">{selectedBuddy.role}</p>
          </div>
        </div>

        {/* Mini stats helper overlay in chat */}
        <div className="hidden sm:flex flex-col items-end text-right">
          <div className="flex items-center space-x-1 text-amber-500 text-xs font-semibold">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Streak: {userStats.streak} Days</span>
          </div>
          <span className="text-[10px] text-slate-400">Targeting: {userStats.goal}</span>
        </div>
      </div>

      {/* Messages Scroll Area */}
      <div id="chat-messages-container" className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin bg-radial from-slate-900 to-slate-950">
        {messages.map((m) => {
          const isUser = m.sender === "user";
          return (
            <div
              key={m.id}
              className={`flex ${isUser ? "justify-end" : "justify-start"} items-end space-x-2 animate-fade-in`}
            >
              {!isUser && (
                <div className={`w-7 h-7 rounded-full bg-gradient-to-tr ${selectedBuddy.gradient} flex items-center justify-center text-sm shadow-sm flex-shrink-0`}>
                  <span>{selectedBuddy.avatarUrl}</span>
                </div>
              )}
              
              <div
                className={`max-w-[78%] rounded-2xl px-4 py-2.5 text-sm ${
                  isUser
                    ? `${selectedBuddy.primaryColor} text-slate-950 rounded-br-none font-medium`
                    : "bg-slate-900 text-slate-200 border border-slate-800 rounded-bl-none"
                }`}
              >
                <p className="whitespace-pre-wrap leading-relaxed">{m.content}</p>
                <span className={`block text-[9px] mt-1 text-right ${isUser ? "text-slate-900/75" : "text-slate-500"}`}>
                  {m.timestamp}
                </span>
              </div>

              {isUser && (
                <div className="w-7 h-7 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-xs text-slate-300 flex-shrink-0">
                  <User className="w-4 h-4" />
                </div>
              )}
            </div>
          );
        })}

        {isLoading && (
          <div className="flex justify-start items-center space-x-2 animate-pulse">
            <div className={`w-7 h-7 rounded-full bg-gradient-to-tr ${selectedBuddy.gradient} flex items-center justify-center text-sm`}>
              <span>{selectedBuddy.avatarUrl}</span>
            </div>
            <div className="bg-slate-900 text-slate-400 border border-slate-800 rounded-2xl rounded-bl-none px-4 py-3 text-xs flex items-center space-x-1.5">
              <span className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: "0ms" }}></span>
              <span className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: "150ms" }}></span>
              <span className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: "300ms" }}></span>
              <span className="text-[11px] text-slate-500 ml-1">{selectedBuddy.name} is formulating response...</span>
            </div>
          </div>
        )}

        {apiError && (
          <div className="p-3.5 bg-red-950/40 border border-red-900/50 rounded-xl flex items-start space-x-2.5 max-w-[90%] mx-auto text-xs text-red-200 animate-shake">
            <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold block text-red-400 mb-0.5">Companion Error</span>
              <p>{apiError}</p>
              <div className="mt-2 text-[10px] text-red-400/80 bg-red-950/60 p-1.5 rounded border border-red-900/30 font-mono">
                Hint: If this persists, please check your network connection or try again shortly.
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Suggested Quick Starters */}
      {messages.length <= 2 && !isLoading && (
        <div id="suggested-prompts" className="px-4 py-2 bg-slate-950 border-t border-slate-900">
          <div className="flex items-center space-x-1.5 mb-2">
            <HeartHandshake className="w-3.5 h-3.5 text-slate-500" />
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Quick Prompts</span>
          </div>
          <div className="flex flex-wrap gap-1.5 overflow-x-auto pb-1 max-h-24 scrollbar-thin">
            {starterPrompts.map((p, idx) => (
              <button
                key={idx}
                onClick={() => handleSendMessage(p.text)}
                className="px-2.5 py-1 text-xs bg-slate-900 hover:bg-slate-850 hover:border-slate-700 text-slate-300 border border-slate-800 rounded-full transition-all text-left truncate max-w-[280px]"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input Message Form */}
      <form
        id="chat-input-form"
        onSubmit={(e) => {
          e.preventDefault();
          handleSendMessage(input);
        }}
        className="p-3 bg-slate-900/80 border-t border-slate-800 backdrop-blur-md flex items-center space-x-2"
      >
        <input
          id="chat-text-input"
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={`Message ${selectedBuddy.name}...`}
          disabled={isLoading}
          className="flex-1 bg-slate-950 border border-slate-800 focus:border-slate-700 focus:ring-1 focus:ring-slate-700 rounded-xl px-4 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none transition-all disabled:opacity-60"
        />
        <button
          id="chat-send-button"
          type="submit"
          disabled={!input.trim() || isLoading}
          className={`p-2.5 rounded-xl transition-all ${
            input.trim() && !isLoading
              ? `${selectedBuddy.primaryColor} text-slate-950 hover:scale-105 active:scale-95 cursor-pointer font-bold`
              : "bg-slate-800 text-slate-600 cursor-not-allowed"
          }`}
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
}
