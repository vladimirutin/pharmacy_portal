const fs = require('fs');

const targetPath = "c:/Users/sasam/Desktop/Medivend Systems code/admin/src/App.jsx";
let content = fs.readFileSync(targetPath, 'utf8');
const CR = '\r\n';

// ============================================
// 1. Inject PharmacistsView COMPONENT before MachinesView (line 1228)
// ============================================
const machinesMarker = 'function MachinesView({ machines, onPing, onRunDiagnostics, onReboot, onLock, onDelete, isDarkMode }) {';

const pharmacistsViewComponent = [
  '',
  'function PharmacistsView({ pharmacists, filter, setFilter, onRefresh, onUpdateStatus, onUpdatePassword, onDelete, loading, isDarkMode }) {',
  '  const [searchTerm, setSearchTerm] = useState(\'\');',
  '  const [currentPage, setCurrentPage] = useState(1);',
  '  const itemsPerPage = 10;',
  '',
  '  const filteredDocs = pharmacists.filter(doc =>',
  '    (doc.name?.toLowerCase() || \'\').includes(searchTerm.toLowerCase()) ||',
  '    (doc.email?.toLowerCase() || \'\').includes(searchTerm.toLowerCase()) ||',
  '    (doc.licenseNumber?.toLowerCase() || \'\').includes(searchTerm.toLowerCase()) ||',
  '    (doc.pharmacyName?.toLowerCase() || \'\').includes(searchTerm.toLowerCase())',
  '  );',
  '',
  '  const totalPages = Math.ceil(filteredDocs.length / itemsPerPage);',
  '  const currentData = filteredDocs.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);',
  '  const filterBtns = [\'pending\', \'active\', \'rejected\', \'all\'];',
  '',
  '  return (',
  '    <>',
  '      <TableContainer isDarkMode={isDarkMode} className="max-w-7xl mx-auto">',
  '        <div className={`p-5 border-b ${isDarkMode ? \'border-white/5\' : \'border-gray-100\'}`}>',
  '          <div className="flex justify-between items-center mb-4">',
  '            <div>',
  '              <h3 className={`font-display font-bold text-base ${isDarkMode ? \'text-white\' : \'text-slate-900\'}`}>Pharmacists Network</h3>',
  '              <p className={`text-xs mt-0.5 ${isDarkMode ? \'text-slate-500\' : \'text-slate-400\'}`}>{pharmacists.length} registered pharmacists</p>',
  '            </div>',
  '            <button onClick={onRefresh} className={`p-2 rounded-lg transition-all btn-hover-lift ${isDarkMode ? \'text-slate-400 hover:bg-white/5 hover:text-emerald-400\' : \'text-slate-400 hover:bg-gray-100 hover:text-emerald-600\'}`}>',
  '              <RefreshCw className={`w-4 h-4 ${loading ? \'animate-spin\' : \'\'}`} />',
  '            </button>',
  '          </div>',
  '          <div className="flex flex-col sm:flex-row gap-3">',
  '            <div className={`flex p-1 rounded-xl gap-1 ${isDarkMode ? \'bg-white/5\' : \'bg-gray-100\'}`}>',
  '              {filterBtns.map(f => (',
  '                <button key={f} onClick={() => setFilter(f)}',
  '                  className={`px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wide transition-all whitespace-nowrap ${filter === f ? \'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20\' : isDarkMode ? \'text-slate-400 hover:text-white\' : \'text-slate-400 hover:text-slate-700\'}`}',
  '                >{f}</button>',
  '              ))}',
  '            </div>',
  '            <div className="relative flex-1 max-w-xs">',
  '              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />',
  '              <input type="text" placeholder="Search pharmacists..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}',
  '                className={`w-full pl-8 pr-3 py-2 rounded-xl text-xs border outline-none focus:ring-2 focus:ring-indigo-500/30 transition-all ${isDarkMode ? \'bg-white/5 border-white/10 text-white placeholder-slate-600\' : \'bg-white border-gray-200 text-slate-700 placeholder-slate-400\'}`} />',
  '            </div>',
  '          </div>',
  '        </div>',
  '',
  '        {/* Mobile */}',
  '        <div className="md:hidden divide-y divide-white/5">',
  '          {currentData.length === 0 ? (',
  '            <div className="p-10 text-center"><Users className="w-8 h-8 text-slate-600 mx-auto mb-2" /><p className="text-xs text-slate-500 italic">No pharmacists found</p></div>',
  '          ) : currentData.map(doc => (',
  '            <div key={doc.id} className={`p-4 relative flex flex-col gap-3 transition-colors ${isDarkMode ? \'hover:bg-white/3\' : \'hover:bg-gray-50\'}`}>',
  '              <div className="absolute top-4 right-4 z-20">',
  '                <MobileMenu isDarkMode={isDarkMode}>',
  '                  {doc.status === \'pending\' && (<><button onClick={() => onUpdateStatus(doc.id, \'active\')} className="flex items-center gap-2 w-full px-3 py-2 text-xs font-bold text-left text-emerald-400 hover:bg-emerald-500/10 rounded-xl"><CheckCircle className="w-3.5 h-3.5" /> Approve</button><button onClick={() => onUpdateStatus(doc.id, \'rejected\')} className="flex items-center gap-2 w-full px-3 py-2 text-xs font-bold text-left text-rose-400 hover:bg-rose-500/10 rounded-xl"><XCircle className="w-3.5 h-3.5" /> Reject</button></>)}',
  '                  {doc.status === \'active\' && <button onClick={() => onUpdateStatus(doc.id, \'rejected\')} className="flex items-center gap-2 w-full px-3 py-2 text-xs font-bold text-left text-rose-400 hover:bg-rose-500/10 rounded-xl"><XCircle className="w-3.5 h-3.5" /> Revoke</button>}',
  '                  {doc.status === \'rejected\' && <button onClick={() => onUpdateStatus(doc.id, \'active\')} className="flex items-center gap-2 w-full px-3 py-2 text-xs font-bold text-left text-emerald-400 hover:bg-emerald-500/10 rounded-xl"><CheckCircle className="w-3.5 h-3.5" /> Restore</button>}',
  '                  <button onClick={() => onDelete(doc.id)} className="flex items-center gap-2 w-full px-3 py-2 text-xs font-bold text-left text-rose-400 hover:bg-rose-500/10 rounded-xl"><Trash2 className="w-3.5 h-3.5" /> Delete</button>',
  '                </MobileMenu>',
  '              </div>',
  '              <div className="flex items-center gap-3">',
  '                <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-display font-bold text-sm ${isDarkMode ? \'bg-indigo-500/20 text-indigo-300\' : \'bg-indigo-50 text-indigo-600\'}`}>{doc.name?.charAt(0) || \'?\'}</div>',
  '                <div>',
  '                  <p className={`font-bold text-sm pr-10 ${isDarkMode ? \'text-white\' : \'text-slate-900\'}`}>{doc.name}</p>',
  '                  <p className="text-xs text-emerald-400">{doc.pharmacyName}</p>',
  '                  <p className="text-xs text-slate-500">{doc.email}</p>',
  '                </div>',
  '              </div>',
  '              <div className="flex items-center gap-3">',
  '                <StatusBadge status={doc.status} />',
  '                <span className={`font-mono text-[10px] ${isDarkMode ? \'text-slate-500\' : \'text-slate-400\'}`}>{doc.licenseNumber || \'N/A\'}</span>',
  '              </div>',
  '            </div>',
  '          ))}',
  '        </div>',
  '',
  '        {/* Desktop */}',
  '        <div className="hidden md:block overflow-x-auto rounded-b-2xl">',
  '          <table className="w-full text-left">',
  '            <TableHeader isDarkMode={isDarkMode}>',
  '              <tr><th className="px-6 py-4">Pharmacist</th><th className="px-6 py-4">Workspace</th><th className="px-6 py-4">License</th><th className="px-6 py-4">Status</th><th className="px-6 py-4 text-right">Actions</th></tr>',
  '            </TableHeader>',
  '            <tbody className={`divide-y ${isDarkMode ? \'divide-white/5\' : \'divide-gray-50\'}`}>',
  '              {currentData.length === 0 ? (',
  '                <tr><td colSpan="5" className="p-10 text-center text-xs text-slate-500 italic">No pharmacists found</td></tr>',
  '              ) : currentData.map(doc => (',
  '                <tr key={doc.id} className={`table-row-hover ${isDarkMode ? \'hover:bg-white/3\' : \'hover:bg-gray-50\'}`}>',
  '                  <td className="px-6 py-4">',
  '                    <div className="flex items-center gap-3">',
  '                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-display font-bold text-xs ${isDarkMode ? \'bg-indigo-500/15 text-indigo-300\' : \'bg-indigo-50 text-indigo-600\'}`}>{doc.name?.charAt(0) || \'?\'}</div>',
  '                      <div>',
  '                        <p className={`font-semibold text-sm ${isDarkMode ? \'text-white\' : \'text-slate-900\'}`}>{doc.name}</p>',
  '                        <p className={`text-[11px] ${isDarkMode ? \'text-slate-500\' : \'text-slate-400\'}`}>{doc.email}</p>',
  '                      </div>',
  '                    </div>',
  '                  </td>',
  '                  <td className="px-6 py-4"><span className="text-xs text-emerald-400 font-bold">{doc.pharmacyName}</span></td>',
  '                  <td className={`px-6 py-4 font-mono text-xs ${isDarkMode ? \'text-slate-400\' : \'text-slate-500\'}`}>{doc.licenseNumber || \'N/A\'}</td>',
  '                  <td className="px-6 py-4"><StatusBadge status={doc.status} /></td>',
  '                  <td className="px-6 py-4 text-right">',
  '                    <div className="flex items-center justify-end gap-2">',
  '                      {doc.status === \'pending\' && (<><button onClick={() => onUpdateStatus(doc.id, \'active\')} className="p-1.5 text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition-colors" title="Approve"><CheckCircle className="w-4 h-4" /></button><button onClick={() => onUpdateStatus(doc.id, \'rejected\')} className="p-1.5 text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors" title="Reject"><XCircle className="w-4 h-4" /></button></>)}',
  '                      {doc.status === \'active\' && <button onClick={() => onUpdateStatus(doc.id, \'rejected\')} className="p-1.5 text-amber-400 hover:bg-amber-500/10 rounded-lg transition-colors" title="Revoke"><XCircle className="w-4 h-4" /></button>}',
  '                      {doc.status === \'rejected\' && <button onClick={() => onUpdateStatus(doc.id, \'active\')} className="p-1.5 text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition-colors" title="Restore"><CheckCircle className="w-4 h-4" /></button>}',
  '                      <button onClick={() => onDelete(doc.id)} className="p-1.5 text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors" title="Delete"><Trash2 className="w-4 h-4" /></button>',
  '                    </div>',
  '                  </td>',
  '                </tr>',
  '              ))}',
  '            </tbody>',
  '          </table>',
  '        </div>',
  '      </TableContainer>',
  '    </>',
  '  );',
  '}',
  '',
].join(CR);

