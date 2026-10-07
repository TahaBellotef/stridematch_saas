"use client";

import React, { useEffect, useState } from "react";
import SettingsToolbar from "../SettingsToolbar";
import { User, Envelope } from "@phosphor-icons/react";
import { updateUserAttributes } from "aws-amplify/auth";
import { useAuth } from "@/shared/auth";
import { useToast } from "@/components/shared/Toast";

export default function AccountSettings() {
  const { user, refreshUser } = useAuth();
  const { showToast } = useToast();

  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
  });
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    if (!user) return;
    setFormData({
      firstName: user.first_name || "",
      lastName: user.last_name || "",
    });
  }, [user]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setSaveSuccess(false);
  };

  const handleSaveChanges = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(false);
    try {
      await updateUserAttributes({
        userAttributes: {
          given_name: formData.firstName,
          family_name: formData.lastName,
        },
      });
      await refreshUser();
      setSaveSuccess(true);
      showToast("success", "Your profile information was updated.");
    } catch (error) {
      console.error("Failed to update profile:", error);
      const message = error instanceof Error ? error.message : "Failed to save changes. Please try again.";
      setSaveError(message);
      showToast("error", message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setFormData({
      firstName: user?.first_name || "",
      lastName: user?.last_name || "",
    });
    setSaveError(null);
    setSaveSuccess(false);
  };

  const userInitials = `${formData.firstName?.[0] ?? ""}${formData.lastName?.[0] ?? ""}`
    .toUpperCase()
    .trim() || "AD";

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
            <div className="rounded-xl p-5 sm:p-8" style={{ background: 'var(--sm-content)' }}>
              <form onSubmit={handleSaveChanges}>
                {/* Avatar (initials only - no photo upload is backed by the server yet) */}
                <div className="mb-8 flex items-center gap-6">
                  <div
                    className="w-24 h-24 rounded-full flex items-center justify-center shrink-0"
                    style={{
                      background: 'linear-gradient(180deg, #3C3854 0%, #4B4474 100%)',
                      border: '1px solid rgba(0, 0, 0, 0.3)',
                      boxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.05), 0 2px 8px rgba(0, 0, 0, 0.2)'
                    }}
                  >
                    <span className="text-2xl text-white">{userInitials}</span>
                  </div>
                  <p className="text-sm text-gray-400">
                    Your avatar is generated from your name. Profile pictures aren&apos;t supported yet.
                  </p>
                </div>

                {/* Form Fields */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* First name */}
                  <div>
                    <label className="block text-sm text-gray-300 mb-2">
                      First name
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <User size={18} className="text-white" />
                      </div>
                      <input
                        type="text"
                        name="firstName"
                        value={formData.firstName}
                        onChange={handleInputChange}
                        placeholder="Type your first name"
                        className="w-full text-white placeholder:text-gray-500 rounded-lg pl-10 pr-4 py-3 outline-none focus:ring-2 focus:ring-purple-500 transition-all"
                        style={{
                          background: 'rgba(255, 255, 255, 0.05)',
                          border: '1px solid rgba(0, 0, 0, 0.3)',
                          boxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.05), 0 2px 8px rgba(0, 0, 0, 0.2)'
                        }}
                      />
                    </div>
                  </div>

                  {/* Last name */}
                  <div>
                    <label className="block text-sm text-gray-300 mb-2">
                      Last name
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <User size={18} className="text-white" />
                      </div>
                      <input
                        type="text"
                        name="lastName"
                        value={formData.lastName}
                        onChange={handleInputChange}
                        placeholder="Type your last name"
                        className="w-full text-white placeholder:text-gray-500 rounded-lg pl-10 pr-4 py-3 outline-none focus:ring-2 focus:ring-purple-500 transition-all"
                        style={{
                          background: 'rgba(255, 255, 255, 0.05)',
                          border: '1px solid rgba(0, 0, 0, 0.3)',
                          boxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.05), 0 2px 8px rgba(0, 0, 0, 0.2)'
                        }}
                      />
                    </div>
                  </div>

                  {/* Email (read-only - changing it requires Cognito email verification) */}
                  <div className="md:col-span-2">
                    <label className="block text-sm text-gray-300 mb-2">
                      Email
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Envelope size={18} className="text-white" />
                      </div>
                      <input
                        type="email"
                        value={user?.email || ""}
                        disabled
                        className="w-full text-gray-400 rounded-lg pl-10 pr-4 py-3 outline-none cursor-not-allowed"
                        style={{
                          background: 'rgba(255, 255, 255, 0.03)',
                          border: '1px solid rgba(0, 0, 0, 0.3)',
                          boxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.05)'
                        }}
                      />
                    </div>
                    <p className="text-xs text-gray-500 mt-1.5">
                      Contact an administrator to change the email address on your account.
                    </p>
                  </div>
                </div>

                {saveError && (
                  <p className="mt-4 text-sm text-red-400">{saveError}</p>
                )}
                {saveSuccess && (
                  <p className="mt-4 text-sm text-emerald-400">Profile updated successfully.</p>
                )}

                {/* Action Buttons */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-4 mt-8">
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="px-6 py-3 text-white rounded-lg transition-all font-medium hover:shadow-xl disabled:opacity-60"
                    style={{
                      background: 'linear-gradient(180deg, #4B21EF 0%, #6F4CF5 100%)',
                      boxShadow: 'inset 0 0 0 1.5px #6A47F4, 0 4px 12px rgba(106, 71, 244, 0.4)',
                    }}
                  >
                    {isSaving ? "Saving…" : "Save Changes"}
                  </button>
                  <button
                    type="button"
                    onClick={handleCancel}
                    disabled={isSaving}
                    className="px-6 py-3 text-white rounded-lg transition-all font-medium hover:bg-opacity-90 disabled:opacity-60"
                    style={{
                      background: 'var(--sm-content)',
                      border: '1px solid rgba(0, 0, 0, 0.3)',
                      boxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.05), 0 2px 8px rgba(0, 0, 0, 0.2)'
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
