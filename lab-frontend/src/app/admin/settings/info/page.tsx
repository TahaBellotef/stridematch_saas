"use client";

import React, { useState } from "react";
import SettingsToolbar from "../SettingsToolbar";
import { CalendarBlank, Phone, Globe, Flag, GenderNeuter, Gps } from "@phosphor-icons/react";

export default function InfoSettings() {
  const [bio, setBio] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [phone, setPhone] = useState("");
  const [website, setWebsite] = useState("");
  const [country, setCountry] = useState("");
  const [language, setLanguage] = useState("");
  const [gender, setGender] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // TODO: Implement save logic
    console.log({ bio, birthDate, phone, website, country, language, gender });
  };

  const handleCancel = () => {
    // TODO: Implement cancel logic
    setBio("");
    setBirthDate("");
    setPhone("");
    setWebsite("");
    setCountry("");
    setLanguage("");
    setGender("");
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
          
          {/* Inner Card with Content */}
          <div className="p-4 sm:p-6" style={{ background: 'var(--sm-fill)' }}>
            <div 
              className="rounded-xl p-5 sm:p-8" 
              style={{ 
                background: 'var(--sm-content)',
                border: '1px solid rgba(0, 0, 0, 0.3)',
                boxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.05), 0 2px 8px rgba(0, 0, 0, 0.2)'
              }}
            >
              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Bio Section */}
                <div>
                  <label className="block text-white text-sm font-medium mb-2">
                    Bio
                  </label>
                  <textarea
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    placeholder="The name's John Deo. I am a tireless seeker of knowledge, occasional purveyor of wisdom and also, coincidentally, a graphic designer. Algolia helps businesses across industries quickly create relevant 😎, scalable 😎, and lightning 😎 fast search and discovery experiences."
                    rows={2}
                    className="w-full text-white placeholder:text-gray-500 rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-purple-500 transition-all resize-none"
                    style={{ 
                      color: '#E7E3FC',
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid rgba(0, 0, 0, 0.3)',
                      boxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.05), 0 2px 8px rgba(0, 0, 0, 0.2)'
                    }}
                  />
                </div>

                {/* Two Column Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                  {/* Birth Date */}
                  <div>
                    <label className="block text-white text-sm font-medium mb-2">
                      Birth Date
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <CalendarBlank size={18} className="text-white" />
                      </div>
                      <input
                        type="text"
                        value={birthDate}
                        onChange={(e) => setBirthDate(e.target.value)}
                        placeholder="jj/mm/aaaa"
                        className="w-full text-white placeholder:text-gray-500 rounded-lg pl-10 pr-4 py-3 outline-none focus:ring-2 focus:ring-purple-500 transition-all"
                        style={{ 
                          background: 'rgba(255, 255, 255, 0.05)',
                          border: '1px solid rgba(0, 0, 0, 0.3)',
                          boxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.05), 0 2px 8px rgba(0, 0, 0, 0.2)',
                          colorScheme: 'dark'
                        }}
                      />
                    </div>
                  </div>

                  {/* Phone */}
                  <div>
                    <label className="block text-white text-sm font-medium mb-2">
                      Phone
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Phone size={18} className="text-white" />
                      </div>
                      <input
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="type your phone number"
                        className="w-full text-white placeholder:text-gray-500 rounded-lg pl-10 pr-4 py-3 outline-none focus:ring-2 focus:ring-purple-500 transition-all"
                        style={{ 
                          background: 'rgba(255, 255, 255, 0.05)',
                          border: '1px solid rgba(0, 0, 0, 0.3)',
                          boxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.05), 0 2px 8px rgba(0, 0, 0, 0.2)'
                        }}
                      />
                    </div>
                  </div>

                  {/* Website */}
                  <div>
                    <label className="block text-white text-sm font-medium mb-2">
                      Website
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Globe size={18} className="text-white" />
                      </div>
                      <input
                        type="url"
                        value={website}
                        onChange={(e) => setWebsite(e.target.value)}
                        placeholder="Type your website"
                        className="w-full text-white placeholder:text-gray-500 rounded-lg pl-10 pr-4 py-3 outline-none focus:ring-2 focus:ring-purple-500 transition-all"
                        style={{ 
                          background: 'rgba(255, 255, 255, 0.05)',
                          border: '1px solid rgba(0, 0, 0, 0.3)',
                          boxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.05), 0 2px 8px rgba(0, 0, 0, 0.2)'
                        }}
                      />
                    </div>
                  </div>

                  {/* Country */}
                  <div>
                    <label className="block text-white text-sm font-medium mb-2">
                      Country
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Gps size={18} className="text-white" />
                      </div>
                      <select
                        value={country}
                        onChange={(e) => setCountry(e.target.value)}
                        className={`w-full rounded-lg pl-10 pr-10 py-3 outline-none focus:ring-2 focus:ring-purple-500 transition-all appearance-none cursor-pointer ${country === '' ? 'text-gray-500' : 'text-white'}`}
                        style={{ 
                          background: 'rgba(255, 255, 255, 0.05)',
                          border: '1px solid rgba(0, 0, 0, 0.3)',
                          boxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.05), 0 2px 8px rgba(0, 0, 0, 0.2)'
                        }}
                      >
                        <option value="" className="bg-gray-800 text-gray-500">Select a country</option>
                        <option value="us" className="bg-gray-800">United States</option>
                        <option value="uk" className="bg-gray-800">United Kingdom</option>
                        <option value="ca" className="bg-gray-800">Canada</option>
                        <option value="fr" className="bg-gray-800">France</option>
                        <option value="de" className="bg-gray-800">Germany</option>
                      </select>
                      <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                        <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </div>
                  </div>

                  {/* Languages */}
                  <div>
                    <label className="block text-white text-sm font-medium mb-2">
                      Languages
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Flag size={18} className="text-white" />
                      </div>
                      <select
                        value={language}
                        onChange={(e) => setLanguage(e.target.value)}
                        className={`w-full rounded-lg pl-10 pr-10 py-3 outline-none focus:ring-2 focus:ring-purple-500 transition-all appearance-none cursor-pointer ${language === '' ? 'text-gray-500' : 'text-white'}`}
                        style={{ 
                          background: 'rgba(255, 255, 255, 0.05)',
                          border: '1px solid rgba(0, 0, 0, 0.3)',
                          boxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.05), 0 2px 8px rgba(0, 0, 0, 0.2)'
                        }}
                      >
                        <option value="" className="bg-gray-800 text-gray-500">Select a language</option>
                        <option value="en" className="bg-gray-800">English</option>
                        <option value="es" className="bg-gray-800">Spanish</option>
                        <option value="fr" className="bg-gray-800">French</option>
                        <option value="de" className="bg-gray-800">German</option>
                        <option value="zh" className="bg-gray-800">Chinese</option>
                      </select>
                      <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                        <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </div>
                  </div>

                  {/* Gender */}
                  <div>
                    <label className="block text-white text-sm font-medium mb-2">
                      Gender
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <GenderNeuter size={18} className="text-white" />
                      </div>
                      <select
                        value={gender}
                        onChange={(e) => setGender(e.target.value)}
                        className={`w-full rounded-lg pl-10 pr-10 py-3 outline-none focus:ring-2 focus:ring-purple-500 transition-all appearance-none cursor-pointer ${gender === '' ? 'text-gray-500' : 'text-white'}`}
                        style={{ 
                          background: 'rgba(255, 255, 255, 0.05)',
                          border: '1px solid rgba(0, 0, 0, 0.3)',
                          boxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.05), 0 2px 8px rgba(0, 0, 0, 0.2)'
                        }}
                      >
                        <option value="" className="bg-gray-800 text-gray-500">Select your gender</option>
                        <option value="male" className="bg-gray-800">Male</option>
                        <option value="female" className="bg-gray-800">Female</option>
                        <option value="other" className="bg-gray-800">Other</option>
                        <option value="prefer-not-to-say" className="bg-gray-800">Prefer not to say</option>
                      </select>
                      <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                        <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex flex-col sm:flex-row gap-4 pt-6">
                  <button
                    type="submit"
                    className="w-full sm:w-auto px-8 py-3 rounded-full font-medium transition-all hover:opacity-90"
                    style={{
                      background: 'linear-gradient(180deg, #4B21EF 0%, #6F4CF5 100%)',
                      border: '1px solid rgba(0, 0, 0, 0.3)',
                      boxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.1), 0 4px 12px rgba(75, 33, 239, 0.3)',
                      color: '#FFFFFF'
                    }}
                  >
                    Save Changes
                  </button>
                  <button
                    type="button"
                    onClick={handleCancel}
                    className="w-full sm:w-auto px-8 py-3 rounded-full font-medium transition-all hover:opacity-80"
                    style={{
                      background: '#312D4B',
                      border: '1px solid rgba(0, 0, 0, 0.5)',
                      color: '#FFFFFF'
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
