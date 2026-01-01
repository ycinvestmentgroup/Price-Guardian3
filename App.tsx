
import React, { useState, useEffect, useMemo } from 'react';
import { 
  LayoutDashboard, Upload, History, CheckCircle2, Package, Wallet, 
  Check, ShoppingBag, Trash2, Banknote, CalendarDays, X, Zap, Menu, ShieldCheck, 
  TriangleAlert, Files, ArrowUpRight, Save, History as HistoryIcon,
  Mail, Hash, Image as ImageIcon, BellRing, TrendingDown, TrendingUp, ChevronDown, ChevronRight,
  Info, CreditCard, Clock, PauseCircle, ArrowRight, UserCircle, MapPin, Phone, Download, Printer,
  Square, CheckSquare
} from 'lucide-react';
import { extractInvoiceData } from './services/geminiService.ts';
import { Invoice, User, InvoiceItem, Supplier, MasterItem, PriceHistoryEntry } from './types.ts';

interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
}

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'upload' | 'history' | 'suppliers' | 'items' | 'variances' | 'gst'>('dashboard');
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

  // Initialization & Storage
  useEffect(() => {
    const savedInvoices = localStorage.getItem('pg_invoices');
    const savedMaster = localStorage.getItem('pg_master_rates');
    const savedSuppliers = localStorage.getItem('pg_suppliers');
    if (savedInvoices) setRawInvoices(JSON.parse(savedInvoices));
    if (savedMaster) setMasterItems(JSON.parse(savedMaster));
    if (savedSuppliers) setSuppliers(JSON.parse(savedSuppliers));
  }, []);

  useEffect(() => {
    localStorage.setItem('pg_invoices', JSON.stringify(rawInvoices));
    localStorage.setItem('pg_master_rates', JSON.stringify(masterItems));
    localStorage.setItem('pg_suppliers', JSON.stringify(suppliers));
  }, [rawInvoices, masterItems, suppliers]);

  const addToast = (message: string, type: Toast['type'] = 'info') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 8000);
  };

  /**
   * Price Guardian Comparison Rule:
   * Only compare if the invoice date is >= the baseline date.
   */
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
        
        // Baseline is only valid if invoice isn't an older record
        const baseline = isBackdated ? undefined : master?.currentPrice;
        const diff = baseline !== undefined ? item.unitPrice - baseline : 0;
        const pct = baseline ? (diff / baseline) * 100 : 0;
        
        return { 
          ...item, 
          previousUnitPrice: baseline, 
          priceChange: diff, 
          percentChange: pct 
        } as InvoiceItem;
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
        // Only log variance if it represents a material shift and isn't already synced
        if (item.priceChange !== undefined && Math.abs(item.priceChange) > 0.01) {
          const master = masterItems.find(m => m.supplierName === inv.supplierName && m.name === item.name);
          const isSynced = master && Math.abs(master.currentPrice - item.unitPrice) < 0.001;
          
          if (!isSynced) {
            logs.push({
              key: `${inv.id}-${item.name}`,
              invoiceId: inv.id,
              invoiceNumber: inv.invoiceNumber,
              date: inv.date,
              supplierName: inv.supplierName,
              itemName: item.name,
              oldPrice: item.previousUnitPrice || 0,
              newPrice: item.unitPrice,
              variance: item.priceChange,
              pct: item.percentChange,
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
          allHistory.push({
            ...h,
            itemName: item.name,
            supplierName: item.supplierName,
            masterId: item.id
          });
        }
      });
    });
    return allHistory.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [masterItems]);

  const toggleSelection = (id: string) => {
    setBulkSelection(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleVarianceSelection = (key: string) => {
    setVarianceSelection(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const clearSelection = () => setBulkSelection(new Set());
  const clearVarianceSelection = () => setVarianceSelection(new Set());

  const removeInvoice = (id: string) => {
    setRawInvoices(prev => prev.filter(inv => inv.id !== id));
    setBulkSelection(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    addToast(`Audit record removed.`, 'info');
  };

  const bulkDelete = () => {
    const count = bulkSelection.size;
    setRawInvoices(prev => prev.filter(inv => !bulkSelection.has(inv.id)));
    clearSelection();
    addToast(`Successfully deleted ${count} audit records.`, 'info');
  };

  const updateMasterRate = (supplierName: string, itemName: string, newPrice: number, invoiceNum: string, invDate: string) => {
    setMasterItems(prev => {
      const existingIdx = prev.findIndex(m => m.supplierName === supplierName && m.name === itemName);
      if (existingIdx > -1) {
        const item = prev[existingIdx];
        if (isInvoiceBackdated(invDate, item.lastUpdated)) return prev;

        const variance = newPrice - item.currentPrice;
        const pct = item.currentPrice ? (variance / item.currentPrice) * 100 : 0;
        
        const updated = {
          ...item,
          currentPrice: newPrice,
          lastUpdated: invDate,
          history: [{
            date: invDate,
            price: newPrice,
            variance,
            percentChange: pct,
            source: 'audit' as const,
            invoiceNumber: invoiceNum,
            note: `Market baseline updated from latest audit (Inv #${invoiceNum})`
          }, ...item.history]
        };
        const next = [...prev];
        next[existingIdx] = updated;
        return next;
      } else {
        return [{
          id: `mstr-${Date.now()}`,
          supplierName,
          name: itemName,
          currentPrice: newPrice,
          lastUpdated: invDate,
          history: [{
            date: invDate,
            price: newPrice,
            variance: 0,
            percentChange: 0,
            source: 'audit' as const,
            invoiceNumber: invoiceNum,
            note: 'Initial Registration'
          }]
        }, ...prev];
      }
    });
  };

  const acceptSelectedVariances = () => {
    const count = varianceSelection.size;
    const selected = pendingVariances.filter(v => varianceSelection.has(v.key));
    selected.forEach(v => {
      updateMasterRate(v.supplierName, v.itemName, v.newPrice, v.invoiceNumber, v.date);
    });
    clearVarianceSelection();
    addToast(`Accepted and commited ${count} price variances to baseline registry.`, 'success');
  };

  const bulkMarkStatus = (status: 'paid' | 'hold' | 'outstanding') => {
    setRawInvoices(prev => prev.map(inv => {
      if (bulkSelection.has(inv.id)) {
        return { ...inv, isPaid: status === 'paid', isHold: status === 'hold' };
      }
      return inv;
    }));
    addToast(`Status updated for ${bulkSelection.size} records.`, 'success');
    clearSelection();
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
    link.setAttribute("download", `audit_report_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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
        
        // Basic Metadata Validation
        if (!data.supplierName || !data.invoiceNumber) {
           throw new Error("Audit failed: Key metadata missing from document.");
        }

        const newInvoice: Invoice = {
          ...data,
          id: `inv-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          isPaid: false, isHold: false, status: 'matched', fileName: file.name
        };

        // Supplier Registry Update
        setSuppliers(prev => {
          const existing = prev.find(s => s.name === data.supplierName);
          const supDetails = { bankAccount: data.bankAccount, address: data.address, abn: data.abn, tel: data.tel, email: data.email, creditTerm: data.creditTerm };
          if (existing) return prev.map(s => s.name === data.supplierName ? { ...s, ...supDetails } : s);
          return [...prev, { id: `sup-${Date.now()}`, name: data.supplierName, totalSpent: 0, ...supDetails }];
        });

        // First-time Item Auto-Registration
        setMasterItems(prev => {
          let next = [...prev];
          data.items.forEach((item: any) => {
            const exists = next.find(m => m.supplierName === data.supplierName && m.name === item.name);
            if (!exists) {
              next.push({
                id: `mstr-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                supplierName: data.supplierName,
                name: item.name,
                currentPrice: item.unitPrice,
                lastUpdated: data.date,
                history: [{
                  date: data.date, price: item.unitPrice, variance: 0, percentChange: 0,
                  source: 'audit', invoiceNumber: data.invoiceNumber, note: 'Initial Registration'
                }]
              });
            }
          });
          return next;
        });

        setRawInvoices(prev => [newInvoice, ...prev]);
        addToast(`Successfully Audited: ${data.invoiceNumber}`, 'success');
      } catch (err: any) {
        addToast(`Audit Failed: ${err.message}`, 'error');
      }
    }
    setLoading(false);
    setActiveTab('dashboard');
    event.target.value = '';
  };

  const stats = useMemo(() => {
    const unpaid = enrichedInvoices.filter(i => !i.isPaid && !i.isHold);
    const totalPayable = unpaid.reduce((sum, i) => sum + i.totalAmount, 0);
    const totalGst = enrichedInvoices.reduce((sum, i) => sum + i.gstAmount, 0);
    const supplierOutstanding: Record<string, number> = {};
    unpaid.forEach(inv => {
      supplierOutstanding[inv.supplierName] = (supplierOutstanding[inv.supplierName] || 0) + inv.totalAmount;
    });
    return { totalPayable, totalGst, totalCount: enrichedInvoices.length, supplierOutstanding };
  }, [enrichedInvoices]);

  return (
    <div className="min-h-screen flex bg-slate-50 font-sans text-slate-900 overflow-hidden print:bg-white relative">
      
      {/* High-Impact Toast Notification System */}
      <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[1000] space-y-2 w-full max-w-md px-4 no-print pointer-events-none">
         {toasts.map(t => (
           <div key={t.id} className={`p-4 rounded-2xl shadow-2xl border flex items-start space-x-3 animate-in slide-in-from-top duration-300 pointer-events-auto ${t.type === 'success' ? 'bg-emerald-600 text-white' : t.type === 'warning' ? 'bg-rose-600 text-white' : 'bg-slate-900 text-white'}`}>
              <div className="mt-0.5">{t.type === 'warning' ? <TriangleAlert size={18} /> : t.type === 'success' ? <CheckCircle2 size={18} /> : <Info size={18} />}</div>
              <div className="flex-1">
                <span className="text-[11px] font-black uppercase tracking-tight block mb-0.5">{t.type === 'warning' ? 'Price Guardian Alert' : 'System Sync'}</span>
                <span className="text-[11px] font-medium leading-tight opacity-90">{t.message}</span>
              </div>
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
        </div>
      </nav>

      <main className={`flex-1 overflow-y-auto p-4 lg:p-12 relative h-screen custom-scrollbar transition-all`}>
        <header className="flex justify-between items-center mb-8 no-print sticky top-0 bg-slate-50/90 backdrop-blur-md py-4 z-[80] -mx-4 px-4 lg:-mx-12 lg:px-12">
          <div><h1 className="text-2xl lg:text-3xl font-black text-slate-900 uppercase tracking-tighter">{activeTab.replace('-', ' ')}</h1></div>
          <button onClick={() => setIsSidebarOpen(true)} className="lg:hidden p-2 bg-white rounded-xl shadow-sm border border-slate-200"><Menu size={24} /></button>
        </header>

        <div className="animate-in fade-in duration-500 max-w-7xl mx-auto space-y-10">
          
          {activeTab === 'dashboard' && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                <StatCard label="Total Payable" value={`$${stats.totalPayable.toLocaleString()}`} icon={Wallet} color="blue" />
                <StatCard label="Price Alerts" value={pendingVariances.length} icon={TriangleAlert} color="amber" />
                <StatCard label="Total GST" value={`$${stats.totalGst.toLocaleString()}`} icon={Banknote} color="emerald" />
                <StatCard label="Audited Docs" value={stats.totalCount} icon={Files} color="slate" />
              </div>

              {/* Dynamic Price Alert Hub */}
              {pendingVariances.length > 0 && (
                <div className="bg-slate-900 rounded-[2.5rem] p-8 shadow-2xl border border-slate-800 text-white animate-in slide-in-from-bottom duration-500">
                  <div className="flex items-center justify-between mb-8">
                     <div className="flex items-center space-x-4">
                        <div className="w-10 h-10 bg-amber-500 rounded-xl flex items-center justify-center text-slate-900 shadow-xl shadow-amber-500/20"><BellRing size={20} /></div>
                        <div>
                           <h3 className="font-black uppercase text-sm tracking-widest">Active Procurement Alerts</h3>
                           <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">Shifts detected in your latest audits relative to baseline</p>
                        </div>
                     </div>
                     <button onClick={() => setActiveTab('variances')} className="text-[10px] font-black uppercase text-amber-500 hover:text-amber-400 flex items-center group transition-all">Review Variances <ChevronRight size={14} className="ml-1 group-hover:translate-x-1 transition-transform"/></button>
                  </div>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                     {pendingVariances.slice(0, 4).map((v, i) => (
                       <div key={i} className="bg-slate-800/50 rounded-3xl p-5 border border-slate-700 flex items-center justify-between group hover:bg-slate-800 transition-colors">
                          <div className="min-w-0 flex-1 pr-4">
                             <p className="font-black text-xs uppercase truncate text-white">{v.itemName}</p>
                             <p className="text-[9px] font-bold text-slate-500 uppercase">{v.supplierName} • {v.date}</p>
                          </div>
                          <div className={`text-right ${v.variance > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                             <p className="font-black text-xs">${v.newPrice.toFixed(2)}</p>
                             <div className="flex items-center justify-end text-[9px] font-black uppercase mt-0.5">
                                {v.variance > 0 ? <TrendingUp size={12} className="mr-1"/> : <TrendingDown size={12} className="mr-1"/>}
                                {Math.abs(v.pct).toFixed(1)}%
                             </div>
                          </div>
                       </div>
                     ))}
                  </div>
                </div>
              )}

              <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm p-8">
                 <h3 className="font-black text-slate-900 uppercase text-sm mb-6 flex items-center">
                   <Banknote size={18} className="mr-3 text-blue-600" /> Accounts Payable by Vendor
                 </h3>
                 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {Object.entries(stats.supplierOutstanding).map(([name, amount]) => (
                      <div key={name} className="flex items-center justify-between p-5 bg-slate-50 rounded-3xl border border-slate-100 group hover:border-blue-200 transition-colors">
                         <div className="flex items-center space-x-4">
                            <div className="w-10 h-10 bg-slate-900 text-white rounded-xl flex items-center justify-center font-black text-xs shadow-lg">{name[0]}</div>
                            <span className="font-black text-[11px] uppercase text-slate-900 truncate max-w-[120px]">{name}</span>
                         </div>
                         <span className="font-black text-sm text-slate-900">${amount.toLocaleString()}</span>
                      </div>
                    ))}
                 </div>
              </div>
            </>
          )}

          {activeTab === 'upload' && <UploadView handleFileUpload={handleFileUpload} loading={loading} progress={uploadProgress} />}

          {activeTab === 'variances' && (
            <div className="space-y-10">
              <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden">
                  <div className="p-8 border-b border-slate-100 bg-slate-50/50 flex flex-col md:flex-row justify-between md:items-center gap-4">
                    <div>
                      <h3 className="font-black text-slate-900 uppercase text-sm flex items-center">
                        <TriangleAlert size={18} className="mr-3 text-rose-600" /> Pending Market Acceptance
                      </h3>
                      <p className="text-[10px] font-bold text-slate-400 uppercase mt-1">Accept price shifts to update your anchored master baseline registry</p>
                    </div>
                    {varianceSelection.size > 0 && (
                      <button onClick={acceptSelectedVariances} className="px-6 py-3 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase hover:bg-blue-600 transition-all shadow-xl flex items-center animate-in slide-in-from-right">
                        <Check size={16} className="mr-2" /> Commit {varianceSelection.size} Rates
                      </button>
                    )}
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left min-w-[800px]">
                      <thead>
                        <tr className="bg-slate-50 text-[10px] font-black uppercase text-slate-400 border-b">
                          <th className="px-6 py-5 w-12 text-center">
                            <button onClick={() => {
                              if (varianceSelection.size === pendingVariances.length) clearVarianceSelection();
                              else setVarianceSelection(new Set(pendingVariances.map(v => v.key)));
                            }} className="p-1 hover:bg-slate-200 rounded text-slate-400 transition-colors">
                              {varianceSelection.size > 0 ? <CheckSquare size={16} className="text-blue-600"/> : <Square size={16}/>}
                            </button>
                          </th>
                          <th className="px-6 py-5">Audit Date</th>
                          <th className="px-6 py-5">Ref #</th>
                          <th className="px-6 py-5">Item Identifier</th>
                          <th className="px-6 py-5 text-right">Market Shift</th>
                          <th className="px-6 py-5 text-center">Accept</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {pendingVariances.length === 0 ? (
                          <tr><td colSpan={6} className="py-20 text-center text-slate-400 font-bold uppercase text-[10px]">No pending price variances detected</td></tr>
                        ) : (
                          pendingVariances.map((v) => (
                            <tr key={v.key} className={`hover:bg-slate-50 transition-all ${varianceSelection.has(v.key) ? 'bg-blue-50/50' : ''}`}>
                              <td className="px-6 py-5 w-12 text-center">
                                 <button onClick={() => toggleVarianceSelection(v.key)} className="p-1">
                                   {varianceSelection.has(v.key) ? <CheckSquare size={16} className="text-blue-600"/> : <Square size={16}/>}
                                 </button>
                              </td>
                              <td className="px-6 py-5 text-[10px] font-bold text-slate-500">{v.date}</td>
                              <td className="px-6 py-5 font-bold text-slate-400 text-[10px]">{v.invoiceNumber}</td>
                              <td className="px-6 py-5">
                                 <p className="font-black text-xs text-slate-900 uppercase truncate max-w-[200px]">{v.itemName}</p>
                                 <p className="text-[9px] font-bold text-slate-400 uppercase">{v.supplierName}</p>
                              </td>
                              <td className="px-6 py-5 text-right cursor-pointer" onClick={() => v.masterItemId && setSelectedMasterItemId(v.masterItemId)}>
                                 <p className="font-black text-xs text-slate-900 group-hover:text-blue-600 underline decoration-slate-200 underline-offset-4">${v.newPrice.toFixed(2)}</p>
                                 <div className={`flex items-center justify-end text-[9px] font-black uppercase mt-1 ${v.variance > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                                    {v.variance > 0 ? <TrendingUp size={12} className="mr-1"/> : <TrendingDown size={12} className="mr-1"/>}
                                    {Math.abs(v.pct).toFixed(1)}%
                                 </div>
                              </td>
                              <td className="px-6 py-5 text-center">
                                <button onClick={() => { updateMasterRate(v.supplierName, v.itemName, v.newPrice, v.invoiceNumber, v.date); addToast(`Accepted variance for ${v.itemName}`, 'success'); }} className="p-2 hover:bg-emerald-50 text-slate-400 hover:text-emerald-600 transition-all rounded-xl" title="Quick Sync">
                                  <CheckCircle2 size={18}/>
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
                      <HistoryIcon size={18} className="mr-3 text-blue-600" /> Historical Trend Archive
                    </h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left min-w-[800px]">
                      <thead>
                        <tr className="bg-slate-50 text-[10px] font-black uppercase text-slate-400 border-b">
                          <th className="px-8 py-5">Event Date</th>
                          <th className="px-8 py-5">Audit Ref</th>
                          <th className="px-8 py-5">Item Identifier</th>
                          <th className="px-8 py-5 text-right">Settled Rate</th>
                          <th className="px-8 py-5 text-right">Movement Impact</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {globalVarianceHistory.map((h, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/50 transition-all cursor-pointer" onClick={() => setSelectedMasterItemId(h.masterId)}>
                            <td className="px-8 py-5 text-[10px] font-bold text-slate-500">{new Date(h.date).toLocaleDateString()}</td>
                            <td className="px-8 py-5 font-bold text-slate-400 text-[10px] uppercase">{h.invoiceNumber || 'Manual'}</td>
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
                        ))}
                      </tbody>
                    </table>
                  </div>
              </div>
            </div>
          )}

          {activeTab === 'history' && (
             <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden relative">
                <div className="p-4 lg:p-8 border-b border-slate-100 flex flex-col md:flex-row justify-between items-start md:items-center bg-slate-50/50 gap-4">
                  <div className="flex space-x-2">
                    {['outstanding', 'settled', 'hold'].map(t => (
                      <button key={t} onClick={() => {setHistoryTab(t as any); clearSelection();}} className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase transition-all whitespace-nowrap ${historyTab === t ? 'bg-slate-900 text-white shadow-xl' : 'text-slate-400 hover:bg-slate-200'}`}>{t}</button>
                    ))}
                  </div>
                  {bulkSelection.size > 0 && (
                    <div className="flex items-center space-x-2 animate-in slide-in-from-right">
                       <button onClick={() => bulkMarkStatus('paid')} className="p-2.5 bg-emerald-100 text-emerald-700 rounded-xl hover:bg-emerald-600 hover:text-white transition-all shadow-sm" title="Mark Settled"><CheckCircle2 size={18}/></button>
                       <button onClick={() => bulkMarkStatus('hold')} className="p-2.5 bg-amber-100 text-amber-700 rounded-xl hover:bg-amber-600 hover:text-white transition-all shadow-sm" title="Put on Hold"><PauseCircle size={18}/></button>
                       <button onClick={bulkDelete} className="p-2.5 bg-rose-100 text-rose-700 rounded-xl hover:bg-rose-600 hover:text-white transition-all shadow-sm" title="Delete Selection"><Trash2 size={18}/></button>
                       <div className="w-px h-6 bg-slate-200 mx-2" />
                       <button onClick={exportSelectedToCSV} className="p-2.5 bg-blue-100 text-blue-700 rounded-xl hover:bg-blue-600 hover:text-white transition-all shadow-sm" title="Export CSV"><Download size={18}/></button>
                       <button onClick={clearSelection} className="p-2.5 bg-slate-200 text-slate-700 rounded-xl hover:bg-slate-900 hover:text-white transition-all" title="Clear All"><X size={18}/></button>
                    </div>
                  )}
                </div>
                <div className="overflow-x-auto">
                   <table className="w-full text-left min-w-[700px]">
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
                              if (bulkSelection.size === filtered.length) clearSelection();
                              else setBulkSelection(new Set(filtered.map(f => f.id)));
                            }} className="p-1 hover:bg-slate-200 rounded text-slate-400">
                              {bulkSelection.size > 0 ? <CheckSquare size={16} className="text-blue-600"/> : <Square size={16}/>}
                            </button>
                          </th>
                          <th className="px-6 py-5">Audit Status</th>
                          <th className="px-6 py-5">Vendor</th>
                          <th className="px-6 py-5">Ref #</th>
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
                          <tr key={inv.id} className={`hover:bg-slate-50 transition-all cursor-pointer ${bulkSelection.has(inv.id) ? 'bg-blue-50/50' : ''}`} onClick={(e) => {
                            if ((e.target as HTMLElement).closest('.checkbox-zone')) return;
                            setSelectedInvoiceId(inv.id);
                          }}>
                            <td className="px-6 py-5 w-12 text-center checkbox-zone">
                               <button onClick={(e) => { e.stopPropagation(); toggleSelection(inv.id); }} className="p-1">
                                 {bulkSelection.has(inv.id) ? <CheckSquare size={16} className="text-blue-600"/> : <Square size={16}/>}
                               </button>
                            </td>
                            <td className="px-6 py-5"><AuditBadge status={inv.status} hold={inv.isHold} /></td>
                            <td className="px-6 py-5 font-black text-slate-900 text-xs uppercase truncate max-w-[150px]">{inv.supplierName}</td>
                            <td className="px-6 py-5 font-bold text-slate-400 text-[10px]">{inv.invoiceNumber}</td>
                            <td className="px-6 py-5 text-right font-black text-slate-900 text-xs">${inv.totalAmount.toFixed(2)}</td>
                            <td className="px-6 py-5 text-center checkbox-zone">
                               <button onClick={(e) => { e.stopPropagation(); removeInvoice(inv.id); }} className="p-2 text-slate-400 hover:text-rose-600 transition-colors" title="Remove Record">
                                 <Trash2 size={16} />
                               </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                   </table>
                </div>
             </div>
          )}

          {activeTab === 'items' && (
            <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden">
               <div className="p-8 border-b border-slate-100 bg-slate-50/50"><h3 className="font-black text-slate-900 uppercase text-sm">Master Baseline Registry</h3></div>
               <div className="overflow-x-auto">
                <table className="w-full text-left min-w-[700px]">
                  <thead>
                    <tr className="bg-slate-50 text-[10px] font-black uppercase text-slate-400 border-b">
                      <th className="px-8 py-5">Item Descriptor</th>
                      <th className="px-8 py-5">Vendor</th>
                      <th className="px-8 py-5">Baseline Price</th>
                      <th className="px-8 py-5">Anchored Date</th>
                      <th className="px-8 py-5 text-right">History</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {masterItems.map(item => (
                      <tr key={item.id} className="hover:bg-slate-50 transition-all">
                        <td className="px-8 py-5 font-black text-slate-900 text-xs uppercase">{item.name}</td>
                        <td className="px-8 py-5 font-bold text-slate-500 text-[10px] uppercase">{item.supplierName}</td>
                        <td className="px-8 py-5 font-black text-slate-900 text-xs">${item.currentPrice.toFixed(2)}</td>
                        <td className="px-8 py-5 font-bold text-slate-400 text-[10px]">{new Date(item.lastUpdated).toLocaleDateString()}</td>
                        <td className="px-8 py-5 text-right">
                          <button onClick={() => setSelectedMasterItemId(item.id)} className="p-2 hover:bg-slate-200 rounded-xl text-blue-600 ml-auto transition-transform active:scale-90"><HistoryIcon size={18} /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
               </div>
            </div>
          )}

          {activeTab === 'suppliers' && (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {suppliers.map(sup => (
                <div key={sup.id} className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm hover:shadow-md transition-all group relative overflow-hidden flex flex-col h-full">
                   <div className="flex justify-between items-start mb-6">
                      <div className="w-14 h-14 bg-slate-900 text-white rounded-2xl flex items-center justify-center font-black text-2xl shadow-xl">{sup.name[0]}</div>
                      <button onClick={() => setSelectedSupplierId(sup.id)} className="p-3 bg-blue-50 text-blue-600 rounded-xl shadow-sm hover:bg-blue-600 hover:text-white transition-all"><Save size={20}/></button>
                   </div>
                   <h3 className="font-black text-slate-900 uppercase text-lg mb-4 truncate">{sup.name}</h3>
                   <div className="space-y-4 border-t border-slate-100 pt-6 flex-1">
                      <div className="flex items-start text-[11px] text-slate-500 font-bold uppercase"><Hash size={14} className="mr-3 mt-0.5 opacity-40 shrink-0" /> <span className="text-slate-900 truncate">{sup.abn || 'ABN Not Registered'}</span></div>
                      <div className="flex items-start text-[11px] text-slate-500 font-bold uppercase"><Mail size={14} className="mr-3 mt-0.5 opacity-40 shrink-0" /> <span className="text-slate-900 truncate">{sup.email || 'Email Not Recorded'}</span></div>
                      <div className="flex items-start text-[11px] text-slate-500 font-bold uppercase"><Phone size={14} className="mr-3 mt-0.5 opacity-40 shrink-0" /> <span className="text-slate-900 truncate">{sup.tel || 'No Contact Number'}</span></div>
                      <div className="flex items-start text-[11px] text-slate-500 font-bold uppercase"><Clock size={14} className="mr-3 mt-0.5 opacity-40 shrink-0" /> <span className="text-slate-900">{sup.creditTerm || 'Terms Not Specified'}</span></div>
                      <div className="flex items-start text-[11px] text-slate-500 font-bold uppercase"><MapPin size={14} className="mr-3 mt-0.5 opacity-40 shrink-0" /> <span className="text-slate-900 line-clamp-2 leading-relaxed">{sup.address || 'Address Not Provided'}</span></div>
                   </div>
                   <div className="mt-6 pt-6 border-t border-slate-100 bg-slate-50 -mx-8 -mb-8 p-6">
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Settlement Intel</p>
                      <div className="flex items-center text-slate-900"><CreditCard size={14} className="mr-3 opacity-40" /> <span className="text-xs font-black uppercase truncate">{sup.bankAccount || 'Bank Details Pending'}</span></div>
                   </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'gst' && <GSTRecordsView invoices={enrichedInvoices} />}
        </div>

        {selectedInvoiceId && <InvoiceDetailModal invoice={enrichedInvoices.find(i => i.id === selectedInvoiceId)!} onClose={() => setSelectedInvoiceId(null)} />}
        {selectedSupplierId && <SupplierEditModal supplier={suppliers.find(s => s.id === selectedSupplierId)!} onClose={() => setSelectedSupplierId(null)} onSave={(updated: Supplier) => { setSuppliers(prev => prev.map(s => s.id === updated.id ? updated : s)); addToast(`Updated vendor intel for ${updated.name}`, 'success'); setSelectedSupplierId(null); }} />}
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
        <div key={month} className="bg-white rounded-[2rem] border border-slate-200 overflow-hidden shadow-sm">
           <div className="px-8 py-6 bg-slate-900 text-white flex justify-between items-center">
              <h4 className="font-black uppercase text-sm tracking-widest flex items-center"><CalendarDays size={18} className="mr-3 text-blue-400" /> {new Date(month).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h4>
              <p className="text-2xl font-black text-emerald-400">${data.totalMonthGst.toFixed(2)}</p>
           </div>
           <div className="p-4 overflow-x-auto">
              <table className="w-full text-[10px] uppercase font-black text-slate-400">
                 <thead><tr className="border-b border-slate-100"><th className="px-6 py-4 text-left">Vendor Entity</th><th className="px-6 py-4 text-right">GST Portion</th><th className="px-6 py-4 text-right">Gross Total</th></tr></thead>
                 <tbody className="divide-y divide-slate-50">
                    {Object.entries(data.suppliers).map(([name, vals]: [string, any]) => (
                      <tr key={name} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-5 text-slate-900 font-black">{name}</td>
                        <td className="px-6 py-5 text-right text-emerald-600">${vals.gst.toFixed(2)}</td>
                        <td className="px-6 py-5 text-right text-slate-900">${vals.total.toFixed(2)}</td>
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

const NavItem = ({ active, onClick, icon: Icon, label, alertCount }: any) => (
  <button onClick={onClick} className={`w-full flex items-center space-x-4 px-6 py-4 rounded-2xl transition-all relative ${active ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' : 'text-slate-400 hover:bg-slate-800'}`}>
    <Icon size={20} />
    <span className="font-bold text-sm tracking-tight">{label}</span>
    {alertCount > 0 && <span className="absolute right-6 bg-rose-600 text-white w-5 h-5 rounded-full text-[10px] font-black flex items-center justify-center border-2 border-slate-900 animate-pulse">{alertCount}</span>}
  </button>
);

const StatCard = ({ label, value, icon: Icon, color }: any) => {
  const c: any = { blue: 'text-blue-600 bg-blue-50', amber: 'text-rose-600 bg-rose-50', emerald: 'text-emerald-600 bg-emerald-50', slate: 'text-slate-600 bg-slate-50' };
  return (
    <div className="bg-white p-6 rounded-[2.5rem] border border-slate-200 shadow-sm transition-transform hover:scale-[1.02]">
      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-4 ${c[color]}`}><Icon size={24} /></div>
      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{label}</p>
      <h3 className="text-2xl font-black text-slate-900 truncate">{value}</h3>
    </div>
  );
};

const AuditBadge = ({ status, hold }: { status: string, hold?: boolean }) => {
  const config: any = {
    matched: { bg: 'bg-emerald-50 text-emerald-700', icon: CheckCircle2, text: 'Clear' },
    price_increase: { bg: 'bg-rose-50 text-rose-700', icon: TriangleAlert, text: 'Hike' },
    price_decrease: { bg: 'bg-blue-50 text-blue-700', icon: TrendingDown, text: 'Saving' },
    mixed: { bg: 'bg-amber-50 text-amber-700', icon: TriangleAlert, text: 'Mixed' },
    new_supplier: { bg: 'bg-slate-100 text-slate-700', icon: Package, text: 'Initial' }
  };
  const s = hold ? { bg: 'bg-slate-900 text-white', icon: PauseCircle, text: 'Hold' } : config[status];
  const Icon = s.icon;
  return (
    <div className={`flex items-center space-x-2 px-3 py-1.5 rounded-full w-fit whitespace-nowrap shadow-sm border border-black/5 ${s.bg}`}>
      <Icon size={12} /><span className="text-[9px] font-black uppercase tracking-widest">{s.text}</span>
    </div>
  );
};

const UploadView = ({ handleFileUpload, loading, progress }: any) => (
  <div className="max-w-4xl mx-auto py-10 lg:py-20 text-center animate-in fade-in duration-500 no-print px-4">
    <div className="w-20 h-20 lg:w-24 lg:h-24 bg-blue-600 text-white rounded-[2rem] flex items-center justify-center mx-auto mb-10 shadow-2xl shadow-blue-500/30"><Upload size={40} /></div>
    <h2 className="text-3xl lg:text-4xl font-black text-slate-900 uppercase tracking-tighter mb-4 leading-none">Intelligence Ingestion</h2>
    <p className="text-slate-400 font-bold mb-12 uppercase tracking-widest text-[10px] lg:text-sm max-w-lg mx-auto">Upload PDF invoices. Price Guardian automatically audits against your anchored baseline registry.</p>
    <label className="group relative block cursor-pointer">
      <div className="border-4 border-dashed border-slate-200 rounded-[2.5rem] lg:rounded-[4rem] p-12 lg:p-24 transition-all group-hover:border-blue-500 group-hover:bg-blue-50 shadow-sm">
        <p className="text-slate-400 font-black uppercase text-[10px] lg:text-xs tracking-widest">Drag & Drop files here</p>
      </div>
      <input type="file" className="hidden" onChange={handleFileUpload} accept="application/pdf,image/*" multiple />
    </label>
  </div>
);

const InvoiceDetailModal = ({ invoice, onClose }: any) => (
  <div className="fixed inset-0 z-[400] flex justify-end no-print">
    <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
    <div className="relative w-full max-w-2xl bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
      <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50 sticky top-0 z-10">
        <div><h2 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">Audit Node</h2><p className="text-[10px] font-black text-slate-400 uppercase truncate">Ref: {invoice.invoiceNumber}</p></div>
        <button onClick={onClose} className="p-3 hover:bg-white rounded-full transition-all text-slate-400"><X size={24}/></button>
      </div>
      <div className="flex-1 overflow-y-auto p-10 space-y-10 custom-scrollbar text-xs uppercase font-black">
         <div className="grid grid-cols-2 gap-8">
            <div><p className="text-slate-400 mb-1">Audit Source</p><p className="text-lg leading-tight">{invoice.supplierName}</p></div>
            <div className="text-right"><p className="text-slate-400 mb-1">Settled Liability</p><p className="text-3xl">${invoice.totalAmount.toFixed(2)}</p></div>
         </div>
         <div className="space-y-4">
           {invoice.items.map((item: any, idx: number) => (
             <div key={idx} className="p-5 bg-slate-50 rounded-3xl border border-slate-100 flex justify-between items-center">
                <div className="min-w-0 pr-4 truncate">
                   <p className="text-slate-900 truncate">{item.name}</p>
                   <p className="text-[10px] text-slate-400">{item.quantity} x ${item.unitPrice.toFixed(2)}</p>
                </div>
                <div className="text-right shrink-0">
                   <p className="text-slate-900">${item.total.toFixed(2)}</p>
                   {item.percentChange !== 0 && (<div className={`flex items-center text-[9px] mt-1 ${item.percentChange > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{item.percentChange > 0 ? <TrendingUp size={12} className="mr-1"/> : <TrendingDown size={12} className="mr-1"/>}{Math.abs(item.percentChange).toFixed(1)}%</div>)}
                </div>
             </div>
           ))}
         </div>
      </div>
    </div>
  </div>
);

const SupplierEditModal = ({ supplier, onClose, onSave }: { supplier: Supplier, onClose: () => void, onSave: (updated: Supplier) => void }) => {
  const [edited, setEdited] = useState<Supplier>({ ...supplier });
  return (
    <div className="fixed inset-0 z-[400] flex justify-end no-print">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
        <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50 sticky top-0 z-10">
          <div><h2 className="text-2xl font-black text-slate-900 uppercase tracking-tighter truncate">Vendor Intelligence</h2><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{supplier.name}</p></div>
          <button onClick={onClose} className="p-2 hover:bg-white rounded-full text-slate-400"><X size={24}/></button>
        </div>
        <div className="flex-1 overflow-y-auto p-10 space-y-8 custom-scrollbar">
           <div className="grid grid-cols-1 gap-6">
              <div>
                <label className="text-[9px] font-black text-slate-500 uppercase mb-2 block">Official Trade Name</label>
                <input type="text" value={edited.name} onChange={e => setEdited({ ...edited, name: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Vendor Name" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-[9px] font-black text-slate-500 uppercase mb-2 block">ABN / Tax ID</label>
                  <input type="text" value={edited.abn || ''} onChange={e => setEdited({ ...edited, abn: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none" placeholder="ABN" />
                </div>
                <div>
                  <label className="text-[9px] font-black text-slate-500 uppercase mb-2 block">Credit Term</label>
                  <input type="text" value={edited.creditTerm || ''} onChange={e => setEdited({ ...edited, creditTerm: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none" placeholder="e.g. NET 30" />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-[9px] font-black text-slate-500 uppercase mb-2 block">Email Address</label>
                  <input type="email" value={edited.email || ''} onChange={e => setEdited({ ...edited, email: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none" placeholder="email@vendor.com" />
                </div>
                <div>
                  <label className="text-[9px] font-black text-slate-500 uppercase mb-2 block">Contact Number</label>
                  <input type="text" value={edited.tel || ''} onChange={e => setEdited({ ...edited, tel: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Phone Number" />
                </div>
              </div>
              <div>
                <label className="text-[9px] font-black text-slate-500 uppercase mb-2 block">Business Address</label>
                <textarea value={edited.address || ''} onChange={e => setEdited({ ...edited, address: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none h-24 resize-none" placeholder="Full Address" />
              </div>
              <div>
                <label className="text-[9px] font-black text-slate-500 uppercase mb-2 block">Bank Settlement Details</label>
                <input type="text" value={edited.bankAccount || ''} onChange={e => setEdited({ ...edited, bankAccount: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none" placeholder="BSB & Account Number" />
              </div>
           </div>
           <button onClick={() => onSave(edited)} className="w-full py-5 bg-slate-900 text-white rounded-2xl font-black uppercase text-[10px] hover:bg-slate-800 transition-all flex items-center justify-center space-x-2"><Save size={16} /><span>Update Provider Profile</span></button>
        </div>
      </div>
    </div>
  );
};

const MasterRateHistoryModal = ({ item, onClose }: any) => (
  <div className="fixed inset-0 z-[400] flex justify-end no-print">
    <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
    <div className="relative w-full max-w-2xl bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
      <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50 sticky top-0 z-10">
        <div><h2 className="text-2xl font-black text-slate-900 uppercase tracking-tighter truncate">{item.name}</h2></div>
        <button onClick={onClose} className="p-2 hover:bg-white rounded-full text-slate-400"><X size={24}/></button>
      </div>
      <div className="flex-1 overflow-y-auto p-10 space-y-12">
         {item.history.map((h: PriceHistoryEntry, idx: number) => (
            <div key={idx} className="flex justify-between items-start border-l-2 border-slate-100 pl-6 pb-6 relative">
               <div className="w-3 h-3 bg-slate-900 rounded-full absolute -left-[7px] top-1" />
               <div className="uppercase font-black">
                  <p className="text-lg text-slate-900">${h.price.toFixed(2)}</p>
                  <p className="text-[10px] text-slate-400 mt-1">{new Date(h.date).toLocaleDateString()}</p>
               </div>
               {h.variance !== 0 && (<div className={`px-3 py-1 rounded-full text-[9px] font-black uppercase ${h.variance > 0 ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'}`}>{h.variance > 0 ? '+' : ''}{h.percentChange.toFixed(1)}%</div>)}
            </div>
         ))}
      </div>
    </div>
  </div>
);

export default App;
