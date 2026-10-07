"use client";

import React, { useState } from "react";
import SettingsToolbar from "../SettingsToolbar";
import { ChartBar, SquaresFour } from "@phosphor-icons/react";

export default function NotificationsSettings() {
  // Activity notifications
  const [activityComments, setActivityComments] = useState(true);
  const [activityAnswers, setActivityAnswers] = useState(true);
  const [activityFollows, setActivityFollows] = useState(true);

  // Application notifications
  const [appComments, setAppComments] = useState(true);
  const [appAnswers, setAppAnswers] = useState(true);
  const [appFollows, setAppFollows] = useState(true);

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
                border: '1px solid rgba(0, 0, 0, 0.3)',
              }}
            >
              {/* Two Column Layout */}
              <div className="flex flex-col lg:flex-row gap-8">
                {/* Activity Section */}
                <div className="lg:flex-1">
                  <div className="flex items-center gap-3 mb-6">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ background: '#312D4B', border: '1px solid #1E1C2B' }}
                    >
                      <ChartBar size={20} className="text-white" />
                    </div>
                    <h2 className="text-xl font-semibold text-white">Activity</h2>
                  </div>
                  <div className="space-y-4">
                    {/* Comment Notification */}
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
                        Email me when someone comments on my article
                      </p>
                      <button
                        onClick={() => setActivityComments(!activityComments)}
                        className="relative inline-flex items-center rounded-full transition-colors"
                        style={{
                          backgroundColor: activityComments ? '#6AFAA5' : '#28243D',
                          width: '44px',
                          height: '24px'
                        }}
                      >
                        <span
                          className="inline-block transform rounded-full transition-transform"
                          style={{
                            width: '18px',
                            height: '18px',
                            backgroundColor: activityComments ? '#28243D' : '#747489',
                            transform: activityComments ? 'translateX(23px)' : 'translateX(3px)'
                          }}
                        />
                      </button>
                    </div>

                    {/* Answer Notification */}
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
                        Email me when someone answers on my forum thread
                      </p>
                      <button
                        onClick={() => setActivityAnswers(!activityAnswers)}
                        className="relative inline-flex items-center rounded-full transition-colors"
                        style={{
                          backgroundColor: activityAnswers ? '#6AFAA5' : '#28243D',
                          width: '44px',
                          height: '24px'
                        }}
                      >
                        <span
                          className="inline-block transform rounded-full transition-transform"
                          style={{
                            width: '18px',
                            height: '18px',
                            backgroundColor: activityAnswers ? '#28243D' : '#747489',
                            transform: activityAnswers ? 'translateX(23px)' : 'translateX(3px)'
                          }}
                        />
                      </button>
                    </div>

                    {/* Follow Notification */}
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
                        Email me when someone follows me
                      </p>
                      <button
                        onClick={() => setActivityFollows(!activityFollows)}
                        className="relative inline-flex items-center rounded-full transition-colors"
                        style={{
                          backgroundColor: activityFollows ? '#6AFAA5' : '#28243D',
                          width: '44px',
                          height: '24px'
                        }}
                      >
                        <span
                          className="inline-block transform rounded-full transition-transform"
                          style={{
                            width: '18px',
                            height: '18px',
                            backgroundColor: activityFollows ? '#28243D' : '#747489',
                            transform: activityFollows ? 'translateX(23px)' : 'translateX(3px)'
                          }}
                        />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Divider */}
                <div 
                  className="hidden lg:block"
                  style={{
                    width: '1px',
                    backgroundColor: '#1F1F1F',
                    opacity: 0.15,
                    height: '430px',
                    flexShrink: 0
                  }}
                ></div>
                <div 
                  className="block lg:hidden"
                  style={{
                    height: '1px',
                    backgroundColor: '#1F1F1F',
                    opacity: 0.15,
                    width: '100%'
                  }}
                ></div>

                {/* Application Section */}
                <div className="lg:flex-1">
                  <div className="flex items-center gap-3 mb-6">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ background: '#312D4B', border: '1px solid #1E1C2B' }}
                    >
                      <SquaresFour size={20} className="text-white" />
                    </div>
                    <h2 className="text-xl font-semibold text-white">Application</h2>
                  </div>
                  <div className="space-y-4">
                    {/* Comment Notification */}
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
                        Email me when someone comments on my article
                      </p>
                      <button
                        onClick={() => setAppComments(!appComments)}
                        className="relative inline-flex items-center rounded-full transition-colors"
                        style={{
                          backgroundColor: appComments ? '#6AFAA5' : '#28243D',
                          width: '44px',
                          height: '24px'
                        }}
                      >
                        <span
                          className="inline-block transform rounded-full transition-transform"
                          style={{
                            width: '18px',
                            height: '18px',
                            backgroundColor: appComments ? '#28243D' : '#747489',
                            transform: appComments ? 'translateX(23px)' : 'translateX(3px)'
                          }}
                        />
                      </button>
                    </div>

                    {/* Answer Notification */}
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
                        Email me when someone answers on my forum thread
                      </p>
                      <button
                        onClick={() => setAppAnswers(!appAnswers)}
                        className="relative inline-flex items-center rounded-full transition-colors"
                        style={{
                          backgroundColor: appAnswers ? '#6AFAA5' : '#28243D',
                          width: '44px',
                          height: '24px'
                        }}
                      >
                        <span
                          className="inline-block transform rounded-full transition-transform"
                          style={{
                            width: '18px',
                            height: '18px',
                            backgroundColor: appAnswers ? '#28243D' : '#747489',
                            transform: appAnswers ? 'translateX(23px)' : 'translateX(3px)'
                          }}
                        />
                      </button>
                    </div>

                    {/* Follow Notification */}
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
                        Email me when someone follows me
                      </p>
                      <button
                        onClick={() => setAppFollows(!appFollows)}
                        className="relative inline-flex items-center rounded-full transition-colors"
                        style={{
                          backgroundColor: appFollows ? '#6AFAA5' : '#28243D',
                          width: '44px',
                          height: '24px'
                        }}
                      >
                        <span
                          className="inline-block transform rounded-full transition-transform"
                          style={{
                            width: '18px',
                            height: '18px',
                            backgroundColor: appFollows ? '#28243D' : '#747489',
                            transform: appFollows ? 'translateX(23px)' : 'translateX(3px)'
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
    </div>
  );
}
