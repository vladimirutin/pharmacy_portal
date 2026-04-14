import React, { useState, useEffect } from 'react';
import { db } from './config/firebase';
import { doc, getDoc, updateDoc, collection, query, where, onSnapshot, addDoc, serverTimestamp, getDocs } from 'firebase/firestore';
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

  // ═══ NEW: View, Broadcasts, Settings, Support state ═══
  const [activeView, setActiveView] = useState('dispense');
  const [broadcasts, setBroadcasts] = useState([]);
  const [dismissedBroadcasts, setDismissedBroadcasts] = useState([]);
  const [settingsTab, setSettingsTab] = useState('profile');
  const [supportTickets, setSupportTickets] = useState([]);
  const [showNewTicket, setShowNewTicket] = useState(false);
  const [ticketForm, setTicketForm] = useState({ subject: '', message: '', priority: 'normal' });
  const [ticketLoading, setTicketLoading] = useState(false);
  const [profileForm, setProfileForm] = useState({ pharmacyName: '' });
  const [passwordForm, setPasswordForm] = useState({ current: '', newPw: '', confirm: '' });
  const [profileSaving, setProfileSaving] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);

  // ═══ Broadcast listener ═══
  useEffect(() => {
    if (!currentUser) return;
    const q = query(collection(db, 'artifacts', 'medivend-local', 'public', 'data', 'broadcasts'));
    const unsub = onSnapshot(q, (snap) => {
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .filter(b => b.active !== false && (b.target === 'all' || b.target === 'pharmacists'))
        .sort((a, b) => (b.timestamp?.toMillis?.() || 0) - (a.timestamp?.toMillis?.() || 0));
      setBroadcasts(items);
    });
    return () => unsub();
  }, [currentUser]);

  // ═══ Support tickets listener ═══
  useEffect(() => {
    if (!currentUser) return;
    const q = query(
      collection(db, 'artifacts', 'medivend-local', 'public', 'data', 'support_tickets'),
      where('senderEmail', '==', currentUser.email)
    );
    const unsub = onSnapshot(q, (snap) => {
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.timestamp?.toMillis?.() || 0) - (a.timestamp?.toMillis?.() || 0));
      setSupportTickets(items);
    });
    return () => unsub();
  }, [currentUser]);

  // ═══ Initialize profile form when user changes ═══
  useEffect(() => {
    if (currentUser) {
      setProfileForm({ pharmacyName: currentUser.pharmacyName || '' });
    }
  }, [currentUser]);

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

      // Update each item's dispensed count
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

  // ═══ Settings Handlers ═══
  const handleSaveProfile = async () => {
    if (!profileForm.pharmacyName.trim()) return;
    setProfileSaving(true);
    try {
      const q = query(
        collection(db, 'artifacts', 'medivend-local', 'public', 'data', 'pharmacists'),
        where('email', '==', currentUser.email)
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        await updateDoc(snap.docs[0].ref, { pharmacyName: profileForm.pharmacyName.trim() });
        setCurrentUser(prev => ({ ...prev, pharmacyName: profileForm.pharmacyName.trim() }));
        showSuccessNotification('Pharmacy name updated successfully!');
      }
    } catch (err) {
      console.error(err);
      showErrorNotification('Failed to update profile.');
    }
    setProfileSaving(false);
  };

  const handleChangePassword = async () => {
    if (!passwordForm.current || !passwordForm.newPw || !passwordForm.confirm) {
      showErrorNotification('Please fill all password fields.');
      return;
    }
    if (passwordForm.current !== currentUser.password) {
      showErrorNotification('Current password is incorrect.');
      return;
    }
    if (passwordForm.newPw.length < 6) {
      showErrorNotification('New password must be at least 6 characters.');
      return;
    }
    if (passwordForm.newPw !== passwordForm.confirm) {
      showErrorNotification('New passwords do not match.');
      return;
    }
    setPasswordSaving(true);
    try {
      const q = query(
        collection(db, 'artifacts', 'medivend-local', 'public', 'data', 'pharmacists'),
        where('email', '==', currentUser.email)
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        await updateDoc(snap.docs[0].ref, { password: passwordForm.newPw });
        setCurrentUser(prev => ({ ...prev, password: passwordForm.newPw }));
        setPasswordForm({ current: '', newPw: '', confirm: '' });
        showSuccessNotification('Password changed successfully!');
      }
    } catch (err) {
      console.error(err);
      showErrorNotification('Failed to change password.');
    }
    setPasswordSaving(false);
  };

  const handleSubmitTicket = async () => {
    if (!ticketForm.subject.trim() || !ticketForm.message.trim()) return;
    setTicketLoading(true);
    try {
      await addDoc(collection(db, 'artifacts', 'medivend-local', 'public', 'data', 'support_tickets'), {
        subject: ticketForm.subject.trim(),
        message: ticketForm.message.trim(),
        priority: ticketForm.priority,
        status: 'open',
        sender: currentUser.pharmacyName || currentUser.name,
        senderEmail: currentUser.email,
        type: 'pharmacy_issue',
        timestamp: serverTimestamp(),
      });
      setTicketForm({ subject: '', message: '', priority: 'normal' });
      setShowNewTicket(false);
      showSuccessNotification('Support ticket submitted successfully!');
    } catch (err) {
      console.error(err);
      showErrorNotification('Failed to submit ticket.');
    }
    setTicketLoading(false);
  };

  const activeBroadcasts = broadcasts.filter(b => !dismissedBroadcasts.includes(b.id));
  const getBroadcastColor = (priority) => {
    switch (priority) {
      case 'high': return { bg: 'bg-rose-500/10', border: 'border-rose-500/20', text: 'text-rose-300', icon: '🚨' };
      case 'medium': return { bg: 'bg-amber-500/10', border: 'border-amber-500/20', text: 'text-amber-300', icon: '⚠️' };
      default: return { bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', text: 'text-emerald-300', icon: '📢' };
    }
  };

  if (!currentUser) {
    return <AuthScreen onLogin={setCurrentUser} />;
  }

  return (
    <div className="min-h-screen min-h-[100dvh] bg-[#0B0F19] relative overflow-hidden">
      {/* Background layers */}
      <div className="absolute inset-0 pointer-events-none z-0">
        <div className="absolute inset-0 bg-[#0B0F19]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-emerald-900/30 via-[#0B0F19] to-black opacity-90" />
        {/* Layer 1: Hexagonal Grid */}
        <div className="absolute inset-0 opacity-50 mix-blend-screen" style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='56' height='100' viewBox='0 0 56 100'%3E%3Cpath d='M28 66L0 50V16l28-16 28 16v34L28 66zm0 34L0 84V50l28-16 28 16v34L28 100z' fill='none' stroke='%2310b981' stroke-width='0.5' stroke-opacity='0.15'/%3E%3C/svg%3E\")" }} />
        {/* Layer 2: Hex grid edge fade */}
        <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at center, transparent 30%, #0B0F19 75%)' }} />
        {/* Layer 3: Constellation particles */}
        <div className="absolute inset-0 opacity-80 mix-blend-screen" style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='400' viewBox='0 0 400 400'%3E%3Ccircle cx='50' cy='80' r='1.5' fill='%2310b981' opacity='0.6'/%3E%3Ccircle cx='150' cy='40' r='1' fill='%2394a3b8' opacity='0.4'/%3E%3Ccircle cx='250' cy='100' r='1.8' fill='%2310b981' opacity='0.5'/%3E%3Ccircle cx='350' cy='60' r='1' fill='%2394a3b8' opacity='0.3'/%3E%3Ccircle cx='100' cy='180' r='1.2' fill='%2306b6d4' opacity='0.5'/%3E%3Ccircle cx='200' cy='200' r='2' fill='%2310b981' opacity='0.4'/%3E%3Ccircle cx='300' cy='150' r='1' fill='%2394a3b8' opacity='0.3'/%3E%3Ccircle cx='80' cy='300' r='1.5' fill='%2394a3b8' opacity='0.4'/%3E%3Ccircle cx='180' cy='330' r='1' fill='%2310b981' opacity='0.5'/%3E%3Ccircle cx='320' cy='280' r='1.8' fill='%2306b6d4' opacity='0.4'/%3E%3Ccircle cx='380' cy='350' r='1' fill='%2394a3b8' opacity='0.3'/%3E%3Ccircle cx='30' cy='370' r='1.2' fill='%2310b981' opacity='0.4'/%3E%3Cline x1='50' y1='80' x2='150' y2='40' stroke='%2310b981' stroke-width='0.3' opacity='0.15'/%3E%3Cline x1='150' y1='40' x2='250' y2='100' stroke='%2394a3b8' stroke-width='0.3' opacity='0.1'/%3E%3Cline x1='250' y1='100' x2='350' y2='60' stroke='%2310b981' stroke-width='0.3' opacity='0.12'/%3E%3Cline x1='100' y1='180' x2='200' y2='200' stroke='%2306b6d4' stroke-width='0.3' opacity='0.12'/%3E%3Cline x1='200' y1='200' x2='300' y2='150' stroke='%2394a3b8' stroke-width='0.3' opacity='0.1'/%3E%3Cline x1='50' y1='80' x2='100' y2='180' stroke='%2394a3b8' stroke-width='0.3' opacity='0.08'/%3E%3Cline x1='250' y1='100' x2='200' y2='200' stroke='%2310b981' stroke-width='0.3' opacity='0.1'/%3E%3Cline x1='80' y1='300' x2='180' y2='330' stroke='%2310b981' stroke-width='0.3' opacity='0.12'/%3E%3Cline x1='320' y1='280' x2='380' y2='350' stroke='%2306b6d4' stroke-width='0.3' opacity='0.1'/%3E%3Cline x1='300' y1='150' x2='320' y2='280' stroke='%2394a3b8' stroke-width='0.3' opacity='0.08'/%3E%3Cline x1='180' y1='330' x2='320' y2='280' stroke='%2310b981' stroke-width='0.3' opacity='0.1'/%3E%3Cline x1='30' y1='370' x2='80' y2='300' stroke='%2394a3b8' stroke-width='0.3' opacity='0.1'/%3E%3C/svg%3E\")" }} />
      </div>

      {/* ── In-App ID Verification Warning Modal ── */}
      {showIdWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(10px)' }}>
          <div className="animate-scale-in w-full max-w-md">
            <div className="rounded-2xl border border-amber-500/25 bg-[#0F1729] overflow-hidden shadow-2xl" style={{ boxShadow: '0 0 80px rgba(245, 158, 11, 0.1)' }}>
              {/* Warning Header */}
              <div className="bg-gradient-to-r from-amber-600/15 to-orange-600/15 border-b border-amber-500/15 px-5 py-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/15 flex items-center justify-center text-xl flex-shrink-0">
                    ⚠️
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-amber-300">Identity Verification Required</h2>
                    <p className="text-[11px] text-amber-400/60 mt-0.5">Mandatory security checkpoint</p>
                  </div>
                </div>
              </div>
              
              {/* Warning Body */}
              <div className="px-5 py-4 space-y-2.5">
                <div className="flex items-start gap-2.5 p-3 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                  <span className="text-base mt-0.5 flex-shrink-0">🪪</span>
                  <div>
                    <p className="text-[13px] font-semibold text-white">Check Government-Issued ID</p>
                    <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">Verify the buyer's ID matches the patient name on the prescription.</p>
                  </div>
                </div>
                <div className="flex items-start gap-2.5 p-3 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                  <span className="text-base mt-0.5 flex-shrink-0">📄</span>
                  <div>
                    <p className="text-[13px] font-semibold text-white">Check Authorization Letter</p>
                    <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">If buyer is not the patient, require a signed authorization letter with representative's valid ID.</p>
                  </div>
                </div>
                <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/15">
                  <p className="text-[11px] text-rose-300 text-center font-medium">
                    ⛔ Do NOT dispense without proper identification. This is logged for audit compliance.
                  </p>
                </div>
              </div>

              {/* Warning Footer */}
              <div className="px-5 pb-4">
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
        <div className="fixed top-4 left-1/2 -translate-x-1/2 sm:left-auto sm:translate-x-0 sm:right-5 sm:top-5 z-50 animate-slide-down w-[calc(100%-2rem)] sm:w-auto">
          <div className="rounded-xl border border-emerald-500/25 bg-[#0F1729]/95 backdrop-blur-xl px-4 py-3 shadow-2xl flex items-center gap-3 sm:max-w-sm" style={{ boxShadow: '0 0 40px rgba(16, 185, 129, 0.12)' }}>
            <div className="w-9 h-9 rounded-lg bg-emerald-500/15 flex items-center justify-center text-base flex-shrink-0">✅</div>
            <div className="min-w-0">
              <p className="text-[13px] font-bold text-emerald-300">Saved Successfully</p>
              <p className="text-[11px] text-slate-400 mt-0.5 truncate">{successMessage}</p>
            </div>
          </div>
        </div>
      )}

      {/* ── Error Notification Toast ── */}
      {showError && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 sm:left-auto sm:translate-x-0 sm:right-5 sm:top-5 z-50 animate-slide-down w-[calc(100%-2rem)] sm:w-auto">
          <div className="rounded-xl border border-rose-500/25 bg-[#0F1729]/95 backdrop-blur-xl px-4 py-3 shadow-2xl flex items-center gap-3 sm:max-w-sm" style={{ boxShadow: '0 0 40px rgba(244, 63, 94, 0.12)' }}>
            <div className="w-9 h-9 rounded-lg bg-rose-500/15 flex items-center justify-center text-base flex-shrink-0">❌</div>
            <div className="min-w-0">
              <p className="text-[13px] font-bold text-rose-300">Error</p>
              <p className="text-[11px] text-slate-400 mt-0.5 truncate">{errorMessage}</p>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════ HEADER ════════════════════════ */}
      <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-[#060D18]/80 backdrop-blur-xl">
        <div className="container-responsive py-3 flex items-center justify-between gap-3">
          {/* Left: Branding */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-emerald-600 to-indigo-600 flex items-center justify-center flex-shrink-0 shadow-lg shadow-emerald-500/10">
              <span className="text-sm sm:text-base text-white font-black">Rx</span>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-bold text-white truncate">Medivend Pharmacy</h1>
                <span className="hidden sm:inline-flex px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/15 text-emerald-400 text-[10px] font-bold items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Live
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-slate-500 truncate">{currentUser?.pharmacyName || "Prescription Verification Portal"}</p>
            </div>
          </div>
          
          {/* Right: Nav + User Info + Sign Out */}
          <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
            {/* Nav Buttons */}
            <div className="flex items-center bg-white/[0.03] rounded-lg border border-white/[0.06] p-0.5">
              <button
                onClick={() => setActiveView('dispense')}
                className={`px-2.5 py-1.5 text-[11px] sm:text-xs font-bold rounded-md transition-all ${activeView === 'dispense' ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20' : 'text-slate-500 hover:text-white border border-transparent'}`}
              >
                💊 Dispense
              </button>
              <button
                onClick={() => setActiveView('settings')}
                className={`px-2.5 py-1.5 text-[11px] sm:text-xs font-bold rounded-md transition-all relative ${activeView === 'settings' ? 'bg-indigo-500/15 text-indigo-400 border border-indigo-500/20' : 'text-slate-500 hover:text-white border border-transparent'}`}
              >
                ⚙️ Settings
              </button>
            </div>

            {/* Broadcast indicator */}
            {activeBroadcasts.length > 0 && (
              <div className="relative">
                <span className="text-base cursor-default" title={`${activeBroadcasts.length} active broadcast(s)`}>📢</span>
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center animate-pulse">{activeBroadcasts.length}</span>
              </div>
            )}

            <div className="hidden md:block w-px h-7 bg-white/[0.08]" />
            <div className="hidden md:block text-right">
              <p className="text-[13px] font-semibold text-white">{currentUser?.name}</p>
              <p className="text-[11px] text-slate-500">PRC #{currentUser?.licenseNumber}</p>
            </div>
            <div className="hidden md:block w-px h-7 bg-white/[0.08]" />
            <button 
              onClick={() => setCurrentUser(null)}
              className="px-3 py-1.5 sm:px-3.5 sm:py-2 text-[11px] sm:text-xs font-bold text-rose-400 hover:text-white bg-rose-500/10 hover:bg-rose-500 border border-rose-500/15 hover:border-rose-500 rounded-lg transition-all"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      {/* ═══ BROADCAST BANNER ═══ */}
      {activeBroadcasts.length > 0 && (
        <div className="container-responsive pt-3 space-y-2">
          {activeBroadcasts.map(b => {
            const color = getBroadcastColor(b.priority);
            return (
              <div key={b.id} className={`animate-broadcast-slide ${color.bg} ${color.border} border rounded-xl px-4 py-3 flex items-start gap-3 ${b.priority === 'high' ? 'animate-broadcast-pulse' : ''}`}>
                <span className="text-base flex-shrink-0 mt-0.5">{color.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className={`text-[13px] font-bold ${color.text}`}>System Broadcast</p>
                  <p className="text-[12px] text-slate-300 mt-0.5 leading-relaxed">{b.message}</p>
                  {b.timestamp && (
                    <p className="text-[10px] text-slate-500 mt-1">{new Date(b.timestamp.toMillis()).toLocaleString()}</p>
                  )}
                </div>
                <button onClick={() => setDismissedBroadcasts(prev => [...prev, b.id])} className="text-slate-500 hover:text-white text-sm transition-colors flex-shrink-0 p-1">✕</button>
              </div>
            );
          })}
        </div>
      )}

      {/* ════════════════════════ MAIN CONTENT ════════════════════════ */}
      {activeView === 'dispense' && (
      <main className="container-responsive py-4 sm:py-6 flex-1">
        
        {/* ─── Prescription Lookup ─── */}
        <div className="glass-card p-4 sm:p-5 mb-4">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/15 flex items-center justify-center flex-shrink-0">
              <span className="text-base">🔍</span>
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-white">Look Up Prescription</h2>
              <p className="text-[11px] text-slate-500 hidden sm:block">Enter prescription ID to verify and manage dispensing</p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-2.5">
            <div className="relative flex-1">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-indigo-400 font-bold text-[13px] pointer-events-none select-none z-10">RX-</span>
              <input
                type="text"
                value={prescriptionId}
                onChange={(e) => {
                  const val = e.target.value.replace(/[^0-9]/g, '');
                  setPrescriptionId(val);
                }}
                onKeyDown={(e) => e.key === 'Enter' && handleLookupPrescription()}
                placeholder="Enter number (e.g., 572347)"
                className="input-field pl-12"
                disabled={scanResult !== null}
              />
            </div>
            <button
              onClick={handleLookupPrescription}
              disabled={!prescriptionId.trim() || isLoading || scanResult !== null}
              className="btn-indigo px-5 py-2.5 sm:py-0 flex items-center justify-center gap-2 text-sm whitespace-nowrap"
            >
              {isLoading ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span className="hidden sm:inline">Verifying...</span>
                  <span className="sm:hidden">Verifying...</span>
                </>
              ) : (
                <>🔐 Verify</>
              )}
            </button>
          </div>
        </div>

        {/* ════════════════════════ RESULTS SECTION ════════════════════════ */}
        {scanResult && !showIdWarning && (
          <div className="space-y-3 sm:space-y-4 animate-slide-up stagger-children">

            {/* ─── Top Row: Status Badge + Prescription Details (side by side on desktop) ─── */}
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.5fr] gap-3 sm:gap-4">
              
              {/* Status Badge */}
              <div className={`glass-card-static p-4 border ${getStatusBg(scanResult.status)} animate-slide-up`}>
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{getStatusIcon(scanResult.status)}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] text-slate-400 uppercase tracking-wider">Status</p>
                    <p className={`text-base sm:text-lg font-bold ${getStatusColor(scanResult.status)}`}>{scanResult.status}</p>
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-white/[0.06] flex items-center justify-between">
                  <span className="text-[11px] text-slate-500">Grand Total</span>
                  <span className="text-white font-bold text-base">₱{scanResult.grandTotal.toLocaleString()}</span>
                </div>
              </div>

              {/* Prescription Details */}
              <div className="glass-card-static p-4 animate-slide-up">
                <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-3">Prescription Details</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2.5">
                  <div>
                    <p className="text-[10px] text-slate-500 mb-0.5">Patient</p>
                    <p className="text-[13px] text-white font-semibold truncate">{scanResult.patientName}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-500 mb-0.5">Rx ID</p>
                    <p className="text-[13px] text-white font-mono font-semibold">{scanResult.prescriptionId}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-500 mb-0.5">Date Issued</p>
                    <p className="text-[13px] text-white">{scanResult.dateIssued}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-500 mb-0.5">Prescribed By</p>
                    <p className="text-[13px] text-white truncate">{scanResult.prescribedBy}</p>
                  </div>
                  {scanResult.doctorLicense && (
                    <div>
                      <p className="text-[10px] text-slate-500 mb-0.5">Doctor License</p>
                      <p className="text-[13px] text-white">{scanResult.doctorLicense}</p>
                    </div>
                  )}
                  {scanResult.clinicName && (
                    <div>
                      <p className="text-[10px] text-slate-500 mb-0.5">Clinic</p>
                      <p className="text-[13px] text-white truncate">{scanResult.clinicName}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* ─── Medicine Items ─── */}
            <div className="glass-card-static p-4 animate-slide-up">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Medicine Items</h3>
                <span className="text-[11px] text-slate-500 font-medium">{scanResult.items.length} item(s)</span>
              </div>

              <div className="space-y-2.5">
                {scanResult.items.map((item) => {
                  const currentDispenseQty = dispenseQty[item.id] || 0;
                  const isItemDone = item.remaining <= 0;
                  const progressPct = item.prescribed > 0 ? ((item.alreadyDispensed) / item.prescribed) * 100 : 0;

                  return (
                    <div
                      key={item.id}
                      className={`rounded-xl border p-3 sm:p-4 transition-all duration-300 ${
                        isItemDone
                          ? 'bg-emerald-500/5 border-emerald-500/15'
                          : currentDispenseQty > 0
                            ? 'bg-indigo-500/5 border-indigo-500/20'
                            : 'bg-white/[0.02] border-white/[0.06]'
                      }`}
                    >
                      {/* Desktop: Horizontal layout | Mobile: Stacked */}
                      <div className="flex flex-col lg:flex-row lg:items-center gap-3">
                        {/* Medicine Name */}
                        <div className="flex items-start justify-between lg:flex-1 lg:min-w-0">
                          <div className="min-w-0">
                            <p className="text-[13px] font-bold text-white truncate">{item.name}</p>
                            {item.dosage && <p className="text-[11px] text-slate-400 mt-0.5">{item.dosage}</p>}
                          </div>
                          {isItemDone && (
                            <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md lg:hidden flex-shrink-0 ml-2">
                              Complete
                            </span>
                          )}
                        </div>

                        {/* Stats Row */}
                        <div className="flex items-center gap-2 lg:gap-3 flex-shrink-0">
                          <div className="flex items-center gap-1.5 sm:gap-2">
                            <div className="stat-box px-2.5 sm:px-3 py-1.5">
                              <p className="text-sm sm:text-base font-bold text-indigo-400 leading-none">{item.prescribed}</p>
                              <p className="text-[8px] sm:text-[9px] text-slate-500 uppercase mt-0.5">Prescribed</p>
                            </div>
                            <div className="stat-box px-2.5 sm:px-3 py-1.5">
                              <p className="text-sm sm:text-base font-bold text-slate-400 leading-none">{item.alreadyDispensed}</p>
                              <p className="text-[8px] sm:text-[9px] text-slate-500 uppercase mt-0.5">Bought</p>
                            </div>
                            <div className="stat-box px-2.5 sm:px-3 py-1.5">
                              <p className={`text-sm sm:text-base font-bold leading-none ${item.remaining > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>{item.remaining}</p>
                              <p className="text-[8px] sm:text-[9px] text-slate-500 uppercase mt-0.5">Left</p>
                            </div>
                          </div>

                          {/* Done badge (desktop) */}
                          {isItemDone && (
                            <span className="hidden lg:inline-flex text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-lg">
                              Complete
                            </span>
                          )}
                        </div>

                        {/* Progress Bar + Dispense Controls */}
                        {!isItemDone && (
                          <div className="flex items-center gap-3 lg:flex-shrink-0">
                            {/* Mini progress bar */}
                            <div className="hidden lg:block w-16">
                              <div className="w-full bg-white/[0.05] rounded-full h-1 overflow-hidden">
                                <div
                                  className="h-full rounded-full transition-all duration-500 bg-gradient-to-r from-indigo-500 to-cyan-500"
                                  style={{ width: `${progressPct}%` }}
                                />
                              </div>
                            </div>
                            
                            {/* Dispense controls */}
                            <div className="flex items-center gap-1.5 bg-white/[0.03] border border-white/[0.05] rounded-lg p-1.5">
                              <span className="text-[10px] text-slate-400 font-medium pl-1.5 hidden sm:inline">Buy:</span>
                              <button
                                onClick={() => handleDecrementQty(item.id)}
                                disabled={currentDispenseQty <= 0}
                                className="w-7 h-7 rounded-md bg-white/[0.05] border border-white/[0.08] text-white font-bold text-xs flex items-center justify-center hover:bg-white/[0.1] transition-all active:scale-90 disabled:opacity-25 disabled:cursor-not-allowed"
                              >
                                −
                              </button>
                              <input
                                type="number"
                                value={currentDispenseQty}
                                onChange={(e) => handleSetQty(item.id, e.target.value)}
                                className="w-11 h-7 text-center bg-white/[0.05] border border-white/[0.08] rounded-md text-white font-bold text-xs focus:outline-none focus:border-indigo-400/40"
                                min={0}
                                max={item.remaining}
                              />
                              <button
                                onClick={() => handleIncrementQty(item.id)}
                                disabled={currentDispenseQty >= item.remaining}
                                className="w-7 h-7 rounded-md bg-indigo-600/80 border border-indigo-500/25 text-white font-bold text-xs flex items-center justify-center hover:bg-indigo-500 transition-all active:scale-90 disabled:opacity-25 disabled:cursor-not-allowed"
                              >
                                +
                              </button>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Mobile progress bar */}
                      <div className="lg:hidden mt-2.5">
                        <div className="w-full bg-white/[0.05] rounded-full h-1 overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500 bg-gradient-to-r from-indigo-500 to-cyan-500"
                            style={{ width: `${progressPct}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ─── Bottom Row: Security Check + Dispense Summary (side by side on desktop) ─── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">

              {/* Security Check */}
              <div className="glass-card-static p-4 border-rose-500/15 bg-rose-600/[0.05] animate-slide-up">
                <div className="flex gap-2.5 mb-3">
                  <div className="w-9 h-9 rounded-lg bg-rose-500/10 border border-rose-500/15 flex items-center justify-center flex-shrink-0">
                    <span className="text-base">🛡️</span>
                  </div>
                  <div>
                    <p className="font-bold text-white text-[13px]">Identity Verification</p>
                    <p className="text-[11px] text-rose-300/70 mt-0.5">Confirm buyer's ID or authorization letter</p>
                  </div>
                </div>
                <label className="flex items-start gap-2.5 cursor-pointer group p-2.5 rounded-lg hover:bg-white/[0.03] transition-all -mx-1">
                  <input 
                    type="checkbox" 
                    checked={idVerified}
                    onChange={(e) => setIdVerified(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-600 bg-white/[0.05] cursor-pointer accent-indigo-500 mt-0.5 flex-shrink-0" 
                  />
                  <span className="text-[12px] text-slate-300 group-hover:text-white transition-colors leading-relaxed">
                    I verified Government ID of <strong className="text-white">{scanResult.patientName}</strong> or Authorized Representative
                  </span>
                </label>
              </div>

              {/* Dispense Summary + Actions */}
              <div className="glass-card-static p-4 animate-slide-up">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Dispense Summary</h3>
                  <span className={`text-[13px] font-bold ${totalToDispense > 0 ? 'text-indigo-400' : 'text-slate-600'}`}>
                    {totalToDispense} item(s)
                  </span>
                </div>

                {/* Mini breakdown */}
                {totalToDispense > 0 && (
                  <div className="space-y-1 mb-3 p-2.5 rounded-lg bg-white/[0.03] border border-white/[0.05]">
                    {scanResult.items.map(item => {
                      const qty = dispenseQty[item.id] || 0;
                      if (qty === 0) return null;
                      return (
                        <div key={item.id} className="flex items-center justify-between text-[12px]">
                          <span className="text-slate-300 truncate mr-3">{item.name} {item.dosage && `(${item.dosage})`}</span>
                          <span className="text-indigo-400 font-bold flex-shrink-0">×{qty}</span>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="flex gap-2">
                  <button
                    onClick={handleSaveToDatabase}
                    disabled={!idVerified || totalToDispense === 0 || isSaving}
                    className="btn-emerald flex-1 py-2.5 flex items-center justify-center gap-2 text-[13px] disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {isSaving ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>💾 Save</>
                    )}
                  </button>
                  <button
                    onClick={handleReset}
                    className="btn-ghost flex-1 py-2.5 text-[13px]"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>

          </div>
        )}

        {/* ─── Footer Security Features (when no results shown) ─── */}
        {!scanResult && (
          <div className="mt-4 sm:mt-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
              {[
                { icon: '🔐', label: 'Real-time Verification', desc: 'Instant Rx validation' },
                { icon: '🪪', label: 'ID Validation', desc: 'Government ID required' },
                { icon: '📊', label: 'Audit Trail', desc: 'Full dispensing log' },
                { icon: '☁️', label: 'Cloud Ledger', desc: 'Synced database' },
              ].map((f, i) => (
                <div key={i} className="glass-card p-3 sm:p-4 text-center">
                  <span className="text-xl sm:text-2xl">{f.icon}</span>
                  <p className="text-[11px] sm:text-xs font-bold text-white mt-2">{f.label}</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
      )}

      {/* ════════════════════════ SETTINGS VIEW ════════════════════════ */}
      {activeView === 'settings' && (
      <main className="container-responsive py-4 sm:py-6 flex-1">
        {/* Tab Navigation */}
        <div className="flex items-center gap-1 mb-5 bg-white/[0.03] rounded-xl border border-white/[0.06] p-1">
          {[
            { id: 'profile', label: '🏥 Profile', },
            { id: 'support', label: '🎫 Support', },
            { id: 'security', label: '🔒 Security', },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setSettingsTab(tab.id)}
              className={`flex-1 py-2.5 text-xs sm:text-sm font-bold rounded-lg transition-all ${settingsTab === tab.id ? 'bg-indigo-500/15 text-indigo-400 border border-indigo-500/20 settings-tab-active' : 'text-slate-500 hover:text-white border border-transparent'}`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ─── Profile Tab ─── */}
        {settingsTab === 'profile' && (
          <div className="glass-card p-5 sm:p-6 animate-scale-in">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/15 flex items-center justify-center"><span className="text-lg">🏥</span></div>
              <div>
                <h2 className="text-base font-bold text-white">Pharmacy Profile</h2>
                <p className="text-[11px] text-slate-500">Update your pharmacy information</p>
              </div>
            </div>

            <div className="space-y-4">
              {/* Read-only info */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  { label: 'Registered Name', value: currentUser?.name, icon: '👤' },
                  { label: 'Email Address', value: currentUser?.email, icon: '📧' },
                  { label: 'PRC License', value: currentUser?.licenseNumber, icon: '🏅' },
                ].map(field => (
                  <div key={field.label} className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                    <p className="text-[9px] font-black uppercase tracking-[0.15em] text-slate-500 mb-1">{field.icon} {field.label}</p>
                    <p className="text-sm text-slate-300 font-medium">{field.value || '—'}</p>
                  </div>
                ))}
              </div>

              {/* Editable pharmacy name */}
              <div>
                <label className="block text-[9px] font-black uppercase tracking-[0.15em] mb-2 text-slate-500">🏥 Pharmacy Name</label>
                <input
                  type="text"
                  value={profileForm.pharmacyName}
                  onChange={(e) => setProfileForm({ pharmacyName: e.target.value })}
                  className="input-field"
                  placeholder="Enter pharmacy name"
                />
              </div>

              <button onClick={handleSaveProfile} disabled={profileSaving || !profileForm.pharmacyName.trim()}
                className="btn-emerald px-6 py-2.5 text-sm flex items-center gap-2">
                {profileSaving ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : '💾'} Save Changes
              </button>
            </div>
          </div>
        )}

        {/* ─── Security Tab ─── */}
        {settingsTab === 'security' && (
          <div className="glass-card p-5 sm:p-6 animate-scale-in">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/15 flex items-center justify-center"><span className="text-lg">🔒</span></div>
              <div>
                <h2 className="text-base font-bold text-white">Change Password</h2>
                <p className="text-[11px] text-slate-500">Update your account password</p>
              </div>
            </div>

            <div className="space-y-4 max-w-md">
              <div>
                <label className="block text-[9px] font-black uppercase tracking-[0.15em] mb-2 text-slate-500">Current Password</label>
                <input 
                  type="password" 
                  value={passwordForm.current} 
                  onChange={(e) => setPasswordForm(f => ({ ...f, current: e.target.value }))}
                  className="input-field" 
                  placeholder="Enter current password" 
                />
              </div>
              <div>
                <label className="block text-[9px] font-black uppercase tracking-[0.15em] mb-2 text-slate-500">New Password</label>
                <input 
                  type="password" 
                  value={passwordForm.newPw} 
                  onChange={(e) => setPasswordForm(f => ({ ...f, newPw: e.target.value }))}
                  className="input-field" 
                  placeholder="Enter new password (min 6 chars)" 
                />
              </div>
              <div>
                <label className="block text-[9px] font-black uppercase tracking-[0.15em] mb-2 text-slate-500">Confirm New Password</label>
                <input 
                  type="password" 
                  value={passwordForm.confirm} 
                  onChange={(e) => setPasswordForm(f => ({ ...f, confirm: e.target.value }))}
                  className="input-field" 
                  placeholder="Re-enter new password" 
                />
              </div>

              <button onClick={handleChangePassword} disabled={passwordSaving}
                className="btn-indigo px-6 py-2.5 text-sm flex items-center gap-2">
                {passwordSaving ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : '🔑'} Update Password
              </button>
            </div>
          </div>
        )}


        {/* ─── Support Tab ─── */}
        {settingsTab === 'support' && (
          <div className="animate-scale-in space-y-4">
            {/* Header + New Ticket Button */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/15 flex items-center justify-center"><span className="text-lg">🎫</span></div>
                <div>
                  <h2 className="text-base font-bold text-white">Support Tickets</h2>
                  <p className="text-[11px] text-slate-500">{supportTickets.length} ticket(s) submitted</p>
                </div>
              </div>
              <button onClick={() => setShowNewTicket(!showNewTicket)} className="btn-emerald px-4 py-2 text-xs flex items-center gap-1.5">
                {showNewTicket ? '✕ Cancel' : '+ New Ticket'}
              </button>
            </div>

            {/* New Ticket Form */}
            {showNewTicket && (
              <div className="glass-card p-5 animate-slide-up">
                <h3 className="text-sm font-bold text-white mb-4">Submit a Support Ticket</h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-[9px] font-black uppercase tracking-[0.15em] mb-2 text-slate-500">Subject</label>
                    <input 
                      type="text" 
                      value={ticketForm.subject} 
                      onChange={(e) => setTicketForm(f => ({ ...f, subject: e.target.value }))}
                      className="input-field" 
                      placeholder="Brief description of the issue" 
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] font-black uppercase tracking-[0.15em] mb-2 text-slate-500">Priority</label>
                    <select 
                      value={ticketForm.priority} 
                      onChange={(e) => setTicketForm(f => ({ ...f, priority: e.target.value }))}
                      className="input-field"
                    >
                      <option value="low">🟢 Low</option>
                      <option value="normal">🟡 Normal</option>
                      <option value="high">🔴 High</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[9px] font-black uppercase tracking-[0.15em] mb-2 text-slate-500">Message</label>
                    <textarea 
                      value={ticketForm.message} 
                      onChange={(e) => setTicketForm(f => ({ ...f, message: e.target.value }))}
                      className="input-field min-h-[100px] resize-y" 
                      placeholder="Describe the issue in detail..." 
                    />
                  </div>
                  <button onClick={handleSubmitTicket} disabled={ticketLoading || !ticketForm.subject.trim() || !ticketForm.message.trim()}
                    className="btn-indigo px-6 py-2.5 text-sm flex items-center gap-2">
                    {ticketLoading ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : '📤'} Submit Ticket
                  </button>
                </div>
              </div>
            )}

            {/* Ticket List */}
            {supportTickets.length === 0 ? (
              <div className="glass-card p-8 text-center">
                <span className="text-4xl block mb-3">📭</span>
                <p className="text-slate-400 font-bold text-sm">No tickets yet</p>
                <p className="text-slate-500 text-xs mt-1">Submit a ticket if you need help</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {supportTickets.map(ticket => {
                  const statusColors = {
                    open: { bg: 'bg-blue-500/10', border: 'border-blue-500/20', text: 'text-blue-400', label: 'Open' },
                    in_progress: { bg: 'bg-amber-500/10', border: 'border-amber-500/20', text: 'text-amber-400', label: 'In Progress' },
                    resolved: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', text: 'text-emerald-400', label: 'Resolved' },
                  };
                  const s = statusColors[ticket.status] || statusColors.open;
                  const priorityIcons = { high: '🔴', normal: '🟡', low: '🟢' };
                  return (
                    <div key={ticket.id} className="glass-card p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs">{priorityIcons[ticket.priority] || '🟡'}</span>
                            <h3 className="text-sm font-bold text-white truncate">{ticket.subject}</h3>
                          </div>
                          <p className="text-[12px] text-slate-400 line-clamp-2">{ticket.message}</p>
                          {ticket.timestamp && (
                            <p className="text-[10px] text-slate-500 mt-1.5">{new Date(ticket.timestamp.toMillis()).toLocaleString()}</p>
                          )}
                          {ticket.adminReply && (
                            <div className="mt-2.5 p-2.5 rounded-lg bg-indigo-500/10 border border-indigo-500/15">
                              <p className="text-[10px] font-bold text-indigo-400 mb-0.5">💬 Admin Reply</p>
                              <p className="text-[12px] text-slate-300">{ticket.adminReply}</p>
                            </div>
                          )}
                        </div>
                        <span className={`px-2 py-1 rounded-lg text-[10px] font-bold ${s.bg} ${s.border} border ${s.text} flex-shrink-0`}>{s.label}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </main>
      )}


      {/* ═══ Mobile User Info Bar (bottom) ═══ */}
      <div className="md:hidden sticky bottom-0 z-30 border-t border-white/[0.06] bg-[#060D18]/90 backdrop-blur-xl px-4 py-2.5 flex items-center justify-between">
        <div className="min-w-0">
          <p className="text-[12px] font-semibold text-white truncate">{currentUser?.name}</p>
          <p className="text-[10px] text-slate-500">PRC #{currentUser?.licenseNumber}</p>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[10px] text-emerald-400 font-medium">Connected</span>
        </div>
      </div>
    </div>
  );
}

export default App;
