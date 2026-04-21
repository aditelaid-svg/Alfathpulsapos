import React, { useState } from 'react';
import { X, Package, Tag, Hash, Plus, Minus } from 'lucide-react';
import { doc, getDoc, updateDoc, serverTimestamp, arrayUnion, arrayRemove } from 'firebase/firestore';                
import { db } from '../firebase';

interface AuditQuickEditModalProps {
  product: any;
  variant: any;
  sn: string;
  onClose: () => void;
  selectedBranch: string | null;
}

export const AuditQuickEditModal: React.FC<AuditQuickEditModalProps> = ({ product, variant, sn, onClose, selectedBranch }) => {
  const [adjustment, setAdjustment] = useState(0);

  const handleUpdateStock = async (type: 'add' | 'subtract') => {
    if (!selectedBranch) return;
    const invKey = `${product.id}_${variant.id}`;
    const invRef = doc(db, `branches/${selectedBranch}/inventory`, invKey);
    const snap = await getDoc(invRef);
    
    if (snap.exists()) {
      const data = snap.data();
      const currentStock = data.stock || 0;
      const newStock = type === 'add' ? currentStock + adjustment : currentStock - adjustment;
      
      const updateData: any = {
        stock: newStock,
        lastUpdated: serverTimestamp()
      };

      // Voucher: Sync SNs | Aksesoris: Just update stock count
      if (product.category === 'voucher' || product.category === 'kuota') {
          updateData.sns = type === 'add' ? arrayUnion(`AUTO_${Date.now()}`) : arrayRemove(data.sns?.[data.sns.length - 1] || '');
      }
      
      await updateDoc(invRef, updateData);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-[160] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={onClose}></div>
      <div className="relative glass-card w-full max-w-sm p-6 space-y-6 border border-white/10 animate-in zoom-in duration-300">
        <div className="flex justify-between items-center">
            <h3 className="text-sm font-black text-slate-200 uppercase tracking-widest flex items-center gap-2">
                <Package size={18} /> Quick Edit Stok
            </h3>
            <button onClick={onClose} className="text-text-dim hover:text-slate-200"><X size={20}/></button>
        </div>

        <div className="space-y-1">
            <p className="text-[10px] text-sapphire font-black uppercase tracking-widest">{product.name}</p>
            <p className="text-xs font-bold text-slate-200">{variant.name}</p>
            <p className="text-[9px] text-text-dim font-mono tracking-widest mt-1">SN: {sn}</p>
        </div>

        <div className="space-y-2">
            <label className="text-[9px] font-bold text-text-dim uppercase tracking-widest">Jumlah Penyesuaian</label>
            <input 
                type="number"
                value={adjustment}
                onChange={e => setAdjustment(parseInt(e.target.value) || 0)}
                className="w-full bg-black/40 border border-white/10 p-3 rounded-xl text-xs font-mono text-slate-200 focus:outline-none focus:border-sapphire/50"
            />
        </div>

        <div className="flex gap-3">
            <button onClick={() => handleUpdateStock('subtract')} className="flex-1 py-3 bg-red-500/20 text-red-500 rounded-xl font-black uppercase text-[10px] flex items-center justify-center gap-2">
                <Minus size={14}/> Kurang
            </button>
            <button onClick={() => handleUpdateStock('add')} className="flex-1 py-3 bg-green-500/20 text-green-500 rounded-xl font-black uppercase text-[10px] flex items-center justify-center gap-2">
                <Plus size={14}/> Tambah
            </button>
        </div>
      </div>
    </div>
  );
};
