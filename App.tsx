import React, { useState, useEffect, useMemo } from 'react';
import { 
  LayoutDashboard, Upload, History, CheckCircle2, Package, Wallet, 
  Check, ShoppingBag, Trash2, Banknote, CalendarDays, X, Zap, Menu, ShieldCheck, 
  TriangleAlert, Files, ArrowUpRight, Save, History as HistoryIcon,
  Mail, Hash, Image as ImageIcon, BellRing, TrendingDown, TrendingUp, ChevronDown, ChevronRight,
  Info, CreditCard, Clock, PauseCircle, ArrowRight, UserCircle, MapPin, Phone, Download, Printer,
  Square, CheckSquare, Plus, Users, Share2, Globe, RefreshCcw, Mailbox, Lock, LogOut, Settings, FileText
} from 'lucide-react';
import { extractInvoiceData } from './services/geminiService.ts';
import { Invoice, User, InvoiceItem, Supplier, MasterItem, PriceHistoryEntry, TeamMember, VaultConfig } from './types.ts';

interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
}

const App: React.FC = () => {
  // Auth State
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(true);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPass, setLoginPass] = useState('');

  // App State
  const [activeTab, setActiveTab] = useState<'dashboard' | 'upload' | 'history' | 'suppliers' | 'items' | 'variances' | 'gst' | 'team' | 'settings'>('dashboard');
  const [historyTab, setHistoryTab] = useState<'outstanding' | 'settled' | 'hold'>('outstanding');
  const [rawInvoices, setRawInvoices] = useState<Invoice[]>([]);
  const [masterItems, setMasterItems] = useState<MasterItem[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string>('');
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [selectedSupplierId, setSelectedSupplierId] = useState<string | null>(null);
  const [selectedMasterItemId, setSelectedMasterItemId] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [bulkSelection, setBulkSelection] = useState<Set<string>>(new Set());
  const [varianceSelection, setVarianceSelection] = useState<Set<string>>(new Set());

  // Collaboration & Vault States
  const [vault, setVault] = useState<VaultConfig>({
    vaultId: 'VLT-A82J9Z',
    inboundEmail: 'audit-vlt-a82j9z@priceguardian.ai',
    isCloudSyncEnabled: true
  });
  const [team, setTeam] = useState<TeamMember[]>([
    { id: '1', name: 'Original User', email: 'owner@business.com', role: 'Admin', status: 'Online' }
  ]);

  // Initialization & Storage
  useEffect(() => {
    const savedUser = localStorage.getItem('pg_auth_user');
    const savedInvoices = localStorage.getItem('pg_invoices');
    const savedMaster = localStorage.getItem('pg_master_rates');
    const savedSuppliers = localStorage.getItem('pg_suppliers');
    const savedVault = localStorage.getItem('pg_vault');

    if (savedUser) setCurrentUser(JSON.parse(savedUser));
    if (savedInvoices) setRawInvoices(JSON.parse(savedInvoices));
    if (savedMaster) setMasterItems(JSON.parse(savedMaster));
    if (savedSuppliers) setSuppliers(JSON.parse(savedSuppliers));
    if (savedVault) setVault(JSON.parse(savedVault));
    
    setIsAuthenticating(false);
  }, []);

  useEffect(() => {
    if (currentUser) {
      localStorage.setItem('pg_invoices', JSON.stringify(rawInvoices));
      localStorage.setItem('pg_master_rates', JSON.stringify(masterItems));
      localStorage.setItem('pg_suppliers', JSON.stringify(suppliers));
      localStorage.setItem('pg_vault', JSON.stringify(vault));
    }
  }, [rawInvoices, masterItems, suppliers, vault, currentUser]);

  const addToast = (message: string, type: Toast['type'] = 'info') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 6000);
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginEmail || !loginPass) return addToast("Credentials required", "error");
    
    const mockUser: User = {
      id: 'u-' + Date.now(),
      name: loginEmail.split('@')[0].toUpperCase(),
      email: loginEmail,
      role: 'Admin',
      organization: 'Guardian Enterprises',
      lastLogin: new Date().toISOString(),
      is2FAEnabled: false
    };
    setCurrentUser(mockUser);
    localStorage.setItem('pg_auth_user', JSON.stringify(mockUser));
    addToast(`Welcome back, ${mockUser.name}`, "success");
  };

  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem('pg_auth_user');
    addToast("Securely logged out", "info");
  };

  const isInvoiceBackdated = (invoiceDateStr: string, masterLastUpdatedStr: string) => {
    if (!invoiceDateStr || !masterLastUpdatedStr) return false;
    const invDate = new Date(invoiceDateStr.split('T')[0]).getTime();
    const masterDate = new Date(masterLastUpdatedStr.split('T')[0]).getTime();
    return invDate < masterDate;
  };

  const enrichedInvoices = useMemo(() => {
    return rawInvoices.map((inv) => {
      const itemsWithVariances = inv.items.map((item) => {
        const master = masterItems.find(m => m.supplierName === inv.supplierName && m.name === item.name);
        const isBackdated = master ? isInvoiceBackdated(inv.date, master.lastUpdated) : false;
        const baseline = isBackdated ? undefined : master?.currentPrice;
        const diff = baseline !== undefined ? item.unitPrice - baseline : 0;
        const pct = baseline ? (diff / baseline) * 100 : 0;
        return { ...item, previousUnitPrice: baseline, priceChange: diff, percentChange: pct } as InvoiceItem;
      });

      let status: Invoice['status'] = 'matched';
      const hasIncrease = itemsWithVariances.some(i => (i.priceChange || 0) > 0.01);
      const hasDecrease = itemsWithVariances.some(i => (i.priceChange || 0) < -0.01);
      if (hasIncrease && hasDecrease) status = 'mixed';
      else if (hasIncrease) status = 'price_increase';
      else if (hasDecrease) status = 'price_decrease';

      return { ...inv, items: itemsWithVariances, status };
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [rawInvoices, masterItems]);

  const pendingVariances = useMemo(() => {
    const logs: any[] = [];
    enrichedInvoices.forEach(inv => {
      inv.items.forEach(item => {
        if (item.priceChange !== undefined && Math.abs(item.priceChange) > 0.01) {
          const master = masterItems.find(m => m.supplierName === inv.supplierName && m.name === item.name);
          const isSynced = master && Math.abs(master.currentPrice - item.unitPrice) < 0.001;
          if (!isSynced) {
            logs.push({
              key: `${inv.id}-${item.name}`,
              invoiceId: inv.id, invoiceNumber: inv.invoiceNumber, date: inv.date,
              supplierName: inv.supplierName, itemName: item.name, oldPrice: item.previousUnitPrice || 0,
              newPrice: item.unitPrice, variance: item.priceChange, pct: item.percentChange,
              masterItemId: master?.id
            });
          }
        }
      });
    });
    return logs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [enrichedInvoices, masterItems]);

  const globalVarianceHistory = useMemo(() => {
    const allHistory: any[] = [];
    masterItems.forEach(item => {
      item.history.forEach(h => {
        if (Math.abs(h.variance) > 0.01) {
          allHistory.push({ ...h, itemName: item.name, supplierName: item.supplierName, masterId: item.id });
        }
      });
    });
    return allHistory.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [masterItems]);

  const updateMasterRate = (supplierName: string, itemName: string, newPrice: number, invoiceNum: string, invDate: string) => {
    setMasterItems(prev => {
      const existingIdx = prev.findIndex(m => m.supplierName === supplierName && m.name === itemName);
      if (existingIdx > -1) {
        const item = prev[existingIdx];
        if (isInvoiceBackdated(invDate, item.lastUpdated)) return prev;
        const variance = newPrice - item.currentPrice;
        const pct = item.currentPrice ? (variance / item.currentPrice) * 100 : 0;
        const updated = {
          ...item, currentPrice: newPrice, lastUpdated: invDate,
          history: [{
            date: invDate, price: newPrice, variance, percentChange: pct,
            source: 'audit' as const, invoiceNumber: invoiceNum,
            note: `Market shift detected in Inv #${invoiceNum}`
          }, ...item.history]
        };
        const next = [...prev];
        next[existingIdx] = updated;
        return next;
      } else {
        return [{
          id: `mstr-${Date.now()}`, supplierName, name: itemName, currentPrice: newPrice, lastUpdated: invDate,
          history: [{ date: invDate, price: newPrice, variance: 0, percentChange: 0, source: 'audit' as const, invoiceNumber: invoiceNum, note: 'Initial Registration' }]
        }, ...prev];
      }
    });
  };

  const acceptSelectedVariances = () => {
    const selected = pendingVariances.filter(v => varianceSelection.has(v.key));
    selected.forEach(v => updateMasterRate(v.supplierName, v.itemName, v.newPrice, v.invoiceNumber, v.date));
    setVarianceSelection(new Set());
    addToast(`Synced ${selected.length} rates to Team Vault.`, 'success');
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    setLoading(true);
    for (const file of Array.from(files) as File[]) {
      setUploadProgress(`Auditing ${file.name}...`);
      try {
        const reader = new FileReader();
        const base64 = await new Promise<string>((resolve) => {
          reader.onload = () => resolve((reader.result as string).split(',')[1]);
          reader.readAsDataURL(file);
        });
        const data: any = await extractInvoiceData(base64, file.type || 'application/pdf');
        
        const newInvoice: Invoice = {
          ...data, id: `inv-${Date.now()}`, isPaid: false, isHold: false, status: 'matched', fileName: file.name, receivedVia: 'upload'
        };

        setSuppliers(prev => {
          const existing = prev.find(s => s.name === data.supplierName);
          const supDetails = { bankAccount: data.bankAccount || existing?.bankAccount, address: data.address || existing?.address, abn: data.abn || existing?.abn, tel: data.tel || existing?.tel, email: data.email || existing?.email, creditTerm: data.creditTerm || existing?.creditTerm };
          if (existing) return prev.map(s => s.name === data.supplierName ? { ...s, ...supDetails } : s);
          return [...prev, { id: `sup-${Date.now()}`, name: data.supplierName, totalSpent: 0, ...supDetails }];
        });

        setMasterItems(prev => {
          let next = [...prev];
          data.items.forEach((item: any) => {
            const exists = next.find(m => m.supplierName === data.supplierName && m.name === item.name);
            if (!exists) {
              next.push({
                id: `mstr-${Date.now()}`, supplierName: data.supplierName, name: item.name,
                currentPrice: item.unitPrice, lastUpdated: data.date, history: [{ date: data.date, price: item.unitPrice, variance: 0, percentChange: 0, source: 'audit', invoiceNumber: data.invoiceNumber, note: 'Initial Registration' }]
              });
            }
          });
          return next;
        });

        setRawInvoices(prev => [newInvoice, ...prev]);
        addToast(`Audited & Synced: ${data.invoiceNumber}`, 'success');
      } catch (err: any) {
        addToast(`Audit Failed: ${err.message}`, 'error');
      }
    }
    setLoading(false);
    setActiveTab('dashboard');
  };

  const stats = useMemo(() => {
    const unpaid = enrichedInvoices.filter(i => !i.isPaid && !i.isHold);
    const totalPayable = unpaid.reduce((sum, i) => sum + i.totalAmount, 0);
    const totalGst = enrichedInvoices.reduce((sum, i) => sum + i.gstAmount, 0);
    const supplierOutstanding: Record<string, number> = {};
    unpaid.forEach(inv => {
      supplierOutstanding[inv.supplierName] = (supplierOutstanding[inv.supplierName] || 0) + inv.totalAmount;
    });
    return { totalPayable, totalGst, totalCount: enrichedInvoices.length, supplierCount: suppliers.length, supplierOutstanding };
  }, [enrichedInvoices, suppliers]);

  const bulkMarkStatus = (status: 'paid' | 'hold' | 'outstanding') => {
    setRawInvoices(prev => prev.map(inv => {
      if (bulkSelection.has(inv.id)) {
        return { ...inv, isPaid: status === 'paid', isHold: status === 'hold' };
      }
      return inv;
    }));
    addToast(`Status updated for ${bulkSelection.size} records.`, 'success');
    setBulkSelection(new Set());
  };

  const bulkDelete = () => {
    if (confirm(`Are you sure you want to remove ${bulkSelection.size} audited records?`)) {
      setRawInvoices(prev => prev.filter(inv => !bulkSelection.has(inv.id)));
      addToast(`Permanently removed ${bulkSelection.size} audit records.`, 'warning');
      setBulkSelection(new Set());
    }
  };

  const removeInvoice = (id: string) => {
    if (confirm("Remove this audit record?")) {
      setRawInvoices(prev => prev.filter(inv => inv.id !== id));
      addToast("Record removed from vault.", "info");
      setBulkSelection(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const exportSelectedToCSV = () => {
    const selectedInvoices = enrichedInvoices.filter(i => bulkSelection.has(i.id));
    if (selectedInvoices.length === 0) return;
    let csvContent = "data:text/csv;charset=utf-8,Date,Invoice Number,Supplier,Total Amount,GST,Status\n";
    selectedInvoices.forEach(inv => {
      csvContent += `${inv.date},${inv.invoiceNumber},${inv.supplierName},${inv.totalAmount},${inv.gstAmount},${inv.isPaid ? 'Paid' : inv.isHold ? 'Hold' : 'Outstanding'}\n`;
    });
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `vault_export_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (isAuthenticating) return null;

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6 relative overflow-hidden font-sans">
        <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
           <div className="absolute top-10 left-10 w-96 h-96 bg-blue-600 rounded-full blur-[120px]" />
           <div className="absolute bottom-10 right-10 w-96 h-96 bg-emerald-600 rounded-full blur-[120px]" />
        </div>

        <div className="w-full max-w-md animate-in fade-in zoom-in duration-500 relative z-10">
           <div className="flex flex-col items-center mb-10 text-center">
              <div className="w-20 h-20 bg-blue-600 rounded-[2rem] flex items-center justify-center text-white shadow-2xl shadow-blue-500/30 mb-6">
                 <ShieldCheck size={40} />
              </div>
              <h1 className="text-4xl font-black text-white uppercase tracking-tighter mb-2 leading-none">Price Guardian</h1>
              <p className="text-slate-400 font-bold uppercase tracking-[0.2em] text-[10px]">Secure Procurement Vault</p>
           </div>

           <div className="bg-slate-800/50 backdrop-blur-xl border border-white/10 rounded-[2.5rem] p-10 shadow-2xl">
              <div className="flex space-x-2 mb-8 bg-slate-900/50 p-1.5 rounded-2xl border border-white/5">
                 <button onClick={() => setAuthMode('login')} className={`flex-1 py-3 text-[10px] font-black uppercase rounded-xl transition-all ${authMode === 'login' ? 'bg-slate-800 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}>Sign In</button>
                 <button onClick={() => setAuthMode('signup')} className={`flex-1 py-3 text-[10px] font-black uppercase rounded-xl transition-all ${authMode === 'signup' ? 'bg-slate-800 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}>New Vault</button>
              </div>

              <form onSubmit={handleLogin} className="space-y-6">
                 <div>
                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2 block ml-1">Work Email</label>
                    <div className="relative">
                       <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600" size={18} />
                       <input type="email" value={loginEmail} onChange={e => setLoginEmail(e.target.value)} required className="w-full bg-slate-900/50 border border-white/5 rounded-2xl py-4 pl-12 pr-4 text-white text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500 transition-all" placeholder="name@business.com" />
                    </div>
                 </div>

                 <div>
                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2 block ml-1">Password</label>
                    <div className="relative">
                       <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600" size={18} />
                       <input type="password" value={loginPass} onChange={e => setLoginPass(e.target.value)} required className="w-full bg-slate-900/50 border border-white/5 rounded-2xl py-4 pl-12 pr-4 text-white text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500 transition-all" placeholder="••••••••" />
                    </div>
                 </div>

                 <button type="submit" className="w-full bg-blue-600 hover:bg-blue-500 text-white py-5 rounded-2xl font-black uppercase text-xs tracking-widest shadow-2xl shadow-blue-500/20 transition-all active:scale-[0.98] mt-4 flex items-center justify-center space-x-3">
                    <span>{authMode === 'login' ? 'Enter Vault' : 'Initialize Vault'}</span>
                    <ArrowRight size={18} />
                 </button>

                 <p className="text-center text-[9px] text-slate-500 font-bold uppercase tracking-widest mt-6">
                    {authMode === 'login' ? "Forgot your key?" : "Already have a vault?"} <span className="text-blue-500 cursor-pointer">Click Here</span>
                 </p>
              </form>
           </div>
           
           <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[1000] space-y-2 w-full max-w-md px-4 no-print pointer-events-none">
              {toasts.map(t => (
                <div key={t.id} className={`p-4 rounded-2xl shadow-2xl border flex items-start space-x-3 animate-in slide-in-from-top duration-300 pointer-events-auto ${t.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'}`}>
                   <div className="mt-0.5">{t.type === 'success' ? <CheckCircle2 size={18} /> : <TriangleAlert size={18} />}</div>
                   <div className="flex-1"><span className="text-[11px] font-medium leading-tight opacity-90">{t.message}</span></div>
                </div>
              ))}
           </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-slate-50 font-sans text-slate-900 overflow-hidden print:bg-white relative">
      
      {/* App Toast System */}
      <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[1000] space-y-2 w-full max-w-md px-4 no-print pointer-events-none">
         {toasts.map(t => (
           <div key={t.id} className={`p-4 rounded-2xl shadow-2xl border flex items-start space-x-3 animate-in slide-in-from-top duration-300 pointer-events-auto ${t.type === 'success' ? 'bg-emerald-600 text-white' : t.type === 'warning' ? 'bg-rose-600 text-white' : 'bg-slate-900 text-white'}`}>
              <div className="mt-0.5">{t.type === 'warning' ? <TriangleAlert size={18} /> : t.type === 'success' ? <CheckCircle2 size={18} /> : <Info size={18} />}</div>
              <div className="flex-1"><span className="text-[11px] font-black uppercase tracking-tight block mb-0.5">Price Guardian</span><span className="text-[11px] font-medium leading-tight opacity-90">{t.message}</span></div>
              <button onClick={() => setToasts(prev => prev.filter(toast => toast.id !== t.id))} className="opacity-60 hover:opacity-100 p-0.5"><X size={14} /></button>
           </div>
         ))}
      </div>

      <nav className={`w-72 bg-slate-900 text-slate-400 flex flex-col shrink-0 fixed inset-y-0 left-0 lg:sticky lg:top-0 h-screen z-[100] transition-transform duration-300 no-print ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        <div className="p-10 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-xl"><ShieldCheck size={24} /></div>
            <span className="text-xl font-black text-white uppercase tracking-tighter">Guardian</span>
          </div>
          <button onClick={() => setIsSidebarOpen(false)} className="lg:hidden text-slate-500 hover:text-white"><X size={24}/></button>
        </div>
        
        <div className="flex-1 px-4 space-y-2 overflow-y-auto custom-scrollbar">
          <NavItem active={activeTab === 'dashboard'} onClick={() => {setActiveTab('dashboard'); setIsSidebarOpen(false);}} icon={LayoutDashboard} label="Dashboard" />
          <NavItem active={activeTab === 'upload'} onClick={() => {setActiveTab('upload'); setIsSidebarOpen(false);}} icon={Upload} label="Audit Invoices" />
          <NavItem active={activeTab === 'history'} onClick={() => {setActiveTab('history'); setIsSidebarOpen(false);}} icon={History} label="Audit Logs" />
          <NavItem active={activeTab === 'items'} onClick={() => {setActiveTab('items'); setIsSidebarOpen(false);}} icon={ShoppingBag} label="Master Rates" />
          <NavItem active={activeTab === 'variances'} onClick={() => {setActiveTab('variances'); setIsSidebarOpen(false);}} icon={HistoryIcon} label="Variance Log" alertCount={pendingVariances.length} />
          <NavItem active={activeTab === 'suppliers'} onClick={() => {setActiveTab('suppliers'); setIsSidebarOpen(false);}} icon={Package} label="Vendors" />
          <NavItem active={activeTab === 'gst'} onClick={() => {setActiveTab('gst'); setIsSidebarOpen(false);}} icon={Banknote} label="GST Records" />
          <div className="my-6 border-t border-slate-800 mx-4" />
          <NavItem active={activeTab === 'team'} onClick={() => {setActiveTab('team'); setIsSidebarOpen(false);}} icon={Users} label="Team Vault" />
          <NavItem active={activeTab === 'settings'} onClick={() => {setActiveTab('settings'); setIsSidebarOpen(false);}} icon={Settings} label="Sync & Cloud" />
        </div>

        <div className="p-6">
           <div className="bg-slate-800 rounded-[2rem] p-5 flex flex-col space-y-4">
              <div className="flex items-center space-x-3">
                 <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center font-black text-xs shadow-lg">
                    {currentUser.name[0]}
                 </div>
                 <div className="min-w-0 flex-1">
                    <p className="text-white text-[10px] font-black uppercase tracking-widest truncate">{currentUser.name}</p>
                    <p className="text-[8px] text-slate-500 font-bold uppercase truncate">{currentUser.email}</p>
                 </div>
              </div>
              <button onClick={handleLogout} className="flex items-center justify-center space-x-2 py-3 bg-slate-900 hover:bg-rose-900/40 hover:text-rose-400 text-slate-500 rounded-xl transition-all text-[9px] font-black uppercase tracking-widest">
                 <LogOut size={14} />
                 <span>Lock Vault</span>
              </button>
           </div>
        </div>
      </nav>

      <main className={`flex-1 overflow-y-auto p-4 lg:p-12 relative h-screen custom-scrollbar transition-all`}>
        <header className="flex justify-between items-center mb-8 no-print sticky top-0 bg-slate-50/90 backdrop-blur-md py-4 z-[80] -mx-4 px-4 lg:-mx-12 lg:px-12">
          <div><h1 className="text-2xl lg:text-3xl font-black text-slate-900 uppercase tracking-tighter">{activeTab.replace('-', ' ')}</h1></div>
          <div className="flex items-center space-x-4">
             <button onClick={() => addToast("Fetching Cloud Sync...", "info")} className="hidden lg:flex items-center space-x-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-[10px] font-black uppercase hover:bg-slate-50 transition-all shadow-sm">
                <RefreshCcw size={14} className="text-blue-600" />
                <span>Auto-Refresh Vault</span>
             </button>
             <button onClick={() => setIsSidebarOpen(true)} className="lg:hidden p-2 bg-white rounded-xl shadow-sm border border-slate-200"><Menu size={24} /></button>
          </div>
        </header>

        <div className="animate-in fade-in duration-500 max-w-7xl mx-auto space-y-10">
          
          {activeTab === 'dashboard' && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                <StatCard label="Cloud Payable" value={`$${stats.totalPayable.toLocaleString()}`} icon={Wallet} color="blue" />
                <StatCard label="Active Alerts" value={pendingVariances.length} icon={TriangleAlert} color="amber" />
                <StatCard label="Total Audit GST" value={`$${stats.totalGst.toLocaleString()}`} icon={Banknote} color="emerald" />
                <StatCard label="Vault Entities" value={stats.supplierCount} icon={Package} color="slate" />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm p-8">
                   <h3 className="font-black text-slate-900 uppercase text-sm mb-6 flex items-center">
                     <Banknote size={18} className="mr-3 text-blue-600" /> Outstanding Payables by Vendor
                   </h3>
                   <div className="space-y-4">
                      {Object.entries(stats.supplierOutstanding).length === 0 ? (
                        <p className="text-[10px] font-bold text-slate-400 uppercase text-center py-10">All accounts settled</p>
                      ) : (
                        Object.entries(stats.supplierOutstanding).map(([name, amount]) => (
                          <div key={name} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 group hover:border-blue-200 transition-colors">
                             <div className="flex items-center space-x-4">
                                <div className="w-10 h-10 bg-slate-900 text-white rounded-xl flex items-center justify-center font-black text-xs shadow-lg">{name[0]}</div>
                                <span className="font-black text-[11px] uppercase text-slate-900 truncate max-w-[200px]">{name}</span>
                             </div>
                             <span className="font-black text-sm text-slate-900">${amount.toLocaleString()}</span>
                          </div>
                        ))
                      )}
                   </div>
                </div>

                {pendingVariances.length > 0 && (
                  <div className="bg-slate-900 rounded-[2.5rem] p-8 shadow-2xl border border-slate-800 text-white relative overflow-hidden">
                    <div className="absolute right-0 top-0 opacity-5 -translate-y-1/4 translate-x-1/4"><BellRing size={200} /></div>
                    <div className="flex items-center justify-between mb-8 relative z-10">
                       <div className="flex items-center space-x-4">
                          <div className="w-12 h-12 bg-amber-500 rounded-2xl flex items-center justify-center text-slate-900 shadow-2xl shadow-amber-500/20"><TriangleAlert size={24} /></div>
                          <div>
                             <h3 className="font-black uppercase text-sm tracking-widest">Price Alert Queue</h3>
                             <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">Pending shifts</p>
                          </div>
                       </div>
                       <button onClick={() => setActiveTab('variances')} className="text-[10px] font-black uppercase text-amber-500 flex items-center group transition-all">Review Queue <ChevronRight size={14} className="ml-1 group-hover:translate-x-1 transition-transform"/></button>
                    </div>
                    <div className="space-y-4 relative z-10">
                       {pendingVariances.slice(0, 4).map((v, i) => (
                         <div key={i} className="bg-white/5 backdrop-blur-md rounded-2xl p-5 border border-white/5 flex items-center justify-between">
                            <div className="min-w-0 flex-1 pr-4">
                               <p className="font-black text-[11px] uppercase truncate text-white mb-1">{v.itemName}</p>
                               <p className="text-[9px] font-bold text-slate-500 uppercase">{v.supplierName}</p>
                            </div>
                            <div className={`text-right ${v.variance > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                               <p className="font-black text-xs">${v.newPrice.toFixed(2)}</p>
                               <div className="flex items-center justify-end text-[9px] font-black uppercase mt-1">
                                  {v.variance > 0 ? <TrendingUp size={12} className="mr-1"/> : <TrendingDown size={12} className="mr-1"/>}
                                  {Math.abs(v.pct).toFixed(1)}%
                               </div>
                            </div>
                         </div>
                       ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {activeTab === 'upload' && <UploadView handleFileUpload={handleFileUpload} loading={loading} progress={uploadProgress} vaultEmail={vault.inboundEmail} />}

          {activeTab === 'variances' && (
            <div className="space-y-10">
              <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden">
                  <div className="p-8 border-b border-slate-100 bg-slate-50/50 flex flex-col md:flex-row justify-between md:items-center gap-4">
                    <div className="flex items-center space-x-4">
                      <div className="w-10 h-10 bg-rose-100 text-rose-600 rounded-xl flex items-center justify-center"><TriangleAlert size={20}/></div>
                      <div>
                         <h3 className="font-black text-slate-900 uppercase text-sm">Market Shifts Pending</h3>
                         <p className="text-[10px] font-bold text-slate-400 uppercase mt-1">Verify movements against baseline</p>
                      </div>
                    </div>
                    {varianceSelection.size > 0 && (
                      <button onClick={acceptSelectedVariances} className="px-6 py-3 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase hover:bg-blue-600 transition-all shadow-xl flex items-center">
                        <CheckCircle2 size={16} className="mr-2" /> Commit {varianceSelection.size} Shifts
                      </button>
                    )}
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left min-w-[800px]">
                      <thead>
                        <tr className="bg-slate-50 text-[10px] font-black uppercase text-slate-400 border-b">
                          <th className="px-6 py-5 w-12 text-center">
                            <button onClick={() => { if (varianceSelection.size === pendingVariances.length) setVarianceSelection(new Set()); else setVarianceSelection(new Set(pendingVariances.map(v => v.key))); }} className="p-1">
                              {varianceSelection.size > 0 ? <CheckSquare size={16} className="text-blue-600"/> : <Square size={16}/>}
                            </button>
                          </th>
                          <th className="px-6 py-5">Audit Date</th>
                          <th className="px-6 py-5">Item Identifier</th>
                          <th className="px-6 py-5 text-right">Market Shift</th>
                          <th className="px-6 py-5 text-center">Commit</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {pendingVariances.length === 0 ? (
                          <tr><td colSpan={5} className="py-20 text-center text-slate-400 font-bold uppercase text-[10px]">No pending baseline shifts detected</td></tr>
                        ) : (
                          pendingVariances.map((v) => (
                            <tr key={v.key} className={`hover:bg-slate-50 transition-all ${varianceSelection.has(v.key) ? 'bg-blue-50/50' : ''}`}>
                              <td className="px-6 py-5 w-12 text-center">
                                 <button onClick={() => {
                                    const next = new Set(varianceSelection);
                                    if (next.has(v.key)) next.delete(v.key); else next.add(v.key);
                                    setVarianceSelection(next);
                                 }} className="p-1">{varianceSelection.has(v.key) ? <CheckSquare size={16} className="text-blue-600"/> : <Square size={16}/>}</button>
                              </td>
                              <td className="px-6 py-5 text-[10px] font-bold text-slate-500">{v.date}</td>
                              <td className="px-6 py-5">
                                 <p className="font-black text-xs text-slate-900 uppercase truncate max-w-[300px] mb-1">{v.itemName}</p>
                                 <p className="text-[9px] font-bold text-slate-400 uppercase">{v.supplierName}</p>
                              </td>
                              <td className="px-6 py-5 text-right">
                                 <p className="font-black text-xs text-slate-900">${v.newPrice.toFixed(2)}</p>
                                 <div className={`flex items-center justify-end text-[9px] font-black uppercase mt-1 ${v.variance > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                                    {v.variance > 0 ? <TrendingUp size={12} className="mr-1"/> : <TrendingDown size={12} className="mr-1"/>}
                                    {Math.abs(v.pct).toFixed(1)}%
                                 </div>
                              </td>
                              <td className="px-6 py-5 text-center">
                                <button onClick={() => { updateMasterRate(v.supplierName, v.itemName, v.newPrice, v.invoiceNumber, v.date); addToast(`Accepted shift for ${v.itemName}`, 'success'); }} className="p-2.5 bg-slate-100 hover:bg-emerald-600 hover:text-white transition-all rounded-xl text-slate-400">
                                  <Check size={16}/>
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
              </div>

              <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden">
                  <div className="p-8 border-b border-slate-100 bg-slate-50/50">
                    <h3 className="font-black text-slate-900 uppercase text-sm flex items-center">
                      <HistoryIcon size={18} className="mr-3 text-blue-600" /> Historical Price Record Log
                    </h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left min-w-[800px]">
                      <thead>
                        <tr className="bg-slate-50 text-[10px] font-black uppercase text-slate-400 border-b">
                          <th className="px-8 py-5">Record Date</th>
                          <th className="px-8 py-5">Audit Ref</th>
                          <th className="px-8 py-5">Item Detail</th>
                          <th className="px-8 py-5 text-right">Settled Price</th>
                          <th className="px-8 py-5 text-right">Impact</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {globalVarianceHistory.length === 0 ? (
                           <tr><td colSpan={5} className="py-20 text-center text-slate-400 font-bold uppercase text-[10px]">No historical variances logged</td></tr>
                        ) : (
                          globalVarianceHistory.map((h, idx) => (
                            <tr key={idx} className="hover:bg-slate-50 transition-all cursor-pointer" onClick={() => setSelectedMasterItemId(h.masterId)}>
                              <td className="px-8 py-5 text-[10px] font-bold text-slate-500">{new Date(h.date).toLocaleDateString()}</td>
                              <td className="px-8 py-5 font-bold text-slate-400 text-[10px] uppercase truncate max-w-[100px]">{h.invoiceNumber || 'Manual'}</td>
                              <td className="px-8 py-5">
                                 <p className="font-black text-xs text-slate-900 uppercase truncate max-w-[200px]">{h.itemName}</p>
                                 <p className="text-[9px] font-bold text-slate-400 uppercase">{h.supplierName}</p>
                              </td>
                              <td className="px-8 py-5 text-right font-black text-xs text-slate-900">${h.price.toFixed(2)}</td>
                              <td className="px-8 py-5 text-right">
                                 <div className={`flex items-center justify-end text-[9px] font-black uppercase ${h.variance > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                                    {h.variance > 0 ? <TrendingUp size={12} className="mr-1"/> : <TrendingDown size={12} className="mr-1"/>}
                                    {Math.abs(h.percentChange).toFixed(1)}%
                                 </div>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
              </div>
            </div>
          )}

          {activeTab === 'history' && (
            <div className="space-y-6">
               <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden relative">
                  <div className="p-4 lg:p-8 border-b border-slate-100 flex flex-col md:flex-row justify-between items-start md:items-center bg-slate-50/50 gap-4">
                    <div className="flex space-x-2">
                       {['outstanding', 'settled', 'hold'].map(t => (
                         <button key={t} onClick={() => { setHistoryTab(t as any); setBulkSelection(new Set()); }} className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase transition-all whitespace-nowrap ${historyTab === t ? 'bg-slate-900 text-white shadow-xl' : 'text-slate-400 hover:bg-slate-200'}`}>{t}</button>
                       ))}
                    </div>
                    {bulkSelection.size > 0 && (
                      <div className="flex items-center space-x-2 animate-in slide-in-from-right">
                         <button onClick={() => bulkMarkStatus('paid')} className="p-2.5 bg-emerald-100 text-emerald-700 rounded-xl hover:bg-emerald-600 hover:text-white transition-all shadow-sm" title="Mark Settled"><CheckCircle2 size={18}/></button>
                         <button onClick={() => bulkMarkStatus('hold')} className="p-2.5 bg-amber-100 text-amber-700 rounded-xl hover:bg-amber-600 hover:text-white transition-all shadow-sm" title="Put on Hold"><PauseCircle size={18}/></button>
                         <button onClick={exportSelectedToCSV} className="p-2.5 bg-blue-100 text-blue-700 rounded-xl hover:bg-blue-600 hover:text-white transition-all shadow-sm" title="Export CSV"><Download size={18}/></button>
                         <button onClick={bulkDelete} className="p-2.5 bg-rose-100 text-rose-700 rounded-xl hover:bg-rose-600 hover:text-white transition-all shadow-sm" title="Remove Selection"><Trash2 size={18}/></button>
                         <div className="w-px h-6 bg-slate-200 mx-2" />
                         <button onClick={() => setBulkSelection(new Set())} className="p-2.5 bg-slate-200 text-slate-700 rounded-xl hover:bg-slate-900 hover:text-white transition-all" title="Clear Selection"><X size={18}/></button>
                      </div>
                    )}
                  </div>
                  <div className="overflow-x-auto">
                     <table className="w-full text-left min-w-[800px]">
                        <thead>
                          <tr className="bg-slate-50 text-[10px] font-black uppercase text-slate-400 border-b">
                            <th className="px-6 py-5 w-12 text-center">
                              <button onClick={() => {
                                 const filtered = enrichedInvoices.filter(i => {
                                    if (historyTab === 'outstanding') return !i.isPaid && !i.isHold;
                                    if (historyTab === 'settled') return i.isPaid;
                                    if (historyTab === 'hold') return i.isHold;
                                    return true;
                                 });
                                 if (bulkSelection.size === filtered.length) setBulkSelection(new Set());
                                 else setBulkSelection(new Set(filtered.map(f => f.id)));
                              }} className="p-1">
                                {bulkSelection.size > 0 ? <CheckSquare size={16} className="text-blue-600"/> : <Square size={16}/>}
                              </button>
                            </th>
                            <th className="px-6 py-5">Audit Status</th>
                            <th className="px-6 py-5">Vendor Entity</th>
                            <th className="px-6 py-5">Reference #</th>
                            <th className="px-6 py-5 text-right">Liability</th>
                            <th className="px-6 py-5 text-center">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {enrichedInvoices.filter(i => {
                            if (historyTab === 'outstanding') return !i.isPaid && !i.isHold;
                            if (historyTab === 'settled') return i.isPaid;
                            if (historyTab === 'hold') return i.isHold;
                            return true;
                          }).map(inv => (
                            <tr key={inv.id} className={`hover:bg-slate-50 transition-all group ${bulkSelection.has(inv.id) ? 'bg-blue-50/50' : ''}`}>
                              <td className="px-6 py-5 w-12 text-center">
                                 <button onClick={() => {
                                    const next = new Set(bulkSelection);
                                    if (next.has(inv.id)) next.delete(inv.id); else next.add(inv.id);
                                    setBulkSelection(next);
                                 }} className="p-1">{bulkSelection.has(inv.id) ? <CheckSquare size={16} className="text-blue-600"/> : <Square size={16}/>}</button>
                              </td>
                              <td className="px-6 py-5" onClick={() => setSelectedInvoiceId(inv.id)}><AuditBadge status={inv.status} hold={inv.isHold} /></td>
                              <td className="px-6 py-5 font-black text-slate-900 text-xs uppercase truncate max-w-[200px]" onClick={() => setSelectedInvoiceId(inv.id)}>{inv.supplierName}</td>
                              <td className="px-6 py-5 font-bold text-slate-400 text-[10px] uppercase" onClick={() => setSelectedInvoiceId(inv.id)}>{inv.invoiceNumber}</td>
                              <td className="px-6 py-5 text-right font-black text-slate-900 text-xs" onClick={() => setSelectedInvoiceId(inv.id)}>${inv.totalAmount.toFixed(2)}</td>
                              <td className="px-6 py-5 text-center">
                                 <div className="flex items-center justify-center space-x-1">
                                    <button onClick={() => setSelectedInvoiceId(inv.id)} className="p-2 hover:bg-slate-900 hover:text-white rounded-xl transition-all text-slate-400" title="View Detail">
                                       <ArrowRight size={16} />
                                    </button>
                                    <button onClick={() => removeInvoice(inv.id)} className="p-2 hover:bg-rose-100 hover:text-rose-600 rounded-xl transition-all text-slate-300" title="Remove Record">
                                       <Trash2 size={16} />
                                    </button>
                                 </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                     </table>
                  </div>
               </div>
            </div>
          )}

          {activeTab === 'suppliers' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {suppliers.map(sup => (
                <div key={sup.id} className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm hover:shadow-md transition-all group relative overflow-hidden flex flex-col h-full">
                   <div className="flex justify-between items-start mb-6">
                      <div className="w-14 h-14 bg-slate-900 text-white rounded-2xl flex items-center justify-center font-black text-2xl shadow-xl">{sup.name[0]}</div>
                      <button onClick={() => setSelectedSupplierId(sup.id)} className="p-3 bg-blue-50 text-blue-600 rounded-xl shadow-sm hover:bg-blue-600 hover:text-white transition-all"><Settings size={20}/></button>
                   </div>
                   <h3 className="font-black text-slate-900 uppercase text-lg mb-4 truncate">{sup.name}</h3>
                   <div className="space-y-4 border-t border-slate-100 pt-6 flex-1 text-[11px] font-bold uppercase text-slate-500">
                      <div className="flex items-center"><Hash size={14} className="mr-3 opacity-40 shrink-0" /> <span className="text-slate-900">{sup.abn || 'ABN Pending'}</span></div>
                      <div className="flex items-center"><Mail size={14} className="mr-3 opacity-40 shrink-0" /> <span className="text-slate-900 truncate">{sup.email || 'No Email Registered'}</span></div>
                      <div className="flex items-center"><Phone size={14} className="mr-3 opacity-40 shrink-0" /> <span className="text-slate-900">{sup.tel || 'No Contact'}</span></div>
                      <div className="flex items-center"><Clock size={14} className="mr-3 opacity-40 shrink-0" /> <span className="text-slate-900">{sup.creditTerm || 'Terms Not Defined'}</span></div>
                      <div className="flex items-start"><MapPin size={14} className="mr-3 mt-0.5 opacity-40 shrink-0" /> <span className="text-slate-900 line-clamp-2 leading-relaxed">{sup.address || 'Address Not Provided'}</span></div>
                   </div>
                   <div className="mt-6 pt-6 border-t border-slate-100 bg-slate-50 -mx-8 -mb-8 p-6">
                      <div className="flex items-center justify-between text-slate-900">
                         <div className="flex items-center min-w-0">
                            <CreditCard size={14} className="mr-3 opacity-40 shrink-0" />
                            <span className={`text-xs font-black uppercase truncate ${!sup.bankAccount ? 'text-rose-500 italic' : ''}`}>
                               {sup.bankAccount || 'Bank Details Pending'}
                            </span>
                         </div>
                         {!sup.bankAccount && <Plus size={14} className="text-blue-600 cursor-pointer" onClick={() => setSelectedSupplierId(sup.id)} />}
                      </div>
                   </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'items' && (
            <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden">
               <div className="p-8 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                  <div>
                     <h3 className="font-black text-slate-900 uppercase text-sm">Master Baseline Registry</h3>
                     <p className="text-[10px] font-bold text-slate-400 uppercase mt-1">Shared anchored rates across the Team Vault</p>
                  </div>
               </div>
               <div className="overflow-x-auto">
                <table className="w-full text-left min-w-[700px]">
                  <thead>
                    <tr className="bg-slate-50 text-[10px] font-black uppercase text-slate-400 border-b">
                      <th className="px-8 py-5">Item Descriptor</th>
                      <th className="px-8 py-5">Vendor Entity</th>
                      <th className="px-8 py-5">Anchored Rate</th>
                      <th className="px-8 py-5">Last Audit</th>
                      <th className="px-8 py-5 text-right">Trend</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {masterItems.map(item => (
                      <tr key={item.id} className="hover:bg-slate-50 transition-all group">
                        <td className="px-8 py-5 font-black text-slate-900 text-xs uppercase">{item.name}</td>
                        <td className="px-8 py-5 font-bold text-slate-500 text-[10px] uppercase">{item.supplierName}</td>
                        <td className="px-8 py-5 font-black text-slate-900 text-xs">${item.currentPrice.toFixed(2)}</td>
                        <td className="px-8 py-5 font-bold text-slate-400 text-[10px]">{new Date(item.lastUpdated).toLocaleDateString()}</td>
                        <td className="px-8 py-5 text-right">
                           <button onClick={() => setSelectedMasterItemId(item.id)} className="p-2 hover:bg-blue-600 hover:text-white rounded-xl text-blue-600 transition-all">
                              <HistoryIcon size={18} />
                           </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
               </div>
            </div>
          )}

          {activeTab === 'gst' && <GSTRecordsView invoices={enrichedInvoices} />}
        </div>

        {selectedInvoiceId && <InvoiceDetailModal invoice={enrichedInvoices.find(i => i.id === selectedInvoiceId)!} onClose={() => setSelectedInvoiceId(null)} onStatusChange={(id, status) => {
          setRawInvoices(prev => prev.map(inv => {
            if (inv.id === id) {
              if (status === 'paid') return { ...inv, isPaid: true, isHold: false };
              if (status === 'hold') return { ...inv, isPaid: false, isHold: true };
              return { ...inv, isPaid: false, isHold: false };
            }
            return inv;
          }));
        }} />}
        {selectedSupplierId && <SupplierEditModal supplier={suppliers.find(s => s.id === selectedSupplierId)!} onClose={() => setSelectedSupplierId(null)} onSave={(updated: Supplier) => { setSuppliers(prev => prev.map(s => s.id === updated.id ? updated : s)); addToast(`Updated vendor profile for ${updated.name}`, 'success'); setSelectedSupplierId(null); }} />}
        {selectedMasterItemId && <MasterRateHistoryModal item={masterItems.find(m => m.id === selectedMasterItemId)!} onClose={() => setSelectedMasterItemId(null)} />}
      </main>

      {loading && (
        <div className="fixed inset-0 z-[500] bg-slate-900/95 backdrop-blur-md flex flex-col items-center justify-center text-white p-6 text-center">
           <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-8 shadow-2xl shadow-blue-500/20" />
           <p className="text-xl font-black uppercase tracking-tighter mb-2">{uploadProgress}</p>
        </div>
      )}
    </div>
  );
};

const NavItem = ({ active, onClick, icon: Icon, label, alertCount }: any) => (
  <button onClick={onClick} className={`w-full flex items-center space-x-4 px-6 py-4 rounded-2xl transition-all relative group ${active ? 'bg-blue-600 text-white shadow-2xl shadow-blue-600/20' : 'text-slate-400 hover:bg-slate-800'}`}>
    <Icon size={20} className={active ? 'text-white' : 'group-hover:text-white'} />
    <span className="font-bold text-sm tracking-tight">{label}</span>
    {alertCount > 0 && <span className="absolute right-6 bg-rose-600 text-white w-5 h-5 rounded-full text-[10px] font-black flex items-center justify-center border-2 border-slate-900 animate-pulse">{alertCount}</span>}
  </button>
);

const StatCard = ({ label, value, icon: Icon, color }: any) => {
  const c: any = { blue: 'text-blue-600 bg-blue-50', amber: 'text-rose-600 bg-rose-50', emerald: 'text-emerald-600 bg-emerald-50', slate: 'text-slate-600 bg-slate-50' };
  return (
    <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all">
      <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-6 shadow-sm ${c[color]}`}><Icon size={24} /></div>
      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{label}</p>
      <h3 className="text-2xl font-black text-slate-900 truncate">{value}</h3>
    </div>
  );
};

const AuditBadge = ({ status, hold }: { status: string, hold?: boolean }) => {
  const config: any = {
    matched: { bg: 'bg-emerald-50 text-emerald-700', icon: CheckCircle2, text: 'Clean' },
    price_increase: { bg: 'bg-rose-50 text-rose-700', icon: TriangleAlert, text: 'Increase' },
    price_decrease: { bg: 'bg-blue-50 text-blue-700', icon: TrendingDown, text: 'Saving' },
    mixed: { bg: 'bg-amber-50 text-amber-700', icon: TriangleAlert, text: 'Mixed' },
    new_supplier: { bg: 'bg-slate-100 text-slate-700', icon: Package, text: 'Initial' }
  };
  const s = hold ? { bg: 'bg-slate-900 text-white', icon: PauseCircle, text: 'Hold' } : config[status] || config.matched;
  const Icon = s.icon;
  return (
    <div className={`flex items-center space-x-2 px-3 py-1.5 rounded-full w-fit whitespace-nowrap shadow-sm border border-black/5 ${s.bg}`}>
      <Icon size={12} /><span className="text-[9px] font-black uppercase tracking-widest">{s.text}</span>
    </div>
  );
};

const UploadView = ({ handleFileUpload, loading, progress, vaultEmail }: any) => (
  <div className="max-w-4xl mx-auto py-10 lg:py-20 text-center animate-in fade-in duration-700 no-print px-4">
    <div className="w-24 h-24 bg-blue-600 text-white rounded-[2.5rem] flex items-center justify-center mx-auto mb-10 shadow-2xl shadow-blue-500/30"><Upload size={40} /></div>
    <h2 className="text-4xl font-black text-slate-900 uppercase tracking-tighter mb-4 leading-none">Ingestion Gateway</h2>
    <p className="text-slate-400 font-bold mb-12 uppercase tracking-widest text-[11px] max-w-lg mx-auto leading-relaxed">Forward PDF invoices to <span className="text-blue-600 lowercase font-black underline underline-offset-4 decoration-2 decoration-blue-200 select-all">{vaultEmail}</span> or drag them below for instant AI auditing.</p>
    <label className="group relative block cursor-pointer">
      <div className="border-4 border-dashed border-slate-200 rounded-[4rem] p-24 transition-all group-hover:border-blue-500 group-hover:bg-blue-50 shadow-sm bg-white">
        <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-6 group-hover:bg-blue-100 transition-all"><Plus size={32} className="text-slate-300 group-hover:text-blue-500" /></div>
        <p className="text-slate-400 font-black uppercase text-xs tracking-widest group-hover:text-blue-600 transition-all">Drop Audit Documents Here</p>
      </div>
      <input type="file" className="hidden" onChange={handleFileUpload} accept="application/pdf,image/*" multiple />
    </label>
  </div>
);

const GSTRecordsView = ({ invoices }: { invoices: Invoice[] }) => {
  const recordsByMonth = useMemo(() => {
    const map: Record<string, { totalMonthGst: number, suppliers: Record<string, { gst: number, total: number }> }> = {};
    invoices.forEach(inv => {
      const month = inv.date.substring(0, 7);
      if (!map[month]) map[month] = { totalMonthGst: 0, suppliers: {} };
      if (!map[month].suppliers[inv.supplierName]) map[month].suppliers[inv.supplierName] = { gst: 0, total: 0 };
      map[month].totalMonthGst += inv.gstAmount;
      map[month].suppliers[inv.supplierName].gst += inv.gstAmount;
      map[month].suppliers[inv.supplierName].total += inv.totalAmount;
    });
    return Object.entries(map).sort((a, b) => b[0].localeCompare(a[0]));
  }, [invoices]);

  return (
    <div className="space-y-10">
      {recordsByMonth.map(([month, data]) => (
        <div key={month} className="bg-white rounded-[2.5rem] border border-slate-200 overflow-hidden shadow-sm">
           <div className="px-10 py-8 bg-slate-900 text-white flex justify-between items-center">
              <h4 className="font-black uppercase text-base tracking-widest flex items-center"><CalendarDays size={24} className="mr-4 text-blue-400" /> {new Date(month).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h4>
              <div className="text-right">
                 <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Monthly Claimable GST</p>
                 <p className="text-3xl font-black text-emerald-400">${data.totalMonthGst.toLocaleString()}</p>
              </div>
           </div>
           <div className="p-4 overflow-x-auto">
              <table className="w-full text-[10px] uppercase font-black text-slate-400">
                 <thead><tr className="border-b border-slate-100"><th className="px-8 py-5 text-left">Vendor Entity</th><th className="px-8 py-5 text-right">GST Portion</th><th className="px-8 py-5 text-right">Gross Total</th></tr></thead>
                 <tbody className="divide-y divide-slate-50">
                    {Object.entries(data.suppliers).map(([name, vals]: [string, any]) => (
                      <tr key={name} className="hover:bg-slate-50 transition-colors">
                        <td className="px-8 py-6 text-slate-900 font-black">{name}</td>
                        <td className="px-8 py-6 text-right text-emerald-600">${vals.gst.toFixed(2)}</td>
                        <td className="px-8 py-6 text-right text-slate-900">${vals.total.toFixed(2)}</td>
                      </tr>
                    ))}
                 </tbody>
              </table>
           </div>
        </div>
      ))}
    </div>
  );
};

const InvoiceDetailModal = ({ invoice, onClose, onStatusChange }: any) => (
  <div className="fixed inset-0 z-[400] flex justify-end no-print">
    <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300" onClick={onClose} />
    <div className="relative w-full max-w-2xl bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-400">
      <div className="p-10 border-b border-slate-100 flex justify-between items-center bg-slate-50 sticky top-0 z-10">
        <div>
           <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">Audit Node</h2>
           <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Invoice #{invoice.invoiceNumber}</p>
        </div>
        <div className="flex items-center space-x-3">
           {!invoice.isPaid && <button onClick={() => { onStatusChange(invoice.id, 'paid'); onClose(); }} className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-[9px] font-black uppercase shadow-xl shadow-emerald-600/20">Mark Settled</button>}
           <button onClick={onClose} className="p-3 hover:bg-white rounded-full transition-all text-slate-400"><X size={24}/></button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-12 space-y-12 custom-scrollbar text-xs uppercase font-black">
         <div className="grid grid-cols-2 gap-10">
            <div><p className="text-slate-400 mb-2">Audit Source</p><p className="text-xl leading-tight text-slate-900">{invoice.supplierName}</p></div>
            <div className="text-right"><p className="text-slate-400 mb-2">Liability Amount</p><p className="text-4xl text-slate-900">${invoice.totalAmount.toFixed(2)}</p></div>
         </div>
         
         <div className="space-y-4">
           <h4 className="text-[10px] font-black text-slate-400 mb-6 border-b pb-4">Line Item Breakdown</h4>
           {invoice.items.map((item: any, idx: number) => (
             <div key={idx} className="p-6 bg-slate-50 rounded-3xl border border-slate-100 flex justify-between items-center group hover:border-blue-200 transition-all">
                <div className="min-w-0 pr-6 truncate">
                   <p className="text-slate-900 truncate mb-1">{item.name}</p>
                   <p className="text-[10px] text-slate-400">{item.quantity} x ${item.unitPrice.toFixed(2)}</p>
                </div>
                <div className="text-right shrink-0">
                   <p className="text-slate-900 text-sm mb-1">${item.total.toFixed(2)}</p>
                   {item.percentChange !== 0 && (<div className={`flex items-center justify-end text-[9px] ${item.percentChange > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{item.percentChange > 0 ? <TrendingUp size={12} className="mr-1"/> : <TrendingDown size={12} className="mr-1"/>}{Math.abs(item.percentChange).toFixed(1)}%</div>)}
                </div>
             </div>
           ))}
         </div>

         <div className="bg-slate-900 rounded-[2rem] p-8 text-white">
            <h4 className="text-[9px] font-black uppercase text-blue-400 mb-4 tracking-widest">Settlement Intel</h4>
            <div className="grid grid-cols-2 gap-6">
               <div><p className="text-white/40 mb-1">Bank Account</p><p className="text-xs">{invoice.bankAccount || 'N/A'}</p></div>
               <div><p className="text-white/40 mb-1">Credit Terms</p><p className="text-xs">{invoice.creditTerm || 'N/A'}</p></div>
            </div>
         </div>
      </div>
    </div>
  </div>
);

const SupplierEditModal = ({ supplier, onClose, onSave }: any) => {
  const [edited, setEdited] = useState<Supplier>({ ...supplier });
  return (
    <div className="fixed inset-0 z-[400] flex justify-end no-print">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-400">
        <div className="p-10 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <div><h2 className="text-2xl font-black text-slate-900 uppercase tracking-tighter truncate">Vendor Intelligence</h2><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">{supplier.name}</p></div>
          <button onClick={onClose} className="p-2 hover:bg-white rounded-full text-slate-400"><X size={24}/></button>
        </div>
        <div className="p-12 space-y-8 uppercase font-black text-[10px] custom-scrollbar overflow-y-auto">
           <div className="space-y-6">
              <div><label className="text-slate-400 mb-2 block">Official ABN</label><input type="text" value={edited.abn || ''} onChange={e => setEdited({ ...edited, abn: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-4 px-6 text-xs outline-none focus:ring-2 focus:ring-blue-500" /></div>
              <div><label className="text-slate-400 mb-2 block">Bank Settlement Profile</label><input type="text" value={edited.bankAccount || ''} onChange={e => setEdited({ ...edited, bankAccount: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-4 px-6 text-xs outline-none focus:ring-2 focus:ring-blue-500" /></div>
              <div className="grid grid-cols-2 gap-6">
                 <div><label className="text-slate-400 mb-2 block">Contact Phone</label><input type="text" value={edited.tel || ''} onChange={e => setEdited({ ...edited, tel: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-4 px-6 text-xs outline-none focus:ring-2 focus:ring-blue-500" /></div>
                 <div><label className="text-slate-400 mb-2 block">Credit Term</label><input type="text" value={edited.creditTerm || ''} onChange={e => setEdited({ ...edited, creditTerm: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-4 px-6 text-xs outline-none focus:ring-2 focus:ring-blue-500" /></div>
              </div>
              <div><label className="text-slate-400 mb-2 block">Primary Business Email</label><input type="email" value={edited.email || ''} onChange={e => setEdited({ ...edited, email: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-4 px-6 text-xs outline-none focus:ring-2 focus:ring-blue-500" /></div>
              <div><label className="text-slate-400 mb-2 block">Registered Address</label><textarea value={edited.address || ''} onChange={e => setEdited({ ...edited, address: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-4 px-6 text-xs outline-none focus:ring-2 focus:ring-blue-500 h-24 resize-none" /></div>
           </div>
           <button onClick={() => onSave(edited)} className="w-full py-6 bg-slate-900 text-white rounded-[2rem] font-black uppercase text-xs tracking-widest shadow-2xl hover:bg-blue-600 transition-all flex items-center justify-center space-x-3">
              <Save size={18} />
              <span>Update Vault Record</span>
           </button>
        </div>
      </div>
    </div>
  );
};

const MasterRateHistoryModal = ({ item, onClose }: any) => (
  <div className="fixed inset-0 z-[400] flex justify-end no-print">
    <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
    <div className="relative w-full max-w-2xl bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-400">
      <div className="p-10 border-b border-slate-100 flex justify-between items-center bg-slate-50 sticky top-0 z-10">
        <div><h2 className="text-2xl font-black text-slate-900 uppercase tracking-tighter truncate">{item.name}</h2><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Price Movement History</p></div>
        <button onClick={onClose} className="p-2 hover:bg-white rounded-full text-slate-400"><X size={24}/></button>
      </div>
      <div className="flex-1 overflow-y-auto p-12 space-y-12 custom-scrollbar">
         {item.history.map((h: PriceHistoryEntry, idx: number) => (
            <div key={idx} className="flex justify-between items-start border-l-4 border-slate-100 pl-10 pb-12 relative group last:pb-0">
               <div className="w-5 h-5 bg-slate-900 border-4 border-white rounded-full absolute -left-[12px] top-1 shadow-lg group-hover:bg-blue-600 transition-all" />
               <div className="uppercase font-black">
                  <p className="text-2xl text-slate-900 mb-1">${h.price.toFixed(2)}</p>
                  <p className="text-[10px] text-slate-400 mb-2">{new Date(h.date).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}</p>
                  <p className="text-[9px] text-slate-400 bg-slate-50 inline-block px-3 py-1 rounded-full border border-slate-200">{h.note}</p>
               </div>
               {h.variance !== 0 && (
                 <div className={`px-4 py-2 rounded-2xl text-[10px] font-black uppercase shadow-sm ${h.variance > 0 ? 'bg-rose-50 text-rose-600 border border-rose-100' : 'bg-emerald-50 text-emerald-600 border border-emerald-100'}`}>
                    {h.variance > 0 ? '+' : ''}{h.percentChange.toFixed(1)}% Movement
                 </div>
               )}
            </div>
         ))}
      </div>
    </div>
  </div>
);

export default App;
