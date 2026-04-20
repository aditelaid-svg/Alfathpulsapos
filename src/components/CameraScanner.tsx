import { useEffect, useRef } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { X } from 'lucide-react';

interface CameraScannerProps {
  onScan: (decodedText: string) => void;
  onClose: () => void;
  title: string;
}

export default function CameraScanner({ onScan, onClose, title }: CameraScannerProps) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const isScannedRef = useRef(false);

  useEffect(() => {
    let isMounted = true;
    const scannerId = "reader";

    const startScanner = async () => {
      try {
        // Create scanner instance
        const html5QrCode = new Html5Qrcode(scannerId);
        scannerRef.current = html5QrCode;

        const config = {
          fps: 15,
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1.0,
          formatsToSupport: [
            Html5QrcodeSupportedFormats.QR_CODE,
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.UPC_E,
            Html5QrcodeSupportedFormats.CODE_39
          ]
        };

        await html5QrCode.start(
          { facingMode: "environment" },
          config,
          (decodedText) => {
            if (isMounted && !isScannedRef.current) {
              isScannedRef.current = true;
              
              // Immediate feedback
              playBeep();
              if (window.navigator.vibrate) window.navigator.vibrate(100);

              // Stop scanner and notify parent
              stopAndFinish(decodedText);
            }
          },
          () => {
            // Error callback - silenced for passive seeking
          }
        );
      } catch (err) {
        if (isMounted) {
          console.error("Failed to start scanner:", err);
        }
      }
    };

    const stopAndFinish = async (text: string) => {
      if (scannerRef.current && scannerRef.current.isScanning) {
        try {
          await scannerRef.current.stop();
        } catch (e) {
          console.warn("Error stopping scanner:", e);
        }
      }
      if (isMounted) {
        onScan(text);
      }
    };

    const playBeep = () => {
      try {
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(880, audioCtx.currentTime); 
        gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
        gainNode.gain.linearRampToValueAtTime(0.2, audioCtx.currentTime + 0.01);
        gainNode.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.1);

        oscillator.start(audioCtx.currentTime);
        oscillator.stop(audioCtx.currentTime + 0.12);
      } catch (e) {
        console.warn("Audio Context failed", e);
      }
    };

    // Small delay to ensure DOM is ready
    const timer = setTimeout(startScanner, 100);

    return () => {
      isMounted = false;
      clearTimeout(timer);
      if (scannerRef.current && scannerRef.current.isScanning) {
        scannerRef.current.stop().catch(err => console.warn("Cleanup stop error:", err));
      }
    };
  }, [onScan]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/90 backdrop-blur-md" onClick={onClose}></div>
      <div className="relative w-full max-w-sm glass-card border-sapphire/30 overflow-hidden animate-in zoom-in duration-300">
        <div className="p-4 border-b border-white/10 flex justify-between items-center bg-gray-900">
          <h3 className="text-xs font-black uppercase tracking-widest text-sapphire">{title}</h3>
          <button onClick={onClose} className="p-1 hover:bg-white/10 rounded-lg text-text-dim">
            <X size={20} />
          </button>
        </div>
        
        <div className="p-2 bg-black flex items-center justify-center relative min-h-[300px]">
          <div id="reader" className="w-full h-full rounded-lg overflow-hidden border-0" />
          <div className="absolute inset-0 pointer-events-none border-2 border-sapphire/30 m-8 rounded-xl opacity-30 flex items-center justify-center">
             <div className="w-12 h-0.5 bg-red-500/50 absolute animate-pulse shadow-[0_0_15px_rgba(239,68,68,0.5)]" />
          </div>
        </div>
        
        <div className="p-6 bg-gray-900/80 text-center relative z-10">
          <p className="text-[10px] text-text-dim uppercase font-black tracking-widest leading-relaxed">
            Tempatkan Barcode / QR di tengah kotak untuk pemindaian instan
          </p>
        </div>
      </div>
    </div>
  );
}