if (!content.includes('function PharmacistsView')) {
  content = content.replace(machinesMarker, pharmacistsViewComponent + CR + machinesMarker);
  console.log('[1/8] PharmacistsView component injected');
} else {
  console.log('[1/8] PharmacistsView component already exists, skipped');
}

// ============================================
// 2. Add `pharmacists` STATE (after doctors state, line 1886)
// ============================================
const stateMarker = "  const [doctors, setDoctors] = useState([]);\r\n  const [transactions, setTransactions] = useState([]);";
const stateReplacement = "  const [doctors, setDoctors] = useState([]);\r\n  const [pharmacists, setPharmacists] = useState([]);\r\n  const [transactions, setTransactions] = useState([]);";

if (!content.includes('setPharmacists')) {
  content = content.replace(stateMarker, stateReplacement);
  console.log('[2/8] Pharmacists state injected');
} else {
  console.log('[2/8] Pharmacists state already exists, skipped');
}

// ============================================
// 3. Add Firestore LISTENER (after doctors listener, line 1915)
// ============================================
const listenerMarker = "onSnapshot(query(collection(db, 'artifacts', appId, 'public', 'data', 'doctors')), snap => setDoctors(snap.docs.map(d => ({ id: d.id, ...d.data() }))), err => console.error(err)),";
const listenerReplacement = listenerMarker + CR + "      onSnapshot(query(collection(db, 'artifacts', appId, 'public', 'data', 'pharmacists')), snap => setPharmacists(snap.docs.map(d => ({ id: d.id, ...d.data() }))), err => console.error(err)),";

