/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { db, auth } from './firebase';
import { collection, onSnapshot, addDoc, serverTimestamp, doc, setDoc, updateDoc, getDoc, deleteDoc, query, where, collectionGroup, getDocs, getDocFromServer } from 'firebase/firestore';
import { signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { Sun, Moon, LayoutDashboard, ShoppingCart, Package, Store, Settings, Plus, ChevronRight, Hash, QrCode, UserCheck, ShieldAlert, MapPin, Trash2, Camera, X, Sparkles, ArrowLeftRight, RotateCcw, FileText, History, LogOut, TrendingUp, Wallet, PieChart, Activity, Coins, FileSpreadsheet, AlertTriangle, Pencil, ShieldCheck, Search } from 'lucide-react';
import CameraScanner from './components/CameraScanner';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  // We don't throw here to avoid crashing the whole app, but we log it clearly
}

export default function App() {
  const [products, setProducts] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [user, setUser] = useState(auth.currentUser);
  const [userData, setUserData] = useState<any>(null);
  const [activeMenu, setActiveMenu] = useState('dashboard');
  const [selectedBranch, setSelectedBranch] = useState<string | null>(null);
  const [branchInventory, setBranchInventory] = useState<any>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('voucher');
  const [filterProvider, setFilterProvider] = useState<string | null>(null);

  const [isEditingPrice, setIsEditingPrice] = useState(false);
  const [editPrice, setEditPrice] = useState({ productName: '', variantName: '', modalPrice: 0, sellingPrice: 0, minStock: 5, barcode: '' });
  const [isEditingProductName, setIsEditingProductName] = useState(false);
  const [editProductName, setEditProductName] = useState('');
  const [isEditingVariantName, setIsEditingVariantName] = useState(false);
  const [editVariantName, setEditVariantName] = useState('');

  const filteredProducts = products.filter(p => {
    const searchLower = searchQuery.trim().toLowerCase();
    
    // If no search, filter by category & provider
    if (!searchLower) {
      const matchesCategory = p.category === selectedCategory;
      const matchesProvider = filterProvider ? p.provider === filterProvider : true;
      return matchesCategory && matchesProvider;
    }

    // Search in Product fields
    const productMatches = p.name.toLowerCase().includes(searchLower) || 
                          p.provider.toLowerCase().includes(searchLower);
    
    // Search in Variant fields (including Barcode)
    const variantMatches = p.variants?.some((v: any) => 
      v.name.toLowerCase().includes(searchLower) || 
      (v.barcode && v.barcode.trim().toLowerCase().includes(searchLower))
    ) || false;

    // IF EXACT BARCODE MATCH -> Ignore category (Global Search)
    const exactBarcodeMatch = p.variants?.some((v: any) => v.barcode && v.barcode.trim().toLowerCase() === searchLower);

    if (exactBarcodeMatch) return true;

    const matchesSearch = productMatches || variantMatches;
    const matchesCategory = p.category === selectedCategory;
    const matchesProvider = filterProvider ? p.provider === filterProvider : true;
    
    return matchesSearch && matchesCategory && matchesProvider;
  });

  // Sync editPrice when editor opens
  useEffect(() => {
    if (isEditingPrice && viewState.product && viewState.variant) {
      setEditPrice({
        productName: viewState.product.name,
        variantName: viewState.variant.name,
        modalPrice: viewState.variant.modalPrice || 0,
        sellingPrice: viewState.variant.sellingPrice || 0,
        minStock: viewState.variant.minStock || 5,
        barcode: viewState.variant.barcode || ''
      });
    }
  }, [isEditingPrice]); // Only run when opening the editor

  const providers = Array.from(new Set(products.filter(p => p.category === selectedCategory).map(p => p.provider))) as string[];
  
  // Form States
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [showAddBranch, setShowAddBranch] = useState(false);
  const [newBranch, setNewBranch] = useState({ name: '', location: '' });
  const [newProduct, setNewProduct] = useState({
    name: '',
    provider: 'Telkomsel',
    category: 'voucher',
    targetProductId: '', // For adding to existing product (kept for backward schema compat but hidden from UI)
    variant: { id: Math.random().toString(36).substr(2, 9), modalPrice: 0, sellingPrice: 0, description: '', minStock: 5, barcode: '' },
    sn: '',
    qty: 1
  });

  const [showBatchSN, setShowBatchSN] = useState(false);
  const [showRangeSN, setShowRangeSN] = useState(false);
  const [batchSNConfig, setBatchSNConfig] = useState({ sn: '', qty: 1 });
  const [rangeSNConfig, setRangeSNConfig] = useState({ start: '', end: '' });
  const [singleSNInput, setSingleSNInput] = useState('');
  const [posScannerInput, setPosScannerInput] = useState('');
  const [posSearchQuery, setPosSearchQuery] = useState('');
  const [auditSearchQuery, setAuditSearchQuery] = useState('');
  const [cart, setCart] = useState<any[]>([]);
  const [posStatus, setPosStatus] = useState({ message: '', type: 'info' });
  const [showCameraScanner, setShowCameraScanner] = useState<'stock' | 'pos' | 'stock-initial' | 'audit' | 'barcode-master' | null>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [transfers, setTransfers] = useState<any[]>([]);
  const [disposals, setDisposals] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [historyTab, setHistoryTab] = useState<'sales' | 'audit'>('sales');
  
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferConfig, setTransferConfig] = useState({ toBranchId: '', productId: '', variantId: '', sns: [] as string[] });
  const [showDisposalModal, setShowDisposalModal] = useState(false);
  const [disposalConfig, setDisposalConfig] = useState({ productId: '', variantId: '', sns: [] as string[], reason: 'broken' });
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [lastTransaction, setLastTransaction] = useState<any>(null);
  const [handovers, setHandovers] = useState<any[]>([]);
  const [showHandoverModal, setShowHandoverModal] = useState(false);
  const [handoverConfig, setHandoverConfig] = useState({ cash: 0, notes: '', shift: 'siang' });
  const [isShiftActive, setIsShiftActive] = useState(false);

  const providersList = ['Telkomsel', 'Indosat', 'XL', 'Axis', 'Three', 'Smartfren', 'Lainnya'];
  const brandsList = ['Robot', 'Vivan', 'Baseus', 'Oppo', 'Samsung', 'Vivo', 'Xiaomi', 'Rexi', 'Foomee', 'Lainnya'];
  const accessoryTypes = ['Charger', 'Headset', 'Kabel Data', 'Powerbank', 'Tempered Glass', 'Memory Card', 'Speaker', 'Earphone', 'Casing', 'Adaptor', 'Lainnya'];
  const voucherTypes = ['Voucher Internet', 'Voucher Game', 'Voucher PLN', 'Lainnya'];
  const perdanaTypes = ['Kartu Perdana', 'Perdana Internet', 'Lainnya'];

  const formatRupiah = (num: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(num);
  };

  const exportToExcel = (data: any[], fileName: string) => {
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Laporan");
    XLSX.writeFile(workbook, `${fileName}.xlsx`);
  };

  useEffect(() => {
    // Reset provider when category changes to ensure it matches the correct list (Brand vs Provider)
    if (newProduct.category === 'aksesoris') {
      if (!brandsList.includes(newProduct.provider)) {
        setNewProduct(prev => ({ ...prev, provider: brandsList[0] }));
      }
    } else {
      if (!providersList.includes(newProduct.provider)) {
        setNewProduct(prev => ({ ...prev, provider: providersList[0] }));
      }
    }
  }, [newProduct.category]);

  const getProviderColor = (provider: string) => {
    switch (provider) {
      case 'Telkomsel': return 'text-red-500 bg-red-500/10 border-red-500/20';
      case 'Indosat': return 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20';
      case 'XL': return 'text-blue-500 bg-blue-500/10 border-blue-500/20';
      case 'Axis': return 'text-purple-500 bg-purple-500/10 border-purple-500/20';
      case 'Three': return 'text-white bg-white/10 border-white/20';
      case 'Smartfren': return 'text-pink-500 bg-pink-500/10 border-pink-500/20';
      default: return 'text-text-dim bg-white/5 border-white/10';
    }
  };

  const [confirmModal, setConfirmModal] = useState<{ show: boolean, onConfirm: () => void, title: string, message: string, confirmText?: string, cancelText?: string }>({ 
    show: false, onConfirm: () => {}, title: '', message: '', confirmText: 'Ya, Hapus', cancelText: 'Batal'
  });

  const handleDeleteProduct = async (productId: string) => {
    try {
      // Check if any variant of this product has stock in any branch
      const invQuery = query(collectionGroup(db, 'inventory'), where('productId', '==', productId));
      const invSnap = await getDocs(invQuery);
      const hasStock = invSnap.docs.some(doc => doc.data().stock > 0);

      if (hasStock) {
        setConfirmModal({
          show: true,
          title: "Produk Dikunci",
          message: "Tidak dapat menghapus produk ini karena masih ada stok (SN) yang tersisa di salah satu cabang. Kosongkan stok terlebih dahulu.",
          confirmText: "Tutup",
          onConfirm: () => setConfirmModal(prev => ({ ...prev, show: false }))
        });
        return;
      }

      setConfirmModal({
        show: true,
        title: "Hapus Produk",
        message: "Hapus produk ini secara permanen dari pusat? Data stok di semua cabang juga akan terputus dari master ini.",
        onConfirm: async () => {
          try {
            await deleteDoc(doc(db, 'products', productId));
            if (viewState.product?.id === productId) setViewState({ ...viewState, product: null, variant: null });
            setConfirmModal(prev => ({ ...prev, show: false }));
          } catch (error) {
            handleFirestoreError(error, OperationType.DELETE, `products/${productId}`);
          }
        }
      });
    } catch (error) {
      console.error("Error checking stock before deletion:", error);
      // Fallback to simple confirmation if check fails
    }
  };

  const handleReturnTransaction = async (tx: any) => {
    setConfirmModal({
      show: true,
      title: "Konfirmasi Retur",
      message: `Anda akan melakukan retur untuk transaksi senilai ${formatRupiah(tx.totalAmount)}. Stok barang akan otomatis dikembalikan ke inventaris cabang. Lanjutkan?`,
      confirmText: "Ya, Retur",
      onConfirm: async () => {
        try {
          // 1. Mark transaction as returned
          await updateDoc(doc(db, 'transactions', tx.id), {
            status: 'returned',
            returnedAt: serverTimestamp(),
            returnedBy: auth.currentUser?.uid,
            returnedByName: userData?.name
          });

          // 2. Restore stock for each item
          const updates: any = {};
          tx.items.forEach((item: any) => {
            const key = `${item.productId}_${item.variantId}`;
            if (!updates[key]) updates[key] = [];
            updates[key].push(item.sn);
          });

          for (const key in updates) {
            const snList = updates[key];
            const itemRef = doc(db, `branches/${tx.branchId}/inventory`, key);
            
            // Note: We need the LATEST data from DB to avoid race conditions
            const snap = await getDoc(itemRef);
            if (snap.exists()) {
              const currentSns = snap.data().sns || [];
              const newSns = [...new Set([...currentSns, ...snList])]; // Ensure no duplicates just in case
              await updateDoc(itemRef, {
                sns: newSns,
                stock: newSns.length,
                lastUpdated: serverTimestamp()
              });
            } else {
              // If somehow the inventory record was deleted, recreate it
              await setDoc(itemRef, {
                productId: key.split('_')[0],
                variantId: key.split('_')[1],
                sns: snList,
                stock: snList.length,
                lastUpdated: serverTimestamp()
              });
            }
          }

          setPosStatus({ message: "Transaksi Berhasil Diretur!", type: 'success' });
          setConfirmModal(prev => ({ ...prev, show: false }));
        } catch (error) {
          handleFirestoreError(error, OperationType.UPDATE, `transactions/${tx.id}`);
        }
      }
    });
  };

  // Test Connection on Boot (Requirement)
  useEffect(() => {
    async function testConnection() {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
        console.log("Firestore connection successful.");
      } catch (error: any) {
        if (error?.code === 'unavailable') {
          console.error("Firestore Error: Backend unreachable. Please check your internet connection or Firebase project status.");
        } else if (error?.code === 'permission-denied') {
          console.log("Firestore reached, but permissions denied (connectivity confirmed).");
        } else {
          console.log("Firestore connection check:", error.message || error);
        }
      }
    }
    testConnection();
  }, []);

  useEffect(() => {
    const unsubAuth = auth.onAuthStateChanged(async (u) => {
      setUser(u);
      if (u) {
        const userRef = doc(db, 'users', u.uid);
        try {
          const userSnap = await getDoc(userRef);
          
          if (!userSnap.exists()) {
            const isOwner = u.email === "aditelaid@gmail.com";
            const initialData = {
              email: u.email,
              name: u.displayName || 'User',
              role: isOwner ? 'admin' : 'employee',
              isApproved: isOwner ? true : false,
              branchId: '',
              createdAt: serverTimestamp()
            };
            await setDoc(userRef, initialData);
            setUserData(initialData);
          } else {
            setUserData(userSnap.data());
          }

          onSnapshot(userRef, (doc) => {
            setUserData(doc.data());
            // Delay hide loading to ensure initial data is fetched
            setTimeout(() => setIsAppLoading(false), 1200);
          }, (error) => {
            handleFirestoreError(error, OperationType.GET, `users/${u.uid}`);
            setIsAppLoading(false);
          });
        } catch (error) {
          handleFirestoreError(error, OperationType.GET, `users/${u.uid}`);
          setIsAppLoading(false);
        }
      } else {
        setUserData(null);
        setIsAppLoading(false);
      }
    });
    return unsubAuth;
  }, []);

  useEffect(() => {
    if (userData?.isApproved || userData?.role === 'admin') {
      const unsubProducts = onSnapshot(collection(db, 'products'), (snapshot) => {
        setProducts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, 'products');
      });

      // Isolate branch fetching: Admins see all, Employees see only their one branch
      let unsubBranches = () => {};
      
      if (userData?.role === 'admin' || userData?.role === 'audit') {
        const branchesRef = collection(db, 'branches');
        unsubBranches = onSnapshot(branchesRef, (snapshot) => {
          const branchData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          setBranches(branchData);
          if (branchData.length > 0 && !selectedBranch) setSelectedBranch(branchData[0].id);
        }, (error) => {
          handleFirestoreError(error, OperationType.LIST, 'branches');
        });
      } else if (userData?.branchId) {
        const branchRef = doc(db, 'branches', userData.branchId);
        unsubBranches = onSnapshot(branchRef, (snap) => {
          if (snap.exists()) {
            const data = { id: snap.id, ...snap.data() };
            setBranches([data]);
            setSelectedBranch(snap.id);
          }
        }, (error) => {
          handleFirestoreError(error, OperationType.GET, `branches/${userData.branchId}`);
        });
      }
      
      let unsubUsers = () => {};
      if (userData?.role === 'admin') {
        unsubUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
          setAllUsers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        }, (error) => {
          handleFirestoreError(error, OperationType.LIST, 'users');
        });
      }

      let unsubTransactions = () => {};
      let unsubTransfers = () => {};
      let unsubDisposals = () => {};
      let unsubHandovers = () => {};
      let unsubAuditLogs = () => {};

      if (userData?.role === 'admin' || userData?.role === 'audit') {
        unsubTransactions = onSnapshot(collection(db, 'transactions'), (snapshot) => {
          setTransactions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        }, (error) => {
          handleFirestoreError(error, OperationType.LIST, 'transactions');
        });
        unsubTransfers = onSnapshot(collection(db, 'transfers'), (snapshot) => {
          setTransfers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        }, (error) => {
          handleFirestoreError(error, OperationType.LIST, 'transfers');
        });
        unsubDisposals = onSnapshot(collection(db, 'disposals'), (snapshot) => {
          setDisposals(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        }, (error) => {
          handleFirestoreError(error, OperationType.LIST, 'disposals');
        });
        unsubHandovers = onSnapshot(collection(db, 'handovers'), (snapshot) => {
          setHandovers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        }, (error) => {
          handleFirestoreError(error, OperationType.LIST, 'handovers');
        });
        unsubAuditLogs = onSnapshot(collection(db, 'audit_logs'), (snapshot) => {
          setAuditLogs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        }, (error) => {
          handleFirestoreError(error, OperationType.LIST, 'audit_logs');
        });
      } else if (userData?.branchId) {
        // Employees only listen to their branch transactions
        unsubTransactions = onSnapshot(query(collection(db, 'transactions'), where('branchId', '==', userData.branchId)), (snapshot) => {
          setTransactions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });
      }

      return () => { 
        unsubProducts(); 
        unsubBranches(); 
        unsubUsers(); 
        unsubTransactions(); 
        unsubTransfers(); 
        unsubDisposals(); 
        unsubHandovers();
        unsubAuditLogs();
      };
    }
  }, [userData, selectedBranch]);

  useEffect(() => {
    if (userData?.role !== 'admin' && userData?.branchId) {
      setSelectedBranch(userData.branchId);
    }
  }, [userData]);

  useEffect(() => {
    if (selectedBranch && (userData?.isApproved || userData?.role === 'admin')) {
      const unsubInventory = onSnapshot(collection(db, `branches/${selectedBranch}/inventory`), (snapshot) => {
        const inv: any = {};
        snapshot.docs.forEach(doc => {
          inv[doc.id] = doc.data();
        });
        setBranchInventory(inv);
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, `branches/${selectedBranch}/inventory`);
      });
      return unsubInventory;
    }
  }, [selectedBranch, userData]);

  const login = async () => {
    await signInWithPopup(auth, new GoogleAuthProvider());
  };

  const handleAddBranch = async () => {
    if (!newBranch.name) return;
    await addDoc(collection(db, 'branches'), {
      ...newBranch,
      createdAt: serverTimestamp()
    });
    setNewBranch({ name: '', location: '' });
    setShowAddBranch(false);
  };

  const approveUser = async (userId: string, branchId: string, role: string) => {
    await updateDoc(doc(db, 'users', userId), {
      isApproved: true,
      branchId: branchId,
      role: role
    });
  };

  const handleLogout = () => {
    setConfirmModal({
      show: true,
      title: "Konfirmasi Logout",
      message: "Apakah Anda yakin ingin keluar dari sistem Alpatpulsa?",
      confirmText: "Ya, Keluar",
      onConfirm: async () => {
        setIsAppLoading(true);
        try {
          await auth.signOut();
          setConfirmModal(prev => ({ ...prev, show: false }));
        } catch (error) {
          console.error("Logout error", error);
        } finally {
          setIsAppLoading(false);
        }
      }
    });
  };

  const handleDeleteBranch = async (branchId: string) => {
    setConfirmModal({
      show: true,
      title: "Hapus Cabang",
      message: "Apakah Anda yakin ingin menghapus cabang ini? Semua data stok di cabang ini juga akan hilang secara permanen di sistem lokal.",
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, 'branches', branchId));
          setConfirmModal(prev => ({ ...prev, show: false }));
        } catch (error) {
          handleFirestoreError(error, OperationType.DELETE, `branches/${branchId}`);
        }
      }
    });
  };

  const handleDeleteUser = async (userId: string) => {
    setConfirmModal({
      show: true,
      title: "Hapus Pegawai",
      message: "Hapus akses pegawai ini secara permanen dari sistem Alpatpulsa?",
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, 'users', userId));
          setConfirmModal(prev => ({ ...prev, show: false }));
        } catch (error) {
          handleFirestoreError(error, OperationType.DELETE, `users/${userId}`);
        }
      }
    });
  };

  const logAuditAction = async (action: string, details: any) => {
    try {
      await addDoc(collection(db, 'audit_logs'), {
        userId: user?.uid,
        userName: userData?.name,
        role: userData?.role,
        action,
        details,
        branchId: details.branchId || selectedBranch,
        timestamp: serverTimestamp()
      });
    } catch (e) {
      console.error("Audit log failed:", e);
    }
  };

  const handleDeleteSN = async (sn: string) => {
    if (!selectedBranch || !viewState.product || !viewState.variant) return;
    
    setConfirmModal({
      show: true,
      title: "Hapus SN",
      message: `Hapus Serial Number ${sn} secara permanen dari stok cabang ini?`,
      onConfirm: async () => {
        try {
          const itemRef = doc(db, `branches/${selectedBranch}/inventory`, `${viewState.product.id}_${viewState.variant.id}`);
          const currentData = branchInventory[`${viewState.product.id}_${viewState.variant.id}`];
          if (!currentData) return;
          
          const newSns = currentData.sns.filter((s: string) => s !== sn);
          await updateDoc(itemRef, {
            sns: newSns,
            stock: newSns.length,
            lastUpdated: serverTimestamp()
          });
          setConfirmModal(prev => ({ ...prev, show: false }));
        } catch (error) {
          handleFirestoreError(error, OperationType.DELETE, `inventory/${sn}`);
        }
      }
    });
  };

  const handleDeleteVariant = async (productId: string, variantId: string) => {
    try {
      // Check if this variant has stock in any branch
      const invQuery = query(collectionGroup(db, 'inventory'), where('variantId', '==', variantId));
      const invSnap = await getDocs(invQuery);
      const hasStock = invSnap.docs.some(doc => doc.data().stock > 0);

      if (hasStock) {
        setConfirmModal({
          show: true,
          title: "Tipe Dikunci",
          message: "Tidak dapat menghapus tipe ini karena masih ada stok (SN) yang tersisa di salah satu cabang. Kosongkan stok terlebih dahulu.",
          confirmText: "Tutup",
          onConfirm: () => setConfirmModal(prev => ({ ...prev, show: false }))
        });
        return;
      }

      setConfirmModal({
        show: true,
        title: "Hapus Varian",
        message: "Hapus paksa varian ini dari katalog? Stok terdaftar akan tetap ada di database tapi tidak akan muncul di menu.",
        onConfirm: async () => {
          try {
            const productRef = doc(db, 'products', productId);
            const pDoc = await getDoc(productRef);
            if (pDoc.exists()) {
              const data = pDoc.data();
              const vId = variantId;
              const newVariants = data.variants.filter((v: any) => (v.id || v.name) !== vId);
              await updateDoc(productRef, { variants: newVariants });
            }
            setConfirmModal(prev => ({ ...prev, show: false }));
            setViewState(prev => ({ ...prev, product: null, variant: null }));
          } catch (error) {
            handleFirestoreError(error, OperationType.DELETE, `variants/${variantId}`);
          }
        }
      });
    } catch (error) {
      console.error("Error checking variant stock before deletion:", error);
    }
  };

  const handleSaveProduct = async () => {
    const trimmedName = newProduct.name.trim();
    if (!trimmedName) {
      setConfirmModal({
        show: true,
        title: "Input Kosong",
        message: "Nama / Model produk harus diisi sebelum dapat disimpan.",
        onConfirm: () => setConfirmModal(prev => ({ ...prev, show: false }))
      });
      return;
    }

    try {
      // Robust number parsing
      const modalPrice = Number(newProduct.variant.modalPrice) || 0;
      const sellingPrice = Number(newProduct.variant.sellingPrice) || 0;
      const variantId = Math.random().toString(36).substr(2, 9);
      
      const variantName = newProduct.variant.description || `Tipe ${variantId}`;

      // Check if product group exists
      const existingProduct = products.find(p => 
        p.name?.toLowerCase() === trimmedName.toLowerCase() && 
        p.provider === newProduct.provider &&
        p.category === newProduct.category
      );

      let pId;

    if (existingProduct) {
      // Check if variant with same name already exists in this group
      const vNameNormalized = variantName.trim();
      const isDuplicateVariant = existingProduct.variants?.some((v: any) => v.name?.trim().toLowerCase() === vNameNormalized.toLowerCase());
      if (isDuplicateVariant) {
        setConfirmModal({
          show: true,
          title: "Tipe Duplikat",
          message: `Tipe "${vNameNormalized}" sudah ada di produk ini. Silakan gunakan nama tipe lain.`,
          onConfirm: () => setConfirmModal(prev => ({ ...prev, show: false }))
        });
        return;
      }

      // Add variant to existing product group
      pId = existingProduct.id;
      const currentVariants = existingProduct.variants || [];
      await updateDoc(doc(db, 'products', pId), {
        variants: [...currentVariants, { 
          ...newProduct.variant, 
          name: vNameNormalized, 
          modalPrice, 
          sellingPrice,
          barcode: newProduct.variant.barcode?.trim() || '',
          id: variantId 
        }]
      });
    } else {
      // Create a new product group
      const newDocRef = await addDoc(collection(db, 'products'), {
        name: trimmedName,
        provider: newProduct.provider,
        category: newProduct.category,
        variants: [{ 
          ...newProduct.variant, 
          name: variantName.trim(), 
          modalPrice, 
          sellingPrice,
          barcode: newProduct.variant.barcode?.trim() || '',
          id: variantId 
        }],
        createdAt: serverTimestamp(),
        createdBy: user?.uid || 'system'
      });
      pId = newDocRef.id;
    }

      // Handle Initial Stock if provided
      if (selectedBranch && (newProduct.sn || newProduct.qty > 0)) {
        const itemRef = doc(db, `branches/${selectedBranch}/inventory`, `${pId}_${variantId}`);
        const currentData = branchInventory[`${pId}_${variantId}`] || { sns: [] };
        
        let newSns = [...currentData.sns];
        let qtyToAdd = newProduct.category === 'aksesoris' ? (newProduct.qty > 0 ? newProduct.qty : 1) : 1;

        if (newProduct.sn) {
          // If SN is provided, add it multiple times based on qty (Batch mode logic for aksesoris)
          // For voucher it will only loop once.
          for (let i = 0; i < qtyToAdd; i++) {
            newSns.push(newProduct.sn);
          }
        } else {
          // No SN but has Qty, generate placeholder SNs
          for (let i = 0; i < qtyToAdd; i++) {
            newSns.push(`STK-${Math.random().toString(36).substr(2, 6).toUpperCase()}`);
          }
        }

        await setDoc(itemRef, {
          productId: pId,
          variantId: variantId,
          sns: newSns,
          stock: newSns.length,
          lastUpdated: serverTimestamp()
        });
      }

      setShowAddProduct(false);
      setNewProduct({
        name: '',
        provider: 'Telkomsel',
        category: 'voucher',
        targetProductId: '',
        variant: { id: Math.random().toString(36).substr(2, 9), modalPrice: 0, sellingPrice: 0, description: '', minStock: 5 },
        sn: '',
        qty: 1
      });
    } catch (error: any) {
      handleFirestoreError(error, OperationType.WRITE, 'products');
      setConfirmModal({
        show: true,
        title: "Gagal Menyimpan",
        message: `Terjadi kendala saat menyimpan data: ${error.message || 'Koneksi terputus'}. Silakan coba beberapa saat lagi.`,
        onConfirm: () => setConfirmModal(prev => ({ ...prev, show: false }))
      });
    }
  };

  const handleTransfer = async () => {
    const { fromBranchId, toBranchId, productId, variantId, sns } = transferConfig;
    if (!fromBranchId || !toBranchId || !productId || !variantId || sns.length === 0) return;
    if (fromBranchId === toBranchId) return;

    try {
      const sourceRef = doc(db, `branches/${fromBranchId}/inventory`, `${productId}_${variantId}`);
      const destRef = doc(db, `branches/${toBranchId}/inventory`, `${productId}_${variantId}`);
      
      const sourceSnap = await getDoc(sourceRef);
      const destSnap = await getDoc(destRef);

      if (!sourceSnap.exists()) return;
      const sourceData = sourceSnap.data();
      const currentSourceSns = sourceData.sns || [];
      
      // Update Source
      const newSourceSns = currentSourceSns.filter((s: string) => !sns.includes(s));
      await updateDoc(sourceRef, { 
        sns: newSourceSns, 
        stock: newSourceSns.length,
        lastUpdated: serverTimestamp() 
      });

      // Update Destination
      const destData = destSnap.data() || { sns: [], stock: 0 };
      const newDestSns = [...destData.sns, ...sns];
      await setDoc(destRef, {
        productId,
        variantId,
        sns: newDestSns,
        stock: newDestSns.length,
        lastUpdated: serverTimestamp()
      });

      // Record Transfer
      const product = products.find(p => p.id === productId);
      const variant = product?.variants.find((v: any) => v.id === variantId);
      
      await addDoc(collection(db, 'transfers'), {
        fromBranchId,
        toBranchId,
        productId,
        variantId,
        productName: product?.name || 'Unknown',
        variantName: variant?.name || 'Unknown',
        sns,
        status: 'completed',
        requestedBy: auth.currentUser?.uid,
        timestamp: serverTimestamp()
      });

      setShowTransferModal(false);
      setTransferConfig({ toBranchId: '', productId: '', variantId: '', sns: [] });
      setPosStatus({ message: "Transfer Stok Berhasil!", type: 'success' });
      setTimeout(() => setPosStatus({ message: '', type: 'info' }), 3000);
    } catch (error) {
       handleFirestoreError(error, OperationType.WRITE, 'transfers');
    }
  };

  const handleDisposal = async () => {
    const { productId, variantId, sns, reason } = disposalConfig;
    const branchId = userData?.branchId;
    if (!branchId || !productId || !variantId || sns.length === 0) return;

    try {
      const itemRef = doc(db, `branches/${branchId}/inventory`, `${productId}_${variantId}`);
      const itemSnap = await getDoc(itemRef);
      if (!itemSnap.exists()) return;

      const currentSns = itemSnap.data().sns || [];
      const newSns = currentSns.filter((s: string) => !sns.includes(s));

      await updateDoc(itemRef, {
        sns: newSns,
        stock: newSns.length,
        lastUpdated: serverTimestamp()
      });

      // Record Disposal
      const product = products.find(p => p.id === productId);
      const variant = product?.variants.find((v: any) => v.id === variantId);

      await addDoc(collection(db, 'disposals'), {
        branchId,
        productId,
        variantId,
        productName: product?.name || 'Unknown',
        variantName: variant?.name || 'Unknown',
        sns,
        reason,
        reportedBy: auth.currentUser?.uid,
        timestamp: serverTimestamp()
      });

      setShowDisposalModal(false);
      setViewState({ ...viewState, product: null, variant: null });
      setPosStatus({ message: `Laporan ${reason === 'broken' ? 'Kerusakan' : 'Retur'} Disimpan!`, type: 'success' });
      setTimeout(() => setPosStatus({ message: '', type: 'info' }), 3000);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'disposals');
    }
  };

  const handleUpdateVariantPrices = async () => {
    if (!viewState.product || !viewState.variant) return;
    
    try {
      const productRef = doc(db, 'products', viewState.product.id);
      const productSnap = await getDoc(productRef);
      
      if (!productSnap.exists()) return;
      
      const productData = productSnap.data();
      const variants = productData.variants || [];
      
      const updatedVariants = variants.map((v: any) => {
        if (v.id === viewState.variant.id) {
          return {
            ...v,
            name: editPrice.variantName?.trim() || v.name,
            modalPrice: editPrice.modalPrice,
            sellingPrice: editPrice.sellingPrice,
            minStock: editPrice.minStock,
            barcode: editPrice.barcode?.trim() || ''
          };
        }
        return v;
      });
      
      await updateDoc(productRef, { 
        name: editPrice.productName?.trim() || productData.name,
        variants: updatedVariants 
      });
      
      // Update local viewState
      setViewState({
        ...viewState,
        product: {
          ...viewState.product,
          name: editPrice.productName?.trim() || viewState.product.name
        },
        variant: {
          ...viewState.variant,
          name: editPrice.variantName?.trim() || viewState.variant.name,
          modalPrice: editPrice.modalPrice,
          sellingPrice: editPrice.sellingPrice,
          minStock: editPrice.minStock,
          barcode: editPrice.barcode?.trim() || ''
        }
      });
      
      setIsEditingPrice(false);
      setPosStatus({ message: "Data Produk Berhasil Diperbarui!", type: 'success' });
      setTimeout(() => setPosStatus({ message: '', type: 'info' }), 3000);
    } catch (error: any) {
      handleFirestoreError(error, OperationType.UPDATE, `products/${viewState.product.id}`);
    }
  };

  const handleUpdateProductName = async () => {
    if (!viewState.product || !editProductName.trim()) return;

    try {
      const productRef = doc(db, 'products', viewState.product.id);
      await updateDoc(productRef, {
        name: editProductName.trim()
      });

      setViewState({
        ...viewState,
        product: {
          ...viewState.product,
          name: editProductName.trim()
        }
      });

      setIsEditingProductName(false);
      setPosStatus({ message: "Nama Produk Diperbarui!", type: 'success' });
      setTimeout(() => setPosStatus({ message: '', type: 'info' }), 3000);
    } catch (error: any) {
      handleFirestoreError(error, OperationType.UPDATE, `products/${viewState.product.id}`);
    }
  };

  const handleUpdateVariantName = async () => {
    if (!viewState.product || !viewState.variant || !editVariantName.trim()) return;

    try {
      const productRef = doc(db, 'products', viewState.product.id);
      const productSnap = await getDoc(productRef);
      if (!productSnap.exists()) return;

      const variants = productSnap.data().variants || [];
      const updatedVariants = variants.map((v: any) => {
        if (v.id === viewState.variant.id) {
          return { ...v, name: editVariantName.trim() };
        }
        return v;
      });

      await updateDoc(productRef, { variants: updatedVariants });

      setViewState({
        ...viewState,
        variant: {
          ...viewState.variant,
          name: editVariantName.trim()
        }
      });

      setIsEditingVariantName(false);
      setPosStatus({ message: "Nama Varian Diperbarui!", type: 'success' });
      setTimeout(() => setPosStatus({ message: '', type: 'info' }), 3000);
    } catch (error: any) {
      handleFirestoreError(error, OperationType.UPDATE, `products/${viewState.product.id}/variants/${viewState.variant.id}`);
    }
  };

  const handleAuditScan = async (snInput: string) => {
    const sn = snInput.trim();
    try {
      // 1. Cari di Inventory (Stok Aktif)
      const invQuery = query(collectionGroup(db, 'inventory'), where('sns', 'array-contains', sn));
      const invSnap = await getDocs(invQuery);

      if (!invSnap.empty) {
        const itemData = invSnap.docs[0].data();
        const product = products.find(p => p.id === itemData.productId);
        const variant = product?.variants.find((v: any) => v.id === itemData.variantId);

        if (product && variant) {
          setViewState({
             category: product.category,
             provider: product.provider,
             product: product,
             variant: variant
          });
          setActiveMenu('products'); // Jump to products to show the modal
          setPosStatus({ message: `Ditemukan di Inventaris: ${product.name}`, type: 'success' });
          setTimeout(() => setPosStatus({ message: '', type: 'info' }), 3000);
          setShowCameraScanner(null);
          return;
        }
      }

      // 2. Jika tidak ada di stok, cari berdasarkan "Kunci SN / Barcode Master" (Khusus Aksesoris/Voucher)
      const productWithMaster = products.find(p => p.variants?.some((v: any) => v.barcode?.trim() === sn));
      if (productWithMaster) {
        const variant = productWithMaster.variants.find((v: any) => v.barcode?.trim() === sn);
        setViewState({
          category: productWithMaster.category,
          provider: productWithMaster.provider,
          product: productWithMaster,
          variant: variant
        });
        setActiveMenu('products'); // Jump to products to show the modal
        setPosStatus({ message: `Ditemukan via Kunci SN: ${productWithMaster.name}`, type: 'success' });
        setTimeout(() => setPosStatus({ message: '', type: 'info' }), 3000);
        setShowCameraScanner(null);
        return;
      }

      setConfirmModal({
        show: true,
        title: "SN Tidak Ditemukan",
        message: `Serial Number/Barcode ${sn} tidak terdaftar di sistem.`,
        confirmText: "Tutup",
        onConfirm: () => setConfirmModal(prev => ({ ...prev, show: false }))
      });
      
      setShowCameraScanner(null);
    } catch (error: any) {
      handleFirestoreError(error, OperationType.GET, 'inventory_search');
    }
  };

  const [viewState, setViewState] = useState<{
    category: string | null,
    provider: string | null,
    product: any | null,
    variant: any | null
  }>({ category: 'voucher', provider: null, product: null, variant: null });

  const [isAppLoading, setIsAppLoading] = useState(true);

  const goBack = () => {
    if (viewState.variant) setViewState({ ...viewState, variant: null });
    else if (viewState.product) setViewState({ ...viewState, product: null });
    else if (viewState.provider) setViewState({ ...viewState, provider: null });
  };

  const filteredProductsByProvider = React.useMemo(() => {
    const raw = products.filter(p => 
      p.category === viewState.category && p.provider === viewState.provider
    );
    
    const groups: Record<string, any> = {};
    raw.forEach(p => {
      const key = p.name.toLowerCase().trim();
      if (!groups[key]) {
        groups[key] = { ...p, variants: [...(p.variants || [])] };
      } else {
        // Merge variants for display if they aren't already grouped in DB
        const existingIds = new Set(groups[key].variants.map((v: any) => v.id));
        p.variants?.forEach((v: any) => {
          if (!existingIds.has(v.id)) {
            groups[key].variants.push(v);
            existingIds.add(v.id);
          }
        });
      }
    });
    return Object.values(groups);
  }, [products, viewState.category, viewState.provider]);

  const availableProviders = Array.from(new Set(
    products.filter(p => p.category === viewState.category).map(p => p.provider)
  )) as string[];

  const cleanupDuplicates = async () => {
    const groups: Record<string, any[]> = {};
    
    products.forEach(p => {
      const key = `${p.name.toLowerCase().trim()}-${p.provider}-${p.category}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(p);
    });

    const duplicates = Object.entries(groups).filter(([_, g]) => g.length > 1);
    
    if (duplicates.length === 0) {
      setConfirmModal({
        show: true,
        title: "Katalog Bersih",
        message: "Tidak ditemukan produk duplikat yang perlu digabungkan.",
        onConfirm: () => setConfirmModal(prev => ({ ...prev, show: false }))
      });
      return;
    }

    setConfirmModal({
      show: true,
      title: "Gabungkan Duplikat",
      message: `Ditemukan ${duplicates.length} kelompok produk yang memiliki duplikat. Gabungkan semua varian ke dalam satu kelompok dan bersihkan katalog?`,
      onConfirm: async () => {
        try {
          for (const [_, group] of duplicates) {
            const [main, ...others] = group;
            let mergedVariants = [...(main.variants || [])];
            
            for (const other of others) {
              if (other.variants) {
                other.variants.forEach((ov: any) => {
                  if (!mergedVariants.find(mv => mv.id === ov.id)) {
                    mergedVariants.push(ov);
                  }
                });
              }
              await deleteDoc(doc(db, 'products', other.id));
            }
            await updateDoc(doc(db, 'products', main.id), { variants: mergedVariants });
          }
          setConfirmModal(prev => ({ ...prev, show: false }));
        } catch (error) {
          console.error("Error merging:", error);
        }
      }
    });
  };

  const renderContent = () => {
    if (!userData && user) {
      return (
        <div className="flex flex-col items-center justify-center mt-32 space-y-6 animate-in fade-in duration-500">
           <div className="relative">
              <div className="w-16 h-16 border-[3px] border-accent-blue/10 border-t-accent-blue rounded-full animate-spin"></div>
              <div className="absolute inset-0 flex items-center justify-center">
                 <div className="w-8 h-8 bg-accent-blue/10 rounded-full animate-pulse"></div>
              </div>
           </div>
           <div className="text-center space-y-1">
              <p className="text-[10px] text-accent-blue font-black uppercase tracking-[0.4em]">Database Sync</p>
              <p className="text-[8px] text-text-dim uppercase tracking-widest leading-relaxed">Menghubungkan ke server Alpatpulsa...</p>
           </div>
        </div>
      );
    }

    if (!userData?.isApproved && userData?.role !== 'admin') {
      return (
        <div className="flex flex-col items-center justify-center mt-20 space-y-6 text-center px-6">
          <div className="w-20 h-20 bg-yellow-500/20 rounded-full flex items-center justify-center text-yellow-500">
            <ShieldAlert size={40} />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-bold">Menunggu Persetujuan</h2>
            <p className="text-text-dim text-sm">Akun Anda sedang ditinjau oleh Owner. Silakan hubungi admin untuk mendapatkan akses ke sistem Alpatpulsa.</p>
          </div>
          <button onClick={() => auth.signOut()} className="text-accent-blue text-sm font-bold">Keluar</button>
        </div>
      );
    }

    const allInventory = Object.entries(branchInventory).map(([key, value]: [string, any]) => ({
      key,
      ...value
    }));

    const lowStockAlerts = allInventory.filter(inv => {
      const product = products.find(p => p.id === inv.productId);
      if (!product) return false;
      const variant = product.variants?.find((v: any) => v.id === inv.variantId);
      if (!variant) return false;
      return inv.stock <= (variant.minStock || 0);
    }).map(inv => {
      const product = products.find(p => p.id === inv.productId);
      const variant = product?.variants?.find((v: any) => v.id === inv.variantId);
      const branchName = branches.find(b => b.id === inv.branchId)?.name || 'Unknown';
      return {
        ...inv,
        productName: product?.name,
        variantName: variant?.name || variant?.description,
        minStock: variant?.minStock,
        branchName
      };
    });

    switch (activeMenu) {
      case 'dashboard':
        const dailyTx = transactions.filter(t => {
          const txDate = t.timestamp?.toDate().toDateString();
          const today = new Date().toDateString();
          const isToday = txDate === today;
          if (!isToday || t.status === 'returned') return false;
          
          // If admin, show all today's transactions for global report
          // If employee, only their branch
          return userData?.role === 'admin' || t.branchId === selectedBranch;
        });
        
        // Specifically for the branch summary, we might want branch-specific daily totals too
        const branchDailyTx = transactions.filter(t => {
          const txDate = t.timestamp?.toDate().toDateString();
          const today = new Date().toDateString();
          return txDate === today && t.branchId === selectedBranch && t.status !== 'returned';
        });
        const branchTotalDaily = branchDailyTx.reduce((acc, curr) => acc + curr.totalAmount, 0);
        const branchProfitDaily = branchDailyTx.reduce((acc, curr) => acc + (curr.totalProfit || 0), 0);

        const totalDaily = dailyTx.reduce((acc, curr) => acc + curr.totalAmount, 0);
        const profitDaily = dailyTx.reduce((acc, curr) => acc + (curr.totalProfit || 0), 0);

        if (userData?.role === 'admin' || userData?.role === 'audit') {
          return (
            <div className="space-y-6 pb-10">
              <div className="flex justify-between items-center px-1">
                <div>
                  <h2 className="text-xl font-black text-white tracking-widest uppercase">
                    {userData.role === 'admin' ? 'Admin Panel' : 'Audit Panel'}
                  </h2>
                  <p className="text-[10px] text-text-dim uppercase font-bold tracking-widest">
                    {userData.role === 'admin' ? 'Dashboard Kendali Sistem' : 'Monitor & Audit Cabang'}
                  </p>
                </div>
                <select 
                  className="bg-gray-800 text-[10px] border border-glass-border px-3 py-2 rounded-xl focus:outline-none focus:border-accent-blue/50 text-white font-bold"
                  value={selectedBranch || ''}
                  onChange={e => setSelectedBranch(e.target.value)}
                >
                  {branches.sort((a,b) => a.name.localeCompare(b.name, undefined, {numeric: true})).map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>

              <div className="glass-card p-4 border-white/10 bg-gradient-to-br from-white/[0.03] to-transparent space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-green-500/20 text-green-500 flex items-center justify-center">
                      <TrendingUp size={18} />
                    </div>
                    <h3 className="text-xs font-black text-white uppercase tracking-widest">Laporan Keuangan Global</h3>
                  </div>
                  <span className="text-[8px] font-bold text-green-500 bg-green-500/10 px-2 py-1 rounded-full uppercase tracking-tighter animate-pulse">Hari Ini</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-text-dim uppercase tracking-[0.2em]">Omset Seluruh Cabang</p>
                    <p className="text-2xl font-black text-white tracking-tighter">{formatRupiah(totalDaily)}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-[9px] font-black bg-blue-500 text-white px-2 py-0.5 rounded uppercase tracking-tighter">{dailyTx.length} Transaksi Terjadi</span>
                    </div>
                  </div>
                  <div className="space-y-1 bg-green-500/5 p-3 rounded-2xl border border-green-500/10">
                    <div className="flex items-center gap-2 mb-1">
                      <Wallet size={12} className="text-green-500" />
                      <p className="text-[10px] font-bold text-green-500 uppercase tracking-[0.2em]">Estimasi Laba Global</p>
                    </div>
                    <p className="text-xl font-black text-green-400 tracking-tighter">{formatRupiah(profitDaily)}</p>
                    <p className="text-[8px] text-green-500/60 font-medium italic mt-1">*Margin kotor dari akumulasi penjualan</p>
                  </div>
                </div>

                <div className="pt-4 border-t border-white/5 grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-[9px] font-bold text-text-dim uppercase tracking-widest">Aktivitas Global</span>
                    </div>
                    <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
                      <div className="bg-blue-500 h-full" style={{ width: `${Math.min(100, (dailyTx.length / 100) * 100)}%` }}></div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-[9px] font-bold text-text-dim uppercase tracking-widest">Laba vs Omset</span>
                    </div>
                    <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
                      <div className="bg-green-500 h-full" style={{ width: `${totalDaily > 0 ? (profitDaily / totalDaily) * 100 : 0}%` }}></div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex justify-between items-center px-1">
                  <h3 className="text-[10px] font-bold text-text-dim uppercase tracking-[0.2em]">Status Cabang: {branches.find(b => b.id === selectedBranch)?.name}</h3>
                  <div className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-accent-blue animate-pulse"></span>
                    <span className="text-[8px] font-bold text-accent-blue uppercase tracking-widest">Live View</span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="glass-card p-3 border-white/5 bg-white/[0.02]">
                    <p className="text-[8px] font-bold text-text-dim uppercase tracking-widest mb-1">Omset Cabang</p>
                    <p className="text-lg font-black text-white">{formatRupiah(branchTotalDaily)}</p>
                  </div>
                  <div className="glass-card p-3 border-white/5 bg-white/[0.02]">
                    <p className="text-[8px] font-bold text-text-dim uppercase tracking-widest mb-1">Laba Cabang</p>
                    <p className="text-lg font-black text-green-500">{formatRupiah(branchProfitDaily)}</p>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex justify-between items-center px-1">
                  <h3 className="text-[10px] font-bold text-text-dim uppercase tracking-[0.2em]">Logistik Cabang</h3>
                  <Activity size={14} className="text-accent-blue" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="glass-card p-4 border-white/10 hover:border-accent-blue/30 transition-colors cursor-pointer group">
                    <div className="flex justify-between items-start mb-2">
                      <div className="w-8 h-8 rounded-lg bg-accent-blue/10 flex items-center justify-center text-accent-blue group-hover:scale-110 transition-transform">
                        <Package size={18} />
                      </div>
                      <PieChart size={14} className="text-text-dim" />
                    </div>
                    <p className="text-[9px] font-bold text-text-dim uppercase tracking-widest mb-1">Total Unit Stok</p>
                    <p className="text-xl font-black tracking-tighter text-white">
                      {Object.values(branchInventory).reduce((acc: number, curr: any) => acc + (curr.stock || 0), 0)}
                    </p>
                  </div>
                  <div className="glass-card p-4 border-white/10 hover:border-accent-blue/30 transition-colors cursor-pointer group">
                    <div className="flex justify-between items-start mb-2">
                      <div className="w-8 h-8 rounded-lg bg-yellow-500/10 flex items-center justify-center text-yellow-500 group-hover:scale-110 transition-transform">
                        <ShoppingCart size={18} />
                      </div>
                      <Activity size={14} className="text-text-dim" />
                    </div>
                    <p className="text-[9px] font-bold text-text-dim uppercase tracking-widest mb-1">Total SKU Unik</p>
                    <p className="text-xl font-black tracking-tighter text-white">
                      {Object.keys(branchInventory).length}
                    </p>
                  </div>
                </div>
                <div className="glass-card p-4 border-white/10 flex items-center justify-between bg-white/[0.02]">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-500">
                      <Store size={20} />
                    </div>
                    <div>
                      <p className="text-[11px] font-black text-white uppercase tracking-tight">Status Operasional</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                        <span className="text-[9px] text-green-500 font-bold uppercase tracking-widest">Sistem Online</span>
                      </div>
                    </div>
                  </div>
                  <button onClick={() => setActiveMenu('system')} className="p-3 bg-white/5 rounded-xl border border-white/10 text-white hover:bg-white/10">
                    <ChevronRight size={18} />
                  </button>
                </div>
              </div>
            </div>
          );
        }

        // Branch View for Employees
        const totalBranchStock = Object.values(branchInventory).reduce((acc: number, curr: any) => acc + (curr.stock || 0), 0);
        const branchDailySales = dailyTx.length;
        const branchDailyRevenue = dailyTx.reduce((acc, curr) => acc + curr.totalAmount, 0);

        return (
          <div className="space-y-4 pb-10">
            <div className="flex justify-between items-center mb-1 px-1">
               <h2 className="text-lg font-black text-white tracking-widest uppercase">Statistik Toko</h2>
               <div className="text-[8px] bg-accent-blue/10 text-accent-blue px-2 py-0.5 rounded-full font-bold border border-accent-blue/20 uppercase tracking-widest">
                  {branches.find(b => b.id === selectedBranch)?.name || 'Cabang'}
               </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
                <div className="glass-card p-3 bg-accent-blue/5 border-accent-blue/20">
                  <p className="text-[8px] font-bold text-accent-blue/60 uppercase tracking-widest mb-1">Stok Ready</p>
                  <p className="text-xl font-black tracking-tighter">{totalBranchStock} <span className="text-[10px] font-bold opacity-50 uppercase">Pcs</span></p>
                </div>
                <div className="glass-card p-3 border-white/10">
                  <p className="text-[8px] font-bold text-text-dim uppercase tracking-widest mb-1">Sales Cabang ({branches.find(b => b.id === selectedBranch)?.name || 'Anda'})</p>
                  <p className="text-xl font-black tracking-tighter">{branchDailySales} <span className="text-[10px] font-bold opacity-50 uppercase">Item</span></p>
                </div>
            </div>

            <section className="bg-accent-blue/10 border border-accent-blue/20 p-4 rounded-3xl relative overflow-hidden group">
               <Sparkles className="absolute -top-4 -right-4 text-accent-blue/20 group-hover:scale-110 transition-transform" size={120} />
               <h3 className="text-[9px] font-bold text-accent-blue uppercase tracking-widest relative z-10 mb-2">Omset Hari Ini (Cabang)</h3>
               <p className="text-2xl font-black tracking-tight text-white relative z-10">{formatRupiah(branchDailyRevenue)}</p>
               <p className="text-[8px] text-accent-blue/70 relative z-10 uppercase font-bold mt-2 tracking-widest italic">Semangat melayani pelanggan!</p>
            </section>
          </div>
        );
      case 'system':
        return (
          <div className="space-y-8 pb-32 px-1">
            <section className="space-y-4">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-semibold text-text-dim">Kelola Cabang</h2>
                {userData?.role === 'admin' && (
                  <button onClick={() => setShowAddBranch(true)} className="bg-accent-blue text-gray-900 p-2 rounded-full shadow-lg shadow-accent-blue/20">
                    <Plus size={20} />
                  </button>
                )}
              </div>

              {showAddBranch && (
                <div className="glass-card p-6 space-y-4 border-accent-blue/30 animate-in fade-in slide-in-from-top-4 duration-300">
                  <h3 className="text-sm font-bold text-accent-blue">Tambah Cabang Baru</h3>
                  <div className="space-y-3">
                    <input placeholder="Nama Cabang" className="w-full bg-white/5 border border-glass-border p-3 rounded-xl focus:outline-none focus:border-accent-blue" value={newBranch.name} onChange={e => setNewBranch({...newBranch, name: e.target.value})} />
                    <input placeholder="Lokasi / Alamat" className="w-full bg-white/5 border border-glass-border p-3 rounded-xl focus:outline-none focus:border-accent-blue" value={newBranch.location} onChange={e => setNewBranch({...newBranch, location: e.target.value})} />
                  </div>
                  <div className="flex gap-3">
                    <button onClick={handleAddBranch} className="flex-1 bg-accent-blue text-gray-900 py-3 rounded-xl font-bold">Simpan</button>
                    <button onClick={() => setShowAddBranch(false)} className="px-6 py-3 border border-glass-border rounded-xl">Batal</button>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 gap-3">
                {branches
                  .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }))
                  .map(b => (
                  <div key={b.id} className="glass-card p-3 flex items-center gap-4 hover:border-white/20 transition-colors">
                    <div className="w-10 h-10 bg-accent-blue/10 rounded-xl flex items-center justify-center text-accent-blue">
                      <MapPin size={20} />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-bold text-sm tracking-tight">{b.name}</h3>
                      <p className="text-[10px] text-text-dim leading-tight">{b.location}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {userData?.role === 'admin' && (
                        <button 
                          onClick={() => handleDeleteBranch(b.id)}
                          className="p-2 text-red-500/60 hover:text-red-500 transition-colors"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                      {userData?.role === 'admin' && (
                        <div className="text-[10px] bg-white/5 px-2 py-1 rounded-lg border border-white/10">
                          {allUsers.filter(u => u.branchId === b.id).length} Pegawai
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {userData?.role === 'admin' && (
              <section className="space-y-4 pt-4 border-t border-white/5">
                <h2 className="text-xl font-semibold text-text-dim flex items-center gap-2">
                  <UserCheck size={20} className="text-accent-blue" /> Izin Akses Pegawai
                </h2>
                
                {/* Pending Approvals */}
                {allUsers.some(u => !u.isApproved) ? (
                  <div className="space-y-3">
                    <h3 className="text-[10px] font-bold text-yellow-500 uppercase tracking-widest px-1">Menunggu Persetujuan</h3>
                    {allUsers.filter(u => !u.isApproved).map(u => (
                      <div key={u.id} className="glass-card p-4 space-y-4 border-yellow-500/30">
                        <div className="flex justify-between items-center">
                          <div>
                            <p className="font-bold text-sm">{u.name}</p>
                            <p className="text-[10px] text-text-dim">{u.email}</p>
                          </div>
                        </div>
                        <div className="space-y-3">
                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                              <p className="text-[8px] font-bold text-text-dim uppercase tracking-widest ml-1">Penempatan Cabang</p>
                              <select 
                                id={`branch-select-${u.id}`}
                                className="w-full bg-gray-950 border border-white/10 text-[10px] p-2.5 rounded-xl focus:outline-none focus:border-accent-blue/50"
                              >
                                <option value="">Pilih Cabang</option>
                                {branches.sort((a,b) => a.name.localeCompare(b.name, undefined, {numeric: true})).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                              </select>
                            </div>
                            <div className="space-y-1">
                              <p className="text-[8px] font-bold text-text-dim uppercase tracking-widest ml-1">Jabatan / Role</p>
                              <select 
                                id={`role-select-${u.id}`}
                                className="w-full bg-gray-950 border border-white/10 text-[10px] p-2.5 rounded-xl focus:outline-none focus:border-accent-blue/50"
                              >
                                <option value="employee">Karyawan</option>
                                <option value="audit">Auditor</option>
                                <option value="admin">Admin / Bos</option>
                              </select>
                            </div>
                          </div>
                          <button 
                            onClick={() => {
                              const bId = (document.getElementById(`branch-select-${u.id}`) as HTMLSelectElement).value;
                              const role = (document.getElementById(`role-select-${u.id}`) as HTMLSelectElement).value;
                              if (bId) approveUser(u.id, bId, role);
                              else if (role === 'admin' || role === 'audit') approveUser(u.id, 'all', role);
                              else {
                                setConfirmModal({
                                  show: true,
                                  title: "Penempatan Diperlukan",
                                  message: "Harap pilih cabang penempatan untuk akun karyawan.",
                                  onConfirm: () => setConfirmModal(prev => ({ ...prev, show: false }))
                                });
                              }
                            }}
                            className="w-full bg-accent-blue text-gray-900 text-[10px] py-3 rounded-xl font-black uppercase tracking-widest shadow-lg shadow-accent-blue/20 active:scale-95 transition"
                          >
                            Setujui & Aktifkan Versi Pro
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-4 bg-white/5 rounded-xl text-center text-[10px] text-text-dim italic">
                    Semasuk antrian pegawai sudah terproses.
                  </div>
                )}

                {/* Approved Employees & Admins Settings */}
                <div className="space-y-3 mt-6">
                  <h3 className="text-[10px] font-bold text-text-dim uppercase tracking-widest px-1">Daftar Akun Aktif (Owner & Pegawai)</h3>
                  {allUsers
                    .filter(u => u.isApproved)
                    .sort((a, b) => {
                      if (a.role === 'admin' && b.role !== 'admin') return -1;
                      if (a.role !== 'admin' && b.role === 'admin') return 1;
                      return a.name.localeCompare(b.name);
                    })
                    .map(u => (
                    <div key={u.id} className={`glass-card p-2 flex items-center justify-between transition-all ${u.role === 'admin' ? 'border-accent-blue/30 bg-accent-blue/5' : 'border-white/5'}`}>
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[8px] font-bold border uppercase ${u.role === 'admin' ? 'bg-accent-blue/20 border-accent-blue/50 text-accent-blue' : 'bg-white/5 border-white/10'}`}>
                          {u.name[0]}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                             <p className="text-xs font-bold">{u.name}</p>
                             {u.role === 'admin' && <span className="text-[7px] bg-accent-blue text-gray-900 px-1 rounded font-black uppercase tracking-tighter">Owner</span>}
                          </div>
                          <p className="text-[8px] text-accent-blue font-medium uppercase tracking-tighter">
                            {u.role === 'admin' ? 'All Access (Admin)' : (branches.find(b => b.id === u.branchId)?.name || 'Pindah Cabang?')}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {/* Only allow deleting if not current user OR if admin has confirmation */}
                        <button 
                          onClick={() => {
                            if (u.id === auth.currentUser?.uid) {
                              setConfirmModal({
                                show: true,
                                title: "Peringatan Diri Sendiri",
                                message: "Anda tidak bisa menghapus akun Anda sendiri melalui menu ini.",
                                confirmText: "Tutup",
                                onConfirm: () => setConfirmModal(prev => ({ ...prev, show: false }))
                              });
                              return;
                            }
                            handleDeleteUser(u.id);
                          }}
                          className="p-2 text-red-500/60 hover:text-red-500"
                        >
                          <Trash2 size={14} />
                        </button>
                        {u.role !== 'admin' && (
                          <button 
                            onClick={() => {
                              const newBId = prompt("ID Cabang baru (atau biarkan kosong):");
                              if (newBId !== null) updateDoc(doc(db, 'users', u.id), { branchId: newBId });
                            }}
                            className="p-2 text-text-dim hover:text-white"
                          >
                            <Settings size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* HANDOVER HISTORY */}
                <div className="space-y-3 mt-8">
                   <div className="flex items-center justify-between px-1">
                      <h3 className="text-[10px] font-bold text-text-dim uppercase tracking-widest">Riwayat Serah Terima Shift</h3>
                      <History size={14} className="text-accent-blue" />
                   </div>
                   
                   <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1 custom-scrollbar">
                      {handovers.length === 0 ? (
                        <div className="p-8 text-center text-text-dim text-[10px] uppercase font-bold border border-dashed border-white/10 rounded-2xl">
                           Belum ada data serah terima.
                        </div>
                      ) : (
                        handovers
                          .sort((a, b) => (b.timestamp?.toDate() || 0) - (a.timestamp?.toDate() || 0))
                          .map(h => (
                          <div key={h.id} className="glass-card p-3 border-white/5 space-y-3">
                             <div className="flex justify-between items-start">
                                <div>
                                   <div className="flex items-center gap-2">
                                      <p className="text-xs font-black text-white uppercase">{h.employeeName}</p>
                                      <span className={`text-[7px] px-1 rounded uppercase font-black ${h.shift === 'siang' ? 'bg-yellow-500 text-black' : 'bg-purple-500 text-white'}`}>
                                         {h.shift}
                                      </span>
                                   </div>
                                   <p className="text-[8px] text-text-dim font-bold uppercase tracking-tighter">
                                      {h.timestamp?.toDate().toLocaleString('id-ID')} • {branches.find(b => b.id === h.branchId)?.name}
                                   </p>
                                </div>
                                <div className="text-right">
                                   <p className={`text-xs font-black ${h.diff < 0 ? 'text-red-500' : h.diff > 0 ? 'text-green-500' : 'text-accent-blue'}`}>
                                      {h.diff === 0 ? 'Sesuai' : (h.diff > 0 ? '+' : '') + formatRupiah(h.diff)}
                                   </p>
                                   <p className="text-[7px] text-text-dim uppercase font-bold">Selisih Kas</p>
                                </div>
                             </div>

                             <div className="grid grid-cols-2 gap-2 pb-2 border-b border-white/5">
                                <div className="bg-white/5 p-2 rounded-lg">
                                   <p className="text-[7px] text-text-dim uppercase font-bold">Voucher</p>
                                   <p className="text-[10px] font-black">{formatRupiah(h.totalVoucher)}</p>
                                </div>
                                <div className="bg-white/5 p-2 rounded-lg text-right">
                                   <p className="text-[7px] text-text-dim uppercase font-bold">Aksesoris</p>
                                   <p className="text-[10px] font-black text-accent-blue">{formatRupiah(h.totalAksesoris)}</p>
                                </div>
                             </div>

                             <div className="flex justify-between items-center px-1">
                                <div className="text-left">
                                   <p className="text-[7px] text-text-dim uppercase font-bold">Uang Fisik Diterima</p>
                                   <p className="text-xs font-black text-white">{formatRupiah(h.cashReported)}</p>
                                </div>
                                {h.notes && (
                                   <div className="text-right italic text-[8px] text-text-dim max-w-[50%]">
                                      "{h.notes}"
                                   </div>
                                )}
                             </div>
                             
                             <button 
                                onClick={() => {
                                   setConfirmModal({
                                      show: true,
                                      title: "Hapus Log",
                                      message: "Hapus riwayat serah terima ini?",
                                      onConfirm: async () => {
                                         await deleteDoc(doc(db, 'handovers', h.id));
                                         setConfirmModal(prev => ({...prev, show: false}));
                                      }
                                   })
                                }}
                                className="w-full py-1.5 bg-red-500/10 text-red-500 text-[8px] font-black uppercase tracking-widest rounded-lg"
                             >
                                Hapus Riwayat
                             </button>
                          </div>
                        ))
                      )}
                   </div>
                </div>
              </section>
            )}

            <section className="pt-8 text-center space-y-4">
              <button 
                onClick={handleLogout}
                className="w-full py-4 border border-red-500/30 text-red-500 rounded-2xl font-black uppercase tracking-widest text-[10px] bg-red-500/5 hover:bg-red-500/10 transition active:scale-95"
              >
                Keluar dari Sistem
              </button>
              <p className="text-[8px] text-text-dim uppercase tracking-widest">Alpatpulsa System v1.0.4</p>
            </section>
          </div>
        );
      case 'products':
        return (
          <div className="space-y-6 pb-20">
            <div className="flex items-center gap-4">
              {(viewState.provider || viewState.product) && (
                <button onClick={goBack} className="p-2 bg-white/5 rounded-lg border border-white/10 text-text-dim">
                  <ChevronRight size={20} className="rotate-180" />
                </button>
              )}
              <h2 className="text-xl font-semibold text-text-dim">
                {viewState.product ? 'Detail Produk' : (viewState.provider ? (viewState.category === 'aksesoris' ? `Merek ${viewState.provider}` : `Paket ${viewState.provider}`) : 'Katalog Stok')}
              </h2>
              {userData?.role === 'admin' && !viewState.product && (
                <div className="ml-auto flex gap-2">
                  {!viewState.provider && (
                    <button 
                      onClick={cleanupDuplicates} 
                      className="p-2 bg-white/5 border border-white/10 rounded-full text-text-dim hover:text-white transition-all"
                      title="Bersihkan Produk Duplikat"
                    >
                      <Sparkles size={18} />
                    </button>
                  )}
                  <button onClick={() => setShowAddProduct(true)} className="bg-accent-blue text-gray-900 p-2 rounded-full shadow-lg">
                    <Plus size={20} />
                  </button>
                </div>
              )}
            </div>

            {showAddProduct && (
              <div className="glass-card p-4 space-y-5 border-accent-blue/40 animate-in fade-in slide-in-from-top-4">
                <div className="text-center pb-2 border-b border-glass-border">
                  <h3 className="text-sm font-black text-accent-blue tracking-widest uppercase">Form Registrasi Master</h3>
                  <p className="text-[10px] text-text-dim mt-1">Lengkapi data untuk mendaftarkan SKU baru</p>
                </div>
                
                {/* CATEGORY SELECTOR */}
                <div className="flex bg-black/40 p-1 rounded-xl">
                  {['aksesoris', 'voucher', 'perdana'].map(c => (
                    <button 
                      key={c}
                      className={`flex-1 py-3 text-[10px] font-bold uppercase rounded-lg transition-all ${newProduct.category === c ? 'bg-accent-blue text-black shadow-lg shadow-accent-blue/20' : 'text-text-dim hover:text-white'}`}
                      onClick={() => setNewProduct({...newProduct, category: c, name: '', sn: '', qty: 1})}
                    >
                      {c}
                    </button>
                  ))}
                </div>

                <div className="space-y-4">
                  {newProduct.category === 'aksesoris' ? (
                    <>
                      {/* STEP 1: IDENTIFIKASI BASE */}
                      <div className="bg-white/5 rounded-2xl p-4 border border-white/10 space-y-4">
                        <div className="flex items-center gap-2 mb-2">
                           <div className="w-5 h-5 rounded-full bg-accent-blue/20 text-accent-blue flex items-center justify-center text-[10px] font-bold">1</div>
                           <h4 className="text-[11px] font-bold text-white uppercase tracking-wider">Identitas Asal</h4>
                        </div>
                        
                        <div className="space-y-1">
                          <p className="text-[9px] font-bold text-text-dim uppercase tracking-widest ml-1">Merek Aksesoris</p>
                          <select className="w-full bg-gray-900 border border-glass-border p-3 rounded-xl focus:outline-none focus:border-accent-blue/50 text-xs text-white" value={newProduct.provider} onChange={e => setNewProduct({...newProduct, provider: e.target.value})}>
                            {brandsList.map(p => <option key={p} value={p}>{p}</option>)}
                          </select>
                        </div>

                        <div className="space-y-1">
                          <p className="text-[9px] font-bold text-text-dim uppercase tracking-widest ml-1">Model Barang</p>
                           <div className="grid grid-cols-1 gap-2">
                            <select 
                              className="w-full bg-gray-900 border border-glass-border p-3 rounded-xl focus:outline-none focus:border-accent-blue/50 text-xs text-white"
                              value={newProduct.name === '' ? '' : (accessoryTypes.includes(newProduct.name) ? newProduct.name : 'Lainnya')}
                              onChange={e => {
                                const val = e.target.value;
                                setNewProduct({...newProduct, name: val === 'Lainnya' ? '' : val});
                              }}
                            >
                              <option value="">-- Pilih Model --</option>
                              {accessoryTypes.map(t => <option key={t} value={t}>{t}</option>)}
                              <option value="Lainnya">Lainnya (Ketik Manual)</option>
                            </select>
                            {(newProduct.name === '' || (!accessoryTypes.includes(newProduct.name) && newProduct.name !== '')) && (
                              <input 
                                placeholder="Ketik model secara manual..." 
                                className="w-full bg-black/40 border border-accent-blue/30 p-3 rounded-xl focus:outline-none focus:border-accent-blue text-xs text-white" 
                                value={newProduct.name} 
                                onChange={e => setNewProduct({...newProduct, name: e.target.value})} 
                              />
                            )}
                           </div>
                        </div>
                      </div>

                      {/* STEP 2: SPESIFIKASI */}
                      <div className="bg-white/5 rounded-2xl p-4 border border-white/10 space-y-4">
                        <div className="flex items-center gap-2 mb-2">
                           <div className="w-5 h-5 rounded-full bg-accent-blue/20 text-accent-blue flex items-center justify-center text-[10px] font-bold">2</div>
                           <h4 className="text-[11px] font-bold text-white uppercase tracking-wider">Spesifikasi Detail</h4>
                        </div>
                        
                        <div className="space-y-1">
                          <p className="text-[9px] font-bold text-accent-blue uppercase tracking-widest ml-1">Kunci SN / Barcode Produk (Opsional)</p>
                          <div className="flex gap-2">
                            <input 
                              placeholder="Scan / Ketik Barcode Master..." 
                              className="flex-1 bg-black/40 border border-accent-blue/30 p-3 rounded-xl text-xs text-white focus:outline-none focus:border-accent-blue font-mono" 
                              value={newProduct.variant.barcode || ''}
                              onChange={e => setNewProduct({...newProduct, variant: { ...newProduct.variant, barcode: e.target.value }})} 
                            />
                            <button 
                              onClick={() => setShowCameraScanner('stock-initial')}
                              className="bg-accent-blue/20 p-3 rounded-xl text-accent-blue border border-accent-blue/30 hover:bg-accent-blue hover:text-gray-900 transition-colors"
                            >
                              <QrCode size={16} />
                            </button>
                          </div>
                          <p className="text-[8px] text-text-dim italic ml-1">Kunci SN mempermudah identifikasi barang saat stok kosong.</p>
                        </div>

                        <div className="space-y-1">
                          <p className="text-[9px] font-bold text-text-dim uppercase tracking-widest ml-1">Type / Varian</p>
                          <input 
                            placeholder="Contoh: Type-C 3A, RT-100"
                            className="w-full bg-transparent border-b-2 border-glass-border p-2 text-sm font-bold text-white focus:outline-none focus:border-accent-blue transition-colors" 
                            value={newProduct.variant.description} 
                            onChange={e => setNewProduct({...newProduct, variant: { ...newProduct.variant, description: e.target.value }})} 
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-4 pt-2">
                          <div className="space-y-1">
                            <p className="text-[9px] font-bold text-text-dim uppercase tracking-widest ml-1">Harga Beli</p>
                            <input 
                              type="number" inputMode="numeric" placeholder="0" 
                              className="w-full bg-black/40 border border-glass-border p-3 rounded-xl text-xs text-white focus:outline-none focus:border-accent-blue" 
                              value={newProduct.variant.modalPrice === 0 ? '' : newProduct.variant.modalPrice}
                              onChange={e => {
                                const val = e.target.value === '' ? 0 : Number(e.target.value);
                                if (!isNaN(val)) setNewProduct({...newProduct, variant: { ...newProduct.variant, modalPrice: val }});
                              }} 
                            />
                            <p className="text-[9px] text-accent-blue font-bold mt-1 px-1">{formatRupiah(newProduct.variant.modalPrice || 0)}</p>
                          </div>
                          <div className="space-y-1">
                            <p className="text-[9px] font-bold text-text-dim uppercase tracking-widest ml-1">Harga Jual</p>
                            <input 
                              type="number" inputMode="numeric" placeholder="0" 
                              className="w-full bg-black/40 border border-glass-border p-3 rounded-xl text-xs text-green-400 font-bold focus:outline-none focus:border-green-500" 
                              value={newProduct.variant.sellingPrice === 0 ? '' : newProduct.variant.sellingPrice}
                              onChange={e => {
                                const val = e.target.value === '' ? 0 : Number(e.target.value);
                                if (!isNaN(val)) setNewProduct({...newProduct, variant: { ...newProduct.variant, sellingPrice: val }});
                              }} 
                            />
                            <p className="text-[9px] text-green-400 font-bold mt-1 px-1">{formatRupiah(newProduct.variant.sellingPrice || 0)}</p>
                          </div>
                          <div className="space-y-1">
                            <p className="text-[9px] font-bold text-text-dim uppercase tracking-widest ml-1">Limit Stok (Alert)</p>
                            <input 
                              type="number" inputMode="numeric" placeholder="5" 
                              className="w-full bg-black/40 border border-glass-border p-3 rounded-xl text-xs text-red-400 font-bold focus:outline-none focus:border-red-500" 
                              value={newProduct.variant.minStock}
                              onChange={e => {
                                const val = e.target.value === '' ? 0 : Number(e.target.value);
                                if (!isNaN(val)) setNewProduct({...newProduct, variant: { ...newProduct.variant, minStock: val }});
                              }} 
                            />
                            <p className="text-[8px] text-text-dim mt-1 px-1">Peringatan jika sisa stok sedikit</p>
                          </div>
                        </div>
                      </div>

                      {/* STEP 3: STOK AWAL */}
                      <div className="bg-accent-blue/5 rounded-2xl p-4 border border-accent-blue/30 space-y-4">
                        <div className="flex items-center gap-2 mb-2">
                           <div className="w-5 h-5 rounded-full bg-accent-blue text-gray-900 flex items-center justify-center text-[10px] font-bold">3</div>
                           <h4 className="text-[11px] font-bold text-accent-blue uppercase tracking-wider">Registrasi Stok Barcode</h4>
                        </div>

                        <div className="grid grid-cols-5 gap-3">
                            <div className="space-y-1 col-span-3">
                              <p className="text-[9px] font-bold text-text-dim uppercase tracking-widest ml-1">Barcode Scanner</p>
                              <div className="flex gap-2">
                                  <input 
                                  placeholder="Scan SN..." 
                                  className="w-full bg-black/50 border border-accent-blue/30 p-3 rounded-xl text-xs font-mono text-white focus:outline-none focus:border-accent-blue" 
                                  value={newProduct.sn} 
                                  onChange={e => setNewProduct({...newProduct, sn: e.target.value})} 
                                  />
                                  <button onClick={() => setShowCameraScanner('stock-initial')} className="aspect-square bg-accent-blue/20 rounded-xl text-accent-blue border border-accent-blue/30 flex items-center justify-center p-3 hover:bg-accent-blue hover:text-black transition-colors">
                                      <Camera size={16} />
                                  </button>
                              </div>
                            </div>
                            <div className="space-y-1 col-span-2">
                              <p className="text-[9px] font-bold text-text-dim uppercase tracking-widest ml-1">Jml Pcs (Stok)</p>
                              <input 
                                type="number" inputMode="numeric" min="1"
                                className="w-full bg-black/50 border border-accent-blue/30 p-3 rounded-xl text-xs text-white focus:outline-none focus:border-accent-blue text-center font-bold" 
                                value={newProduct.qty} 
                                onChange={e => setNewProduct({...newProduct, qty: Number(e.target.value)})} 
                              />
                            </div>
                        </div>
                        <p className="text-[9px] text-text-dim italic leading-relaxed bg-black/20 p-2 rounded-lg">*Sistem akan merekam 1 Barcode ini dengan kuantitas yang Anda tetapkan.</p>
                      </div>
                    </>
                  ) : (
                    // VOUCHER / PERDANA FORM
                    <>
                      {/* STEP 1: IDENTIFIKASI BASE */}
                      <div className="bg-white/5 rounded-2xl p-4 border border-white/10 space-y-4">
                        <div className="flex items-center gap-2 mb-2">
                           <div className="w-5 h-5 rounded-full bg-accent-blue/20 text-accent-blue flex items-center justify-center text-[10px] font-bold">1</div>
                           <h4 className="text-[11px] font-bold text-white uppercase tracking-wider">Identitas Jaringan</h4>
                        </div>

                        <div className="space-y-1">
                          <p className="text-[9px] font-bold text-text-dim uppercase tracking-widest ml-1">Provider</p>
                          <select className="w-full bg-gray-900 border border-glass-border p-3 rounded-xl focus:outline-none focus:border-accent-blue/50 text-xs text-white" value={newProduct.provider} onChange={e => setNewProduct({...newProduct, provider: e.target.value})}>
                            {providersList.map(p => <option key={p} value={p}>{p}</option>)}
                          </select>
                        </div>

                        <div className="space-y-1">
                          <p className="text-[9px] font-bold text-text-dim uppercase tracking-widest ml-1">Jenis {newProduct.category === 'voucher' ? 'Voucher' : 'Perdana'}</p>
                           <div className="grid grid-cols-1 gap-2">
                            <select 
                              className="w-full bg-gray-900 border border-glass-border p-3 rounded-xl focus:outline-none focus:border-accent-blue/50 text-xs text-white"
                              value={newProduct.name === '' ? '' : ( 
                                (newProduct.category === 'voucher' && voucherTypes.includes(newProduct.name)) ||
                                (newProduct.category === 'perdana' && perdanaTypes.includes(newProduct.name)) ? newProduct.name : 'Lainnya' 
                              )}
                              onChange={e => {
                                const val = e.target.value;
                                setNewProduct({...newProduct, name: val === 'Lainnya' ? '' : val});
                              }}
                            >
                              <option value="">-- Pilih Jenis --</option>
                              {newProduct.category === 'voucher' && voucherTypes.map(t => <option key={t} value={t}>{t}</option>)}
                              {newProduct.category === 'perdana' && perdanaTypes.map(t => <option key={t} value={t}>{t}</option>)}
                              <option value="Lainnya">Lainnya (Ketik Sengdiri)</option>
                            </select>
                            {(newProduct.name === '' || (
                              newProduct.category === 'voucher' && !voucherTypes.includes(newProduct.name) && newProduct.name !== ''
                            ) || (
                              newProduct.category === 'perdana' && !perdanaTypes.includes(newProduct.name) && newProduct.name !== ''
                            )) && (
                              <input 
                                placeholder="Ketik jenis manual..." 
                                className="w-full bg-black/40 border border-accent-blue/30 p-3 rounded-xl focus:outline-none focus:border-accent-blue text-xs text-white" 
                                value={newProduct.name} 
                                onChange={e => setNewProduct({...newProduct, name: e.target.value})} 
                              />
                            )}
                           </div>
                        </div>
                      </div>

                      {/* STEP 2: SPESIFIKASI */}
                      <div className="bg-white/5 rounded-2xl p-4 border border-white/10 space-y-4">
                        <div className="flex items-center gap-2 mb-2">
                           <div className="w-5 h-5 rounded-full bg-accent-blue/20 text-accent-blue flex items-center justify-center text-[10px] font-bold">2</div>
                           <h4 className="text-[11px] font-bold text-white uppercase tracking-wider">Kuota & Harga</h4>
                        </div>
                        
                        <div className="space-y-1">
                          <p className="text-[9px] font-bold text-text-dim uppercase tracking-widest ml-1">Isi Kuota / Rincian</p>
                          <input 
                            placeholder="Contoh: 5GB 30 Hari Full"
                            className="w-full bg-transparent border-b-2 border-glass-border p-2 text-sm font-bold text-white focus:outline-none focus:border-accent-blue transition-colors" 
                            value={newProduct.variant.description} 
                            onChange={e => setNewProduct({...newProduct, variant: { ...newProduct.variant, description: e.target.value }})} 
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-4 pt-2">
                          <div className="space-y-1">
                            <p className="text-[9px] font-bold text-text-dim uppercase tracking-widest ml-1">Harga Modal</p>
                            <input 
                              type="number" inputMode="numeric" placeholder="0" 
                              className="w-full bg-black/40 border border-glass-border p-3 rounded-xl text-xs text-white focus:outline-none focus:border-accent-blue" 
                              value={newProduct.variant.modalPrice === 0 ? '' : newProduct.variant.modalPrice}
                              onChange={e => {
                                const val = e.target.value === '' ? 0 : Number(e.target.value);
                                if (!isNaN(val)) setNewProduct({...newProduct, variant: { ...newProduct.variant, modalPrice: val }});
                              }} 
                            />
                            <p className="text-[9px] text-accent-blue font-bold mt-1 px-1">{formatRupiah(newProduct.variant.modalPrice || 0)}</p>
                          </div>
                          <div className="space-y-1">
                            <p className="text-[9px] font-bold text-text-dim uppercase tracking-widest ml-1">Harga Jual</p>
                            <input 
                              type="number" inputMode="numeric" placeholder="0" 
                              className="w-full bg-black/40 border border-glass-border p-3 rounded-xl text-xs text-green-400 font-bold focus:outline-none focus:border-green-500" 
                              value={newProduct.variant.sellingPrice === 0 ? '' : newProduct.variant.sellingPrice}
                              onChange={e => {
                                const val = e.target.value === '' ? 0 : Number(e.target.value);
                                if (!isNaN(val)) setNewProduct({...newProduct, variant: { ...newProduct.variant, sellingPrice: val }});
                              }} 
                            />
                            <p className="text-[9px] text-green-400 font-bold mt-1 px-1">{formatRupiah(newProduct.variant.sellingPrice || 0)}</p>
                          </div>
                          <div className="space-y-1">
                            <p className="text-[9px] font-bold text-text-dim uppercase tracking-widest ml-1">Limit Stok (Alert)</p>
                            <input 
                              type="number" inputMode="numeric" placeholder="5" 
                              className="w-full bg-black/40 border border-glass-border p-3 rounded-xl text-xs text-red-400 font-bold focus:outline-none focus:border-red-500" 
                              value={newProduct.variant.minStock}
                              onChange={e => {
                                const val = e.target.value === '' ? 0 : Number(e.target.value);
                                if (!isNaN(val)) setNewProduct({...newProduct, variant: { ...newProduct.variant, minStock: val }});
                              }} 
                            />
                            <p className="text-[8px] text-text-dim mt-1 px-1">Peringatan jika sisa stok sedikit</p>
                          </div>
                        </div>
                      </div>

                      {/* STEP 3: STOK AWAL */}
                      <div className="bg-accent-blue/5 rounded-2xl p-4 border border-accent-blue/30 space-y-4">
                        <div className="flex items-center gap-2 mb-2">
                           <div className="w-5 h-5 rounded-full bg-accent-blue text-gray-900 flex items-center justify-center text-[10px] font-bold">3</div>
                           <h4 className="text-[11px] font-bold text-accent-blue uppercase tracking-wider">Scan SN Fisik Pertama (Opsional)</h4>
                        </div>

                        <div className="space-y-1">
                          <p className="text-[9px] font-bold text-text-dim uppercase tracking-widest ml-1">Unik Serial Number</p>
                          <div className="flex gap-2">
                              <input 
                              placeholder="Scan 1 fisik voucher/perdana" 
                              className="w-full bg-black/50 border border-accent-blue/30 p-3 rounded-xl text-xs font-mono text-white focus:outline-none focus:border-accent-blue" 
                              value={newProduct.sn} 
                              onChange={e => setNewProduct({...newProduct, sn: e.target.value, qty: 1})} 
                              />
                              <button onClick={() => setShowCameraScanner('stock-initial')} className="aspect-square bg-accent-blue/20 rounded-xl text-accent-blue border border-accent-blue/30 flex items-center justify-center p-3 hover:bg-accent-blue hover:text-black transition-colors">
                                  <Camera size={16} />
                              </button>
                          </div>
                        </div>
                        <div className="bg-black/20 p-2 rounded-lg px-3">
                           <p className="text-[8px] text-text-dim italic leading-relaxed mb-1">Hanya melayani scan otomatis 1 SN pada tahap ini agar aman ke database.</p>
                           <p className="text-[8px] text-text-dim italic leading-relaxed">Punya Tumpukan Ratusan SN Fisik? <b>Simpan data ini dulu, lalu menuju 'Katalog Stok' & Scan masal disana!</b></p>
                        </div>
                      </div>
                    </>
                  )}
                </div>

                <div className="flex gap-3 pt-6 border-t border-glass-border">
                  <button onClick={() => setShowAddProduct(false)} className="px-6 py-4 bg-white/5 border border-glass-border rounded-xl font-bold uppercase tracking-widest text-[10px] hover:bg-white/10 transition-colors">Batal</button>
                  <button onClick={handleSaveProduct} className="flex-1 bg-accent-blue text-gray-900 py-4 rounded-xl font-black uppercase tracking-widest text-[10px] shadow-lg shadow-accent-blue/20 hover:bg-white transition-colors">Simpan Data SKU</button>
                </div>
              </div>
            )}

            {/* View Layer 1: Categories */}
            {!viewState.provider && !viewState.product && (
              <div className="space-y-4">
                <div className="flex gap-2 overflow-x-auto pb-4 scrollbar-hide">
                  {['voucher', 'perdana', 'aksesoris'].map(cat => (
                    <button 
                      key={cat} 
                      onClick={() => setViewState({ ...viewState, category: cat })}
                      className={`px-6 py-3 rounded-2xl text-xs font-bold uppercase tracking-widest transition-all ${viewState.category === cat ? 'bg-accent-blue text-gray-900' : 'bg-white/5 border border-glass-border text-text-dim'}`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
                      <div className="space-y-3">
                        <h3 className="text-[10px] font-bold text-text-dim uppercase tracking-[0.2em] px-1">
                          {viewState.category === 'aksesoris' ? 'Pilih Merek' : 'Pilih Provider'}
                        </h3>
                        {availableProviders.map((p: string, pIdx: number) => {
                          const colors = getProviderColor(p);
                          return (
                            <button 
                              key={`${p}-${pIdx}`} 
                              onClick={() => setViewState({ ...viewState, provider: p })}
                              className={`glass-card p-4 flex justify-between items-center group active:scale-[0.98] transition border ${colors.split(' ').slice(2).join(' ')}`}
                            >
                        <div className="flex items-center gap-4">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${colors.split(' ').slice(0, 2).join(' ')} group-hover:bg-white/20`}>
                            <Package size={20} />
                          </div>
                          <span className="font-bold tracking-tight uppercase">{p}</span>
                        </div>
                        <ChevronRight size={16} className="text-text-dim group-hover:text-white transition" />
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* View Layer 2: Variant List per Provider */}
            {viewState.provider && !viewState.product && (
              <div className="space-y-4">
                <div className="relative">
                  <input 
                    placeholder={`Cari paket ${viewState.provider}...`} 
                    className="w-full bg-white/5 border border-glass-border p-4 pl-12 rounded-2xl text-sm focus:outline-none focus:border-accent-blue transition"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                  />
                  <Package className="absolute left-4 top-4.5 text-text-dim" size={18} />
                </div>
                <div className="space-y-4">
                  {filteredProductsByProvider.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase())).map(p => (
                    <div key={p.id} className="glass-card overflow-hidden border-white/5 hover:border-accent-blue/20 transition-all p-3 space-y-3">
                        <div className="flex justify-between items-center mb-1">
                          <div className="flex items-center gap-2">
                             <div className="w-1.5 h-6 bg-accent-blue rounded-full"></div>
                             <h3 className="text-sm font-black uppercase tracking-tight">{p.name}</h3>
                          </div>
                          <div className="flex items-center gap-1">
                            {userData?.role === 'admin' && (
                              <button 
                                onClick={(e) => { e.stopPropagation(); handleDeleteProduct(p.id); }}
                                className="p-2 text-red-500/60 hover:text-red-500 transition-colors"
                              >
                                <Trash2 size={16} />
                              </button>
                            )}
                          </div>
                        </div>
                      
                      <div className="grid grid-cols-1 gap-2">
                        {p.variants && Array.isArray(p.variants) && p.variants.map((v: any, vIdx: number) => {
                          const invKey = `${p.id}_${v.id || vIdx}`;
                          const currentInv = branchInventory[invKey] || { stock: 0 };
                          return (
                            <button 
                             key={v.id || `v-${vIdx}`} 
                             onClick={() => setViewState({ ...viewState, product: p, variant: v })}
                             className="w-full bg-white/5 p-3 rounded-xl text-left border border-white/5 hover:border-accent-blue/30 transition-all"
                            >
                             <div className="flex justify-between items-start">
                                <div className="flex-1">
                                   <span className="text-[11px] font-bold text-text-main line-clamp-1">{v.description || v.name}</span>
                                </div>
                                <div className="flex items-center gap-2 ml-2">
                                   {userData?.role === 'admin' && (
                                     <div 
                                       onClick={(e) => { e.stopPropagation(); handleDeleteVariant(p.id, v.id || v.name); }} 
                                       className="p-1.5 hover:bg-red-500/10 rounded-lg group/del transition-colors cursor-pointer"
                                     >
                                       <Trash2 size={12} className="text-red-500/30 group-hover/del:text-red-500" />
                                     </div>
                                   )}
                                   <div className="text-right shrink-0">
                                      <span className="text-[10px] text-accent-blue font-black block">Rp {v.sellingPrice?.toLocaleString()}</span>
                                      <span className={`text-[8px] font-bold uppercase tracking-tighter ${currentInv.stock > 0 ? 'text-green-500' : 'text-red-500'}`}>
                                        {currentInv.stock > 0 ? `Stok: ${currentInv.stock}` : 'Kosong'}
                                      </span>
                                   </div>
                                </div>
                             </div>
                            </button>
                         );
                       })}
                      </div>
                      {userData?.role === 'admin' && (
                        <button 
                          onClick={() => {
                            setNewProduct({
                              ...newProduct,
                              targetProductId: p.id,
                              name: p.name,
                              provider: p.provider,
                              category: p.category,
                              variant: { ...newProduct.variant, id: Math.random().toString(36).substr(2, 9) }
                            });
                            setShowAddProduct(true);
                          }}
                          className="w-full py-2 border border-dashed border-accent-blue/30 rounded-xl text-[9px] font-bold uppercase text-accent-blue hover:bg-accent-blue/5 transition"
                        >
                          + Tambah Tipe / Model Baru
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* View Layer 3: Detail & SN Management (Bottom Style) */}
            {viewState.product && viewState.variant && (
              <div className="fixed inset-0 z-[60] flex items-end">
                <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setViewState({ ...viewState, product: null, variant: null })}></div>
                <div className="relative w-full glass-card rounded-t-[40px] p-6 border-t border-white/10 animate-in slide-in-from-bottom duration-500 max-h-[85vh] overflow-y-auto">
                  <div className="w-12 h-1 bg-white/20 rounded-full mx-auto mb-6"></div>
                  
                  <div className="space-y-6">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center gap-3">
                          <h4 className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded border ${getProviderColor(viewState.provider)}`}>
                            {viewState.provider}
                          </h4>
                          <span className="text-[10px] text-text-dim uppercase tracking-widest">{viewState.product.category}</span>
                        </div>

                        {isEditingVariantName ? (
                          <div className="mt-2 flex gap-2">
                             <input 
                               type="text"
                               className="flex-1 bg-black/40 border border-white/10 p-2 rounded-lg text-lg font-bold text-white focus:outline-none focus:border-accent-blue"
                               value={editVariantName}
                               onChange={e => setEditVariantName(e.target.value)}
                               autoFocus
                             />
                             <button 
                               onClick={handleUpdateVariantName}
                               className="p-2 bg-accent-blue text-gray-900 rounded-lg hover:bg-accent-blue/80 transition"
                             >
                                <Plus size={18} />
                             </button>
                             <button 
                               onClick={() => setIsEditingVariantName(false)}
                               className="p-2 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 transition"
                             >
                                <X size={18} />
                             </button>
                          </div>
                        ) : (
                          <div className="group flex items-center gap-2 mt-2">
                            <h3 className="text-xl font-bold">{viewState.variant.name}</h3>
                            {userData?.role === 'admin' && (
                              <button 
                                onClick={() => {
                                  setEditVariantName(viewState.variant.name);
                                  setIsEditingVariantName(true);
                                }}
                                className="p-1.5 bg-accent-blue/10 text-accent-blue rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <Pencil size={12} />
                              </button>
                            )}
                          </div>
                        )}

                        {viewState.variant.description && (
                           <p className={`mt-1 font-bold ${viewState.product.category === 'aksesoris' ? 'text-accent-blue text-[10px] bg-accent-blue/5 px-2 py-1 rounded-lg inline-block border border-accent-blue/10' : 'text-text-dim text-xs italic'}`}>
                             {viewState.variant.description}
                           </p>
                        )}
                        
                        <div className="flex items-center gap-2 mt-1">
                          <p className="text-[9px] text-text-dim font-bold uppercase tracking-tighter">Grup: <span className="text-white/60">{viewState.product.name}</span></p>
                          {userData?.role === 'admin' && !isEditingProductName && (
                            <button 
                              onClick={() => {
                                setEditProductName(viewState.product.name);
                                setIsEditingProductName(true);
                              }}
                              className="p-1 text-accent-blue hover:bg-accent-blue/10 rounded transition"
                            >
                              <Pencil size={8} />
                            </button>
                          )}
                        </div>

                        {isEditingProductName && (
                          <div className="mt-2 flex gap-2">
                             <input 
                               type="text"
                               className="flex-1 bg-black/40 border border-white/10 p-1.5 rounded-lg text-xs font-bold text-white focus:outline-none focus:border-accent-blue"
                               value={editProductName}
                               onChange={e => setEditProductName(e.target.value)}
                               autoFocus
                             />
                             <button 
                               onClick={handleUpdateProductName}
                               className="p-1.5 bg-accent-blue text-gray-900 rounded-lg hover:bg-accent-blue/80 transition"
                             >
                                <Plus size={14} />
                             </button>
                             <button 
                               onClick={() => setIsEditingProductName(false)}
                               className="p-1.5 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 transition"
                             >
                                <X size={14} />
                             </button>
                          </div>
                        )}
                      </div>
                      <div className="flex gap-2">
                        {userData?.role === 'admin' && (
                          <div className="flex flex-col gap-2">
                            <button 
                              onClick={() => handleDeleteVariant(viewState.product.id, viewState.variant.id)}
                              title="Hapus Tipe/Model Ini"
                              className="bg-red-500/10 text-red-500 p-2 rounded-xl border border-red-500/20 hover:bg-red-500 hover:text-white transition flex items-center gap-2 group"
                            >
                              <History size={14} />
                              <span className="text-[8px] font-black uppercase hidden group-hover:block">Hapus Tipe</span>
                            </button>
                            <button 
                              onClick={() => handleDeleteProduct(viewState.product.id)}
                              title="Hapus Seluruh Grup Produk"
                              className="bg-red-600/20 text-red-500 p-2 rounded-xl border border-red-600/30 hover:bg-red-600 hover:text-white transition flex items-center gap-2 group"
                            >
                              <Trash2 size={14} />
                              <span className="text-[8px] font-black uppercase hidden group-hover:block">Hapus Produk</span>
                            </button>
                          </div>
                        )}
                        <div className="bg-accent-blue/10 p-3 rounded-2xl border border-accent-blue/20 h-fit">
                          <Package size={24} className="text-accent-blue" />
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-2">
                        {/* Price Details - Filtered by role - Updated to hide modal from employee again */}
                        {(userData?.role === 'admin' || userData?.role === 'audit') && (
                          <div className={`p-4 bg-white/5 rounded-2xl border border-white/5 group relative hover:border-accent-blue/30 transition-all cursor-pointer ${isEditingPrice ? 'hidden' : 'block'}`} onClick={() => {
                              if (userData?.role === 'admin') {
                                setEditPrice({
                                  productName: viewState.product.name,
                                  variantName: viewState.variant.name,
                                  modalPrice: viewState.variant.modalPrice || 0,
                                  sellingPrice: viewState.variant.sellingPrice || 0,
                                  minStock: viewState.variant.minStock || 5,
                                  barcode: viewState.variant.barcode || ''
                                });
                                setIsEditingPrice(true);
                              }
                            }}>
                            <p className="text-[8px] text-text-dim uppercase tracking-widest">Harga Modal</p>
                            <div className="flex justify-between items-end">
                              <p className="text-lg font-bold">{formatRupiah(viewState.variant.modalPrice || 0)}</p>
                              {userData?.role === 'admin' && (
                                <div className="p-1.5 bg-accent-blue/10 text-accent-blue rounded-lg">
                                  <Pencil size={12} />
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                       
                       <div className={`p-4 bg-white/5 rounded-2xl border border-white/5 group relative hover:border-green-500/30 transition-all cursor-pointer flex-1 ${isEditingPrice ? 'hidden' : 'block'}`} onClick={() => {
                           if (userData?.role === 'admin') {
                             setEditPrice({
                               productName: viewState.product.name,
                               variantName: viewState.variant.name,
                               modalPrice: viewState.variant.modalPrice || 0,
                               sellingPrice: viewState.variant.sellingPrice || 0,
                               minStock: viewState.variant.minStock || 5,
                               barcode: viewState.variant.barcode || ''
                             });
                             setIsEditingPrice(true);
                           }
                         }}>
                         <p className="text-[8px] text-text-dim uppercase tracking-widest">Harga Jual</p>
                         <div className="flex justify-between items-end">
                            <p className="text-lg font-bold text-green-400">{formatRupiah(viewState.variant.sellingPrice || 0)}</p>
                            {userData?.role === 'admin' && (
                              <div className="p-1.5 bg-green-500/10 text-green-500 rounded-lg">
                                <Pencil size={12} />
                              </div>
                            )}
                         </div>
                       </div>
                    </div>
                        <div className="p-4 bg-white/5 rounded-2xl border border-white/5 col-span-2">
                          <p className="text-[8px] text-text-dim uppercase tracking-widest">Stok Saat Ini (Cabang Terpilih)</p>
                          <p className="text-lg font-bold">{branchInventory[`${viewState.product.id}_${viewState.variant.id}`]?.stock || 0}</p>
                        </div>

                      <div className="space-y-4">
                      {userData?.role === 'audit' && (
                        <div className="flex justify-between items-center">
                          <h5 className="text-xs font-bold uppercase tracking-widest flex items-center gap-2">
                            <Hash size={14} className="text-accent-blue" />
                            {viewState.product.category === 'aksesoris' ? 'Daftar SN / Unit' : 'Daftar SN Terdaftar'}
                          </h5>
                          <div className="flex gap-2">
                            <div className={`flex rounded-xl p-1 bg-white/5 border border-white/10 ${showBatchSN || showRangeSN ? 'bg-accent-blue/5' : ''}`}>
                              <button 
                                onClick={() => { setShowBatchSN(false); setShowRangeSN(false); }}
                                className={`text-[9px] px-3 py-2 rounded-lg font-bold uppercase tracking-wider transition-all ${!showBatchSN && !showRangeSN ? 'bg-accent-blue text-gray-900 shadow-lg' : 'text-text-dim'}`}
                              >
                                Single
                              </button>
                              {viewState.product.category === 'aksesoris' ? (
                                <button 
                                  onClick={() => { setShowBatchSN(true); setShowRangeSN(false); }}
                                  className={`text-[9px] px-3 py-2 rounded-lg font-bold uppercase tracking-wider transition-all ${showBatchSN ? 'bg-accent-blue text-gray-900 shadow-lg' : 'text-text-dim'}`}
                                >
                                  Batch
                                </button>
                              ) : (
                                <button 
                                  onClick={() => { setShowRangeSN(true); setShowBatchSN(false); }}
                                  className={`text-[9px] px-3 py-2 rounded-lg font-bold uppercase tracking-wider transition-all ${showRangeSN ? 'bg-accent-blue text-gray-900 shadow-lg' : 'text-text-dim'}`}
                                >
                                  Range/Masal
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      )}

                      {userData?.role === 'audit' && !showBatchSN && !showRangeSN && (
                        <div className="p-4 bg-white/5 rounded-2xl border border-accent-blue/30 space-y-3 animate-in fade-in slide-in-from-top-2">
                          <div className="flex justify-between items-center px-1">
                            <p className="text-[10px] font-bold text-accent-blue uppercase tracking-widest">Scan / Input SN Unik</p>
                            <span className="text-[8px] text-text-dim italic">Gunakan Scanner Bluetooth (Keyboard Mode)</span>
                          </div>
                          <div className="flex gap-2">
                             <input 
                              placeholder="Fokus di sini & scan QR..."
                              className="flex-1 bg-black/40 border border-white/10 p-3 rounded-xl text-xs font-mono focus:outline-none focus:border-accent-blue/50"
                              value={singleSNInput}
                              onChange={e => setSingleSNInput(e.target.value)}
                              onKeyDown={async (e) => {
                                if (e.key === 'Enter' && singleSNInput.trim()) {
                                  if (!selectedBranch) return;
                                  const sn = singleSNInput.trim();
                                  const itemRef = doc(db, `branches/${selectedBranch}/inventory`, `${viewState.product.id}_${viewState.variant.id}`);
                                  const currentData = branchInventory[`${viewState.product.id}_${viewState.variant.id}`] || { sns: [] };
                                  
                                  if (!currentData.sns.includes(sn)) {
                                    await setDoc(itemRef, {
                                      productId: viewState.product.id,
                                      variantId: viewState.variant.id,
                                      sns: [...currentData.sns, sn],
                                      stock: (currentData.stock || 0) + 1,
                                      lastUpdated: serverTimestamp()
                                    });
                                  }
                                  setSingleSNInput('');
                                }
                              }}
                            />
                            <button 
                              onClick={() => setShowCameraScanner('stock')}
                              className="p-3 bg-accent-blue/10 text-accent-blue rounded-xl border border-accent-blue/30"
                            >
                              <Camera size={18} />
                            </button>
                            <button 
                              onClick={async () => {
                                if (!singleSNInput.trim() || !selectedBranch) return;
                                const sn = singleSNInput.trim();
                                const itemRef = doc(db, `branches/${selectedBranch}/inventory`, `${viewState.product.id}_${viewState.variant.id}`);
                                const currentData = branchInventory[`${viewState.product.id}_${viewState.variant.id}`] || { sns: [] };
                                if (currentData.sns.includes(sn)) return;
                                await setDoc(itemRef, {
                                  productId: viewState.product.id,
                                  variantId: viewState.variant.id,
                                  sns: [...currentData.sns, sn],
                                  stock: (currentData.stock || 0) + 1,
                                  lastUpdated: serverTimestamp()
                                });
                                setSingleSNInput('');
                                const dispName = viewState.product.category === 'aksesoris' ? `${viewState.product.provider} ${viewState.variant.name} ${viewState.product.name}` : `${viewState.product.name} - ${viewState.variant.name}`;
                                setPosStatus({ message: `📦 Stok Masuk: ${dispName} (SN: ${sn})`, type: 'success' });
                                setTimeout(() => setPosStatus({ message: '', type: 'info' }), 3000);
                              }}
                              className="px-4 bg-accent-blue text-gray-900 rounded-xl font-bold text-xs"
                            >
                              Add
                            </button>
                          </div>
                        </div>
                      )}

                      {showRangeSN && (
                        <div className="p-4 bg-white/5 rounded-2xl border border-accent-blue/30 space-y-4 animate-in fade-in slide-in-from-top-2">
                          <div className="flex justify-between items-center">
                             <p className="text-[10px] font-bold text-accent-blue uppercase tracking-widest">Input SN Masal (Berurutan)</p>
                          </div>
                          
                          <div className="grid grid-cols-2 gap-3">
                             <div className="space-y-1">
                               <p className="text-[9px] font-bold text-text-dim uppercase tracking-widest ml-1">SN Awal</p>
                               <input 
                                 placeholder="Contoh: ...9270"
                                 className="w-full bg-black/40 border border-white/10 p-3 rounded-xl text-xs font-mono focus:outline-none focus:border-accent-blue/50"
                                 value={rangeSNConfig.start}
                                 onChange={e => setRangeSNConfig({...rangeSNConfig, start: e.target.value})}
                               />
                             </div>
                             <div className="space-y-1">
                               <p className="text-[9px] font-bold text-text-dim uppercase tracking-widest ml-1">SN Akhir</p>
                               <input 
                                 placeholder="Contoh: ...9280"
                                 className="w-full bg-black/40 border border-white/10 p-3 rounded-xl text-xs font-mono focus:outline-none focus:border-accent-blue/50"
                                 value={rangeSNConfig.end}
                                 onChange={e => setRangeSNConfig({...rangeSNConfig, end: e.target.value})}
                               />
                             </div>
                          </div>

                          {rangeSNConfig.start && rangeSNConfig.end && (() => {
                            const startMatch = rangeSNConfig.start.match(/^(.*?)(\d+)$/);
                            const endMatch = rangeSNConfig.end.match(/^(.*?)(\d+)$/);
                            if (startMatch && endMatch && startMatch[1] === endMatch[1]) {
                              const s = BigInt(startMatch[2]);
                              const e = BigInt(endMatch[2]);
                              const diff = e - s;
                              if (diff >= 0n && diff < 500n) {
                                const count = Number(diff) + 1;
                                return (
                                  <div className="p-3 bg-accent-blue/10 border border-accent-blue/20 rounded-xl space-y-2">
                                    <div className="flex justify-between items-center">
                                      <p className="text-[10px] font-bold text-accent-blue uppercase">📋 Preview SN ({count} Pcs)</p>
                                      <span className="text-[10px] text-green-400 font-bold">Valid Sequence</span>
                                    </div>
                                    <div className="text-[9px] text-text-dim font-mono line-clamp-2 italic bg-black/20 p-2 rounded">
                                      {rangeSNConfig.start}, ..., {rangeSNConfig.end}
                                    </div>
                                    <button 
                                      onClick={async () => {
                                        if (!selectedBranch) return;
                                        const sns = [];
                                        const padding = startMatch[2].length;
                                        for (let i = s; i <= e; i++) {
                                          sns.push(startMatch[1] + i.toString().padStart(padding, '0'));
                                        }

                                        const itemRef = doc(db, `branches/${selectedBranch}/inventory`, `${viewState.product.id}_${viewState.variant.id}`);
                                        const currentData = branchInventory[`${viewState.product.id}_${viewState.variant.id}`] || { sns: [] };
                                        
                                        // Skip duplicates
                                        const uniqueNewSns = sns.filter(sn => !currentData.sns.includes(sn));
                                        if (uniqueNewSns.length === 0) {
                                          setPosStatus({ message: "Semua SN dalam jangkauan sudah terdaftar!", type: 'error' });
                                          return;
                                        }

                                        const finalSns = [...currentData.sns, ...uniqueNewSns];
                                        await setDoc(itemRef, {
                                          productId: viewState.product.id,
                                          variantId: viewState.variant.id,
                                          sns: finalSns,
                                          stock: finalSns.length,
                                          lastUpdated: serverTimestamp()
                                        });

                                        setRangeSNConfig({ start: '', end: '' });
                                        setShowRangeSN(false);
                                        const dispName = viewState.product.category === 'aksesoris' ? `${viewState.product.provider} ${viewState.variant.name} ${viewState.product.name}` : `${viewState.product.name} - ${viewState.variant.name}`;
                                        setPosStatus({ message: `✅ Berhasil Input ${uniqueNewSns.length} SN Berurutan: ${dispName}`, type: 'success' });
                                        setTimeout(() => setPosStatus({ message: '', type: 'info' }), 4000);
                                      }}
                                      className="w-full py-3 bg-accent-blue text-gray-900 rounded-xl font-bold text-[10px] uppercase tracking-widest shadow-lg shadow-accent-blue/20 hover:bg-white active:scale-95 transition"
                                    >
                                      Konfirmasi & Simpan {count} Pcs
                                    </button>
                                  </div>
                                );
                              }
                            }
                            return (
                              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
                                <p className="text-[9px] text-red-400 font-bold italic text-center">Format SN tidak valid atau terlalu besar (max 500 pcs). Pastikan awalan SN sama & berakhiran angka.</p>
                              </div>
                            );
                          })()}

                          <button 
                            onClick={() => { setShowRangeSN(false); setRangeSNConfig({ start: '', end: '' }); }}
                            className="w-full py-3 border border-white/10 rounded-xl text-[10px] font-bold uppercase tracking-widest text-text-dim"
                          >
                            Batal
                          </button>
                        </div>
                      )}

                      {showBatchSN && (
                        <div className="p-4 bg-white/5 rounded-2xl border border-accent-blue/30 space-y-4 animate-in fade-in slide-in-from-top-2">
                          <div className="flex justify-between items-center">
                             <p className="text-[10px] font-bold text-accent-blue uppercase tracking-widest">Input Batch (1 SN Banyak Pcs)</p>
                          </div>
                          
                          <div className="space-y-3">
                             <div className="space-y-1">
                               <p className="text-[9px] font-bold text-text-dim uppercase tracking-widest ml-1">Kode SN / Batch</p>
                               <input 
                                 placeholder="Scan atau ketik SN..."
                                 className="w-full bg-black/40 border border-white/10 p-3 rounded-xl text-xs font-mono focus:outline-none focus:border-accent-blue/50"
                                 value={batchSNConfig.sn}
                                 onChange={e => setBatchSNConfig({...batchSNConfig, sn: e.target.value})}
                               />
                             </div>
                             <div className="space-y-1">
                               <p className="text-[9px] font-bold text-text-dim uppercase tracking-widest ml-1">Jumlah (Pcs)</p>
                               <input 
                                 type="number" inputMode="numeric"
                                 placeholder="Jumlah Pcs"
                                 className="w-full bg-black/40 border border-white/10 p-3 rounded-xl text-xs focus:outline-none focus:border-accent-blue/50"
                                 value={batchSNConfig.qty || ''}
                                 onChange={e => setBatchSNConfig({...batchSNConfig, qty: Math.max(1, Number(e.target.value) || 1)})}
                               />
                             </div>
                          </div>

                          <div className="flex gap-2">
                            <button 
                              onClick={() => {
                                if (!batchSNConfig.sn || !selectedBranch) return;
                                const itemRef = doc(db, `branches/${selectedBranch}/inventory`, `${viewState.product.id}_${viewState.variant.id}`);
                                const currentData = branchInventory[`${viewState.product.id}_${viewState.variant.id}`] || { sns: [] };
                                
                                // Create array with same SN multiple times to increase stock count
                                const newSns = [...currentData.sns, ...new Array(batchSNConfig.qty).fill(batchSNConfig.sn)];
                                
                                setDoc(itemRef, {
                                  productId: viewState.product.id,
                                  variantId: viewState.variant.id,
                                  sns: newSns,
                                  stock: newSns.length,
                                  lastUpdated: serverTimestamp()
                                });
                                setBatchSNConfig({ sn: '', qty: 1 });
                                setShowBatchSN(false);
                                const dispName = viewState.product.category === 'aksesoris' ? `${viewState.product.provider} ${viewState.variant.name} ${viewState.product.name}` : `${viewState.product.name} - ${viewState.variant.name}`;
                                setPosStatus({ message: `📦 Batch Masuk: ${batchSNConfig.qty} Pcs ${dispName}`, type: 'success' });
                                setTimeout(() => setPosStatus({ message: '', type: 'info' }), 4000);
                              }}
                              className="flex-1 bg-accent-blue text-gray-900 py-3 rounded-xl font-bold text-[10px] uppercase tracking-widest"
                            >
                              Simpan Batch Produk
                            </button>
                            <button 
                              onClick={() => { setShowBatchSN(false); setBatchSNConfig({ sn: '', qty: 1 }); }}
                              className="px-6 py-3 border border-white/10 rounded-xl text-[10px] font-bold uppercase tracking-widest"
                            >
                              Batal
                            </button>
                          </div>
                        </div>
                      )}

                      <div className="space-y-2 max-h-40 overflow-y-auto pr-2 scrollbar-hide">
                        {(branchInventory[`${viewState.product.id}_${viewState.variant.id}`]?.sns || []).length > 0 ? (
                          branchInventory[`${viewState.product.id}_${viewState.variant.id}`].sns.map((sn: string, sIdx: number) => (
                            <div key={`${sn}-${sIdx}`} className="flex justify-between items-center p-3 bg-white/5 rounded-xl border border-white/5 group">
                              <span className="text-[10px] font-mono tracking-wider">{sn}</span>
                              <div className="flex items-center gap-2">
                                {(userData?.role === 'admin' || userData?.role === 'audit') && (
                                  <button 
                                    onClick={() => handleDeleteSN(sn)}
                                    className="p-1.5 text-red-500/60 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all"
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                )}
                                {userData?.role === 'employee' && (
                                  <button 
                                    onClick={() => {
                                      setDisposalConfig({ productId: viewState.product.id, variantId: viewState.variant.id, sns: [sn], reason: 'broken' });
                                      setShowDisposalModal(true);
                                    }}
                                    className="p-1.5 bg-red-500/10 text-red-500 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                                    title="Pemusnahan / Retur"
                                  >
                                    <RotateCcw size={12} />
                                  </button>
                                )}
                                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="p-4 text-center text-[10px] text-text-dim italic">Belum ada SN yang diinput untuk cabang ini.</div>
                        )}
                      </div>
                    </div>

                    <button 
                      onClick={() => setViewState({ ...viewState, product: null, variant: null })}
                      className="w-full py-4 glass-card border-accent-blue/30 text-accent-blue font-bold uppercase tracking-[0.2em] text-[10px] rounded-2xl"
                    >
                      Tutup Detail
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      case 'shopping':
        const handlePOSScan = (e: React.KeyboardEvent<HTMLInputElement>) => {
          if (e.key === 'Enter' && posScannerInput.trim()) {
            const sn = posScannerInput.trim();
            setPosScannerInput('');

            // Search in active branch inventory (Direct SN match)
            let found = false;
            for (const key in branchInventory) {
              const inv = branchInventory[key];
              if (inv.sns.includes(sn)) {
                const product = products.find(p => p.id === inv.productId);
                if (product) {
                  const variant = product.variants.find((v: any) => v.id === inv.variantId);
                  if (variant) {
                    setCart(prev => [...prev, {
                      sn,
                      productId: product.id,
                      variantId: variant.id,
                      name: product.name,
                      variantName: variant.name,
                      price: variant.sellingPrice,
                      modal: variant.modalPrice || 0,
                      category: product.category,
                      provider: product.provider
                    }]);
                    const displayName = product.category === 'aksesoris' ? `${product.provider} ${variant.name} ${product.name}` : `${product.name} - ${variant.name}`;
                    setPosStatus({ message: `Scanned: ${displayName}`, type: 'success' });
                    found = true;
                    break;
                  }
                }
              }
            }

            // If not found as unique SN, search as Barcode Master (Kunci SN)
            if (!found) {
              for (const p of products) {
                const variantFound = p.variants?.find((v: any) => v.barcode === sn);
                if (variantFound) {
                  const invKey = `${p.id}_${variantFound.id}`;
                  const currentInv = branchInventory[invKey];
                  
                  if (currentInv && currentInv.sns?.length > 0) {
                    // Pick the first available SN for this model
                    const pickedSN = currentInv.sns[0];
                    setCart(prev => [...prev, {
                      sn: pickedSN,
                      productId: p.id,
                      variantId: variantFound.id,
                      name: p.name,
                      variantName: variantFound.name,
                      price: variantFound.sellingPrice,
                      modal: variantFound.modalPrice || 0,
                      category: p.category,
                      provider: p.provider
                    }]);
                    const displayName = p.category === 'aksesoris' ? `${p.provider} ${variantFound.name} ${p.name}` : `${p.name} - ${variantFound.name}`;
                    setPosStatus({ message: `Master Barcode Found: ${displayName}`, type: 'success' });
                    found = true;
                    break;
                  } else {
                    setPosStatus({ message: `Produk ditemukan, tapi Stok di cabang ini Kosong!`, type: 'error' });
                    found = true; // Mark as found to avoid the generic "tidak ditemukan" message
                    break;
                  }
                }
              }
            }
            if (!found) setPosStatus({ message: `SN / Barcode Master ${sn} tidak ditemukan di stok cabang ini!`, type: 'error' });
          }
        };

        const totalCart = cart.reduce((acc, curr) => acc + curr.price, 0);

        const checkout = async () => {
          if (cart.length === 0) return;
          
          setConfirmModal({
            show: true,
            title: "Konfirmasi Penjualan",
            message: `Selesaikan penjualan ${cart.length} item dengan total ${formatRupiah(totalCart)}? Stok akan otomatis dikurangi.`,
            onConfirm: async () => {
              try {
                // Group by inventory key to update
                const updates: any = {};
                cart.forEach(item => {
                  const key = `${item.productId}_${item.variantId}`;
                  if (!updates[key]) updates[key] = [];
                  updates[key].push(item.sn);
                });

                for (const key in updates) {
                  const snList = updates[key];
                  const itemRef = doc(db, `branches/${selectedBranch}/inventory`, key);
                  const currentData = branchInventory[key];
                  
                  // Filter out the sold SNs
                  const newSns = (currentData?.sns || []).filter((s: string) => !snList.includes(s));
                  
                  await updateDoc(itemRef, {
                    sns: newSns,
                    stock: newSns.length,
                    lastUpdated: serverTimestamp()
                  });
                }

                // Add to Global Transactions
                const txData: any = {
                  branchId: selectedBranch,
                  branchName: branches.find(b => b.id === selectedBranch)?.name || 'Unknown',
                  employeeId: auth.currentUser?.uid,
                  employeeName: userData?.name || 'Staff',
                  items: cart.map(item => ({
                    productId: item.productId,
                    variantId: item.variantId,
                    sn: item.sn,
                    name: item.name,
                    variantName: item.variantName,
                    price: item.price,
                    modal: item.modal || 0,
                    category: item.category,
                    provider: item.provider
                  })),
                  totalAmount: totalCart,
                  totalProfit: cart.reduce((acc, curr) => acc + (curr.price - (curr.modal || 0)), 0),
                  status: 'success',
                  timestamp: serverTimestamp()
                };

                const docRef = await addDoc(collection(db, 'transactions'), txData);
                
                // Create receipt snapshot
                setLastTransaction({ id: docRef.id, ...txData, timestamp: new Date() });
                
                setCart([]);
                setPosStatus({ message: "Penjualan Berhasil Disimpan!", type: 'success' });
                setShowReceiptModal(true);
                setConfirmModal(prev => ({ ...prev, show: false }));
              } catch (error: any) {
                handleFirestoreError(error, OperationType.WRITE, `branches/${selectedBranch}/inventory`);
              }
            }
          });
        };

        return (
          <div className="space-y-6 pb-20">
            <div className="flex justify-between items-center">
               <div className="flex flex-col">
                  <h2 className="text-xl font-black text-text-dim tracking-tight leading-none">KASIR / POS</h2>
                  <div className="flex items-center gap-2 mt-1">
                     <span className={`w-1.5 h-1.5 rounded-full ${isShiftActive ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></span>
                     <span className="text-[8px] font-bold text-text-dim uppercase tracking-widest">{isShiftActive ? 'Shift Aktif' : 'Shift Belum Buka'}</span>
                  </div>
               </div>
               <div className="flex items-center gap-2">
                  <div className="text-[10px] bg-accent-blue/10 text-accent-blue px-3 py-1 rounded-full font-bold border border-accent-blue/20 uppercase tracking-widest">
                     {branches.find(b => b.id === selectedBranch)?.name || 'Cabang'}
                  </div>
                  {isShiftActive && (
                    <button 
                       onClick={() => setShowHandoverModal(true)}
                       className="p-2 bg-red-500/10 text-red-500 rounded-xl border border-red-500/20 hover:bg-red-500 hover:text-white transition group"
                       title="Oper Shift / Selesai Sesi"
                    >
                       <RotateCcw size={14} className="group-hover:rotate-180 transition-transform duration-500" />
                    </button>
                  )}
               </div>
            </div>

            {!isShiftActive && userData?.role === 'employee' ? (
              <div className="glass-card p-12 text-center border-dashed border-accent-blue/30 bg-accent-blue/5 animate-in fade-in zoom-in">
                 <div className="w-16 h-16 bg-accent-blue/20 rounded-full flex items-center justify-center mx-auto mb-4 border border-accent-blue/30 relative">
                    <Lock size={32} className="text-accent-blue" />
                    <div className="absolute -inset-2 bg-accent-blue/20 blur-xl animate-pulse rounded-full"></div>
                 </div>
                 <h3 className="text-xl font-black text-white uppercase tracking-tighter mb-2">Kasir Terkunci</h3>
                 <p className="text-[10px] text-text-dim font-bold uppercase tracking-[0.2em] mb-8 leading-relaxed">
                    Silakan buka sesi shift <br />
                    untuk memulainya penjualan.
                 </p>
                 <button 
                   onClick={() => setIsShiftActive(true)}
                   className="w-full py-4 bg-accent-blue text-gray-900 rounded-2xl font-black uppercase tracking-[0.3em] text-[10px] shadow-lg shadow-accent-blue/20 hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-3"
                 >
                   <Sparkles size={16} />
                   Buka Shift Sekarang
                 </button>
              </div>
            ) : (
              <>
                <div className="glass-card p-4 space-y-4 border-accent-blue/30 relative overflow-hidden text-left">
               <div className="absolute top-0 right-0 p-2 opacity-10">
                  <QrCode size={80} />
               </div>
               <div className="space-y-1 relative z-10">
                 <p className="text-[10px] font-bold text-accent-blue uppercase tracking-widest">Pencarian / Scan Kode Produk</p>
                 <div className="flex gap-2 relative">
                   <input 
                    autoFocus
                    placeholder="Ketik Nama / Type / Scan SN..."
                    className="flex-1 bg-black/40 border-2 border-accent-blue/50 p-3 rounded-2xl text-base font-mono placeholder:opacity-30 focus:outline-none focus:border-accent-blue shadow-inner"
                    value={posSearchQuery}
                    onChange={e => setPosSearchQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        setPosScannerInput(posSearchQuery);
                        handlePOSScan({ ...e, key: 'Enter', target: { value: posSearchQuery } } as any);
                        setPosSearchQuery('');
                      }
                    }}
                   />
                   <button 
                    onClick={() => setShowCameraScanner('pos')}
                    className="aspect-square w-14 bg-accent-blue/20 text-accent-blue rounded-2xl flex items-center justify-center border-2 border-accent-blue/30 shadow-lg shadow-accent-blue/10"
                   >
                     <Camera size={32} />
                   </button>

                    {/* Real-time Results POS */}
                   {posSearchQuery.trim().length >= 1 && (
                     <div className="absolute top-full left-0 right-0 mt-2 z-50 glass-card bg-gray-950 border border-white/20 p-2 max-h-80 overflow-y-auto shadow-2xl animate-in fade-in slide-in-from-top-2">
                       {products
                         .flatMap(p => (p.variants || []).map((v: any) => ({ ...v, pName: p.name, pProvider: p.provider, pCategory: p.category, pId: p.id })))
                         .filter(v => 
                           v.pName.toLowerCase().includes(posSearchQuery.toLowerCase().trim()) || 
                           v.name.toLowerCase().includes(posSearchQuery.toLowerCase().trim()) ||
                           (v.barcode && v.barcode.toLowerCase().includes(posSearchQuery.toLowerCase().trim())) ||
                           (v.barcode && v.barcode.toLowerCase() === posSearchQuery.toLowerCase().trim())
                         )
                         .slice(0, 10)
                         .map((v, i) => (
                           <button 
                             key={`${v.id}-${i}`}
                             onClick={() => {
                               const invKey = `${v.pId}_${v.id}`;
                               const currentInv = branchInventory[invKey];
                               if (currentInv && currentInv.sns?.length > 0) {
                                 const sn = currentInv.sns[0];
                                 setCart(prev => [...prev, {
                                   sn: sn,
                                   productId: v.pId,
                                   variantId: v.id,
                                   name: v.pName,
                                   variantName: v.name,
                                   price: v.sellingPrice,
                                   modal: v.modalPrice || 0,
                                   category: v.pCategory,
                                   provider: v.pProvider
                                 }]);
                                 setPosStatus({ message: `Ditambahkan: ${v.pName} ${v.name}`, type: 'success' });
                                 setPosSearchQuery('');
                               } else {
                                 setPosStatus({ message: `Stok Kosong!`, type: 'error' });
                               }
                             }}
                             className="w-full text-left p-3 hover:bg-white/5 rounded-xl border-b border-white/5 last:border-0"
                           >
                             <div className="flex justify-between items-center">
                               <div>
                                 <p className="text-[10px] font-bold text-accent-blue uppercase">{v.pProvider}</p>
                                 <p className="text-xs font-bold">{v.pName} - {v.name}</p>
                                 {v.barcode && <p className="text-[9px] text-text-dim mt-0.5">Barcode: {v.barcode}</p>}
                               </div>
                               <div className="text-right">
                                 <p className="text-xs font-black text-white">{formatRupiah(v.sellingPrice)}</p>
                                 {(userData?.role === 'admin' || userData?.role === 'audit') && (
                                   <p className="text-[8px] text-accent-blue/60 font-bold">Mdl: {formatRupiah(v.modalPrice || 0)}</p>
                                 )}
                                 <p className={`text-[8px] font-bold uppercase ${(branchInventory[`${v.pId}_${v.id}`]?.sns?.length || 0) > 0 ? 'text-green-500' : 'text-red-500'}`}>
                                   Stok: {branchInventory[`${v.pId}_${v.id}`]?.sns?.length || 0}
                                 </p>
                               </div>
                             </div>
                           </button>
                         ))
                       }
                       {products
                         .flatMap(p => (p.variants || []).map((v: any) => ({ ...v, pName: p.name, pProvider: p.provider, pCategory: p.category, pId: p.id })))
                         .filter(v => 
                           v.pName.toLowerCase().includes(posSearchQuery.toLowerCase()) || 
                           v.name.toLowerCase().includes(posSearchQuery.toLowerCase()) ||
                           (v.barcode && v.barcode.toLowerCase().includes(posSearchQuery.toLowerCase()))
                         ).length === 0 && (
                           <p className="text-center p-4 text-[10px] text-text-dim italic">Produk tidak ditemukan...</p>
                         )
                       }
                     </div>
                   )}
                 </div>
                 <p className="text-[8px] text-text-dim italic mt-2 text-center">Scanner Bluetooth otomatis menekan ENTER setelah scan.</p>
               </div>
            </div>

            {posStatus.message && (
              <div className={`p-3 rounded-xl border text-center text-xs font-bold animate-in fade-in slide-in-from-top-2 ${posStatus.type === 'success' ? 'bg-green-500/10 border-green-500/30 text-green-500' : 'bg-red-500/10 border-red-500/30 text-red-500'}`}>
                {posStatus.message}
              </div>
            )}

            <div className="space-y-3">
              <div className="flex justify-between items-center px-1">
                <h3 className="text-[10px] font-bold text-text-dim uppercase tracking-widest">Rincian Penjualan ({cart.length})</h3>
                {cart.length > 0 && <button onClick={() => setCart([])} className="text-[9px] text-red-500 font-bold uppercase">Kosongkan</button>}
              </div>

              <div className="space-y-2 max-h-[300px] md:max-h-[500px] overflow-y-auto scrollbar-hide py-2">
                {cart.length > 0 ? cart.map((item, idx) => (
                  <div key={`${item.sn}-${idx}`} className="glass-card p-3 flex justify-between items-center border-white/5 animate-in slide-in-from-right-4">
                    <div className="flex-1">
                      <p className="text-[8px] font-black text-accent-blue/80 uppercase tracking-widest leading-none mb-1">
                        {item.provider}
                      </p>
                      <p className="text-[10px] font-bold tracking-tight">
                        {item.category === 'aksesoris' ? `${item.variantName} ${item.name}` : `${item.name} - ${item.variantName}`}
                      </p>
                      <p className="text-[8px] text-text-dim font-mono">{item.sn}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-bold text-accent-blue">{formatRupiah(item.price)}</p>
                      {(userData?.role === 'admin' || userData?.role === 'audit') && (
                        <p className="text-[8px] text-text-dim font-bold">Mdl: {formatRupiah(item.modal || 0)}</p>
                      )}
                      <button onClick={() => setCart(prev => prev.filter((_, i) => i !== idx))} className="text-[9px] text-red-500/50 hover:text-red-500 font-bold">Batal</button>
                    </div>
                  </div>
                )) : (
                  <div className="p-12 text-center glass-card border-dashed border-white/10 opacity-30">
                    <ShoppingCart size={32} className="mx-auto mb-2 opacity-50" />
                    <p className="text-[10px] uppercase font-bold tracking-widest">Keranjang Kosong</p>
                  </div>
                )}
              </div>
            </div>

            {cart.length > 0 && (
              <div className="fixed bottom-20 left-4 right-4 md:static md:bottom-auto md:left-auto md:right-auto md:mt-6 animate-in slide-in-from-bottom-10">
                <div className="glass-card p-3 border-accent-blue/50 shadow-2xl shadow-accent-blue/20 space-y-3 bg-gray-900/90 md:bg-gray-900/40 backdrop-blur-3xl">
                  <div className="flex justify-between items-center px-1">
                    <p className="text-[10px] font-bold text-text-dim uppercase tracking-[0.2em]">Total Transaksi</p>
                    <p className="text-xl font-black text-accent-blue">{formatRupiah(totalCart)}</p>
                  </div>
                  <button 
                    onClick={checkout}
                    className="w-full py-4 bg-accent-blue text-gray-900 rounded-2xl font-black uppercase tracking-widest text-xs shadow-lg shadow-accent-blue/30 active:scale-95 transition"
                  >
                    Selesaikan Penjualan
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    );
      case 'restock':
        return (
          <div className="space-y-6 pb-20">
            <div className="flex justify-between items-center bg-red-500/5 p-6 rounded-3xl border border-red-500/20">
              <div>
                <h2 className="text-2xl font-black text-white tracking-tighter flex items-center gap-2">
                  <AlertTriangle size={24} className="text-red-500" /> STOK MENIPIS
                </h2>
                <p className="text-[10px] text-red-500 font-bold uppercase tracking-widest mt-1 opacity-70 italic">Semua Cabang • Perlu Segera Diisi</p>
              </div>
              <button 
                onClick={() => {
                  const data = lowStockAlerts.map(item => ({
                    'Cabang': item.branchName,
                    'Produk': item.productName,
                    'Varian': item.variantName,
                    'Stok Saat Ini': item.stock,
                    'Batas Minimal': item.minStock || 5,
                    'Status': item.stock === 0 ? 'HABIS' : 'KRITIS'
                  }));
                  exportToExcel(data, `Laporan_Restok_${new Date().toLocaleDateString()}`);
                }}
                className="bg-red-500 text-white px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-red-500/20 active:scale-95 transition flex items-center gap-2"
              >
                <FileSpreadsheet size={16} /> Export Excel
              </button>
            </div>

            <div className="overflow-x-auto rounded-3xl border border-white/5 bg-black/20">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-white/5">
                    <th className="p-4 text-[9px] font-black text-text-dim uppercase tracking-widest border-b border-white/5">Cabang</th>
                    <th className="p-4 text-[9px] font-black text-text-dim uppercase tracking-widest border-b border-white/5">Nama Barang</th>
                    <th className="p-4 text-[9px] font-black text-text-dim uppercase tracking-widest border-b border-white/5">Varian</th>
                    <th className="p-4 text-[9px] font-black text-text-dim uppercase tracking-widest border-b border-white/5 text-center">Stok</th>
                    <th className="p-4 text-[9px] font-black text-text-dim uppercase tracking-widest border-b border-white/5 text-center">Batas</th>
                    <th className="p-4 text-[9px] font-black text-text-dim uppercase tracking-widest border-b border-white/5 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {lowStockAlerts.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-12 text-center text-text-dim text-[10px] font-bold uppercase italic tracking-widest">
                        Semua stok di semua cabang masih aman.
                      </td>
                    </tr>
                  ) : lowStockAlerts.sort((a,b) => a.stock - b.stock).map((item, idx) => (
                    <tr key={idx} className="hover:bg-white/5 transition-colors">
                      <td className="p-4">
                        <span className="text-[10px] font-black text-accent-blue bg-accent-blue/10 px-2 py-1 rounded-lg uppercase">{item.branchName}</span>
                      </td>
                      <td className="p-4">
                        <p className="text-[10px] font-black text-white uppercase">{item.productName}</p>
                      </td>
                      <td className="p-4">
                        <p className="text-[10px] text-text-dim font-bold uppercase">{item.variantName}</p>
                      </td>
                      <td className="p-4 text-center">
                        <span className={`text-xs font-black ${item.stock <= 2 ? 'text-red-500' : 'text-yellow-500'}`}>
                          {item.stock}
                        </span>
                      </td>
                      <td className="p-4 text-center">
                        <span className="text-[10px] text-text-dim font-mono">{item.minStock || 5}</span>
                      </td>
                      <td className="p-4 text-center">
                        {item.stock === 0 ? (
                          <span className="text-[8px] bg-red-500 text-white px-2 py-1 rounded-full font-black uppercase tracking-tighter shadow-lg shadow-red-500/20">Habis Total</span>
                        ) : (
                          <span className="text-[8px] bg-yellow-500/20 text-yellow-500 border border-yellow-500/20 px-2 py-1 rounded-full font-black uppercase tracking-tighter">Kritis</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      case 'reports':
        return (
          <div className="space-y-6 pb-20">
            <div className="flex justify-between items-center bg-accent-blue/5 p-6 rounded-3xl border border-accent-blue/20">
              <div>
                <h2 className="text-2xl font-black text-white tracking-tighter flex items-center gap-2">
                  <FileSpreadsheet size={24} className="text-accent-blue" /> REKAP PENGHASILAN
                </h2>
                <p className="text-[10px] text-accent-blue font-bold uppercase tracking-widest mt-1 opacity-70 italic">Semua Cabang • Berdasarkan Serah Terima</p>
              </div>
              <button 
                onClick={() => {
                  const data = handovers.map(h => ({
                    'Cabang': branches.find(b => b.id === h.branchId)?.name || 'Unknown',
                    'Tanggal': h.timestamp?.toDate().toLocaleDateString('id-ID'),
                    'Karyawan': h.employeeName,
                    'Shift': h.shift.toUpperCase(),
                    'Jam Oper Sif': h.timestamp?.toDate().toLocaleTimeString('id-ID'),
                    'Omset Voucher': h.totalVoucher,
                    'Omset Aksesoris': h.totalAksesoris,
                    'Total Hitung': h.totalCalculated,
                    'Uang Fisik': h.cashReported,
                    'Selisih': h.diff,
                    'Catatan': h.notes || '-'
                  }));
                  exportToExcel(data, `Rekap_Penghasilan_${new Date().toLocaleDateString()}`);
                }}
                className="bg-accent-blue text-gray-900 px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-accent-blue/20 active:scale-95 transition flex items-center gap-2"
              >
                <Plus size={16} /> Download Excel
              </button>
            </div>

            <div className="grid gap-6">
              {branches.map(branch => {
                const branchHandover = handovers
                  .filter(h => h.branchId === branch.id)
                  .sort((a, b) => (b.timestamp?.toDate() || 0) - (a.timestamp?.toDate() || 0));

                return (
                  <div key={branch.id} className="space-y-3">
                    <div className="flex items-center gap-3 px-1">
                      <div className="w-1.5 h-6 bg-accent-blue rounded-full"></div>
                      <h3 className="text-sm font-black text-white uppercase tracking-tight">{branch.name}</h3>
                      <span className="text-[8px] text-text-dim font-bold uppercase tracking-widest bg-white/5 px-2 py-1 rounded-lg">
                        {branchHandover.length} Sesi Tercatat
                      </span>
                    </div>

                    <div className="overflow-x-auto rounded-3xl border border-white/5 bg-black/20">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-white/5">
                            <th className="p-4 text-[9px] font-black text-text-dim uppercase tracking-widest border-b border-white/5">Waktu Oper</th>
                            <th className="p-4 text-[9px] font-black text-text-dim uppercase tracking-widest border-b border-white/5 text-center">Shift</th>
                            <th className="p-4 text-[9px] font-black text-text-dim uppercase tracking-widest border-b border-white/5">Karyawan</th>
                            <th className="p-4 text-[9px] font-black text-text-dim uppercase tracking-widest border-b border-white/5 text-right">Voucher</th>
                            <th className="p-4 text-[9px] font-black text-text-dim uppercase tracking-widest border-b border-white/5 text-right">Aksesoris</th>
                            <th className="p-4 text-[9px] font-black text-text-dim uppercase tracking-widest border-b border-white/5 text-right">Total Kas</th>
                            <th className="p-4 text-[9px] font-black text-text-dim uppercase tracking-widest border-b border-white/5 text-center">Selisih</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {branchHandover.length === 0 ? (
                            <tr>
                              <td colSpan={7} className="p-8 text-center text-text-dim text-[10px] font-bold uppercase italic tracking-widest">
                                Belum ada riwayat serah terima untuk cabang ini.
                              </td>
                            </tr>
                          ) : branchHandover.slice(0, 10).map(h => (
                            <tr key={h.id} className="hover:bg-white/5 transition-colors group">
                              <td className="p-4">
                                <p className="text-[10px] font-bold text-white">{h.timestamp?.toDate().toLocaleDateString('id-ID')}</p>
                                <p className="text-[8px] text-text-dim font-mono">{h.timestamp?.toDate().toLocaleTimeString('id-ID')}</p>
                              </td>
                              <td className="p-4 text-center">
                                <span className={`text-[7px] px-2 py-1 rounded-full font-black uppercase tracking-tighter shadow-sm ${h.shift === 'siang' ? 'bg-yellow-500/20 text-yellow-500 border border-yellow-500/20' : 'bg-purple-500/20 text-purple-500 border border-purple-500/20'}`}>
                                  {h.shift}
                                </span>
                              </td>
                              <td className="p-4">
                                <p className="text-[10px] font-black text-white uppercase tracking-tight">{h.employeeName}</p>
                              </td>
                              <td className="p-4 text-right">
                                <p className="text-[10px] font-mono font-bold text-white">{formatRupiah(h.totalVoucher)}</p>
                              </td>
                              <td className="p-4 text-right">
                                <p className="text-[10px] font-mono font-bold text-accent-blue">{formatRupiah(h.totalAksesoris)}</p>
                              </td>
                              <td className="p-4 text-right">
                                <p className="text-xs font-black text-white">{formatRupiah(h.cashReported)}</p>
                              </td>
                              <td className="p-4 text-center">
                                <span className={`text-[9px] font-black ${h.diff < 0 ? 'text-red-500' : h.diff > 0 ? 'text-green-500' : 'text-accent-blue'}`}>
                                  {h.diff === 0 ? '-' : (h.diff > 0 ? '+' : '') + formatRupiah(h.diff)}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {branchHandover.length > 10 && (
                        <div className="p-3 text-center border-t border-white/5">
                           <p className="text-[8px] text-text-dim font-bold uppercase tracking-widest">Menampilkan 10 sesi terakhir. Gunakan export untuk data lengkap.</p>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      case 'audit_center':
        return (
          <div className="space-y-6 pb-20">
            <div className="flex justify-between items-center px-1">
              <div>
                <h2 className="text-xl font-black text-white tracking-widest uppercase flex items-center gap-2">
                  <ShieldCheck className="text-accent-blue" /> Pusat Audit
                </h2>
                <p className="text-[10px] text-text-dim uppercase font-bold tracking-widest">Cek Stok & Validasi Inventaris</p>
              </div>
              <div className="text-[10px] bg-accent-blue/10 text-accent-blue px-3 py-1 rounded-full font-bold border border-accent-blue/20 uppercase tracking-widest">
                {branches.find(b => b.id === selectedBranch)?.name || 'Pilih Cabang'}
              </div>
            </div>

            <div className="glass-card p-6 space-y-6 border-accent-blue/30 relative overflow-hidden group">
              <div className="absolute -top-10 -right-10 w-32 h-32 bg-accent-blue/10 rounded-full blur-3xl group-hover:bg-accent-blue/20 transition-all"></div>
              
              <div className="text-center space-y-4">
                <div className="w-16 h-16 bg-accent-blue/10 rounded-2xl flex items-center justify-center mx-auto text-accent-blue mb-4">
                  <QrCode size={32} />
                </div>
                <h3 className="text-sm font-black uppercase tracking-widest">Scan atau Input Kode</h3>
                <p className="text-[10px] text-text-dim uppercase font-bold">Gunakan Barcode Master atau SN Unit</p>
                
                <div className="relative text-left">
                  <input 
                    type="text"
                    autoFocus
                    placeholder="Scan / Ketik Kode Produk..."
                    className="w-full bg-black/40 border border-white/10 p-4 pr-12 rounded-2xl text-xs font-mono focus:outline-none focus:border-accent-blue/50 text-white"
                    value={auditSearchQuery}
                    onChange={(e) => setAuditSearchQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        const val = (e.target as HTMLInputElement).value;
                        if (val.trim()) {
                          handleAuditScan(val.trim());
                          setAuditSearchQuery('');
                        }
                      }
                    }}
                  />
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 text-accent-blue/50">
                    <Search size={16} />
                  </div>

                  {/* Real-time Results Audit */}
                  {auditSearchQuery.trim().length >= 2 && (
                    <div className="absolute top-full left-0 right-0 mt-2 z-50 glass-card bg-gray-950 border border-white/20 p-2 max-h-60 overflow-y-auto shadow-2xl animate-in fade-in slide-in-from-top-2">
                      {products
                        .flatMap(p => (p.variants || []).map((v: any) => ({ ...v, pName: p.name, pProvider: p.provider, pCategory: p.category, pId: p.id, productFull: p })))
                        .filter(v => 
                          v.pName.toLowerCase().includes(auditSearchQuery.toLowerCase()) || 
                          v.name.toLowerCase().includes(auditSearchQuery.toLowerCase()) ||
                          (v.barcode && v.barcode.toLowerCase().includes(auditSearchQuery.toLowerCase()))
                        )
                        .slice(0, 10)
                        .map((v, i) => (
                          <button 
                            key={`${v.id}-${i}`}
                            onClick={() => {
                              setViewState({
                                category: v.pCategory,
                                provider: v.pProvider,
                                product: v.productFull,
                                variant: v
                              });
                              setActiveMenu('products');
                              setAuditSearchQuery('');
                            }}
                            className="w-full text-left p-3 hover:bg-white/5 rounded-xl border-b border-white/5 last:border-0"
                          >
                            <div className="flex justify-between items-center">
                              <div>
                                <p className="text-[10px] font-bold text-accent-blue uppercase">{v.pProvider}</p>
                                <p className="text-xs font-bold">{v.pName} - {v.name}</p>
                                {v.barcode && <p className="text-[9px] text-text-dim mt-0.5">Master: {v.barcode}</p>}
                              </div>
                              <div className="text-right">
                                <p className={`text-[8px] font-bold uppercase ${(branchInventory[`${v.pId}_${v.id}`]?.sns?.length || 0) > 0 ? 'text-green-500' : 'text-red-500'}`}>
                                  Stok: {branchInventory[`${v.pId}_${v.id}`]?.sns?.length || 0}
                                </p>
                              </div>
                            </div>
                          </button>
                        ))
                      }
                    </div>
                  )}
                </div>
              </div>

              <button 
                onClick={() => setShowCameraScanner('audit')}
                className="w-full py-4 bg-accent-blue text-gray-900 rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-lg shadow-accent-blue/20 active:scale-95 transition flex items-center justify-center gap-3"
              >
                <Camera size={16} /> Buka Kamera Scanner
              </button>
            </div>

            <div className="space-y-4">
              <h4 className="text-[10px] font-bold text-text-dim uppercase tracking-widest px-1">Instruksi Audit</h4>
              <div className="grid grid-cols-1 gap-3">
                <div className="glass-card p-4 border-white/5 flex items-start gap-4">
                  <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-accent-blue shrink-0">1</div>
                  <p className="text-[10px] text-text-dim leading-relaxed">Pilih <b>Cabang</b> yang ingin diaudit melalui pilihan di menu Home atau Sistem.</p>
                </div>
                <div className="glass-card p-4 border-white/5 flex items-start gap-4">
                  <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-accent-blue shrink-0">2</div>
                  <p className="text-[10px] text-text-dim leading-relaxed"><b>Scan Barcode Master</b> untuk melihat informasi produk secara umum dan total stok di cabang ini.</p>
                </div>
                <div className="glass-card p-4 border-white/5 flex items-start gap-4">
                  <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-accent-blue shrink-0">3</div>
                  <p className="text-[10px] text-text-dim leading-relaxed"><b>Scan SN Spesifik</b> untuk memastikan unit tersebut benar-benar terdaftar di inventaris cabang.</p>
                </div>
              </div>
            </div>
          </div>
        );
      case 'history':
        const filteredTransactions = transactions.filter(t => 
          userData?.role === 'admin' || userData?.role === 'audit' || t.branchId === userData?.branchId
        ).sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));

        const sortedAuditLogs = auditLogs.sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));

        return (
          <div className="space-y-6 pb-20">
            <div className="flex justify-between items-center bg-gray-900/40 p-3 rounded-2xl border border-white/5">
              <h2 className="text-xl font-black text-text-dim tracking-tight flex items-center gap-2">
                <History size={20} className="text-accent-blue" /> RIWAYAT
              </h2>
              {(userData?.role === 'admin' || userData?.role === 'audit') && (
                <div className="flex bg-black/40 p-1 rounded-xl border border-white/10">
                  <button 
                    onClick={() => setHistoryTab('sales')}
                    className={`px-3 py-1.5 rounded-lg text-[9px] font-bold uppercase transition-all ${historyTab === 'sales' ? 'bg-accent-blue text-gray-900 shadow-lg' : 'text-text-dim hover:text-white'}`}
                  >
                    Penjualan
                  </button>
                  <button 
                    onClick={() => setHistoryTab('audit')}
                    className={`px-3 py-1.5 rounded-lg text-[9px] font-bold uppercase transition-all ${historyTab === 'audit' ? 'bg-accent-blue text-gray-900 shadow-lg' : 'text-text-dim hover:text-white'}`}
                  >
                    Audit Log
                  </button>
                </div>
              )}
            </div>

            {historyTab === 'sales' ? (
              <div className="space-y-4">
                {filteredTransactions.length > 0 ? filteredTransactions.map((tx) => (
                  <div key={tx.id} className="glass-card p-4 space-y-3 border-white/5">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-[10px] font-bold text-accent-blue uppercase">{tx.branchName}</p>
                        <p className="text-[8px] text-text-dim">{tx.timestamp?.toDate().toLocaleString('id-ID')}</p>
                      </div>
                      <div className="text-right">
                         <p className={`text-sm font-black ${tx.status === 'returned' ? 'text-red-500 line-through' : 'text-white'}`}>{formatRupiah(tx.totalAmount)}</p>
                         <p className="text-[8px] text-text-dim uppercase tracking-widest">{tx.employeeName}</p>
                      </div>
                    </div>
                    <div className="space-y-1 border-y border-white/5 py-2">
                      {tx.items.map((it: any, i: number) => (
                        <div key={i} className="flex justify-between text-[10px]">
                          <span className="text-text-dim"><span className="text-accent-blue">[{it.provider}]</span> {it.name} - {it.variantName}</span>
                          <span className="font-mono text-[8px] opacity-50">{it.sn}</span>
                        </div>
                      ))}
                    </div>

                    <div className="flex justify-between items-center pt-1">
                       {tx.status === 'returned' ? (
                          <div className="flex items-center gap-1.5 text-red-500">
                             <RotateCcw size={10} />
                             <span className="text-[8px] font-black uppercase tracking-widest">Barang Telah Diretur</span>
                          </div>
                       ) : (
                          <button 
                             onClick={() => handleReturnTransaction(tx)}
                             className="flex items-center gap-1.5 text-text-dim hover:text-red-500 transition-colors"
                          >
                             <RotateCcw size={10} />
                             <span className="text-[8px] font-black uppercase tracking-widest">Retur Barang</span>
                          </button>
                       )}
                    </div>
                  </div>
                )) : (
                  <div className="text-center py-20 text-text-dim italic text-xs">Belum ada transaksi tercatat.</div>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {sortedAuditLogs.length > 0 ? sortedAuditLogs.map((log) => (
                  <div key={log.id} className="glass-card p-3 border-white/5 flex gap-3 items-center">
                    <div className={`p-2 rounded-xl border ${
                      log.action.includes('tambah') ? 'bg-green-500/10 border-green-500/20 text-green-500' : 'bg-accent-blue/10 border-accent-blue/20 text-accent-blue'
                    }`}>
                      <Package size={16} />
                    </div>
                    <div className="flex-1">
                      <div className="flex justify-between items-start">
                        <p className="text-[10px] font-black text-white uppercase tracking-tight">
                          {log.action === 'tambah_stok' || log.action === 'tambah_stok_manual' ? 'Restok (1 Pcs)' : 
                           log.action === 'tambah_stok_masal' ? `Restok (${log.details.qty} Pcs)` : log.action}
                        </p>
                        <span className="text-[8px] text-text-dim whitespace-nowrap">{log.timestamp?.toDate().toLocaleString('id-ID')}</span>
                      </div>
                      <p className="text-[8px] text-accent-blue font-bold uppercase tracking-widest mb-1">{log.details.branchName}</p>
                      <p className="text-[9px] text-text-dim font-bold">
                        {log.details.productName} - {log.details.variantName} 
                        {log.details.sn && <span className="text-white ml-2 font-mono">({log.details.sn})</span>}
                      </p>
                      <div className="mt-2 flex items-center justify-between">
                         <p className="text-[7px] text-accent-blue/60 uppercase font-black tracking-tighter">Auditor: {log.userName}</p>
                         {log.action === 'tambah_stok_masal' && (
                            <p className="text-[7px] text-text-dim italic">Range: {log.details.startSN} - {log.details.endSN}</p>
                         )}
                      </div>
                    </div>
                  </div>
                )) : (
                  <div className="text-center py-24 text-text-dim italic text-xs font-bold uppercase tracking-[0.2em] bg-white/[0.02] rounded-3xl border border-dashed border-white/10">
                    Belum ada riwayat audit.
                  </div>
                )}
              </div>
            )}
          </div>
        );
      case 'transfers':
        const filteredTransfers = transfers.filter(t => 
          userData?.role === 'admin' || userData?.role === 'audit'
        ).sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));

        return (
          <div className="space-y-6 pb-20">
             <div className="flex justify-between items-center">
                <h2 className="text-xl font-black text-text-dim tracking-tight flex items-center gap-2">
                  <ArrowLeftRight size={20} className="text-accent-blue" /> TRANSFER STOK
                </h2>
                <button 
                  onClick={() => setShowTransferModal(true)}
                  className="bg-accent-blue/10 text-accent-blue border border-accent-blue/20 px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest"
                >
                  Transfer Baru
                </button>
             </div>

             <div className="space-y-3">
               {filteredTransfers.length > 0 ? filteredTransfers.map((tf) => (
                 <div key={tf.id} className="glass-card p-4 space-y-2 border-white/5">
                    <div className="flex items-center justify-between">
                       <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold text-white uppercase">{branches.find(b => b.id === tf.fromBranchId)?.name}</span>
                          <ArrowLeftRight size={10} className="text-accent-blue" />
                          <span className="text-[10px] font-bold text-white uppercase">{branches.find(b => b.id === tf.toBranchId)?.name}</span>
                       </div>
                       <span className={`text-[8px] font-bold px-2 py-0.5 rounded-full border ${tf.status === 'completed' ? 'border-green-500 text-green-500' : 'border-yellow-500 text-yellow-500'}`}>
                          {tf.status === 'completed' ? 'Terkirim' : 'Pending'}
                       </span>
                    </div>
                    <p className="text-[10px] font-medium text-text-dim">{tf.productName} ({tf.variantName})</p>
                    <div className="text-[8px] font-mono text-text-dim italic">
                       {tf.sns.length} SN: {tf.sns.slice(0, 3).join(', ')}{tf.sns.length > 3 ? '...' : ''}
                    </div>
                 </div>
               )) : (
                 <div className="text-center py-20 text-text-dim italic text-xs">Belum ada riwayat transfer.</div>
               )}
             </div>
          </div>
        );
      default:
        return <div className="text-center text-text-dim mt-10 italic">Fitur segera hadir.</div>;
    }
  };

  const menuItems = React.useMemo(() => {
    if (!userData) return [];
    
    const items = [];
    
    if (userData.role === 'admin' || userData.role === 'audit') {
      items.push({ id: 'dashboard', label: 'Home', icon: LayoutDashboard });
      items.push({ id: 'audit_center', label: 'Audit', icon: ShieldCheck });
      items.push({ id: 'restock', label: 'Restok', icon: AlertTriangle });
      if (userData.role === 'admin') {
        items.push({ id: 'reports', label: 'Laporan', icon: FileSpreadsheet });
      }
    }

    if (userData.role === 'employee') {
      items.push({ id: 'shopping', label: 'Kasir', icon: ShoppingCart });
    }

    // Products (Katalog/Stok)
    items.push({ id: 'products', label: 'Stok', icon: Package });

    if (userData.role === 'audit' || userData.role === 'admin') {
      items.push({ id: 'transfers', label: 'Transfer', icon: ArrowLeftRight });
    }

    items.push({ id: 'history', label: 'Riwayat', icon: History });

    if (userData.role === 'admin') {
      items.push({ id: 'system', label: 'Sistem', icon: Settings });
    }

    return items;
  }, [userData]);

  return (
    <div 
      className="min-h-screen bg-gray-950 text-text-main pb-24 md:pb-0 md:pl-24 font-sans selection:bg-accent-blue/30 overflow-x-hidden outline-none border-none ring-0 focus:outline-none"
      style={{ WebkitTapHighlightColor: 'transparent' }}
    >
      <div className="fixed top-0 left-0 right-0 h-px bg-gray-950 z-[300] pointer-events-none"></div>
      {/* App Loader */}
      {isAppLoading && (
        <div className="fixed inset-0 z-[200] bg-gray-950 flex flex-col items-center justify-center p-6 text-center animate-out fade-out duration-700 fill-mode-forwards" style={{ animationDelay: '800ms' }}>
          <div className="relative mb-8">
            <div className="w-20 h-20 rounded-2xl bg-accent-blue/20 flex items-center justify-center animate-pulse">
               <Sparkles size={40} className="text-accent-blue" />
            </div>
            <div className="absolute -inset-1 rounded-2xl bg-accent-blue/20 blur-xl animate-pulse"></div>
          </div>
          <h2 className="text-2xl font-black bg-gradient-to-r from-white to-accent-blue bg-clip-text text-transparent tracking-tighter mb-2">ALPATPULSA</h2>
          <p className="text-[10px] text-accent-blue/50 font-bold uppercase tracking-[0.4em] mb-8">Initializing System...</p>
          <div className="w-48 h-1 bg-white/5 rounded-full overflow-hidden relative">
             <div className="absolute inset-0 bg-accent-blue h-full animate-loading-bar rounded-full shadow-[0_0_10px_#4F46E5]"></div>
          </div>
        </div>
      )}

      <div className="max-w-lg mx-auto p-3 md:p-8 flex flex-col min-h-screen">
        <header className="mb-4 flex justify-between items-center pt-2 px-1">
          <div className="flex flex-col">
            <h1 className="text-xl md:text-2xl font-black bg-gradient-to-r from-white to-accent-blue bg-clip-text text-transparent tracking-tighter leading-none">ALPATPULSA</h1>
            <p className="text-[8px] text-accent-blue/50 font-bold uppercase tracking-[0.3em] mt-1">Inventory Management</p>
          </div>
          {user && (
            <div className="flex items-center gap-3">
              <div className="hidden sm:block text-right">
                <p className="text-[10px] font-bold leading-tight">{user.displayName || 'User'}</p>
                <p className="text-[7px] text-text-dim uppercase tracking-widest">{userData?.role}</p>
              </div>
              <button 
                onClick={handleLogout} 
                className="w-8 h-8 rounded-lg bg-accent-blue/10 border border-accent-blue/30 flex items-center justify-center text-[10px] font-extrabold hover:bg-accent-blue hover:text-gray-900 transition-all shadow-lg active:scale-95"
              >
                {user.email?.[0].toUpperCase()}
              </button>
            </div>
          )}
        </header>

        {!user ? (
          <div className="flex flex-col items-center justify-center mt-32 space-y-6">
            <div className="w-20 h-20 glass-card flex items-center justify-center"><Package size={40} className="text-accent-blue" /></div>
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-bold">Alpatpulsa System</h2>
              <p className="text-text-dim text-sm px-10">Manajemen Stok & SN Unik Antar Cabang.</p>
            </div>
            <button onClick={login} className="w-full max-w-xs bg-accent-blue text-gray-900 py-4 rounded-2xl font-bold hover:scale-105 transition shadow-lg shadow-accent-blue/20">Masuk dengan Google</button>
          </div>
        ) : renderContent()}
      </div>

      {user && (userData?.isApproved || userData?.role === 'admin') && (
        <nav className="fixed bottom-0 left-0 right-0 md:top-0 md:bottom-0 md:left-0 md:right-auto md:w-24 bg-gray-950/90 backdrop-blur-2xl border-t md:border-t-0 md:border-r border-white/10 p-2 md:p-3 md:pt-24 flex md:flex-col justify-around md:justify-start md:gap-8 shadow-2xl z-50">
          {menuItems.map((item) => {
            const Icon = item.icon;
            return (
              <button 
                key={item.id} 
                onClick={() => setActiveMenu(item.id)} 
                className={`flex flex-col items-center justify-center p-2 rounded-2xl transition-all duration-300 ${activeMenu === item.id ? 'text-accent-blue scale-110 bg-accent-blue/10 md:bg-transparent' : 'text-text-dim opacity-50 hover:opacity-100'}`}
              >
                <Icon size={window.innerWidth < 768 ? 20 : 24} strokeWidth={activeMenu === item.id ? 2.5 : 2} />
                <span className={`text-[8px] md:text-[9px] mt-1 font-bold uppercase tracking-tighter ${activeMenu === item.id ? 'block' : 'hidden md:block opacity-50'}`}>{item.label}</span>
              </button>
            );
          })}
        </nav>
      )}

      {/* Custom Confirmation Modal */}
      {showCameraScanner && (
        <CameraScanner 
          title={showCameraScanner === 'stock' ? 'Input Stok SN' : showCameraScanner === 'stock-initial' ? 'Scan SN Awal' : showCameraScanner === 'audit' ? 'Audit Barang' : showCameraScanner === 'barcode-master' ? 'Scan Kunci SN Master' : 'Scan Kasir POS'}
          onClose={() => setShowCameraScanner(null)}
          onScan={async (rawSn) => {
            const sn = rawSn.trim();
            if (showCameraScanner === 'stock-initial') {
              setNewProduct(prev => ({ ...prev, sn }));
              setShowCameraScanner(null);
            } else if (showCameraScanner === 'barcode-master') {
              if (isEditingPrice) {
                 setEditPrice(prev => ({ ...prev, barcode: sn }));
              } else {
                 setNewProduct(prev => ({ ...prev, variant: { ...prev.variant, barcode: sn } }));
              }
              setShowCameraScanner(null);
            } else if (showCameraScanner === 'stock') {
               if (!selectedBranch || !viewState.product || !viewState.variant) return;
               const itemKey = `${viewState.product.id}_${viewState.variant.id}`;
               const itemRef = doc(db, `branches/${selectedBranch}/inventory`, itemKey);
               const currentData = branchInventory[itemKey] || { sns: [] };
               
               if (!currentData.sns.includes(sn)) {
                 await setDoc(itemRef, {
                   productId: viewState.product.id,
                   variantId: viewState.variant.id,
                   sns: [...currentData.sns, sn],
                   stock: (currentData.stock || 0) + 1,
                   lastUpdated: serverTimestamp()
                 });

                 await logAuditAction('tambah_stok', {
                   productName: viewState.product.name,
                   variantName: viewState.variant.name,
                   sn,
                   branchId: selectedBranch,
                   branchName: branches.find(b => b.id === selectedBranch)?.name || 'Cabang'
                 });

                 setShowCameraScanner(null);
                 const dispName = viewState.product.category === 'aksesoris' ? `${viewState.product.provider} ${viewState.variant.name} ${viewState.product.name}` : `${viewState.product.name} - ${viewState.variant.name}`;
                 setPosStatus({ message: `📦 Masuk: ${dispName} (SN: ${sn})`, type: 'success' });
                 setTimeout(() => setPosStatus({ message: '', type: 'info' }), 2000);
               } else {
                 setPosStatus({ message: `SN ${sn} sudah ada!`, type: 'error' });
                 setTimeout(() => setPosStatus({ message: '', type: 'info' }), 2000);
               }
            } else if (showCameraScanner === 'audit') {
              handleAuditScan(sn);
            } else {
              // POS Mode
              setPosScannerInput(sn);
              // Trigger scan logic (Direct SN search first)
              const trimmedSN = sn.trim();
              let found = false;
              for (const key in branchInventory) {
                const inv = branchInventory[key];
                if (inv.sns.includes(trimmedSN)) {
                  const product = products.find(p => p.id === inv.productId);
                  if (product) {
                    const variant = product.variants.find((v: any) => v.id === inv.variantId);
                    if (variant) {
                      setCart(prev => [...prev, {
                        sn: trimmedSN,
                        productId: product.id,
                        variantId: variant.id,
                        name: product.name,
                        variantName: variant.name,
                        price: variant.sellingPrice,
                        modal: variant.modalPrice || 0,
                        category: product.category,
                        provider: product.provider
                      }]);
                      const displayName = product.category === 'aksesoris' ? `${product.provider} ${variant.name} ${product.name}` : `${product.name} - ${variant.name}`;
                      setPosStatus({ message: `Scanned: ${displayName}`, type: 'success' });
                      found = true;
                      setShowCameraScanner(null); 
                      break;
                    }
                  }
                }
              }

              // If not found in SNs, check Barcode Master (Kunci SN)
              if (!found) {
                for (const p of products) {
                  const variantFound = p.variants?.find((v: any) => v.barcode?.trim() === trimmedSN);
                  if (variantFound) {
                    const invKey = `${p.id}_${variantFound.id}`;
                    const currentInv = branchInventory[invKey];
                    
                    if (currentInv && currentInv.sns?.length > 0) {
                      const pickedSN = currentInv.sns[0];
                      setCart(prev => [...prev, {
                        sn: pickedSN,
                        productId: p.id,
                        variantId: variantFound.id,
                        name: p.name,
                        variantName: variantFound.name,
                        price: variantFound.sellingPrice,
                        modal: variantFound.modalPrice || 0,
                        category: p.category,
                        provider: p.provider
                      }]);
                      const displayName = p.category === 'aksesoris' ? `${p.provider} ${variantFound.name} ${p.name}` : `${p.name} - ${variantFound.name}`;
                      setPosStatus({ message: `Master Barcode Found: ${displayName}`, type: 'success' });
                      found = true;
                      setShowCameraScanner(null);
                      break;
                    } else {
                      setPosStatus({ message: `Produk ditemukan, tapi Stok Kosong!`, type: 'error' });
                      found = true;
                      break;
                    }
                  }
                }
              }

              if (!found) {
                setPosStatus({ message: `SN / Barcode Master ${trimmedSN} tidak ditemukan!`, type: 'error' });
                setTimeout(() => setPosStatus({ message: '', type: 'info' }), 2000);
              }
            }
          }}
        />
      )}
      
      {/* Transfer Modal */}
      {showTransferModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => setShowTransferModal(false)}></div>
          <div className="relative glass-card w-full max-w-lg p-4 space-y-6 border border-white/20 animate-in zoom-in duration-300">
             <div className="flex justify-between items-center">
                <h3 className="text-lg font-black uppercase tracking-widest text-accent-blue flex items-center gap-2">
                   <ArrowLeftRight size={20} /> Transfer Unit Antar Cabang
                </h3>
                <button onClick={() => setShowTransferModal(false)} className="p-2 text-text-dim hover:text-white"><X size={20} /></button>
             </div>

             <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                   <div className="space-y-1">
                      <p className="text-[9px] font-bold text-text-dim uppercase tracking-widest ml-1">Cabang Asal</p>
                      <select 
                        className="w-full bg-white/5 border border-white/10 p-3 rounded-xl text-xs focus:outline-none focus:border-accent-blue/50"
                        value={transferConfig.fromBranchId as any}
                        onChange={e => setTransferConfig({...transferConfig, fromBranchId: e.target.value})}
                      >
                         <option value="">Pilih Cabang Asal</option>
                         {branches.sort((a,b) => a.name.localeCompare(b.name, undefined, {numeric: true})).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                      </select>
                   </div>
                   <div className="space-y-1">
                      <p className="text-[9px] font-bold text-text-dim uppercase tracking-widest ml-1">Cabang Tujuan</p>
                      <select 
                        className="w-full bg-white/5 border border-white/10 p-3 rounded-xl text-xs focus:outline-none focus:border-accent-blue/50"
                        value={transferConfig.toBranchId}
                        onChange={e => setTransferConfig({...transferConfig, toBranchId: e.target.value})}
                      >
                         <option value="">Pilih Cabang Tujuan</option>
                         {branches.filter(b => b.id !== transferConfig.fromBranchId).sort((a,b) => a.name.localeCompare(b.name, undefined, {numeric: true})).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                      </select>
                   </div>
                </div>

                {transferConfig.fromBranchId && (
                  <>
                    <div className="space-y-1">
                       <p className="text-[9px] font-bold text-text-dim uppercase tracking-widest ml-1">Produk & SN</p>
                       <textarea 
                        className="w-full bg-black/40 border border-white/10 p-3 rounded-xl text-xs font-mono h-24 focus:outline-none focus:border-accent-blue/50"
                        placeholder="Scan SN-SN yang akan dipindah ke sini..."
                        value={transferConfig.sns.join('\n')}
                        onChange={e => setTransferConfig({...transferConfig, sns: e.target.value.split('\n').filter(s => s.trim())})}
                       />
                       <p className="text-[8px] text-text-dim italic">Gunakan ENTER untuk memisahkan SN.</p>
                    </div>

                    <div className="space-y-1">
                       <p className="text-[9px] font-bold text-text-dim uppercase tracking-widest ml-1">Cari Produk Katalog (Target)</p>
                       <select 
                        className="w-full bg-white/5 border border-white/10 p-3 rounded-xl text-xs focus:outline-none focus:border-accent-blue/50"
                        onChange={e => {
                          const [pId, vId] = e.target.value.split(':');
                          setTransferConfig({...transferConfig, productId: pId, variantId: vId});
                        }}
                       >
                          <option value="">Pilih Produk yang dipindah</option>
                          {products.map(p => p.variants.map((v: any) => (
                            <option key={`${p.id}-${v.id}`} value={`${p.id}:${v.id}`}>
                              [{p.provider}] {p.name} - {v.name}
                            </option>
                          )))}
                       </select>
                    </div>
                  </>
                )}

                <button 
                  onClick={handleTransfer}
                  disabled={!transferConfig.toBranchId || transferConfig.sns.length === 0 || !transferConfig.productId}
                  className="w-full py-4 bg-accent-blue text-gray-900 rounded-2xl font-black uppercase tracking-widest text-xs shadow-lg shadow-accent-blue/20 disabled:opacity-50 disabled:grayscale transition"
                >
                  Eksekusi Pemindahan Stok
                </button>
             </div>
          </div>
        </div>
      )}

      {/* Disposal Modal */}
      {showDisposalModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => setShowDisposalModal(false)}></div>
          <div className="relative glass-card w-full max-w-sm p-6 space-y-6 border border-white/20 animate-in zoom-in duration-300">
             <div className="space-y-4 text-center">
                <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto text-red-500">
                   <RotateCcw size={32} />
                </div>
                <div className="space-y-1">
                   <h3 className="text-lg font-black uppercase tracking-widest text-red-500">Pemusnahan / Retur</h3>
                   <p className="text-xs text-text-dim">Pilih alasan barang dikeluarkan dari stok cabang.</p>
                </div>
             </div>

             <div className="space-y-3">
                {['broken', 'return', 'lost'].map((r) => (
                  <button 
                    key={r}
                    onClick={() => setDisposalConfig({...disposalConfig, reason: r})}
                    className={`w-full p-4 rounded-xl border text-xs font-bold uppercase tracking-widest transition-all ${disposalConfig.reason === r ? 'bg-red-500 text-white border-red-500 shadow-lg shadow-red-500/20' : 'bg-white/5 border-white/10 text-text-dim'}`}
                  >
                    {r === 'broken' ? 'Barang Rusak / Cacat' : r === 'return' ? 'Retur ke Pusat' : 'Barang Hilang'}
                  </button>
                ))}
             </div>

             <div className="flex gap-4">
                <button 
                  onClick={handleDisposal}
                  className="flex-1 py-4 bg-red-500 text-white rounded-2xl font-black uppercase tracking-widest text-[10px]"
                >
                  Konfirmasi Laporan
                </button>
                <button 
                  onClick={() => setShowDisposalModal(false)}
                  className="px-6 py-4 glass-card border-white/10 text-[10px] font-bold uppercase tracking-widest"
                >
                  Batal
                </button>
             </div>
          </div>
        </div>
      )}

      {/* RECEIPT MODAL */}
      {showReceiptModal && lastTransaction && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/90 backdrop-blur-xl" onClick={() => setShowReceiptModal(false)}></div>
          <div className="relative glass-card w-full max-w-sm overflow-hidden border-accent-blue/40 animate-in slide-in-from-bottom-8 duration-500">
            <div className="bg-accent-blue p-4 text-center text-gray-950">
               <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-2 shadow-inner">
                  <UserCheck size={20} />
               </div>
               <h3 className="text-base font-black uppercase tracking-widest">Penjualan Berhasil</h3>
               <p className="text-[9px] font-bold opacity-80 uppercase mt-1 tracking-tighter">ID: {lastTransaction.id.substring(0, 8)}</p>
            </div>
            
            <div className="p-4 space-y-6">
              <div className="border-b border-white/5 pb-4 space-y-4">
                {lastTransaction.items.map((item: any, i: number) => (
                  <div key={i} className="flex justify-between items-start">
                    <div>
                      <p className="text-[11px] font-black uppercase text-white tracking-tight">{item.name}</p>
                      <p className="text-[9px] text-accent-blue font-bold uppercase">{item.variantName}</p>
                      <p className="text-[8px] text-text-dim font-mono">{item.sn}</p>
                    </div>
                    <p className="text-xs font-bold text-white">{formatRupiah(item.price)}</p>
                  </div>
                ))}
              </div>

              <div className="flex justify-between items-center bg-white/5 p-4 rounded-xl border border-white/10">
                <span className="text-[10px] font-bold text-text-dim uppercase tracking-widest">Total Bayar</span>
                <span className="text-lg font-black text-accent-blue tracking-tighter">{formatRupiah(lastTransaction.totalAmount)}</span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                 <button 
                  onClick={() => window.print()}
                  className="p-4 glass-card border-white/20 flex flex-col items-center gap-2 hover:bg-white/5 transition active:scale-95"
                 >
                    <Plus size={16} className="text-accent-blue rotate-45" />
                    <span className="text-[9px] font-bold uppercase tracking-widest">Cetak Struk</span>
                 </button>
                 <button 
                  onClick={() => {
                    const msg = `*ALPATPULSA RECEIPT*\n------------------\n${lastTransaction.items.map((i:any) => `${i.name}\n${i.sn}\n${formatRupiah(i.price)}`).join('\n--\n')}\n------------------\n*TOTAL: ${formatRupiah(lastTransaction.totalAmount)}*\nTerima Kasih!`;
                    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
                  }}
                  className="p-4 bg-green-500 rounded-2xl flex flex-col items-center gap-2 shadow-lg shadow-green-500/20 active:scale-95 transition"
                 >
                    <ChevronRight size={16} className="text-white" />
                    <span className="text-[9px] font-black text-white uppercase tracking-widest">Share WA</span>
                 </button>
              </div>

              <button 
                onClick={() => setShowReceiptModal(false)}
                className="w-full py-4 text-[10px] font-bold uppercase tracking-widest text-text-dim border-t border-white/5 pt-6 mt-2"
              >
                Kembali ke Kasir
              </button>
            </div>
          </div>
        </div>
      )}

      {showHandoverModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => setShowHandoverModal(false)}></div>
          <div className="relative glass-card w-full max-w-sm p-6 space-y-6 border border-white/20 animate-in zoom-in duration-300 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-2">
               <h3 className="text-sm font-black text-white uppercase tracking-widest">Serah Terima Shift</h3>
               <button onClick={() => setShowHandoverModal(false)} className="text-text-dim hover:text-white"><X size={20}/></button>
            </div>

            <div className="space-y-4">
               {/* SHIFT TYPE SELECTOR */}
               <div className="grid grid-cols-2 gap-3">
                  <button 
                    onClick={() => setHandoverConfig({...handoverConfig, shift: 'siang'})}
                    className={`p-3 rounded-2xl border flex flex-col items-center gap-1 transition-all ${handoverConfig.shift === 'siang' ? 'bg-yellow-500/20 border-yellow-500/50 text-yellow-500' : 'bg-white/5 border-white/10 text-text-dim'}`}
                  >
                     <Sun size={18} />
                     <span className="text-[9px] font-black uppercase">Siang</span>
                  </button>
                  <button 
                    onClick={() => setHandoverConfig({...handoverConfig, shift: 'malam'})}
                    className={`p-3 rounded-2xl border flex flex-col items-center gap-1 transition-all ${handoverConfig.shift === 'malam' ? 'bg-purple-500/20 border-purple-500/50 text-purple-500' : 'bg-white/5 border-white/10 text-text-dim'}`}
                  >
                     <Moon size={18} />
                     <span className="text-[9px] font-black uppercase">Malam</span>
                  </button>
               </div>

               {/* STATS OVERVIEW */}
               <div className="bg-black/40 p-4 rounded-2xl border border-white/5 space-y-3">
                  <p className="text-[9px] font-bold text-text-dim uppercase tracking-widest text-center border-b border-white/10 pb-2">Status Penjualan Anda</p>
                  <div className="flex justify-between items-center">
                     <span className="text-[10px] text-text-dim uppercase font-bold">Voucher/Perdana</span>
                     <span className="text-[11px] font-black text-white">
                        {formatRupiah(transactions.filter(t => t.employeeId === user?.uid && t.status !== 'returned' && t.timestamp?.toDate() > new Date(Date.now() - 12 * 60 * 60 * 1000)).reduce((acc, tx) => acc + tx.items.filter((i:any) => i.category !== 'aksesoris').reduce((s:number, item:any)=>s+item.price, 0),0))}
                     </span>
                  </div>
                  <div className="flex justify-between items-center">
                     <span className="text-[10px] text-text-dim uppercase font-bold">Aksesoris</span>
                     <span className="text-[11px] font-black text-accent-blue">
                        {formatRupiah(transactions.filter(t => t.employeeId === user?.uid && t.status !== 'returned' && t.timestamp?.toDate() > new Date(Date.now() - 12 * 60 * 60 * 1000)).reduce((acc, tx) => acc + tx.items.filter((i:any) => i.category === 'aksesoris').reduce((s:number, item:any)=>s+item.price, 0),0))}
                     </span>
                  </div>
                  <div className="pt-2 border-t border-white/10 flex justify-between items-center">
                     <span className="text-[10px] font-black text-white uppercase">Total Tunai</span>
                     <span className="text-xs font-black text-green-500">
                        {formatRupiah(transactions.filter(t => t.employeeId === user?.uid && t.status !== 'returned' && t.timestamp?.toDate() > new Date(Date.now() - 12 * 60 * 60 * 1000)).reduce((acc, tx) => acc + tx.totalAmount, 0))}
                     </span>
                  </div>
               </div>

               <div className="space-y-3">
                  <div className="space-y-1">
                     <p className="text-[9px] font-bold text-text-dim uppercase tracking-widest ml-1">Uang Fisik di Laci</p>
                     <input 
                       type="number" inputMode="numeric" placeholder="0"
                       className="w-full bg-black/40 border border-glass-border p-3 rounded-xl text-xs font-mono text-white focus:outline-none focus:border-accent-blue/50"
                       value={handoverConfig.cash}
                       onChange={e => setHandoverConfig({...handoverConfig, cash: parseInt(e.target.value) || 0})}
                     />
                  </div>
                  <div className="space-y-1">
                     <p className="text-[9px] font-bold text-text-dim uppercase tracking-widest ml-1">Catatan Tambahan</p>
                     <textarea 
                       placeholder="Misal: Kurang 1000 perak dsb..."
                       className="w-full bg-black/40 border border-glass-border p-3 rounded-xl text-xs text-white h-20 focus:outline-none focus:border-accent-blue/50"
                       value={handoverConfig.notes}
                       onChange={e => setHandoverConfig({...handoverConfig, notes: e.target.value})}
                     />
                  </div>
               </div>

               <button 
                 onClick={async () => {
                    try {
                       const sessionTx = transactions.filter(t => t.employeeId === user?.uid && t.status !== 'returned' && t.timestamp?.toDate() > new Date(Date.now() - 12 * 60 * 60 * 1000));
                       const totalVoucher = sessionTx.reduce((acc, tx) => acc + tx.items.filter((i:any) => i.category !== 'aksesoris').reduce((s:number, item:any)=>s+item.price, 0),0);
                       const totalAksesoris = sessionTx.reduce((acc, tx) => acc + tx.items.filter((i:any) => i.category === 'aksesoris').reduce((s:number, item:any)=>s+item.price, 0),0);
                       
                       await addDoc(collection(db, 'handovers'), {
                          branchId: selectedBranch,
                          employeeId: user?.uid,
                          employeeName: userData?.name,
                          shift: handoverConfig.shift,
                          totalVoucher,
                          totalAksesoris,
                          totalCalculated: totalVoucher + totalAksesoris,
                          cashReported: handoverConfig.cash,
                          diff: handoverConfig.cash - (totalVoucher + totalAksesoris),
                          notes: handoverConfig.notes,
                          timestamp: serverTimestamp()
                       });
                       setIsShiftActive(false);
                       setShowHandoverModal(false);
                       setHandoverConfig({ cash: 0, notes: '', shift: 'siang' });
                       setPosStatus({ message: 'Serah terima shift berhasil disimpan!', type: 'success' });
                    } catch (error) {
                       handleFirestoreError(error, OperationType.WRITE, 'handovers');
                    }
                 }}
                 className="w-full py-4 bg-accent-blue text-white rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-lg shadow-accent-blue/20 active:scale-95 transition"
               >
                  Simpan & Selesai Shift
               </button>
            </div>
          </div>
        </div>
      )}

      {confirmModal.show && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => setConfirmModal(prev => ({ ...prev, show: false }))}></div>
          <div className="relative glass-card w-full max-w-sm p-6 space-y-6 border border-white/20 animate-in zoom-in duration-300">
            <div className="space-y-4 text-center">
              <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto text-red-500">
                <ShieldAlert size={32} />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-black uppercase tracking-widest text-accent-blue">{confirmModal.title}</h3>
                <p className="text-xs text-text-dim leading-relaxed">{confirmModal.message}</p>
              </div>
            </div>
            <div className="flex gap-4">
              <button 
                onClick={confirmModal.onConfirm}
                className="flex-1 py-4 bg-red-500 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-lg shadow-red-500/20 active:scale-95 transition"
              >
                {confirmModal.title === "Produk Duplikat" ? (confirmModal.confirmText || "Tutup") : (confirmModal.confirmText || "Ya, Hapus")}
              </button>
              {confirmModal.title !== "Produk Duplikat" && (
                <button 
                  onClick={() => setConfirmModal(prev => ({ ...prev, show: false }))}
                  className="px-6 py-4 glass-card border-white/10 opacity-70 font-bold uppercase tracking-widest text-[10px] active:scale-95 transition"
                >
                  {confirmModal.cancelText || "Batal"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      {/* Floating Audit Scanner for Auditors (Deprecated - Moved to Audit Center) */}

    </div>
  );
}
