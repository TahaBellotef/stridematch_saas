"use client";

import React, { useState } from "react";
import SettingsToolbar from "../SettingsToolbar";
import { LockKey, Password, Key, Eye, EyeSlash, X } from "@phosphor-icons/react";
import { updatePassword } from "aws-amplify/auth";
import { useToast } from "@/components/shared/Toast";

export default function SecuritySettings() {
  const { showToast } = useToast();
  const [password, setPassword] = useState("");
  const [twoFactorMethod, setTwoFactorMethod] = useState("Authenticator App");
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState("");

  const handlePasswordChange = (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError("");
    setPasswordSuccess("");
    setShowPasswordModal(true);
  };

  const handleSavePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError("");
    setPasswordSuccess("");

    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordError("Please fill in all password fields.");
      return;
    }

    if (newPassword.length < 8) {
      setPasswordError("New password must be at least 8 characters long.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError("New password and confirm password do not match.");
      return;
    }

    setIsSavingPassword(true);
    try {
      await updatePassword({ oldPassword: currentPassword, newPassword });
      setPasswordSuccess("Password changed successfully.");
      showToast("success", "Your password has been changed.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      window.setTimeout(() => {
        setShowPasswordModal(false);
        setPasswordSuccess("");
      }, 700);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to change password. Please try again.";
      setPasswordError(message);
      showToast("error", message);
    } finally {
      setIsSavingPassword(false);
    }
  };

  const handleCancelPasswordChange = () => {
    setShowPasswordModal(false);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setPasswordError("");
    setPasswordSuccess("");
  };

  const handleTwoFactorChange = (e: React.FormEvent) => {
    e.preventDefault();
    // TODO: Implement two-factor change logic
    console.log("Two-factor method:", twoFactorMethod);
  };

  return (
    <div className="admin-page p-4 sm:p-6">
      <div className="max-w-6xl mx-auto">
        {/* Outer Card */}
        <div 
          className="rounded-xl overflow-hidden" 
          style={{ 
            background: 'var(--sm-fill)',
            border: '1px solid rgba(0, 0, 0, 0.3)',
            boxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.05), 0 2px 8px rgba(0, 0, 0, 0.2)'
          }}
        >
          {/* Navigation Tabs */}
          <SettingsToolbar />
          
          {/* Inner Card with Form */}
          <div className="p-4 sm:p-6" style={{ background: 'var(--sm-fill)' }}>
            <div 
              className="rounded-xl p-5 sm:p-8 min-h-[500px]" 
              style={{ 
                background: 'var(--sm-content)',
                border: '1px solid rgba(0, 0, 0, 0.3)',
                boxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.05), 0 2px 8px rgba(0, 0, 0, 0.2)',
              }}
            >
              <div className="flex flex-col lg:flex-row lg:items-start gap-8">
                {/* Change Password Section */}
                <div className="w-full lg:max-w-[480px]">
                  <div className="flex items-start gap-3 mb-6">
                    <div 
                      className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ 
                        background: '#312D4B',
                        border: '1px solid #1E1C2B',
                        boxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.05), 0 2px 8px rgba(0, 0, 0, 0.2)'
                      }}
                    >
                      <LockKey size={20} style={{ color: '#FFFFFF' }} />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-white mb-1">
                        Change Password
                      </h3>
                      <p className="text-sm text-gray-400">
                        Change your password if you think your password<br />
                        is need to change.
                      </p>
                    </div>
                  </div>
                  
                  <form onSubmit={handlePasswordChange}>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                      <div className="relative flex-1">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                          <Password size={18} className="text-white" />
                        </div>
                        <input
                          type="password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="••••••••••••••••••"
                          className="w-full text-white placeholder:text-gray-500 rounded-lg pl-10 pr-4 py-3 outline-none focus:ring-2 focus:ring-purple-500 transition-all"
                          style={{ 
                            background: 'rgba(255, 255, 255, 0.05)',
                            border: '1px solid rgba(0, 0, 0, 0.3)',
                            boxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.05), 0 2px 8px rgba(0, 0, 0, 0.2)'
                          }}
                        />
                      </div>
                      
                      <button
                        type="submit"
                        className="px-6 py-3 rounded-full transition-all font-medium hover:opacity-90 whitespace-nowrap"
                        style={{
                          background: 'linear-gradient(90deg, #3C3854 0%, #4B4474 100%)',
                          border: '1.5px solid rgba(0, 0, 0, 0.5)',
                          boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.1), 0 2px 4px rgba(0, 0, 0, 0.2)',
                          color: '#FFFFFF'
                        }}
                      >
                        Change
                      </button>
                    </div>
                  </form>
                </div>

                {/* Separator */}
                <div 
                  className="hidden lg:block w-px"
                  style={{
                    background: '#3C3854',
                    height: '160px'
                  }}
                ></div>
                <div className="block lg:hidden h-px w-full" style={{ background: '#3C3854' }} />

                {/* Two Step Verification Section */}
                <div className="w-full lg:max-w-[480px]">
                  <div className="flex items-start gap-3 mb-6">
                    <div 
                      className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ 
                        background: '#312D4B',
                        border: '1px solid #1E1C2B',
                        boxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.05), 0 2px 8px rgba(0, 0, 0, 0.2)'
                      }}
                    >
                      <Key size={20} style={{ color: '#FFFFFF' }}  />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-white mb-1">
                        Two Step Verification
                      </h3>
                      <p className="text-sm text-gray-400">
                        We use two step verification when we need to<br />
                        check it's really you using your account.
                      </p>
                    </div>
                  </div>
                  
                  <form onSubmit={handleTwoFactorChange}>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                      <div className="flex-1 flex items-center gap-3">
                        <span className="text-white font-medium">Authenticator App</span>
                      </div>
                      
                      <button
                        type="submit"
                        className="px-6 py-3 rounded-full transition-all font-medium hover:opacity-90 whitespace-nowrap"
                        style={{
                          background: 'linear-gradient(90deg, #3C3854 0%, #4B4474 100%)',
                          border: '1px solid rgba(0, 0, 0, 0.3)',
                          boxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.05), 0 2px 8px rgba(0, 0, 0, 0.2)',
                          color: '#FFFFFF'
                        }}
                      >
                        Change
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Password Change Modal */}
        {showPasswordModal && (
          <div 
            className="fixed inset-0 backdrop-blur-md flex items-center justify-center z-50"
            style={{ backgroundColor: 'rgba(0, 0, 0, 0.3)' }}
            onClick={handleCancelPasswordChange}
          >
            <div 
              className="rounded-2xl p-8 w-full max-w-md relative"
              style={{
                background: 'var(--sm-content)',
                border: '1px solid rgba(0, 0, 0, 0.3)',
                boxShadow: '0 20px 60px rgba(0, 0, 0, 0.4)'
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Close Button */}
              <button
                onClick={handleCancelPasswordChange}
                className="absolute top-6 right-6 text-gray-400 hover:text-white transition-colors"
              >
                <X size={24} />
              </button>

              {/* Modal Header */}
              <h2 className="text-2xl font-bold text-white mb-2">
                Change Your Password
              </h2>
              <p className="text-gray-400 text-sm mb-6">
                Enter a new password below to change your password.
              </p>

              {/* Password Form */}
              <form onSubmit={handleSavePassword} className="space-y-4">
                {passwordError && (
                  <p className="text-sm" style={{ color: "#FCA5A5" }}>
                    {passwordError}
                  </p>
                )}
                {passwordSuccess && (
                  <p className="text-sm" style={{ color: "#86EFAC" }}>
                    {passwordSuccess}
                  </p>
                )}

                {/* Current Password */}
                <div>
                  <label className="block text-white text-sm font-medium mb-2">
                    Current Password
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <LockKey size={18} className="text-gray-500" />
                    </div>
                    <input
                      type={showCurrentPassword ? "text" : "password"}
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="Type your password"
                      required
                      className="w-full text-white placeholder:text-gray-500 rounded-lg pl-12 pr-12 py-3 outline-none focus:ring-2 focus:ring-purple-500 transition-all"
                      style={{
                        background: 'rgba(255, 255, 255, 0.05)',
                        border: '1px solid rgba(0, 0, 0, 0.3)',
                        boxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.05)'
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                      className="absolute inset-y-0 right-0 pr-4 flex items-center text-gray-400 hover:text-white transition-colors"
                    >
                      {showCurrentPassword ? <EyeSlash size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                {/* New Password */}
                <div>
                  <label className="block text-white text-sm font-medium mb-2">
                    New Password
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <LockKey size={18} className="text-gray-500" />
                    </div>
                    <input
                      type={showNewPassword ? "text" : "password"}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Type your password"
                      required
                      className="w-full text-white placeholder:text-gray-500 rounded-lg pl-12 pr-12 py-3 outline-none focus:ring-2 focus:ring-purple-500 transition-all"
                      style={{
                        background: 'rgba(255, 255, 255, 0.05)',
                        border: '1px solid rgba(0, 0, 0, 0.3)',
                        boxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.05)'
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      className="absolute inset-y-0 right-0 pr-4 flex items-center text-gray-400 hover:text-white transition-colors"
                    >
                      {showNewPassword ? <EyeSlash size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                {/* Confirm New Password */}
                <div>
                  <label className="block text-white text-sm font-medium mb-2">
                    Confirm New Password
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <LockKey size={18} className="text-gray-500" />
                    </div>
                    <input
                      type={showConfirmPassword ? "text" : "password"}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Type your new password"
                      required
                      className="w-full text-white placeholder:text-gray-500 rounded-lg pl-12 pr-12 py-3 outline-none focus:ring-2 focus:ring-purple-500 transition-all"
                      style={{
                        background: 'rgba(255, 255, 255, 0.05)',
                        border: '1px solid rgba(0, 0, 0, 0.3)',
                        boxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.05)'
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute inset-y-0 right-0 pr-4 flex items-center text-gray-400 hover:text-white transition-colors"
                    >
                      {showConfirmPassword ? <EyeSlash size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-4 pt-4">
                  <button
                    type="button"
                    onClick={handleCancelPasswordChange}
                    className="px-8 py-3 rounded-lg font-medium transition-all hover:opacity-80"
                    style={{
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid rgba(0, 0, 0, 0.3)',
                      color: '#FFFFFF'
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingPassword}
                    className="flex-1 px-8 py-3 rounded-lg font-medium transition-all hover:opacity-90"
                    style={{
                      background: 'linear-gradient(180deg, #4B21EF 0%, #6F4CF5 100%)',
                      border: '1px solid rgba(0, 0, 0, 0.3)',
                      boxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.1), 0 4px 12px rgba(75, 33, 239, 0.3)',
                      color: '#FFFFFF',
                      opacity: isSavingPassword ? 0.7 : 1,
                    }}
                  >
                    {isSavingPassword ? "Saving..." : "Save Changes"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