if (!content.includes("'pharmacists')), snap => setPharmacists")) {
  content = content.replace(listenerMarker, listenerReplacement);
  console.log('[3/8] Pharmacists listener injected');
} else {
  console.log('[3/8] Pharmacists listener already exists, skipped');
}

// ============================================
// 4. Add HANDLERS (before handlePingMachine, line 1980)
// ============================================
const handlersMarker = '  const handlePingMachine = async (machineId) =>';
const handlersInject = [
  '  const updatePharmacistStatus = async (pharmacistId, newStatus) => {',
  '    try {',
  "      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'pharmacists', pharmacistId), { status: newStatus, adminReviewedAt: serverTimestamp() }, { merge: true });",
  "      await addAuditLog('Pharmacist Status Update', `Set ${String.fromCharCode(36)}{pharmacistId} to ${String.fromCharCode(36)}{newStatus}`);",
  '      showNotification(`Pharmacist status updated to ${String.fromCharCode(36)}{newStatus}`);',
  "    } catch (e) { showNotification(\"Update failed: \" + e.message, 'error'); }",
  '  };',
  '',
  '  const handlePharmacistPasswordUpdate = async (pharmacistId, newPassword) => {',
  '    if (!newPassword) return;',
  '    try {',
  "      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'pharmacists', pharmacistId), { password: newPassword });",
  '      await addAuditLog("Pharmacist Mgmt", `Updated password for pharmacist ${String.fromCharCode(36)}{pharmacistId}`);',
  '      showNotification("Pharmacist password updated");',
  "    } catch (e) { showNotification(\"Update failed: \" + e.message, 'error'); }",
  '  };',
  '',
  '  const handleDeletePharmacist = (pharmacistId) => {',
  '    setConfirmConfig({',
  '      title: "Delete Pharmacist Account?",',
  '      message: `Permanently remove ${String.fromCharCode(36)}{pharmacistId}?\\n\\nThis action cannot be undone.`,',
  "      type: 'danger', confirmText: 'Delete Account',",
  '      onConfirm: async () => {',
  '        setConfirmConfig(null);',
  '        try {',
  "          await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'pharmacists', pharmacistId));",
  '          await addAuditLog("Pharmacist Deletion", `Removed pharmacist: ${String.fromCharCode(36)}{pharmacistId}`);',
  '          showNotification("Pharmacist account deleted");',
  "        } catch (e) { showNotification(\"Deletion failed: \" + e.message, 'error'); }",
  '      }',
  '    });',
  '  };',
  '',
].join(CR);

