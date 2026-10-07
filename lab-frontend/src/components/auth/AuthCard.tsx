"use client";

interface AuthCardProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}

export default function AuthCard({ title, subtitle, children }: AuthCardProps) {
  return (
    <div className="bg-[#312D4B] rounded-2xl p-6 border border-slate-700/50">
      <h1 className="text-2xl font-bold text-white text-center mb-1">
        {title}
      </h1>
      {subtitle && (
        <p className="text-slate-400 text-center text-sm mb-5">
          {subtitle}
        </p>
      )}
      {children}
    </div>
  );
}
