import React, { useState } from 'react';
import { Download, Smartphone, WifiOff, X } from 'lucide-react';
import { useOnlineStatus, usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC<{ variant?: 'compact' | 'panel' }> = ({
  variant = 'compact',
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    if (variant === 'panel') {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#14532D]">
          Geïnstalleerd als app
        </span>
      );
    }
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={() => void install()}
        className={
          variant === 'panel'
            ? 'inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-[#14532D] hover:bg-[#166534] rounded-lg transition-colors whitespace-nowrap cursor-pointer'
            : 'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#14532D] bg-zinc-100 hover:bg-zinc-200 rounded-lg transition-colors whitespace-nowrap cursor-pointer'
        }
      >
        <Download className="w-3.5 h-3.5" />
        Installeer als app
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-zinc-700 bg-zinc-100 hover:bg-zinc-200 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
        >
          <Smartphone className="w-3.5 h-3.5" />
          Zet op beginscherm
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-sm rounded-2xl bg-white border border-zinc-200 p-6 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-editorial text-lg font-semibold text-zinc-950">
                  Installeer op iPhone of iPad
                </h3>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  className="p-1 text-zinc-400 hover:text-zinc-800 cursor-pointer"
                  aria-label="Sluiten"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <ol className="text-sm text-zinc-600 space-y-2 list-decimal list-inside">
                <li>
                  Tik op de <strong>Deel-knop</strong> onderaan in Safari.
                </li>
                <li>
                  Scroll omlaag en tik op <strong>Zet op beginscherm</strong>.
                </li>
                <li>
                  Tik op <strong>Voeg toe</strong> om Tafelboek als app te openen.
                </li>
              </ol>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="w-full py-2 text-xs font-medium text-zinc-800 bg-zinc-100 hover:bg-zinc-200 rounded-lg cursor-pointer"
              >
                Begrepen
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-lg bg-zinc-900 px-3.5 py-2 text-xs font-medium text-white shadow-lg no-print">
      <WifiOff className="w-3.5 h-3.5 text-amber-400" />
      <span>Offline modus — opgeslagen versie actief</span>
    </div>
  );
};