if (!content.includes('const updatePharmacistStatus = async')) {
  content = content.replace(handlersMarker, handlersInject + CR + handlersMarker);
  console.log('[4/8] Pharmacist handlers injected');
} else {
  console.log('[4/8] Pharmacist handlers already exist, skipped');
}

// ============================================
// 5. Add COUNTERS (after pendingDocs, line 2154)
// ============================================
const countersMarker = "  const pendingDocs = doctors.filter(d => d.status === 'pending').length;\r\n  const activeDocs";
const countersReplacement = "  const pendingDocs = doctors.filter(d => d.status === 'pending').length;\r\n  const pendingPharmacists = pharmacists.filter(p => p.status === 'pending').length;\r\n  const displayedPharmacists = pharmacists.filter(p => filter === 'all' ? true : p.status === filter);\r\n  const activeDocs";

if (!content.includes('pendingPharmacists')) {
  content = content.replace(countersMarker, countersReplacement);
  console.log('[5/8] Pharmacist counters injected');
} else {
  console.log('[5/8] Pharmacist counters already exist, skipped');
}

// ============================================
// 6. Update TOTAL NOTIFICATIONS (line 2158)
// ============================================
const notifMarker = 'const totalNotifications = pendingDocs + openTickets;';
const notifReplacement = 'const totalNotifications = pendingDocs + pendingPharmacists + openTickets;';

if (!content.includes('pendingPharmacists + openTickets')) {
  content = content.replace(notifMarker, notifReplacement);
  console.log('[6/8] Total notifications updated');
} else {
  console.log('[6/8] Total notifications already updated, skipped');
}

// ============================================
// 7. Add NAV ITEM (after doctors nav item, line 2178)
// ============================================
const navMarker = "        { id: 'doctors', label: 'Doctors', icon: <Users />, badge: pendingDocs },\r\n        { id: 'machines'";
const navReplacement = "        { id: 'doctors', label: 'Doctors', icon: <Users />, badge: pendingDocs },\r\n        { id: 'pharmacists', label: 'Pharmacists', icon: <User />, badge: pendingPharmacists > 0 ? pendingPharmacists : null },\r\n        { id: 'machines'";

