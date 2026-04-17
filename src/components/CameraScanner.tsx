import { useEffect, useRef } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { X } from 'lucide-react';

interface CameraScannerProps {
  onScan: (decodedText: string) => void;
  onClose: () => void;
  title: string;
}

export default function CameraScanner({ onScan, onClose, title }: CameraScannerProps) {
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);

  useEffect(() => {
    // Initialize scanner
    const config = { 
      fps: 10, 
      qrbox: { width: 250, height: 250 },
      aspectRatio: 1.0
    };
    
    scannerRef.current = new Html5QrcodeScanner(
      "reader", 
      config, 
      /* verbose= */ false
    );

    const onScanSuccess = (decodedText: string) => {
      onScan(decodedText);
      // Optional: beep or vibrate
      if (window.navigator.vibrate) window.navigator.vibrate(100);
    };

    scannerRef.current.render(onScanSuccess, (error) => {
      // Ignore errors (scanning keeps going)
    });

    return () => {
      if (scannerRef.current) {
        scannerRef.current.clear().catch(err => console.error("Failed to clear scanner", err));
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
        
        <div className="p-2 bg-black">
          <div id="reader" className="w-full"></div>
        </div>
        
        <div className="p-4 bg-gray-900/80 text-center">
          <p className="text-[10px] text-text-dim uppercase font-bold tracking-widest">Arahkan kamera ke Kode QR atau Barcode</p>
        </div>
      </div>
    </div>
  );
}
