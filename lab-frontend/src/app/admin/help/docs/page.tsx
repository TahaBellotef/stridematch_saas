"use client";

import Link from "next/link";
import { useState } from "react";
import { Lock, Code, CreditCard, Gavel, Smartphone, BookOpen, ChevronDown } from "lucide-react";
import { AdminHeader } from "../../AdminHeader";
import { AdminSidebar } from "../../AdminSidebar";

interface FAQItem {
  question: string;
  answer: string;
}

interface FAQCategory {
  title: string;
  icon: React.ReactNode;
  items: FAQItem[];
}

export default function HelpDocsPage() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [openQuestion, setOpenQuestion] = useState<string | null>(null);

  const toggleQuestion = (question: string) => {
    setOpenQuestion(openQuestion === question ? null : question);
  };

  const faqData: FAQCategory[] = [
    {
      title: 'Account Settings',
      icon: <Lock className="w-5 h-5 text-slate-200" />,
      items: [
        {
          question: 'How secure is my password?',
          answer: 'Your password is encrypted using industry-standard bcrypt hashing with salt. We never store plain text passwords, and all authentication is handled securely through JWT tokens with expiration.'
        },
        {
          question: 'Can I change my username?',
          answer: 'Yes, you can update your username from your profile settings. Navigate to the admin panel, click on your profile, and update your display name or email address.'
        },
        {
          question: 'Where can I upload my avatar?',
          answer: 'Profile avatars can be uploaded through the Account Settings page. We support JPG, PNG, and WebP formats up to 5MB. Your avatar will be automatically resized for optimal performance.'
        },
        {
          question: 'How do I change my timezone?',
          answer: 'Timezone settings are managed in your profile preferences. This ensures all analysis session timestamps and reports display in your local time.'
        },
        {
          question: 'How do I change my password?',
          answer: 'To change your password, go to Account Settings > Security. You\'ll need to provide your current password and choose a new one. We recommend using a strong password with at least 8 characters.'
        }
      ]
    },
    {
      title: 'API Questions',
      icon: <Code className="w-5 h-5 text-slate-200" />,
      items: [
        {
          question: 'What technologies are used?',
          answer: 'StrideMatch uses FastAPI (Python) for the backend with PostgreSQL database, Next.js 14 (React/TypeScript) for the frontend, and MediaPipe for pose detection. Video processing leverages OpenCV and FFmpeg.'
        },
        {
          question: 'What are the API limits?',
          answer: 'Standard accounts can process up to 50 video analyses per month. Premium accounts have unlimited processing. Individual API requests timeout after 300 seconds for video analysis operations.'
        },
        {
          question: 'Why was my application rejected?',
          answer: 'API applications may be rejected if they don\'t meet our use case requirements. Common reasons include incomplete registration information or intended usage outside of gait analysis and biomechanics research.'
        },
        {
          question: 'Where can I find the documentation?',
          answer: 'Complete API documentation is available at /api/docs (Swagger UI) and /api/redoc. You can also find detailed guides in the Help section covering analysis endpoints, authentication, and file uploads.'
        },
        {
          question: 'How do I get an API key?',
          answer: 'API keys are automatically generated upon account creation. You can view and regenerate your API key in the Account Settings > Developer section. Keep your API key secure and never share it publicly.'
        }
      ]
    },
    {
      title: 'Billing',
      icon: <CreditCard className="w-5 h-5 text-slate-200" />,
      items: [
        {
          question: 'Can I contact a sales rep?',
          answer: 'Yes! For enterprise plans or custom solutions, contact our sales team at sales@stridematch.com. We offer dedicated support and custom pricing for teams and research institutions.'
        },
        {
          question: 'Do I need to pay VAT?',
          answer: 'VAT charges depend on your location. EU customers are charged applicable VAT rates based on their country. The exact amount is calculated at checkout before payment.'
        },
        {
          question: 'Can I get a refund?',
          answer: 'We offer a 14-day money-back guarantee for new subscriptions. If you\'re not satisfied with StrideMatch, contact support@stridematch.com within 14 days of your first payment.'
        },
        {
          question: 'Annual vs. monthly billing differences',
          answer: 'Annual billing saves 20% compared to monthly payments. Annual subscribers also get priority support and early access to new features. You can switch between plans at any time.'
        },
        {
          question: 'What happens if the price increases?',
          answer: 'Existing subscribers are grandfathered into their current pricing. Price increases only apply to new subscribers or when you choose to upgrade your plan. We provide 30 days notice for any changes.'
        }
      ]
    },
    {
      title: 'Copyright & Legal',
      icon: <Gavel className="w-5 h-5 text-slate-200" />,
      items: [
        {
          question: 'How do I contact Legal?',
          answer: 'For legal inquiries, reach out to legal@stridematch.com. For urgent matters, you can also contact our main office. Response time is typically 2-3 business days.'
        },
        {
          question: 'Where are your offices located?',
          answer: 'StrideMatch is headquartered in San Francisco, CA. We also have development teams distributed globally. For office visits, please schedule an appointment through support@stridematch.com.'
        },
        {
          question: 'Where can I upload my avatar?',
          answer: 'Profile avatars can be uploaded through Account Settings. All uploaded images are subject to our Terms of Service and must be appropriate for a professional platform.'
        },
        {
          question: 'Who owns the copyright on text?',
          answer: 'You retain full ownership of all video data and analysis results uploaded to StrideMatch. We use your data only to provide the analysis service. See our Terms of Service for complete details.'
        },
        {
          question: 'How do I file a DMCA?',
          answer: 'DMCA notices should be sent to dmca@stridematch.com with detailed information about the copyrighted work, the allegedly infringing content, and your contact information.'
        }
      ]
    },
    {
      title: 'Mobile Apps',
      icon: <Smartphone className="w-5 h-5 text-slate-200" />,
      items: [
        {
          question: 'How do I download the Android app?',
          answer: 'The StrideMatch Android app is available on Google Play Store. Search for "StrideMatch Gait Analysis" or visit play.google.com/store. Requires Android 8.0 or higher.'
        },
        {
          question: 'How to download our iPad app?',
          answer: 'Download StrideMatch from the Apple App Store on your iPad. The app is optimized for iPad Pro and supports Apple Pencil for annotating analysis results. Requires iPadOS 14 or later.'
        },
        {
          question: 'Where can I upload my avatar?',
          answer: 'In the mobile app, tap your profile icon, select "Edit Profile", and tap the camera icon to upload or take a new profile photo. Photos are synced across all devices.'
        },
        {
          question: 'Can I use my Android phone?',
          answer: 'Yes! The StrideMatch app works on Android phones running version 8.0 or higher. For the best experience analyzing videos, we recommend using a tablet or desktop for detailed review.'
        },
        {
          question: 'Is there an iOS app?',
          answer: 'Yes, StrideMatch is available for iPhone and iPad on the App Store. The iOS app includes all core features including video upload, analysis viewing, and session management.'
        }
      ]
    },
    {
      title: 'Using Know How',
      icon: <BookOpen className="w-5 h-5 text-slate-200" />,
      items: [
        {
          question: 'Customizing your theme?',
          answer: 'Theme customization is available in Settings > Appearance. Choose between light and dark modes, adjust accent colors, and customize the dashboard layout to match your preferences.'
        },
        {
          question: 'Upgrading your theme?',
          answer: 'Theme updates are automatically applied when you refresh the application. We regularly release new themes and UI improvements. Check the changelog for the latest design updates.'
        },
        {
          question: 'Customization?',
          answer: 'StrideMatch offers extensive customization options including dashboard widgets, analysis report formats, metric thresholds, and notification preferences. Explore Settings to personalize your experience.'
        },
        {
          question: 'Upgrading?',
          answer: 'To upgrade your account plan, navigate to Settings > Billing and select your desired tier. Changes take effect immediately, and you\'ll only be charged for the prorated difference.'
        }
      ]
    }
  ];

  return (
    <main className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-6xl px-6 py-10">
            {/* Hero */}
            <div className="admin-card mb-8 overflow-hidden">
              <div className="w-full bg-gradient-to-r from-[rgba(111,65,232,0.16)] via-[rgba(59,30,197,0.08)] to-transparent px-6 py-12 rounded-2xl flex flex-col items-center text-center">
                <h1 className="text-3xl font-extrabold text-white">Hello, how can we help?</h1>
                <p className="mt-2 text-sm text-slate-300">Or choose category to quickly find the help you need</p>

                <div className="mt-6 w-full max-w-2xl mx-auto">
                  <label htmlFor="help-search" className="sr-only">Search help</label>
                  <div className="relative">
                    <input
                      id="help-search"
                      placeholder="Ask a question"
                      className="w-full rounded-full bg-white/6 placeholder:text-slate-300 px-5 py-3 text-slate-100 focus:outline-none"
                    />
                    <button className="absolute right-2 top-1/2 -translate-y-1/2 bg-gradient-to-r from-indigo-500 to-indigo-400 text-white px-4 py-2 rounded-full text-sm">Search</button>
                  </div>
                </div>
              </div>
            </div>

            {/* Cards grid */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              {faqData.map((category) => (
                <article key={category.title} className="admin-card p-4">
                  <header className="mb-3 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                      {category.icon} {category.title} 
                      <span className="text-slate-300 text-xs">({category.items.length})</span>
                    </h3>
                  </header>

                  <ul className="space-y-2">
                    {category.items.map((item) => (
                      <li key={item.question} className="rounded-md overflow-hidden">
                        <button
                          onClick={() => toggleQuestion(item.question)}
                          className="w-full text-left rounded-md bg-white/4 hover:bg-white/8 px-3 py-2 text-sm text-slate-200 transition-all duration-200 flex items-center justify-between group"
                        >
                          <span className="group-hover:text-white transition-colors">{item.question}</span>
                          <ChevronDown 
                            className={`w-4 h-4 text-slate-400 transition-transform duration-300 flex-shrink-0 ml-2 ${
                              openQuestion === item.question ? 'rotate-180 text-indigo-400' : ''
                            }`}
                          />
                        </button>
                        
                        <div
                          className={`overflow-hidden transition-all duration-300 ease-in-out ${
                            openQuestion === item.question 
                              ? 'max-h-96 opacity-100 mt-2' 
                              : 'max-h-0 opacity-0'
                          }`}
                        >
                          <div className="bg-gradient-to-br from-indigo-500/10 to-purple-500/10 border border-indigo-500/20 rounded-lg p-4 mx-1">
                            <div className="flex items-start gap-3">
                              <div className="flex-shrink-0 w-1 h-full bg-gradient-to-b from-indigo-400 to-purple-400 rounded-full" />
                              <p className="text-sm text-slate-300 leading-relaxed">
                                {item.answer}
                              </p>
                            </div>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>

      </div>
    </main>
  );
}