if (!content.includes("id: 'pharmacists'")) {
  content = content.replace(navMarker, navReplacement);
  console.log('[7/8] Nav item injected');
} else {
  console.log('[7/8] Nav item already exists, skipped');
}

// ============================================
// 8. Add ROUTE (after doctors route, line 2512)
// ============================================
const routeMarker = "          {activeTab === 'doctors' && <DoctorsView doctors={displayedDoctors} filter={filter} setFilter={setFilter} onRefresh={() => { }} onUpdateStatus={updateDoctorStatus} onUpdatePassword={handleDoctorPasswordUpdate} onDelete={handleDeleteDoctor} loading={loading} isDarkMode={isDarkMode} />}\r\n          {activeTab === 'machines'";
const routeReplacement = "          {activeTab === 'doctors' && <DoctorsView doctors={displayedDoctors} filter={filter} setFilter={setFilter} onRefresh={() => { }} onUpdateStatus={updateDoctorStatus} onUpdatePassword={handleDoctorPasswordUpdate} onDelete={handleDeleteDoctor} loading={loading} isDarkMode={isDarkMode} />}\r\n          {activeTab === 'pharmacists' && <PharmacistsView pharmacists={displayedPharmacists} filter={filter} setFilter={setFilter} onRefresh={() => { }} onUpdateStatus={updatePharmacistStatus} onUpdatePassword={handlePharmacistPasswordUpdate} onDelete={handleDeletePharmacist} loading={loading} isDarkMode={isDarkMode} />}\r\n          {activeTab === 'machines'";

if (!content.includes("activeTab === 'pharmacists'")) {
  content = content.replace(routeMarker, routeReplacement);
  console.log('[8/8] Route injected');
} else {
  console.log('[8/8] Route already exists, skipped');
}

// ============================================
// BONUS: Add stat card + notification dropdown entry
// ============================================
// Stat card
const statMarker = "                  { title: 'Pending Approvals', value: pendingDocs, icon: <Users className=\"w-5 h-5\" />, color: 'amber', subtext: 'Needs attention', onClick: () => { setActiveTab('doctors'); setFilter('pending'); } },";
const statReplacement = "                  { title: 'Pending Pharmacists', value: pendingPharmacists, icon: <User className=\"w-5 h-5\" />, color: 'emerald', subtext: 'Pending access', onClick: () => { setActiveTab('pharmacists'); setFilter('pending'); } },\r\n                  { title: 'Pending Approvals', value: pendingDocs, icon: <Users className=\"w-5 h-5\" />, color: 'amber', subtext: 'Needs attention', onClick: () => { setActiveTab('doctors'); setFilter('pending'); } },";
if (!content.includes("title: 'Pending Pharmacists'")) {
  content = content.replace(statMarker, statReplacement);
  console.log('[BONUS] Stat card injected');
}

// Notification dropdown entry
const notifDropMarker = "                    {openTickets > 0 && (";
const notifDropReplacement = `                    {pendingPharmacists > 0 && (\r\n                      <button onClick={() => { setActiveTab('pharmacists'); setFilter('pending'); setIsNotifOpen(false); }} className={\`w-full p-4 text-left flex items-center justify-between transition-all hover:bg-emerald-500/5 border-b \${isDarkMode ? 'border-white/5' : 'border-gray-50'}\`}>\r\n                        <div className="flex items-center gap-3">\r\n                          <div className="p-2 rounded-xl bg-emerald-500/10"><User className="w-4 h-4 text-emerald-400" /></div>\r\n                          <div><p className={\`font-bold text-sm \${isDarkMode ? 'text-white' : 'text-slate-900'}\`}>Pending Pharmacists</p><p className="text-xs text-slate-500">Review pharmacist access</p></div>\r\n                        </div>\r\n                        <span className="bg-emerald-500/15 text-emerald-400 text-xs px-2 py-1 rounded-xl font-bold border border-emerald-500/20">{pendingPharmacists}</span>\r\n                      </button>\r\n                    )}\r\n                    {openTickets > 0 && (`;
if (!content.includes('Pending Pharmacists')) {
  content = content.replace(notifDropMarker, notifDropReplacement);
  console.log('[BONUS] Notification dropdown injected');
}

fs.writeFileSync(targetPath, content);
console.log('\n=== Admin Dashboard fully updated! ===');
console.log('Total file size:', content.length, 'bytes');
