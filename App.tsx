import React, { useState, useEffect, useMemo } from 'react';
import { 
  LayoutDashboard, 
  Upload, 
  TrendingUp, 
  TrendingDown,
  History,
  CheckCircle2,
  Package,
  Wallet,
  FileDown,
  PlusCircle,
  Check,
  ShoppingBag,
  Trash2,
  Phone,
  Banknote,
  CalendarDays,
  X,
  Zap,
  Menu,
  ShieldCheck,
  Lock,
  Info,
  TriangleAlert,
  Files,
  ArrowUpRight,
  Target
} from 'lucide-react';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer 
} from 'recharts';
import { extractInvoiceData } from './services/geminiService.ts';
import { Invoice, User, InvoiceItem } from './types.ts';

// Default user for direct access
const DEFAULT_USER: User = {
  id: 'admin-001',
  name: 'Master Auditor',
  email: 'admin@priceguardian.ai',
  avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=facearea&facepad=2&w=256&h=256&q=80',
  role: 'Senior Procurement Auditor',
  organization: 'Acme Supply Chain Solutions',
  lastLogin: new Date().toLocaleString(),
  is2FAEnabled: true
};

interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
}

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'upload' | 'history' | 'suppliers' | 'items' | 'gst' | 'profile'>('dashboard');
  const [historyTab, setHistoryTab] = useState<'outstanding' | 'settled' | 'hold'>('outstanding');
  const [rawInvoices, setRawInvoices] = useState<Invoice[]>([]);
  const [priceBaselines, setPriceBaselines] = useState<Record<string, Record<string, number>>>({}); 
  const [loading, setLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string>('');
  const [user] = useState<User>(DEFAULT_USER);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Load Data
  useEffect(() => {
    const savedInvoices = localStorage.getItem('pg_invoices');
    const savedBaselines = localStorage.getItem('pg_baselines');
    if (savedInvoices) setRawInvoices(JSON.parse(savedInvoices));
    if (savedBaselines) setPriceBaselines(JSON.parse(savedBaselines));
  }, []);

  // Save Data
  useEffect(() => {
    localStorage.setItem('pg_invoices', JSON.stringify(rawInvoices));
    localStorage.setItem('pg_baselines', JSON.stringify(priceBaselines));
  }, [rawInvoices, priceBaselines]);

  const addToast = (message: string, type: Toast['type'] = 'info') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 6000);
  };

  // Advanced Price Variance Logic
  const enrichedInvoices = useMemo(() => {
    return rawInvoices.map((inv) => {
      const itemsWithVariances = inv.items.map((item) => {
        const baseline = priceBaselines[inv.supplierName]?.[item.name];
        const diff = baseline !== undefined ? item.unitPrice - baseline : 0;
        const pct = baseline ? (diff / baseline) * 100 : 0;

        return {
          ...item,
          previousUnitPrice: baseline,
          priceChange: diff,
          percentChange: pct,
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
  }, [rawInvoices, priceBaselines]);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    if (!process.env.API_KEY) {
      addToast("API Key not found in environment. Please configure Vercel Environment Variables.", "error");
      return;
    }

    setLoading(true);
    const fileArray: File[] = Array.from(files);
    
    for (const file of fileArray) {
      setUploadProgress(`Auditing ${file.name}...`);
      try {
        const reader = new FileReader();
        const base64Promise = new Promise<string>((resolve) => {
          reader.onload = () => resolve((reader.result as string).split(',')[1]);
          reader.readAsDataURL(file);
        });

        const base64 = await base64Promise;
        // Sanitize mime type: default to PDF if unidentified
        const mimeType = file.type || 'application/pdf';
        const data = await extractInvoiceData(base64, mimeType);
        
        const newInvoice: Invoice = {
          ...data,
          id: `inv-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          isPaid: false,
          isHold: false,
          status: 'matched',
          fileName: file.name
        };

        setPriceBaselines(prev => {
          const supplierBaselines = { ...(prev[data.supplierName] || {}) };
          let changed = false;
          data.items.forEach((item: { name: string; unitPrice: number }) => {
            if (supplierBaselines[item.name] === undefined) {
              supplierBaselines[item.name] = item.unitPrice;
              changed = true;
            }
          });
          return changed ? { ...prev, [data.supplierName]: supplierBaselines } : prev;
        });

        setRawInvoices(prev => [newInvoice, ...prev]);
        addToast(`Success: ${file.name} audited.`, 'success');
      } catch (err: any) {
        addToast(`Audit Failed: ${err.message}`, 'error');
        console.error("Audit error details:", err);
      }
    }

    setLoading(false);
    setUploadProgress('');
    setActiveTab('history');
    // Reset input
    event.target.value = '';
  };

  const handleUpdateBaseline = (supplier: string, item: string, newPrice: number) => {
    setPriceBaselines(prev => ({
      ...prev,
      [supplier]: {
        ...prev[supplier],
        [item]: newPrice
      }
    }));
    addToast(`Master rate updated for ${item}`, 'success');
  };

  const deleteInvoice = (id: string) => {
    if (confirm("Permanently discard this audit log?")) {
      setRawInvoices(prev => prev.filter(i => i.id !== id));
      addToast("Log removed", "info");
      setSelectedInvoiceId(null);
    }
  };

  const stats = useMemo(() => {
    const unpaid = enrichedInvoices.filter(i => !i.isPaid && !i.isHold);
    const totalPayable = unpaid.reduce((sum, i) => sum + i.totalAmount, 0);
    const variances = enrichedInvoices.filter(i => (i.status === 'price_increase' || i.status === 'mixed') && !i.isPaid).length;
    const totalGst = enrichedInvoices.reduce((sum, i) => sum + i.gstAmount, 0);

    return { totalPayable, variances, totalGst, totalCount: enrichedInvoices.length };
  }, [enrichedInvoices]);

  const trendData = useMemo(() => {
    return enrichedInvoices
      .slice(0, 10)
      .reverse()
      .map(inv => ({
        date: inv.date.split('-').slice(1).join('/'),
        total: inv.totalAmount,
        variance: inv.items.reduce((sum, item) => sum + (item.priceChange || 0), 0)
      }));
  }, [enrichedInvoices]);

  const masterItemsList = useMemo(() => {
    const itemsMap: Record<string, { name: string; lastPrice: number; baselinePrice: number; suppliers: Set<string> }> = {};
    enrichedInvoices.forEach(inv => {
      inv.items.forEach(item => {
        if (!itemsMap[item.name]) {
          itemsMap[item.name] = { 
            name: item.name, 
            lastPrice: item.unitPrice, 
            baselinePrice: priceBaselines[inv.supplierName]?.[item.name] || item.unitPrice,
            suppliers: new Set([inv.supplierName]) 
          };
        } else {
          itemsMap[item.name].suppliers.add(inv.supplierName);
        }
      });
    });
    return Object.values(itemsMap);
  }, [enrichedInvoices, priceBaselines]);

  const suppliersList = useMemo(() => {
    const sMap: Record<string, { name: string; invoiceCount: number; totalVolume: number; latestDate: string; abn?: string; tel?: string; email?: string }> = {};
    enrichedInvoices.forEach(inv => {
      if (!sMap[inv.supplierName]) {
        sMap[inv.supplierName] = { 
          name: inv.supplierName, 
          invoiceCount: 0, 
          totalVolume: 0, 
          latestDate: inv.date,
          abn: inv.abn,
          tel: inv.tel,
          email: inv.email
        };
      }
      sMap[inv.supplierName].invoiceCount++;
      sMap[inv.supplierName].totalVolume += inv.totalAmount;
      if (new Date(inv.date) > new Date(sMap[inv.supplierName].latestDate)) {
        sMap[inv.supplierName].latestDate = inv.date;
      }
    });
    return Object.values(sMap).sort((a, b) => b.totalVolume - a.totalVolume);
  }, [enrichedInvoices]);

  const NavItem = ({ id, icon: Icon, label, alertCount }: any) => (
    <button 
      onClick={() => { setActiveTab(id); setIsSidebarOpen(false); }}
      className={`w-full flex items-center space-x-4 px-6 py-4 rounded-2xl transition-all duration-200 group relative ${activeTab === id ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
    >
      <Icon size={20} />
      <span className="font-bold text-sm tracking-tight">{label}</span>
      {alertCount > 0 && <span className="absolute right-6 bg-red-500 text-white w-5 h-5 rounded-full text-[10px] font-black flex items-center justify-center border-2 border-slate-900">{alertCount}</span>}
    </button>
  );

  return (
    <div className="min-h-screen flex bg-slate-50 font-sans text-slate-900 overflow-hidden">
      
      {/* Toast Notification */}
      <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[300] space-y-2 w-full max-w-sm px-4">
         {toasts.map(t => (
           <div key={t.id} className={`p-4 rounded-2xl shadow-2xl border flex items-center space-x-3 animate-in slide-in-from-top duration-300 ${t.type === 'success' ? 'bg-emerald-600 border-emerald-400 text-white' : t.type === 'error' ? 'bg-rose-600 border-rose-400 text-white' : 'bg-slate-900 border-slate-700 text-white'}`}>
              <Info size={18}/>
              <span className="text-xs font-bold uppercase tracking-tight">{t.message}</span>
           </div>
         ))}
      </div>

      {/* Navigation Sidebar */}
      <nav className={`w-72 bg-slate-900 text-slate-400 flex flex-col shrink-0 fixed inset-y-0 left-0 lg:sticky lg:top-0 h-screen z-[100] shadow-2xl transition-transform duration-300 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        <div className="p-10 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-xl">
              <ShieldCheck size={24} />
            </div>
            <span className="text-xl font-black text-white tracking-tighter uppercase">Guardian</span>
          </div>
          <button onClick={() => setIsSidebarOpen(false)} className="lg:hidden text-white"><X size={20}/></button>
        </div>

        <div className="flex-1 px-4 space-y-2 overflow-y-auto custom-scrollbar">
          <NavItem id="dashboard" icon={LayoutDashboard} label="Audit Pulse" />
          <NavItem id="upload" icon={Upload} label="Ingest PDF" />
          <NavItem id="history" icon={History} label="Audit Logs" alertCount={stats.variances} />
          <NavItem id="items" icon={ShoppingBag} label="Master Rates" />
          <NavItem id="suppliers" icon={Package} label="Vendors" />
          <NavItem id="gst" icon={Banknote} label="Tax Registry" />
        </div>

        <div className="p-6 mt-auto border-t border-slate-800">
           <button onClick={() => setActiveTab('profile')} className="w-full flex items-center space-x-3 hover:bg-slate-800 p-3 rounded-2xl transition-all">
              <img src={user.avatar} className="w-10 h-10 rounded-full border-2 border-slate-700" alt="User" />
              <div className="text-left">
                <p className="text-sm font-bold text-white leading-tight">{user.name}</p>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{user.role}</p>
              </div>
           </button>
        </div>
      </nav>

      <main className="flex-1 overflow-y-auto p-6 lg:p-12 relative h-screen">
        <header className="flex justify-between items-center mb-10">
          <div>
            <h1 className="text-3xl font-black text-slate-900 uppercase tracking-tighter">{activeTab.replace('-', ' ')}</h1>
            <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-1">Audit Mode: {user.organization}</p>
          </div>
          <div className="flex items-center space-x-4">
            <button className="hidden sm:flex items-center space-x-2 px-4 py-2 bg-white rounded-xl shadow-sm border border-slate-200 text-xs font-bold uppercase tracking-widest text-slate-600">
              <CalendarDays size={16}/>
              <span>{new Date().toLocaleDateString()}</span>
            </button>
            <button onClick={() => setIsSidebarOpen(true)} className="lg:hidden p-2 bg-white rounded-xl shadow-sm border border-slate-200">
              <Menu size={24} />
            </button>
          </div>
        </header>

        <div className="animate-in fade-in duration-500">
          {activeTab === 'dashboard' && (
            <div className="space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
                <StatCard label="Audit Liability" value={`$${stats.totalPayable.toLocaleString()}`} icon={Wallet} color="blue" />
                <StatCard label="Price Variances" value={stats.variances} icon={TriangleAlert} color="amber" sub="Detected Price Hikes" />
                <StatCard label="GST Recorded" value={`$${stats.totalGst.toLocaleString()}`} icon={Banknote} color="emerald" />
                <StatCard label="Total Documents" value={stats.totalCount} icon={Files} color="slate" />
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
                <div className="xl:col-span-2 bg-white rounded-3xl p-8 border border-slate-200 shadow-sm flex flex-col">
                  <div className="flex justify-between items-center mb-6">
                    <div>
                      <h3 className="font-black text-slate-900 uppercase tracking-tight">Variance Trend Pulse</h3>
                      <p className="text-[10px] font-bold text-slate-400 uppercase">Average spend & deviation across last 10 audits</p>
                    </div>
                  </div>
                  <div className="flex-1 h-[300px]">
                    {trendData.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={trendData}>
                          <defs>
                            <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1}/>
                              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                          <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#94a3b8'}} dy={10} />
                          <YAxis axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#94a3b8'}} />
                          <Tooltip 
                            contentStyle={{borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontSize: '12px'}} 
                            cursor={{stroke: '#3b82f6', strokeWidth: 2}}
                          />
                          <Area type="monotone" dataKey="total" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorTotal)" />
                        </AreaChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex items-center justify-center h-full text-slate-300 font-bold uppercase text-xs italic">No trend data available. Ingest documents to populate.</div>
                    )}
                  </div>
                </div>

                <div className="bg-slate-900 text-white rounded-3xl p-8 shadow-2xl relative overflow-hidden flex flex-col justify-between">
                  <div className="absolute top-0 right-0 p-8 opacity-10"><Zap size={100} /></div>
                  <div>
                    <h3 className="font-black text-xl uppercase tracking-tighter mb-4 relative z-10">AI Intake</h3>
                    <p className="text-slate-400 text-sm mb-8 relative z-10 leading-relaxed">Drop your procurement PDFs here. Gemini 3 will map line items to your master baseline in real-time.</p>
                  </div>
                  <label className="block relative z-10 group cursor-pointer">
                    <div className="bg-blue-600 hover:bg-blue-500 text-white p-4 rounded-2xl flex items-center justify-center space-x-3 transition-all font-black text-xs uppercase tracking-widest shadow-lg shadow-blue-900/40">
                      <Upload size={18} />
                      <span>Ingest Documents</span>
                    </div>
                    <input type="file" className="hidden" onChange={handleFileUpload} accept="application/pdf,image/*" multiple />
                  </label>
                </div>
              </div>

              {/* Recent Discrepancy List */}
              <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="font-black text-slate-900 uppercase tracking-tight">High Risk Variances</h3>
                  <button onClick={() => setActiveTab('history')} className="text-xs font-bold text-blue-600 hover:underline uppercase">Audit History</button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {enrichedInvoices.filter(i => i.status === 'price_increase' || i.status === 'mixed').slice(0, 6).map(inv => (
                    <div key={inv.id} className="p-5 bg-slate-50 rounded-2xl border border-slate-100 hover:bg-slate-100 transition-all cursor-pointer" onClick={() => setSelectedInvoiceId(inv.id)}>
                      <div className="flex justify-between items-start mb-3">
                        <AuditBadge status={inv.status} />
                        <span className="text-[10px] font-mono text-slate-400 uppercase">{inv.date}</span>
                      </div>
                      <p className="font-black text-slate-900 text-sm truncate uppercase tracking-tight">{inv.supplierName}</p>
                      <div className="flex justify-between items-end mt-4 pt-4 border-t border-slate-200">
                        <div className="text-[10px] font-bold text-slate-400 uppercase">Inv: {inv.invoiceNumber}</div>
                        <div className="text-sm font-black text-slate-900">${inv.totalAmount.toFixed(2)}</div>
                      </div>
                    </div>
                  ))}
                  {stats.variances === 0 && (
                    <div className="col-span-full py-10 text-center text-slate-300 font-bold uppercase text-xs italic">No high-risk variances found in recent audits.</div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'upload' && <UploadView handleFileUpload={handleFileUpload} loading={loading} progress={uploadProgress} />}

          {activeTab === 'history' && (
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                <div className="flex space-x-2">
                  {['outstanding', 'settled', 'hold'].map(t => (
                    <button key={t} onClick={() => setHistoryTab(t as any)} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase transition-all ${historyTab === t ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-400 hover:text-slate-600'}`}>{t}</button>
                  ))}
                </div>
                <button className="p-2 border border-slate-200 rounded-xl hover:bg-white transition-all"><FileDown size={18}/></button>
              </div>
              <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-slate-50/50 text-[10px] font-black uppercase text-slate-400 border-b">
                      <th className="px-8 py-5">Audit Identity</th>
                      <th className="px-8 py-5">Verified Date</th>
                      <th className="px-8 py-5">Vendor Node</th>
                      <th className="px-8 py-5">Ref #</th>
                      <th className="px-8 py-5 text-right">Liability</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {enrichedInvoices.filter(i => {
                      if (historyTab === 'outstanding') return !i.isPaid && !i.isHold;
                      if (historyTab === 'settled') return i.isPaid;
                      if (historyTab === 'hold') return i.isHold;
                      return true;
                    }).map(inv => (
                      <tr key={inv.id} className="hover:bg-slate-50 cursor-pointer group transition-all" onClick={() => setSelectedInvoiceId(inv.id)}>
                        <td className="px-8 py-5"><AuditBadge status={inv.status} /></td>
                        <td className="px-8 py-5 font-bold text-slate-600 text-sm">{inv.date}</td>
                        <td className="px-8 py-5 font-black text-slate-900 text-sm uppercase">{inv.supplierName}</td>
                        <td className="px-8 py-5 font-mono text-xs text-slate-400">{inv.invoiceNumber}</td>
                        <td className="px-8 py-5 text-right font-black text-slate-900">${inv.totalAmount.toFixed(2)}</td>
                      </tr>
                    ))}
                    {enrichedInvoices.length === 0 && (
                      <tr><td colSpan={5} className="py-20 text-center text-slate-400 font-bold uppercase text-xs italic">Awaiting document ingestion...</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'items' && (
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
               <div className="p-8 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                  <h3 className="font-black text-slate-900 uppercase">Master Baseline Inventory</h3>
                  <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">{masterItemsList.length} Unique Trackers</div>
               </div>
               <div className="overflow-x-auto custom-scrollbar">
                 <table className="w-full text-left">
                   <thead>
                     <tr className="bg-slate-50/50 text-[10px] font-black uppercase text-slate-400 border-b">
                       <th className="px-8 py-5">Product Identifier</th>
                       <th className="px-8 py-5">Master Baseline</th>
                       <th className="px-8 py-5">Market Rate</th>
                       <th className="px-8 py-5">Trend Status</th>
                       <th className="px-8 py-5">Supply Points</th>
                     </tr>
                   </thead>
                   <tbody className="divide-y divide-slate-50">
                     {masterItemsList.map(item => {
                       const variance = item.lastPrice - item.baselinePrice;
                       return (
                        <tr key={item.name} className="hover:bg-slate-50 transition-colors">
                          <td className="px-8 py-5 font-black text-slate-900 text-sm uppercase">{item.name}</td>
                          <td className="px-8 py-5 font-bold text-slate-400 text-sm">${item.baselinePrice.toFixed(2)}</td>
                          <td className="px-8 py-5 font-black text-slate-900 text-sm">${item.lastPrice.toFixed(2)}</td>
                          <td className="px-8 py-5">
                            {Math.abs(variance) < 0.01 ? (
                              <span className="text-[10px] font-black uppercase text-slate-300 bg-slate-100 px-2 py-1 rounded-md">Stable</span>
                            ) : variance > 0 ? (
                              <span className="text-[10px] font-black uppercase text-rose-500 bg-rose-50 px-2 py-1 rounded-md flex items-center gap-1 w-fit"><TrendingUp size={12}/> +${variance.toFixed(2)}</span>
                            ) : (
                              <span className="text-[10px] font-black uppercase text-emerald-500 bg-emerald-50 px-2 py-1 rounded-md flex items-center gap-1 w-fit"><TrendingDown size={12}/> -${Math.abs(variance).toFixed(2)}</span>
                            )}
                          </td>
                          <td className="px-8 py-5">
                            <div className="flex -space-x-2">
                               {Array.from(item.suppliers).slice(0, 3).map(s => (
                                 <div key={s} className="w-8 h-8 rounded-full bg-slate-900 text-white border-2 border-white flex items-center justify-center text-[10px] font-black uppercase shadow-sm" title={s}>{s[0]}</div>
                               ))}
                            </div>
                          </td>
                        </tr>
                       );
                     })}
                   </tbody>
                 </table>
               </div>
            </div>
          )}

          {activeTab === 'suppliers' && (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
               {suppliersList.map(s => (
                 <div key={s.name} className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm hover:border-blue-500 transition-all cursor-pointer group">
                    <div className="flex justify-between items-start mb-6">
                       <div className="w-12 h-12 bg-slate-900 text-white rounded-2xl flex items-center justify-center shadow-lg transition-transform group-hover:scale-110"><Package size={24}/></div>
                       <div className="text-right">
                          <p className="text-[10px] font-black text-slate-400 uppercase">Total Audit Vol.</p>
                          <p className="text-xl font-black text-slate-900">${s.totalVolume.toLocaleString()}</p>
                       </div>
                    </div>
                    <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight group-hover:text-blue-600 mb-4 truncate">{s.name}</h3>
                    <div className="space-y-3 pt-4 border-t border-slate-100">
                       <div className="flex items-center gap-3 text-xs font-bold text-slate-500"><Target size={14}/> ABN: {s.abn || 'UNMAPPED'}</div>
                       <div className="flex items-center gap-3 text-xs font-bold text-slate-500"><Phone size={14}/> {s.tel || 'N/A'}</div>
                       <div className="flex items-center gap-3 text-xs font-bold text-slate-500"><History size={14}/> {s.invoiceCount} Audits Complete</div>
                    </div>
                 </div>
               ))}
               {suppliersList.length === 0 && (
                  <div className="col-span-full py-20 text-center bg-white rounded-3xl border-2 border-dashed border-slate-200 text-slate-400 font-bold uppercase text-xs">No vendor data found. Ingest a document to start mapping.</div>
               )}
            </div>
          )}
          
        </div>
      </main>

      {/* Detail Sidebar Modal */}
      {selectedInvoiceId && (
        <InvoiceDetailModal 
          invoice={enrichedInvoices.find(i => i.id === selectedInvoiceId)!} 
          onClose={() => setSelectedInvoiceId(null)} 
          onDelete={deleteInvoice}
          onUpdateBaseline={handleUpdateBaseline}
          onTogglePaid={() => {}}
          onToggleHold={() => {}}
        />
      )}

      {/* Build/AI Processing Overlay */}
      {loading && (
        <div className="fixed inset-0 z-[200] bg-slate-900/80 backdrop-blur-sm flex flex-col items-center justify-center text-white space-y-6">
           <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
           <div className="text-center">
             <h3 className="text-xl font-black uppercase tracking-tighter">AI Processing Pipeline</h3>
             <p className="text-slate-400 text-sm font-bold uppercase tracking-widest mt-2">{uploadProgress}</p>
           </div>
        </div>
      )}
    </div>
  );
};

// --- Polished UI Components ---

const StatCard = ({ label, value, icon: Icon, color, sub }: any) => {
  const colors: any = {
    blue: 'bg-blue-50 text-blue-600',
    amber: 'bg-amber-50 text-amber-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    slate: 'bg-slate-50 text-slate-600'
  };
  return (
    <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-4 ${colors[color]}`}>
        <Icon size={24} />
      </div>
      <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">{label}</p>
      <h3 className="text-2xl font-black text-slate-900 tracking-tight">{value}</h3>
      {sub && <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-tight">{sub}</p>}
    </div>
  );
};

const AuditBadge = ({ status }: { status: Invoice['status'] }) => {
  const config = {
    matched: { bg: 'bg-emerald-50 text-emerald-700', icon: CheckCircle2, text: 'Verified' },
    price_increase: { bg: 'bg-rose-50 text-rose-700', icon: TrendingUp, text: 'Hike Warning' },
    price_decrease: { bg: 'bg-blue-50 text-blue-700', icon: TrendingDown, text: 'Savings Opt' },
    mixed: { bg: 'bg-amber-50 text-amber-700', icon: TriangleAlert, text: 'Mixed Audit' },
    new_supplier: { bg: 'bg-slate-50 text-slate-700', icon: PlusCircle, text: 'Initial Map' }
  }[status];

  const Icon = config.icon;
  return (
    <div className={`flex items-center space-x-2 px-3 py-1.5 rounded-full w-fit ${config.bg}`}>
      <Icon size={14} />
      <span className="text-[10px] font-black uppercase tracking-widest">{config.text}</span>
    </div>
  );
};

const InvoiceDetailModal = ({ invoice, onClose, onDelete, onUpdateBaseline }: any) => (
  <div className="fixed inset-0 z-[200] flex justify-end">
    <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
    <div className="relative w-full max-w-2xl bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
      <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50">
        <div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tighter uppercase">Audit Identity</h2>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Verification Node: {invoice.invoiceNumber}</p>
        </div>
        <button onClick={onClose} className="p-3 hover:bg-white rounded-full transition-all text-slate-400"><X size={24}/></button>
      </div>

      <div className="flex-1 overflow-y-auto p-8 space-y-10 custom-scrollbar text-left">
        <div className="grid grid-cols-2 gap-8">
           <div className="space-y-4">
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Supplier Entity</p>
                <p className="font-black text-slate-900 text-lg leading-tight uppercase">{invoice.supplierName}</p>
              </div>
              <AuditBadge status={invoice.status} />
           </div>
           <div className="space-y-4 text-right">
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Maturity Timeline</p>
                <p className="font-black text-blue-600 uppercase text-sm">{invoice.dueDate}</p>
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Verified Liability</p>
                <p className="font-black text-3xl tracking-tighter text-slate-900">${invoice.totalAmount.toFixed(2)}</p>
              </div>
           </div>
        </div>

        <div className="space-y-4">
          <h4 className="text-xs font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
            <ShieldCheck size={16} className="text-blue-600"/> 
            Item Variance Analysis
          </h4>
          <div className="space-y-4">
            {invoice.items.map((item: any) => (
              <div key={item.id} className={`p-6 rounded-3xl border transition-all ${item.priceChange > 0 ? 'bg-rose-50 border-rose-100' : 'bg-slate-50 border-slate-100'}`}>
                <div className="flex justify-between items-start mb-4">
                  <div className="max-w-[70%]">
                    <p className="font-black text-slate-900 text-base mb-1 leading-tight uppercase tracking-tight">{item.name}</p>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Qty: {item.quantity} units</p>
                  </div>
                  <div className="text-right">
                    <p className="font-black text-slate-900 text-lg">${item.unitPrice.toFixed(2)} <span className="text-[10px] text-slate-400 uppercase">ea</span></p>
                    {item.previousUnitPrice !== undefined && (
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest bg-white/50 px-2 py-0.5 rounded-md mt-1">Master: ${item.previousUnitPrice.toFixed(2)}</p>
                    )}
                  </div>
                </div>
                
                {item.priceChange > 0 ? (
                  <div className="flex items-center justify-between pt-4 border-t border-rose-200">
                    <div className="flex items-center space-x-2 text-rose-600">
                      <TriangleAlert size={16} />
                      <span className="text-xs font-black uppercase">Overcharge: +${item.priceChange.toFixed(2)} ({item.percentChange.toFixed(1)}%)</span>
                    </div>
                    <button 
                      onClick={() => onUpdateBaseline(invoice.supplierName, item.name, item.unitPrice)}
                      className="bg-white px-4 py-2 rounded-xl text-[10px] font-black uppercase text-slate-700 border border-rose-300 hover:bg-slate-900 hover:text-white transition-all shadow-sm"
                    >
                      Update Master Rate
                    </button>
                  </div>
                ) : item.priceChange < 0 ? (
                  <div className="flex items-center space-x-2 text-emerald-600 pt-4 border-t border-emerald-100">
                    <TrendingDown size={16} />
                    <span className="text-xs font-black uppercase">Savings Recognized: -${Math.abs(item.priceChange).toFixed(2)}</span>
                  </div>
                ) : (
                  <div className="flex items-center space-x-2 text-slate-400 pt-4 border-t border-slate-200 opacity-50">
                    <CheckCircle2 size={16} />
                    <span className="text-xs font-black uppercase">Rate Verified Against Baseline</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="p-8 border-t border-slate-100 bg-slate-50 grid grid-cols-2 gap-4">
        <button onClick={() => onDelete(invoice.id)} className="p-4 bg-white border-2 border-slate-200 rounded-2xl text-rose-600 font-black text-xs uppercase tracking-widest flex items-center justify-center space-x-2 hover:bg-rose-600 hover:text-white hover:border-rose-600 transition-all">
          <Trash2 size={16}/>
          <span>Discard Data</span>
        </button>
        <button onClick={onClose} className="p-4 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center space-x-2 hover:bg-slate-800 transition-all shadow-xl shadow-slate-200">
          <Check size={16}/>
          <span>Audit Complete</span>
        </button>
      </div>
    </div>
  </div>
);

const UploadView = ({ handleFileUpload, loading, progress }: any) => (
  <div className="max-w-4xl mx-auto py-20 text-center animate-in fade-in duration-500">
    <div className="w-24 h-24 bg-blue-600 text-white rounded-[2rem] flex items-center justify-center mx-auto mb-10 shadow-2xl shadow-blue-200">
      <Upload size={40} />
    </div>
    <h2 className="text-4xl font-black text-slate-900 tracking-tighter uppercase mb-4">Ingest Procurement Documents</h2>
    <p className="text-slate-400 font-bold mb-12 uppercase tracking-widest text-sm leading-relaxed max-w-lg mx-auto">
      Batch upload PDF invoices or snapshots. Gemini 3 will automatically extract quantities and unit prices to verify against history.
    </p>
    
    <label className="group relative block cursor-pointer">
      <div className="border-4 border-dashed border-slate-200 rounded-[3rem] p-20 transition-all group-hover:border-blue-500 group-hover:bg-blue-50/50">
        <div className="space-y-4">
          <Files size={48} className="mx-auto text-slate-300 group-hover:text-blue-500 transition-colors" />
          <p className="text-slate-400 font-bold uppercase text-xs tracking-[0.2em] group-hover:text-blue-600 transition-colors">Drag PDF here or click to browse</p>
        </div>
      </div>
      <input type="file" className="hidden" onChange={handleFileUpload} accept="application/pdf,image/*" multiple />
    </label>
  </div>
);

export default App;