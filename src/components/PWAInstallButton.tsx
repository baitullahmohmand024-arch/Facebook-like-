import React, { useState } from 'react';
import { Download, Share, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  variant?: 'sidebar' | 'compact' | 'card';
  className?: string;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  variant = 'compact',
  className = '',
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  // Keep mobile top bar extra compact unless native install or iOS guide applies
  if (variant === 'compact' && !isInstallable && !isIOS) {
    return null;
  }

  const handleClick = async () => {
    if (isInstallable) {
      const accepted = await install();
      if (!accepted) {
        return;
      }
      return;
    }
    setShowGuide(true);
  };

  return (
    <>
      {variant === 'sidebar' ? (
        <button
          type="button"
          onClick={handleClick}
          title="Install Hostel Friend App"
          className={`w-full min-h-[42px] px-3 lg:px-3.5 py-2 rounded-xl border border-[#00C8FF]/35 bg-[#00C8FF]/10 text-[#00C8FF] hover:bg-[#00C8FF]/20 flex items-center justify-center lg:justify-start gap-3 transition-colors whitespace-nowrap shrink-0 ${className}`}
        >
          <Download className="w-4 h-4 shrink-0" />
          <span className="hidden lg:inline text-xs font-semibold truncate">
            {isInstallable ? 'Install Hostel Friend' : 'Get Mobile App'}
          </span>
        </button>
      ) : variant === 'card' ? (
        <button
          type="button"
          onClick={handleClick}
          className={`gold-gradient-btn px-4 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-2 whitespace-nowrap shrink-0 ${className}`}
        >
          <Download className="w-3.5 h-3.5" />
          <span>{isInstallable ? 'Install Hostel Friend' : 'How to Install App'}</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={handleClick}
          aria-label="Install Hostel Friend"
          className={`px-3 py-1.5 rounded-xl border border-[#00C8FF]/40 bg-[#151519] text-xs font-medium text-[#00C8FF] hover:bg-[#00C8FF]/15 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 ${className}`}
        >
          <Download className="w-3.5 h-3.5" />
          <span>Install</span>
        </button>
      )}

      {showGuide && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Install Hostel Friend"
        >
          <div className="glass-surface w-full max-w-sm rounded-2xl p-6 border border-white/10 shadow-2xl">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <img
                  src="/icons/icon-192.png"
                  alt="Hostel Friend"
                  className="w-10 h-10 rounded-xl border border-white/10 object-cover"
                />
                <div>
                  <h3 className="font-display text-base font-bold text-[#F8F9FA]">
                    Install Hostel Friend
                  </h3>
                  <p className="text-[11px] text-[#00C8FF]">Connect • Share • Discover</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                aria-label="Close install instructions"
                className="text-[#A1A1AA] hover:text-[#F8F9FA] p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {isIOS ? (
              <div className="mt-4 space-y-2.5 text-xs text-[#F8F9FA]">
                <p className="text-[#A1A1AA] leading-relaxed">
                  Safari on iPhone &amp; iPad uses Add to Home Screen for full-screen standalone
                  launch:
                </p>
                <ol className="space-y-2">
                  <li className="flex items-center gap-2.5">
                    <span className="w-5 h-5 rounded-md bg-[#00C8FF]/15 text-[#00C8FF] flex items-center justify-center font-mono text-[11px] shrink-0">
                      1
                    </span>
                    <span>
                      Tap <Share className="inline w-3.5 h-3.5 text-[#00C8FF] mx-0.5" />{' '}
                      <strong>Share</strong> in Safari&apos;s toolbar.
                    </span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <span className="w-5 h-5 rounded-md bg-[#00C8FF]/15 text-[#00C8FF] flex items-center justify-center font-mono text-[11px] shrink-0">
                      2
                    </span>
                    <span>
                      Scroll down and tap <strong>Add to Home Screen</strong>, then{' '}
                      <strong>Add</strong>.
                    </span>
                  </li>
                </ol>
              </div>
            ) : (
              <div className="mt-4 space-y-3 text-xs text-[#F8F9FA]">
                <p className="text-[#A1A1AA] leading-relaxed">
                  If your browser didn&apos;t show an automatic install pop-up, you can add Hostel
                  Friend directly:
                </p>
                <div className="rounded-xl bg-[#0A0A0C] border border-white/[0.08] p-3 space-y-1.5">
                  <p className="font-semibold text-[#00C8FF] flex items-center gap-1.5">
                    <Smartphone className="w-3.5 h-3.5" /> Android (Chrome / Edge)
                  </p>
                  <p className="text-[#A1A1AA] leading-relaxed">
                    Tap the browser menu (<strong>⋮</strong>) in the top right and select{' '}
                    <strong className="text-[#F8F9FA]">Install app</strong> or{' '}
                    <strong className="text-[#F8F9FA]">Add to Home screen</strong>. (If viewing
                    inside an in-app browser like WhatsApp/Instagram, open this link in Chrome
                    first.)
                  </p>
                </div>
                <div className="rounded-xl bg-[#0A0A0C] border border-white/[0.08] p-3 space-y-1.5">
                  <p className="font-semibold text-[#8B35FF]">iPhone / iPad (Safari)</p>
                  <p className="text-[#A1A1AA] leading-relaxed">
                    Open in Safari, tap <strong className="text-[#F8F9FA]">Share</strong>, and pick{' '}
                    <strong className="text-[#F8F9FA]">Add to Home Screen</strong>.
                  </p>
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowGuide(false)}
              className="mt-5 w-full py-2.5 rounded-xl border border-white/10 text-xs font-medium text-[#F8F9FA] hover:bg-white/[0.04]"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
};
