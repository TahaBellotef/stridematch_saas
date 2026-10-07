"use client";

type LoadingSpinnerProps = {
  fullScreen?: boolean;
};

export function LoadingSpinner({ fullScreen = true }: LoadingSpinnerProps) {
  return (
    <div
      className={fullScreen ? "min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 flex items-center justify-center" : "flex items-center justify-center py-8"}
    >
      <div className="text-center">
        {/* Animated Logo */}
        <div className={fullScreen ? "mb-8 flex justify-center" : "mb-4 flex justify-center"}>
          <div className={fullScreen ? "relative w-20 h-20" : "relative w-16 h-16"}>
            {/* Outer spinning ring */}
            <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-indigo-500 border-r-purple-500 animate-spin"></div>
            
            {/* Middle spinning ring (reverse) */}
            <div className="absolute inset-2 rounded-full border-2 border-transparent border-b-indigo-500 border-l-purple-500 animate-spin" style={{ animationDirection: "reverse" }}></div>
            
            {/* Inner logo text */}
            <div className="absolute inset-0 flex items-center justify-center">
              <span className={fullScreen ? "text-2xl font-bold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent" : "text-xl font-bold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent"}>SM</span>
            </div>
          </div>
        </div>

        {/* Loading text */}
        <h2 className={fullScreen ? "text-white text-lg font-semibold mb-2" : "text-white text-base font-semibold mb-1"}>StrideMatch</h2>
        <p className={fullScreen ? "text-slate-400 text-sm" : "text-slate-400 text-xs"}>Loading...</p>

        {/* Animated dots */}
        <div className={fullScreen ? "mt-4 flex justify-center gap-1" : "mt-3 flex justify-center gap-1"}>
          <div className={fullScreen ? "w-2 h-2 bg-indigo-500 rounded-full animate-bounce" : "w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce"} style={{ animationDelay: "0s" }}></div>
          <div className={fullScreen ? "w-2 h-2 bg-purple-500 rounded-full animate-bounce" : "w-1.5 h-1.5 bg-purple-500 rounded-full animate-bounce"} style={{ animationDelay: "0.2s" }}></div>
          <div className={fullScreen ? "w-2 h-2 bg-indigo-500 rounded-full animate-bounce" : "w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce"} style={{ animationDelay: "0.4s" }}></div>
        </div>
      </div>
    </div>
  );
}
