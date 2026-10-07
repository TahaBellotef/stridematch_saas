"use client";

import React, { useState } from "react";
import SettingsToolbar from "../SettingsToolbar";
import { ChartBar } from "@phosphor-icons/react";

export default function ScanSetupSettings() {
  // Activity notifications
  const [smartmorphAI, setSmartmorphAI] = useState(true);
  const [smartFitAI, setSmartFitAI] = useState(true);
  const [shoeRecommendation, setShoeRecommendation] = useState(true);

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
              className="rounded-xl p-5 sm:p-8 min-h-[600px]" 
              style={{ 
                background: 'var(--sm-content)',
                border: '1px solid rgba(0, 0, 0, 0.3)'
              }}
            >
              {/* Activity Section */}
              <div>
                <div className="flex items-center gap-3 mb-6">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: '#312D4B', border: '1px solid rgba(255, 255, 255, 0.1)' }}
                  >
                    <ChartBar size={20} className="text-white" />
                  </div>
                  <h2 className="text-xl font-semibold text-white">Activity</h2>
                </div>
                <div className="space-y-4 max-w-md">
                  {/* SmartmorphAI Notification */}
                  <div 
                    className="rounded-xl flex flex-col justify-center"
                    style={{
                      background: '#3C3854',
                      border: '1px solid rgba(0, 0, 0, 0.3)',
                      boxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.05)',
                      width: '483.5px',
                      height: '92px',
                      padding: '14px 20px'
                    }}
                  >
                    <p className="text-gray-300 text-sm mb-2">
                      SmartmorphAI comments on my article
                    </p>
                    <button
                      onClick={() => setSmartmorphAI(!smartmorphAI)}
                      className="relative inline-flex items-center rounded-full transition-colors"
                      style={{
                        backgroundColor: smartmorphAI ? '#6AFAA5' : '#28243D',
                        width: '44px',
                        height: '24px'
                      }}
                    >
                      <span
                        className="inline-block transform rounded-full transition-transform"
                        style={{
                          width: '18px',
                          height: '18px',
                          backgroundColor: smartmorphAI ? '#28243D' : '#747489',
                          transform: smartmorphAI ? 'translateX(23px)' : 'translateX(3px)'
                        }}
                      />
                    </button>
                  </div>

                  {/* SmartFitAI Notification */}
                  <div 
                    className="rounded-xl flex flex-col justify-center"
                    style={{
                      background: '#3C3854',
                      border: '1px solid rgba(0, 0, 0, 0.3)',
                      boxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.05)',
                      width: '483.5px',
                      height: '92px',
                      padding: '14px 20px'
                    }}
                  >
                    <p className="text-gray-300 text-sm mb-2">
                      SmartFitAI comments on my article
                    </p>
                    <button
                      onClick={() => setSmartFitAI(!smartFitAI)}
                      className="relative inline-flex items-center rounded-full transition-colors"
                      style={{
                        backgroundColor: smartFitAI ? '#6AFAA5' : '#28243D',
                        width: '44px',
                        height: '24px'
                      }}
                    >
                      <span
                        className="inline-block transform rounded-full transition-transform"
                        style={{
                          width: '18px',
                          height: '18px',
                          backgroundColor: smartFitAI ? '#28243D' : '#747489',
                          transform: smartFitAI ? 'translateX(23px)' : 'translateX(3px)'
                        }}
                      />
                    </button>
                  </div>

                  {/* Shoe Recommendation Notification */}
                  <div 
                    className="rounded-xl flex flex-col justify-center"
                    style={{
                      background: '#3C3854',
                      border: '1px solid rgba(0, 0, 0, 0.3)',
                      boxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.05)',
                      width: '483.5px',
                      height: '92px',
                      padding: '14px 20px'
                    }}
                  >
                    <p className="text-gray-300 text-sm mb-2">
                      Shoe Recommendation follows me
                    </p>
                    <button
                      onClick={() => setShoeRecommendation(!shoeRecommendation)}
                      className="relative inline-flex items-center rounded-full transition-colors"
                      style={{
                        backgroundColor: shoeRecommendation ? '#6AFAA5' : '#28243D',
                        width: '44px',
                        height: '24px'
                      }}
                    >
                      <span
                        className="inline-block transform rounded-full transition-transform"
                        style={{
                          width: '18px',
                          height: '18px',
                          backgroundColor: shoeRecommendation ? '#28243D' : '#747489',
                          transform: shoeRecommendation ? 'translateX(23px)' : 'translateX(3px)'
                        }}
                      />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
