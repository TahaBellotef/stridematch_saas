"use client";

import { Envelope, Password, Eye, EyeSlash, User } from "@phosphor-icons/react";

interface AuthInputProps {
  id: string;
  label: string;
  type: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder: string;
  icon: "envelope" | "password" | "user";
  required?: boolean;
  autoComplete?: string;
  showPasswordToggle?: boolean;
  showPassword?: boolean;
  onTogglePassword?: () => void;
}

const icons = {
  envelope: <Envelope className="w-5 h-5 text-white" />,
  password: <Password className="w-5 h-5 text-white" />,
  user: <User className="w-5 h-5 text-white" />,
};

export default function AuthInput({
  id,
  label,
  type,
  value,
  onChange,
  placeholder,
  icon,
  required = true,
  autoComplete,
  showPasswordToggle = false,
  showPassword = false,
  onTogglePassword,
}: AuthInputProps) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-white">
        {label}
      </label>
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
          {icons[icon]}
        </div>
        <input
          id={id}
          type={showPasswordToggle ? (showPassword ? "text" : "password") : type}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          required={required}
          autoComplete={autoComplete}
          className="w-full border border-slate-600/50 rounded-xl pl-12 pr-12 py-2.5 text-white placeholder-slate-400 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-0"
          style={{ backgroundColor: '#534E70', '--tw-ring-color': 'var(--sm-primary)' } as React.CSSProperties}
        />
        {showPasswordToggle && onTogglePassword && (
          <button
            type="button"
            onClick={onTogglePassword}
            className="absolute inset-y-0 right-0 pr-4 flex items-center text-white hover:text-slate-200 transition-colors"
          >
            {showPassword ? (
              <EyeSlash className="w-5 h-5" />
            ) : (
              <Eye className="w-5 h-5" />
            )}
          </button>
        )}
      </div>
    </div>
  );
}
