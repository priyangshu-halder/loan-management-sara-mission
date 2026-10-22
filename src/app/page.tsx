export default function HomePage() {
  return (
    <main className="flex-1 flex flex-col items-center justify-center p-8 bg-slate-50">
      <div className="max-w-2xl w-full bg-white rounded-xl shadow-sm border border-slate-200 p-8 text-center space-y-6">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-50 text-blue-600 mb-2 font-bold text-2xl">
          ₹
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          Financial Management System
        </h1>
        <p className="text-slate-600 text-base leading-relaxed">
          Secure, multi-tenant loan management, daily collections, deposit accounts, and double-entry accounting ledger platform.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 text-left">
          <div className="p-4 rounded-lg bg-slate-50 border border-slate-100">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Core Engine</h2>
            <p className="text-sm font-medium text-slate-800 mt-1">Exact Decimal Math</p>
            <p className="text-xs text-slate-500 mt-0.5">DECIMAL(19,4) Precision</p>
          </div>
          <div className="p-4 rounded-lg bg-slate-50 border border-slate-100">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Multi-Tenancy</h2>
            <p className="text-sm font-medium text-slate-800 mt-1">Tenant & Branch Scope</p>
            <p className="text-xs text-slate-500 mt-0.5">Strict server-side isolation</p>
          </div>
          <div className="p-4 rounded-lg bg-slate-50 border border-slate-100">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Auditability</h2>
            <p className="text-sm font-medium text-slate-800 mt-1">Double-Entry Ledger</p>
            <p className="text-xs text-slate-500 mt-0.5">Append-only audit trail</p>
          </div>
        </div>
        <div className="pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
          <span>Phase 1: Foundation</span>
          <span className="inline-flex items-center gap-1.5 text-emerald-600 font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            System Ready
          </span>
        </div>
      </div>
    </main>
  );
}

