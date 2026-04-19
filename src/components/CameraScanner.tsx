import { useEffect, useRef } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { X } from 'lucide-react';

interface CameraScannerProps {
  onScan: (decodedText: string) => void;
  onClose: () => void;
  title: string;
}

export default function CameraScanner({ onScan, onClose, title }: CameraScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<any>(null);

  useEffect(() => {
    let isComponentMounted = true;
    const codeReader = new BrowserMultiFormatReader();

    const startScanner = async () => {
      try {
        if (videoRef.current) {
          controlsRef.current = await codeReader.decodeFromVideoDevice(
            undefined, 
            videoRef.current, 
            (result, error, controls) => {
              if (result && isComponentMounted) {
                onScan(result.getText());
                if (window.navigator.vibrate) window.navigator.vibrate(100);
              }
            }
          );
        }
      } catch (err) {
        console.error("Failed to start camera scanner", err);
      }
    };

    startScanner();

    return () => {
      isComponentMounted = false;
      if (controlsRef.current) {
        controlsRef.current.stop();
      }
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/90 backdrop-blur-md" onClick={onClose}></div>
      <div className="relative w-full max-w-sm glass-card border-accent-blue/30 overflow-hidden animate-in zoom-in duration-300">
        <div className="p-4 border-b border-white/10 flex justify-between items-center bg-gray-900">
          <h3 className="text-xs font-black uppercase tracking-widest text-accent-blue">{title}</h3>
          <button onClick={onClose} className="p-1 hover:bg-white/10 rounded-lg text-text-dim">
            <X size={20} />
          </button>
        </div>
        
        <div className="p-2 bg-black flex items-center justify-center relative min-h-[250px]">
          <video 
            ref={videoRef} 
            className="w-full h-full object-cover rounded-lg aspect-square"
            playsInline
            muted
          />
          <div className="absolute inset-0 pointer-events-none border-2 border-accent-blue/30 m-8 rounded-xl opacity-50" />
        </div>
        
        <div className="p-4 bg-gray-900/80 text-center relative z-10">
          <p className="text-[10px] text-text-dim uppercase font-bold tracking-widest">Arahkan kamera ke Kode QR atau Barcode</p>
        </div>
      </div>
    </div>
  );
}
