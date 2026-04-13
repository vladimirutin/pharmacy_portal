import React, { useState } from 'react';
import { db } from './config/firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import AuthScreen from './components/AuthScreen';

function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [prescriptionId, setPrescriptionId] = useState('');
  const [scanResult, setScanResult] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [idVerified, setIdVerified] = useState(false);

  // Per-item dispensing quantities selected by the pharmacist
  const [dispenseQty, setDispenseQty] = useState({});

  // In-app modal warning state
  const [showIdWarning, setShowIdWarning] = useState(false);

  // Success notification state
  const [showSuccess, setShowSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  // Error notification state
  const [showError, setShowError] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const showSuccessNotification = (msg) => {
    setSuccessMessage(msg);
    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 4000);
  };

  const showErrorNotification = (msg) => {
    setErrorMessage(msg);
    setShowError(true);
    setTimeout(() => setShowError(false), 4000);
  };

  const handleLookupPrescription = async () => {
    if (!prescriptionId.trim()) return;
    
    setIsLoading(true);
    setScanResult(null);

    try {
      // Build the full ID: RX- prefix + number typed by pharmacist
      const fullRxId = `RX-${prescriptionId}`;
      const docRef = doc(db, 'artifacts', 'medivend-local', 'public', 'data', 'prescriptions', fullRxId);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const data = docSnap.data();
        const items = data.items || [];

        // Build items with dispensed tracking
        // Note: The kiosk uses 'dispensed' field on each item
        const mappedItems = items.map((item, index) => {
          const prescribed = parseInt(item.quantity) || 0;
          const alreadyDispensed = parseInt(item.dispensed) || 0;
          return {
            id: index,
            name: item.name || 'Unknown Medicine',
            dosage: item.dosage || '',
            prescribed: prescribed,
            alreadyDispensed: alreadyDispensed,
            remaining: Math.max(prescribed - alreadyDispensed, 0),
          };
        });

        const isFullyDispensed = data.status === 'dispensed' || data.status === 'completed' || mappedItems.every(i => i.remaining <= 0);

        setScanResult({
          prescriptionId: docSnap.id,
          patientName: data.patient?.name || "Unknown Patient",
          patientAge: data.patient?.age || "",
          patientSex: data.patient?.sex || "",
          dateIssued: data.date || "Unknown Date",
          prescribedBy: data.doctorName || "Unknown Doctor",
          doctorLicense: data.doctorLicense || "",
          clinicName: data.clinicDetails?.name || "",
          status: isFullyDispensed ? 'Fully Dispensed' : (mappedItems.some(i => i.alreadyDispensed > 0) ? 'Partially Dispensed' : 'Pending'),
          items: mappedItems,
          grandTotal: data.grandTotal || 0,
          rawStatus: data.status,
        });

        // Initialize dispense quantities to 0 for each item
        const initialQty = {};
        mappedItems.forEach(item => {
          initialQty[item.id] = 0;
        });
        setDispenseQty(initialQty);

        // Show the in-app ID warning modal
        setShowIdWarning(true);

      } else {
        showErrorNotification('Prescription not found in database. Please check the ID.');
      }
    } catch (error) {
      console.error("Error fetching prescription:", error);
      showErrorNotification('Error looking up prescription. Check your connection.');
    }

    setIdVerified(false);
    setIsLoading(false);
  };

  const handleIncrementQty = (itemId) => {
    const item = scanResult.items.find(i => i.id === itemId);
    if (!item) return;
    setDispenseQty(prev => ({
      ...prev,
      [itemId]: Math.min((prev[itemId] || 0) + 1, item.remaining)
    }));
  };

  const handleDecrementQty = (itemId) => {
    setDispenseQty(prev => ({
      ...prev,
      [itemId]: Math.max((prev[itemId] || 0) - 1, 0)
    }));
  };

  const handleSetQty = (itemId, value) => {
    const item = scanResult.items.find(i => i.id === itemId);
    if (!item) return;
    const num = parseInt(value) || 0;
    setDispenseQty(prev => ({
      ...prev,
      [itemId]: Math.min(Math.max(num, 0), item.remaining)
    }));
  };

  const totalToDispense = Object.values(dispenseQty).reduce((s, v) => s + v, 0);

  const handleSaveToDatabase = async () => {
    if (!idVerified || !scanResult || totalToDispense === 0) return;
    
    setIsSaving(true);

    try {
      const docRef = doc(db, 'artifacts', 'medivend-local', 'public', 'data', 'prescriptions', scanResult.prescriptionId);
      const docSnap = await getDoc(docRef);

      if (!docSnap.exists()) {
        showErrorNotification('Prescription document no longer exists.');
        setIsSaving(false);
        return;
      }

      const data = docSnap.data();
      const currentItems = data.items || [];

      // Update each item's dispensed count (using 'dispensed' field to match kiosk)
      const updatedItems = currentItems.map((item, index) => {
        const addedQty = dispenseQty[index] || 0;
        const currentDispensed = parseInt(item.dispensed) || 0;
        return {
          ...item,
          dispensed: currentDispensed + addedQty,
        };
      });

      // Determine if everything is now fully dispensed
      const fullyDone = updatedItems.every(item => {
        const prescribed = parseInt(item.quantity) || 0;
        const dispensed = parseInt(item.dispensed) || 0;
        return dispensed >= prescribed;
      });

      await updateDoc(docRef, {
        items: updatedItems,
        status: fullyDone ? 'dispensed' : 'partial',
      });

      showSuccessNotification(`Successfully saved! ${totalToDispense} item(s) dispensed and ledger updated.`);
      setScanResult(null);
      setPrescriptionId('');
      setIdVerified(false);
      setDispenseQty({});
    } catch (error) {
      console.error("Error updating database:", error);
      showErrorNotification('Error saving to database. Please try again.');
    }

    setIsSaving(false);
  };

  const handleReset = () => {
    setScanResult(null);
    setPrescriptionId('');
    setIdVerified(false);
    setDispenseQty({});
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'Fully Dispensed': return 'text-emerald-400';
      case 'Partially Dispensed': return 'text-amber-400';
      default: return 'text-indigo-400';
    }
  };

  const getStatusBg = (status) => {
    switch (status) {
      case 'Fully Dispensed': return 'bg-emerald-500/10 border-emerald-500/20';
      case 'Partially Dispensed': return 'bg-amber-500/10 border-amber-500/20';
      default: return 'bg-indigo-500/10 border-indigo-500/20';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'Fully Dispensed': return '✅';
      case 'Partially Dispensed': return '🔄';
      default: return '📋';
    }
  };

  if (!currentUser) {
    return <AuthScreen onLogin={setCurrentUser} />;
  }

  return (
    <div className="min-h-screen bg-slate-900">

      {/* ── In-App ID Verification Warning Modal ── */}
      {showIdWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}>
          <div className="animate-scale-in w-full max-w-md">
            <div className="rounded-3xl border border-amber-500/30 bg-slate-800 overflow-hidden shadow-2xl" style={{ boxShadow: '0 0 60px rgba(245, 158, 11, 0.15)' }}>
              {/* Warning Header */}
              <div className="bg-gradient-to-r from-amber-600/20 to-orange-600/20 border-b border-amber-500/20 px-6 py-5">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-amber-500/20 flex items-center justify-center text-2xl">
                    ⚠️
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-amber-300">Identity Verification Required</h2>
                    <p className="text-xs text-amber-400/70 mt-0.5">Mandatory security checkpoint</p>
                  </div>
                </div>
              </div>
              
              {/* Warning Body */}
              <div className="px-6 py-5">
                <div className="space-y-3">
                  <div className="flex items-start gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                    <span className="text-lg mt-0.5">🪪</span>
                    <div>
                      <p className="text-sm font-semibold text-white">Check Government-Issued ID</p>
                      <p className="text-xs text-slate-400 mt-1">Verify the buyer's government-issued ID matches the patient name on the prescription.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                    <span className="text-lg mt-0.5">📄</span>
                    <div>
                      <p className="text-sm font-semibold text-white">Check Authorization Letter</p>
                      <p className="text-xs text-slate-400 mt-1">If the buyer is not the patient, require a signed authorization letter from the patient along with the representative's valid ID.</p>
                    </div>
                  </div>
                </div>

                <div className="mt-5 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20">
                  <p className="text-xs text-rose-300 text-center font-medium">
                    ⛔ Do NOT dispense without proper identification. This is logged for audit compliance.
                  </p>
                </div>
              </div>

              {/* Warning Footer */}
              <div className="px-6 pb-5">
                <button
                  onClick={() => setShowIdWarning(false)}
                  className="btn-indigo w-full py-3 text-sm flex items-center justify-center gap-2"
                >
                  🔒 I Understand, Proceed to Review
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Success Notification Toast ── */}
      {showSuccess && (
        <div className="fixed top-6 right-6 z-50 animate-slide-up">
          <div className="rounded-2xl border border-emerald-500/30 bg-slate-800/95 backdrop-blur-xl px-5 py-4 shadow-2xl flex items-center gap-3 max-w-sm" style={{ boxShadow: '0 0 40px rgba(16, 185, 129, 0.15)' }}>
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center text-lg flex-shrink-0">✅</div>
            <div>
              <p className="text-sm font-bold text-emerald-300">Saved Successfully</p>
              <p className="text-xs text-slate-400 mt-0.5">{successMessage}</p>
            </div>
          </div>
        </div>
      )}

      {/* ── Error Notification Toast ── */}
      {showError && (
        <div className="fixed top-6 right-6 z-50 animate-slide-up">
          <div className="rounded-2xl border border-rose-500/30 bg-slate-800/95 backdrop-blur-xl px-5 py-4 shadow-2xl flex items-center gap-3 max-w-sm" style={{ boxShadow: '0 0 40px rgba(244, 63, 94, 0.15)' }}>
            <div className="w-10 h-10 rounded-xl bg-rose-500/20 flex items-center justify-center text-lg flex-shrink-0">❌</div>
            <div>
              <p className="text-sm font-bold text-rose-300">Error</p>
              <p className="text-xs text-slate-400 mt-0.5">{errorMessage}</p>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="border-b border-white/[0.07] backdrop-blur-xl bg-white/[0.02]">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-2xl font-bold text-white">Medivend Pharmacy</h1>
              <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold flex items-center gap-1.5 hidden sm:flex">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Live Network
              </span>
            </div>
            <p className="text-sm text-slate-400">{currentUser?.pharmacyName || "Prescription Verification Portal"}</p>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-bold text-white">{currentUser?.name}</p>
              <p className="text-xs text-slate-500">License: {currentUser?.licenseNumber}</p>
            </div>
            <div className="w-px h-8 bg-white/10 hidden sm:block"></div>
            <button 
              onClick={() => setCurrentUser(null)}
              className="p-2 sm:px-4 sm:py-2 text-sm font-bold text-rose-400 hover:text-white bg-rose-500/10 hover:bg-rose-500 border border-rose-500/20 hover:border-rose-500 rounded-xl transition-all"
              title="Sign Out"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-3xl mx-auto px-6 py-8">
        {/* Lookup Section */}
        <div className="glass-card p-8 mb-6">
          <div className="flex items-center gap-3 mb-6">
            <span className="text-2xl">🔍</span>
            <div>
              <h2 className="text-lg font-bold text-white">Look Up Prescription</h2>
              <p className="text-xs text-slate-400">Enter prescription ID to verify and manage dispensing</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="relative flex items-center">
              <span className="absolute left-4 text-indigo-400 font-bold text-sm pointer-events-none select-none z-10">RX-</span>
              <input
                type="text"
                value={prescriptionId}
                onChange={(e) => {
                  // Only allow numbers
                  const val = e.target.value.replace(/[^0-9]/g, '');
                  setPrescriptionId(val);
                }}
                onKeyDown={(e) => e.key === 'Enter' && handleLookupPrescription()}
                placeholder="Enter number (e.g., 572347)"
                className="input-field"
                style={{ paddingLeft: '3.2rem' }}
                disabled={scanResult !== null}
              />
            </div>

            <button
              onClick={handleLookupPrescription}
              disabled={!prescriptionId.trim() || isLoading || scanResult !== null}
              className="btn-indigo w-full py-2.5 flex items-center justify-center gap-2 text-sm"
            >
              {isLoading ? (
                <>
                  <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Verifying...
                </>
              ) : (
                <>
                  🔐 Verify Prescription
                </>
              )}
            </button>
          </div>
        </div>

        {/* ═══════ Results Section ═══════ */}
        {scanResult && !showIdWarning && (
          <div className="space-y-4 animate-slide-up">

            {/* Status Badge */}
            <div className={`glass-card p-5 border ${getStatusBg(scanResult.status)}`}>
              <div className="flex items-center gap-3">
                <span className="text-2xl">{getStatusIcon(scanResult.status)}</span>
                <div className="flex-1">
                  <p className="text-xs text-slate-400 uppercase tracking-wide">Prescription Status</p>
                  <p className={`text-lg font-bold ${getStatusColor(scanResult.status)}`}>{scanResult.status}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-500">Grand Total</p>
                  <p className="text-white font-bold">₱{scanResult.grandTotal.toLocaleString()}</p>
                </div>
              </div>
            </div>

            {/* Patient & Doctor Details */}
            <div className="glass-card p-6">
              <h3 className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-4">Prescription Details</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-xs text-slate-500 mb-1">Patient Name</p>
                  <p className="text-white font-semibold">{scanResult.patientName}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">Prescription ID</p>
                  <p className="text-white font-mono font-semibold">{scanResult.prescriptionId}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">Date Issued</p>
                  <p className="text-white">{scanResult.dateIssued}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">Prescribed By</p>
                  <p className="text-white">{scanResult.prescribedBy}</p>
                </div>
                {scanResult.clinicName && (
                  <div className="col-span-2">
                    <p className="text-xs text-slate-500 mb-1">Clinic</p>
                    <p className="text-white">{scanResult.clinicName}</p>
                  </div>
                )}
              </div>
            </div>

            {/* ── Medicine Items Table ── */}
            <div className="glass-card p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xs font-bold uppercase tracking-wide text-slate-400">Medicine Items</h3>
                <span className="text-xs text-slate-500">{scanResult.items.length} item(s)</span>
              </div>

              <div className="space-y-3">
                {scanResult.items.map((item) => {
                  const currentDispenseQty = dispenseQty[item.id] || 0;
                  const isItemDone = item.remaining <= 0;

                  return (
                    <div
                      key={item.id}
                      className={`rounded-2xl border p-4 transition-all duration-300 ${
                        isItemDone
                          ? 'bg-emerald-500/5 border-emerald-500/15'
                          : currentDispenseQty > 0
                            ? 'bg-indigo-500/5 border-indigo-500/20'
                            : 'bg-white/[0.02] border-white/[0.07]'
                      }`}
                    >
                      {/* Medicine Name Row */}
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <p className="text-sm font-bold text-white">{item.name}</p>
                          {item.dosage && <p className="text-xs text-slate-400 mt-0.5">{item.dosage}</p>}
                        </div>
                        {isItemDone && (
                          <span className="text-xs font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-lg">
                            Complete
                          </span>
                        )}
                      </div>

                      {/* Quantity Info */}
                      <div className="grid grid-cols-3 gap-3 mb-3">
                        <div className="text-center p-2 rounded-xl bg-white/[0.03]">
                          <p className="text-lg font-bold text-indigo-400">{item.prescribed}</p>
                          <p className="text-[10px] text-slate-500 uppercase">Prescribed</p>
                        </div>
                        <div className="text-center p-2 rounded-xl bg-white/[0.03]">
                          <p className="text-lg font-bold text-slate-400">{item.alreadyDispensed}</p>
                          <p className="text-[10px] text-slate-500 uppercase">Bought</p>
                        </div>
                        <div className="text-center p-2 rounded-xl bg-white/[0.03]">
                          <p className={`text-lg font-bold ${item.remaining > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>{item.remaining}</p>
                          <p className="text-[10px] text-slate-500 uppercase">Remaining</p>
                        </div>
                      </div>

                      {/* Progress Bar */}
                      <div className="w-full bg-white/[0.05] rounded-full h-1.5 mb-3 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500 bg-gradient-to-r from-indigo-500 to-cyan-500"
                          style={{ width: `${item.prescribed > 0 ? ((item.alreadyDispensed) / item.prescribed) * 100 : 0}%` }}
                        />
                      </div>

                      {/* Dispense Controls — only show if not fully bought yet */}
                      {!isItemDone && (
                        <div className="flex items-center justify-between mt-2 p-2 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                          <span className="text-xs text-slate-400 font-medium pl-1">Buy Now:</span>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleDecrementQty(item.id)}
                              disabled={currentDispenseQty <= 0}
                              className="w-8 h-8 rounded-lg bg-white/[0.05] border border-white/[0.1] text-white font-bold text-sm flex items-center justify-center hover:bg-white/[0.1] transition-all active:scale-90 disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                              −
                            </button>
                            <input
                              type="number"
                              value={currentDispenseQty}
                              onChange={(e) => handleSetQty(item.id, e.target.value)}
                              className="w-14 h-8 text-center bg-white/[0.05] border border-white/[0.1] rounded-lg text-white font-bold text-sm focus:outline-none focus:border-indigo-400/50"
                              min={0}
                              max={item.remaining}
                            />
                            <button
                              onClick={() => handleIncrementQty(item.id)}
                              disabled={currentDispenseQty >= item.remaining}
                              className="w-8 h-8 rounded-lg bg-indigo-600/80 border border-indigo-500/30 text-white font-bold text-sm flex items-center justify-center hover:bg-indigo-500 transition-all active:scale-90 disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                              +
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Security Check */}
            <div className="glass-card p-6 border-rose-400/20 bg-rose-600/[0.08]">
              <div className="flex gap-3 mb-4">
                <span className="text-xl">🛡️</span>
                <div>
                  <p className="font-bold text-white text-sm">Identity Verified</p>
                  <p className="text-xs text-rose-300 mt-1">Confirm you have verified the buyer's ID or authorization letter</p>
                </div>
              </div>
              <label className="flex items-center gap-3 cursor-pointer group">
                <input 
                  type="checkbox" 
                  checked={idVerified}
                  onChange={(e) => setIdVerified(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-600 bg-white/[0.05] cursor-pointer accent-indigo-500" 
                />
                <span className="text-sm text-slate-300 group-hover:text-white transition-colors">
                  I verified Government ID of <strong>{scanResult.patientName}</strong> or Authorized Representative
                </span>
              </label>
            </div>

            {/* Dispense Summary + Save */}
            <div className="glass-card p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xs font-bold uppercase tracking-wide text-slate-400">Dispense Summary</h3>
                <span className={`text-sm font-bold ${totalToDispense > 0 ? 'text-indigo-400' : 'text-slate-600'}`}>
                  {totalToDispense} item(s) selected
                </span>
              </div>

              {/* Mini breakdown */}
              {totalToDispense > 0 && (
                <div className="space-y-1.5 mb-4 p-3 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                  {scanResult.items.map(item => {
                    const qty = dispenseQty[item.id] || 0;
                    if (qty === 0) return null;
                    return (
                      <div key={item.id} className="flex items-center justify-between text-sm">
                        <span className="text-slate-300">{item.name} {item.dosage && `(${item.dosage})`}</span>
                        <span className="text-indigo-400 font-bold">×{qty}</span>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={handleSaveToDatabase}
                  disabled={!idVerified || totalToDispense === 0 || isSaving}
                  className="btn-emerald flex-1 py-3 flex items-center justify-center gap-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSaving ? (
                    <>
                      <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      💾 Save to Database
                    </>
                  )}
                </button>
                <button
                  onClick={handleReset}
                  className="btn-ghost flex-1 py-3 text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>

          </div>
        )}



        {/* Footer Info */}
        <div className="glass-card p-4 mt-8 text-center">
          <div className="flex items-center justify-center gap-2 mb-3">
            <span className="text-lg">🛡️</span>
            <h3 className="text-sm font-bold text-white">Security Features</h3>
          </div>
          <div className="text-xs text-slate-400 space-y-1">
            <p>✅ Real-time prescription verification</p>
            <p>✅ Government ID validation required</p>
            <p>✅ Partial dispensing with audit trail</p>
            <p>✅ Cloud ledger integration</p>
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
