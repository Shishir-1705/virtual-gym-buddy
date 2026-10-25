import React, { useState } from "react";
import { Smartphone, Laptop, Wifi, Battery, Signal, Zap } from "lucide-react";

interface MobileFrameProps {
  children: React.ReactNode;
  isMobileMode: boolean;
  setIsMobileMode: (val: boolean) => void;
  accountControl?: React.ReactNode;
}

export default function MobileFrame({ children, isMobileMode, setIsMobileMode, accountControl }: MobileFrameProps) {
  // Simulate current device time
  const [currentTime] = useState(() => {
    const now = new Date();
    return now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  });

  return (
    <div id="app-wrapper" className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans transition-colors duration-500">
      {/* View Switcher Controls Header */}
      <header id="viewport-switcher" className="bg-slate-900/90 border-b border-slate-800 px-4 py-3 sticky top-0 z-50 backdrop-blur-md flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="bg-amber-500 text-slate-950 p-1.5 rounded-lg flex items-center justify-center font-bold">
            <Zap className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-sm font-semibold tracking-wide text-slate-200">Virtual Gym Buddy</h1>
          </div>
        </div>

        {/* Dynamic Mode Switcher */}
        <div className="flex items-center bg-slate-950 p-1 rounded-full border border-slate-800">
          <button
            id="toggle-mobile-mode"
            onClick={() => setIsMobileMode(true)}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
              isMobileMode
                ? "bg-amber-500 text-slate-950 shadow-md font-semibold"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>Mobile App</span>
          </button>
          <button
            id="toggle-desktop-mode"
            onClick={() => setIsMobileMode(false)}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
              !isMobileMode
                ? "bg-amber-500 text-slate-950 shadow-md font-semibold"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Laptop className="w-3.5 h-3.5" />
            <span>Desktop Dashboard</span>
          </button>
        </div>

        <div className="flex items-center space-x-3">
          {accountControl}
          <div className="hidden lg:flex items-center space-x-2 text-xs text-slate-400">
            <span className="inline-block w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
            <span>AI Companion Active</span>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main id="viewport-container" className="flex-1 flex items-center justify-center py-6 px-4 md:px-8 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 overflow-x-hidden">
        {isMobileMode ? (
          /* High-Fidelity Mobile Emulator Outer Mockup */
          <div id="phone-emulator" className="relative mx-auto w-full max-w-[400px] h-[844px] max-h-[calc(100vh-4.5rem)] min-h-[580px] bg-slate-900 rounded-[50px] shadow-2xl border-[10px] border-slate-800 ring-4 ring-slate-900/40 flex flex-col overflow-hidden">
            {/* Speaker Grille and Camera Notch Overlay */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 h-6 w-36 bg-slate-800 rounded-b-2xl z-50 flex items-center justify-center">
              <div className="w-12 h-1 bg-slate-900 rounded-full mb-1"></div>
              <div className="w-2.5 h-2.5 bg-slate-900 rounded-full ml-2 mb-1"></div>
            </div>

            {/* Simulated Phone Status Bar */}
            <div className="bg-slate-950 text-slate-300 px-6 pt-2.5 pb-1 flex justify-between items-center text-[11px] font-semibold tracking-wide z-40 select-none border-b border-slate-900">
              <span>{currentTime}</span>
              <div className="flex items-center space-x-1.5">
                <Signal className="w-3.5 h-3.5 text-slate-300" />
                <Wifi className="w-3.5 h-3.5 text-slate-300" />
                <div className="flex items-center space-x-0.5">
                  <Battery className="w-4 h-4 text-slate-300" />
                </div>
              </div>
            </div>

            {/* Interactive Screen viewport */}
            <div className="flex-1 flex flex-col bg-slate-950 overflow-y-auto overflow-x-hidden scrollbar-thin relative">
              {children}
            </div>

            {/* Virtual Home Bar Indicator */}
            <div className="bg-slate-950 py-2.5 flex justify-center items-center select-none z-40">
              <div className="w-28 h-1 bg-slate-700/80 rounded-full"></div>
            </div>
          </div>
        ) : (
          /* Desktop Fluid Full Width Screen View */
          <div id="desktop-view-container" className="w-full max-w-7xl mx-auto min-h-[750px] bg-slate-900/60 rounded-3xl border border-slate-800 shadow-xl overflow-hidden flex flex-col">
            <div className="flex-1 flex flex-col overflow-y-auto scrollbar-thin">
              {children}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
