import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Calculator, ArrowRight, Wallet, CheckCircle2 } from 'lucide-react';

interface PosPaymentModalProps {
  total: number;
  itemCount: number;
  onClose: () => void;
  onConfirm: (amountPaid: number) => void;
  formatRupiah: (num: number) => string;
}

export const PosPaymentModal: React.FC<PosPaymentModalProps> = ({ total, itemCount, onClose, onConfirm, formatRupiah }) => {
  const [amountPaid, setAmountPaid] = useState<number>(0);
  const change = amountPaid - total;

  // Presets for quick selection
  const presets = [
    5000, 10000, 20000, 50000, 100000
  ];

  const handlePresetClick = (preset: number) => {
    setAmountPaid(prev => prev + preset);
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        />
        
        <motion.div 
          initial={{ scale: 0.9, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0, y: 20 }}
          className="relative w-full max-w-lg glass-card border-white/10 bg-[#0B0B0C] overflow-hidden rounded-[2.5rem] shadow-[0_50px_100px_rgba(0,0,0,0.5)]"
        >
          <div className="absolute top-0 right-0 w-64 h-64 bg-sapphire/5 blur-[100px] pointer-events-none" />
          
          <div className="p-6 sm:p-8 space-y-8">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-[10px] font-black text-sapphire uppercase tracking-[0.4em] mb-1">Settlement Workflow</p>
                <h2 className="text-xl font-black text-slate-200 tracking-tight uppercase">Payment Interface</h2>
              </div>
              <button 
                onClick={onClose}
                className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-text-dim hover:text-red-500 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                <p className="text-[8px] font-black text-text-dim uppercase tracking-widest mb-1">Queue Size</p>
                <p className="text-lg font-black text-slate-200">{itemCount} Items</p>
              </div>
              <div className="p-4 bg-sapphire/10 border border-sapphire/20 rounded-2xl">
                <p className="text-[8px] font-black text-sapphire uppercase tracking-widest mb-1">Total Due</p>
                <p className="text-lg font-black text-slate-200">{formatRupiah(total)}</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="relative group">
                <p className="text-[10px] font-black text-text-dim uppercase tracking-widest mb-3 ml-2">Amount Received</p>
                <div className="relative">
                  <div className="absolute left-6 top-1/2 -translate-y-1/2 text-sapphire/50 font-black text-xl">Rp</div>
                  <input 
                    type="number"
                    autoFocus
                    placeholder="0"
                    className="w-full bg-black/60 border-2 border-white/5 p-6 pl-16 rounded-[2rem] text-3xl font-black tracking-tighter text-slate-200 focus:outline-none focus:border-sapphire/50 focus:bg-black/80 transition-all shadow-inner"
                    value={amountPaid === 0 ? '' : amountPaid}
                    onChange={(e) => setAmountPaid(Number(e.target.value))}
                  />
                  <div className="absolute right-6 top-1/2 -translate-y-1/2 text-sapphire pointer-events-none">
                    <Wallet size={24} />
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {presets.map(p => (
                  <button
                    key={p}
                    onClick={() => handlePresetClick(p)}
                    className="px-4 py-2 rounded-xl bg-white/5 border border-white/5 text-[10px] font-black text-slate-400 hover:border-sapphire/40 hover:text-sapphire transition-all active:scale-95"
                  >
                    +{formatRupiah(p).replace('Rp ', '')}
                  </button>
                ))}
                <button
                  onClick={() => setAmountPaid(total)}
                  className="px-4 py-2 rounded-xl bg-sapphire/10 border border-sapphire/20 text-[10px] font-black text-sapphire hover:bg-sapphire hover:text-white transition-all active:scale-95"
                >
                  Pas
                </button>
                <button
                  onClick={() => setAmountPaid(0)}
                  className="px-4 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-[10px] font-black text-red-500 hover:bg-red-500 hover:text-white transition-all active:scale-95"
                >
                  Clear
                </button>
              </div>
            </div>

            <motion.div 
              animate={{ 
                opacity: change >= 0 && amountPaid > 0 ? 1 : 0.3,
                scale: change >= 0 && amountPaid > 0 ? 1 : 0.98
              }}
              className={`p-6 rounded-[2rem] border transition-all ${change >= 0 && amountPaid > 0 ? 'bg-green-500/10 border-green-500/30' : 'bg-white/5 border-white/5'}`}
            >
              <div className="flex justify-between items-center">
                <div className="space-y-1">
                  <p className={`text-[10px] font-black uppercase tracking-widest ${change >= 0 && amountPaid > 0 ? 'text-green-500' : 'text-text-dim'}`}>
                    Kembalian
                  </p>
                  <p className={`text-2xl font-black tracking-tighter ${change >= 0 && amountPaid > 0 ? 'text-slate-200' : 'text-slate-200/20'}`}>
                    {change < 0 ? 'Kurang ' + formatRupiah(Math.abs(change)) : formatRupiah(change)}
                  </p>
                </div>
                {change >= 0 && amountPaid > 0 && (
                  <div className="w-12 h-12 rounded-full bg-green-500 flex items-center justify-center text-white shadow-lg shadow-green-500/30">
                    <CheckCircle2 size={24} />
                  </div>
                )}
              </div>
            </motion.div>

            <button 
              disabled={change < 0 || amountPaid <= 0}
              onClick={() => onConfirm(amountPaid)}
              className="w-full py-6 bg-sapphire text-white rounded-[2rem] font-black uppercase tracking-[0.4em] text-xs shadow-xl shadow-sapphire/30 hover:shadow-sapphire/50 hover:-translate-y-1 active:scale-[0.98] transition-all flex items-center justify-center gap-4 disabled:opacity-50 disabled:grayscale disabled:cursor-not-allowed"
            >
              Confirm Transaction
              <ArrowRight size={20} />
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
