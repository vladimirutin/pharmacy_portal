import React, { useState, useRef, useEffect } from 'react';
import { collection, query, where, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebase';

export default function AuthScreen({ onLogin }) {
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [pendingEmail, setPendingEmail] = useState(null);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockoutTimer, setLockoutTimer] = useState(0);
  const fileInputRef = useRef(null);
  const selfieInputRef = useRef(null);
  
  // Registration Form State
  const [regForm, setRegForm] = useState({
    name: '',
    email: '',
    password: '',
    licenseNumber: '',
    pharmacyName: ''
  });
  const [licenseImage, setLicenseImage] = useState(null);
  const [licensePreview, setLicensePreview] = useState(null);
  const [selfieImage, setSelfieImage] = useState(null);
  const [selfiePreview, setSelfiePreview] = useState(null);

  // Login Form State
  const [loginForm, setLoginForm] = useState({
    email: '',
    password: ''
  });

  useEffect(() => { setTimeout(() => setMounted(true), 50); }, []);

  useEffect(() => {
    let interval;
    if (lockoutTimer > 0) {
      interval = setInterval(() => setLockoutTimer(p => p - 1), 1000);
    } else if (failedAttempts >= 5) {
      setFailedAttempts(0); setError('');
    }
    return () => clearInterval(interval);
  }, [lockoutTimer, failedAttempts]);

  const handleRegisterChange = (e) => setRegForm({ ...regForm, [e.target.name]: e.target.value });
  const handleLoginChange = (e) => setLoginForm({ ...loginForm, [e.target.name]: e.target.value });

  // Compress image to base64
  const compressImage = (file, maxWidth = 800, quality = 0.7) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new window.Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let w = img.width, h = img.height;
          if (w > maxWidth) { h = (maxWidth / w) * h; w = maxWidth; }
          canvas.width = w; canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.onerror = reject;
        img.src = e.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleImageSelect = async (e, type) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { setError('Please select an image file.'); return; }
    if (file.size > 10 * 1024 * 1024) { setError('Image must be less than 10MB.'); return; }
    try {
      const compressed = await compressImage(file);
      if (type === 'license') {
        setLicenseImage(compressed);
        setLicensePreview(compressed);
      } else {
        setSelfieImage(compressed);
        setSelfiePreview(compressed);
      }
      setError('');
    } catch { setError('Failed to process image.'); }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setError(''); setPendingEmail(null);
    
    if (!regForm.name || !regForm.email || !regForm.password || !regForm.licenseNumber || !regForm.pharmacyName) {
      setError('All fields are required.');
      return;
    }
    if (!licenseImage) {
      setError('Please upload a clear photo of your PRC License ID.');
      return;
    }
    if (!selfieImage) {
      setError('Please upload a selfie photo of yourself.');
      return;
    }

    setLoading(true);
    try {
      const q = query(collection(db, 'artifacts', 'medivend-local', 'public', 'data', 'pharmacists'), where('email', '==', regForm.email));
      const querySnapshot = await getDocs(q);
      
      if (!querySnapshot.empty) {
        setError('An account with this email already exists.');
        setLoading(false);
        return;
      }

      await addDoc(collection(db, 'artifacts', 'medivend-local', 'public', 'data', 'pharmacists'), {
        ...regForm,
        licenseImage: licenseImage,
        selfieImage: selfieImage,
        role: 'pharmacist',
        status: 'pending',
        createdAt: serverTimestamp()
      });

      setRegForm({ name: '', email: '', password: '', licenseNumber: '', pharmacyName: '' });
      setLicenseImage(null);
      setLicensePreview(null);
      setSelfieImage(null);
      setSelfiePreview(null);
      setIsLogin(true);
      setPendingEmail(regForm.email);
    } catch (err) {
      console.error("Registration error:", err);
      setError('Failed to register. Please try again.');
    }
    setLoading(false);
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    if (lockoutTimer > 0) return;
    setError(''); setPendingEmail(null);
    
    if (!loginForm.email || !loginForm.password) {
      setError('Please enter your email and password.');
      return;
    }

    setLoading(true);
    try {
      const q = query(
        collection(db, 'artifacts', 'medivend-local', 'public', 'data', 'pharmacists'), 
        where('email', '==', loginForm.email),
        where('password', '==', loginForm.password)
      );
      
      const querySnapshot = await getDocs(q);
      
      if (querySnapshot.empty) {
        const newCount = failedAttempts + 1;
        setFailedAttempts(newCount);
        if (newCount >= 5) {
          setLockoutTimer(10);
          setError('Maximum attempts reached. Please wait 10s.');
        } else {
          setError(`Invalid credentials. ${5 - newCount} attempts remaining.`);
        }
        setLoading(false);
        return;
      }

      const userDoc = querySnapshot.docs[0];
      const userData = { id: userDoc.id, ...userDoc.data() };

      if (userData.status === 'pending') {
        setPendingEmail(loginForm.email);
      } else if (userData.status === 'rejected') {
        setError('Your account has been rejected.');
      } else if (userData.status === 'active') {
        setFailedAttempts(0);
        onLogin(userData);
      } else {
        setError('Account status unknown.');
      }
    } catch (err) {
      console.error("Login error:", err);
      setError('Connection error. Check your internet connection.');
    }
    setLoading(false);
  };

  const switchMode = () => {
    setIsLogin(!isLogin);
    setError('');
    setPendingEmail(null);
    setRegForm({ name: '', email: '', password: '', licenseNumber: '', pharmacyName: '' });
    setLoginForm({ email: '', password: '' });
    setLicenseImage(null); setLicensePreview(null);
    setSelfieImage(null); setSelfiePreview(null);
    setShowPassword(false);
  };

  const fieldInputClass = "w-full pl-10 pr-4 py-3 rounded-xl border text-sm font-medium outline-none transition-all duration-200 bg-white/[0.04] border-white/[0.08] text-white placeholder-slate-600 hover:border-white/[0.15] focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500/50 focus:shadow-[0_0_20px_rgba(16,185,129,0.08)]";
  const fieldInputClassNoIcon = "w-full pl-4 pr-4 py-3 rounded-xl border text-sm font-medium outline-none transition-all duration-200 bg-white/[0.04] border-white/[0.08] text-white placeholder-slate-600 hover:border-white/[0.15] focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500/50 focus:shadow-[0_0_20px_rgba(16,185,129,0.08)]";

  return (
    <div className="flex min-h-screen min-h-[100dvh] w-full bg-[#0B0F19] overflow-y-auto relative">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-emerald-900/30 via-[#0B0F19] to-black opacity-90" />

      {/* ═══════════════════════ LEFT: Form Panel ═══════════════════════ */}
      <div className={`auth-panel-left w-full lg:w-[560px] min-h-full relative z-10 flex flex-col items-center justify-start lg:justify-center py-8 px-5 sm:px-6 lg:p-10 transition-all duration-700 ${mounted ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-8'}`}>
        
        {/* Logo */}
        <div className="w-full max-w-md mb-7">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 via-emerald-600 to-teal-700 flex items-center justify-center shadow-[0_8px_32px_rgba(16,185,129,0.45)]">
                <span className="text-lg text-white font-black">Rx</span>
              </div>
              <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-emerald-400 border-2 border-[#060b18] shadow-[0_0_10px_rgba(52,211,153,0.6)]" />
            </div>
            <div>
              <h1 className="text-xl font-black text-white tracking-tight">MediVend</h1>
              <p className="text-[10px] text-emerald-400 font-bold uppercase tracking-[0.25em]">Pharmacy Portal</p>
            </div>
          </div>
        </div>

        {/* Auth Card */}
        <div className="w-full max-w-md">
          <div className="rounded-3xl border border-white/[0.08] p-6 sm:p-8 shadow-2xl overflow-hidden relative" style={{ background: 'linear-gradient(135deg, rgba(16,185,129,0.03) 0%, rgba(11,15,25,0.95) 50%, rgba(99,102,241,0.03) 100%)' }}>
            {/* Glow effect */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[200px] h-[1px] bg-gradient-to-r from-transparent via-emerald-500/50 to-transparent" />
            
            <div className="relative z-10">
              {/* Header */}
              <div className="mb-6">
                <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight mb-1.5">
                  {isLogin ? 'Welcome back' : 'Join MediVend'}
                </h2>
                <p className="text-slate-500 text-sm">{isLogin ? 'Sign in to your pharmacy dashboard.' : 'Create your pharmacist account.'}</p>
              </div>

              {/* Pending Approval Notice */}
              {pendingEmail && (
                <div className="mb-5 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-sm flex items-start gap-3">
                  <span className="text-base mt-0.5 flex-shrink-0">⚠️</span>
                  <div>
                    <p className="font-bold text-amber-200 text-sm">Account Pending Approval</p>
                    <p className="mt-0.5 opacity-70 text-xs">Your account is under review by the admin.</p>
                  </div>
                </div>
              )}

              {/* Error Message */}
              {error && (
                <div className="mb-5 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-sm flex items-center gap-2">
                  <span className="flex-shrink-0">⚠️</span> {error}
                </div>
              )}

              {/* ─── LOGIN FORM ─── */}
              {isLogin ? (
                <form onSubmit={handleLogin} className="space-y-3.5">
                  {/* Email */}
                  <div>
                    <label className="block text-[9px] font-black uppercase tracking-[0.15em] mb-2 text-slate-500">Email Address</label>
                    <div className="relative group">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-emerald-400 transition-colors z-10 text-sm">📧</span>
                      <input
                        type="email" name="email"
                        value={loginForm.email} onChange={handleLoginChange}
                        className={fieldInputClass}
                        placeholder="pharmacist@example.com"
                        required
                      />
                    </div>
                  </div>

                  {/* Password */}
                  <div>
                    <label className="block text-[9px] font-black uppercase tracking-[0.15em] mb-2 text-slate-500">Password</label>
                    <div className="relative group">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-emerald-400 transition-colors z-10 text-sm">🔒</span>
                      <input
                        type={showPassword ? 'text' : 'password'} name="password"
                        value={loginForm.password} onChange={handleLoginChange}
                        className={`${fieldInputClass} pr-11`}
                        placeholder="••••••••"
                        required
                      />
                      <button type="button" onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors p-0.5 z-10">
                        {showPassword ? '🙈' : '👁️'}
                      </button>
                    </div>
                  </div>

                  {/* Sign In Button */}
                  <button
                    type="submit"
                    disabled={loading || lockoutTimer > 0}
                    className="w-full mt-2 relative overflow-hidden text-white font-bold rounded-2xl shadow-lg transition-all duration-200 active:scale-[0.96] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 px-6 py-3.5 text-sm"
                    style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 50%, #047857 100%)', boxShadow: '0 8px 32px rgba(16,185,129,0.35)' }}
                  >
                    {/* Shine effect */}
                    <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full hover:translate-x-full transition-transform duration-700" />
                    {loading ? (
                      <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : lockoutTimer > 0 ? (
                      <span className="relative z-10">Wait {lockoutTimer}s</span>
                    ) : (
                      <span className="relative z-10 flex items-center gap-2">Sign In <span>→</span></span>
                    )}
                  </button>

                  {/* Switch to Register */}
                  <div className="mt-5 text-center">
                    <p className="text-sm text-slate-600">
                      New to MediVend?
                      <button type="button" onClick={switchMode}
                        className="ml-2 text-emerald-400 font-bold hover:text-cyan-300 transition-colors">
                        Create account
                      </button>
                    </p>
                  </div>
                </form>
              ) : (
                /* ─── REGISTRATION FORM ─── */
                <form onSubmit={handleRegister} className="space-y-3.5">
                  {/* Name */}
                  <div>
                    <label className="block text-[9px] font-black uppercase tracking-[0.15em] mb-2 text-slate-500">Full Name</label>
                    <div className="relative group">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-emerald-400 transition-colors z-10 text-sm">👤</span>
                      <input type="text" name="name" value={regForm.name} onChange={handleRegisterChange}
                        className={fieldInputClass} placeholder="Juan Dela Cruz" required />
                    </div>
                  </div>
                  
                  {/* PRC License */}
                  <div>
                    <label className="block text-[9px] font-black uppercase tracking-[0.15em] mb-2 text-slate-500">PRC License No.</label>
                    <div className="relative group">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-emerald-400 transition-colors z-10 text-sm">🏅</span>
                      <input type="text" name="licenseNumber" value={regForm.licenseNumber} onChange={handleRegisterChange}
                        className={fieldInputClass} placeholder="PRCL-XXXXXX" required />
                    </div>
                  </div>

                  {/* Pharmacy Name */}
                  <div>
                    <label className="block text-[9px] font-black uppercase tracking-[0.15em] mb-2 text-slate-500">Pharmacy Workspace</label>
                    <div className="relative group">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-emerald-400 transition-colors z-10 text-sm">🏥</span>
                      <input type="text" name="pharmacyName" value={regForm.pharmacyName} onChange={handleRegisterChange}
                        className={fieldInputClass} placeholder="Mercury Drug - Makati Ave" required />
                    </div>
                  </div>

                  {/* Photo Uploads - Side by Side */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {/* PRC License Photo */}
                    <div>
                      <label className="block text-[9px] font-black uppercase tracking-[0.15em] mb-2 text-slate-500">PRC License <span className="text-rose-400">*</span></label>
                      <input ref={fileInputRef} type="file" accept="image/*" capture="environment" onChange={(e) => handleImageSelect(e, 'license')} className="hidden" />
                      {licensePreview ? (
                        <div className="relative rounded-2xl overflow-hidden border border-white/[0.08] group">
                          <img src={licensePreview} alt="License Preview" className="w-full h-28 object-cover" />
                          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-all flex flex-col items-center justify-center gap-2">
                            <button type="button" onClick={() => fileInputRef.current?.click()} className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-[10px] font-bold flex items-center gap-1.5 hover:bg-indigo-500 transition-all">
                              📷 Retake
                            </button>
                            <button type="button" onClick={() => { setLicenseImage(null); setLicensePreview(null); }} className="px-3 py-1.5 bg-rose-600 text-white rounded-lg text-[10px] font-bold flex items-center gap-1.5 hover:bg-rose-500 transition-all">
                              ✕ Remove
                            </button>
                          </div>
                          <div className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 bg-emerald-500/90 text-white text-[8px] font-bold rounded flex items-center gap-1">✓ Done</div>
                        </div>
                      ) : (
                        <button type="button" onClick={() => fileInputRef.current?.click()}
                          className="w-full py-4 px-2 h-28 rounded-2xl border-2 border-dashed border-white/[0.1] hover:border-emerald-500/40 bg-white/[0.02] hover:bg-emerald-500/[0.05] transition-all flex flex-col items-center justify-center gap-1.5 group cursor-pointer">
                          <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                            <span className="text-base">📷</span>
                          </div>
                          <p className="text-xs font-bold text-slate-400 group-hover:text-emerald-300 transition-colors">PRC Photo</p>
                        </button>
                      )}
                    </div>

                    {/* Selfie Photo */}
                    <div>
                      <label className="block text-[9px] font-black uppercase tracking-[0.15em] mb-2 text-slate-500">Your Selfie <span className="text-rose-400">*</span></label>
                      <input ref={selfieInputRef} type="file" accept="image/*" capture="user" onChange={(e) => handleImageSelect(e, 'selfie')} className="hidden" />
                      {selfiePreview ? (
                        <div className="relative rounded-2xl overflow-hidden border border-white/[0.08] group">
                          <img src={selfiePreview} alt="Selfie Preview" className="w-full h-28 object-cover" />
                          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-all flex flex-col items-center justify-center gap-2">
                            <button type="button" onClick={() => selfieInputRef.current?.click()} className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-[10px] font-bold flex items-center gap-1.5 hover:bg-indigo-500 transition-all">
                              📷 Retake
                            </button>
                            <button type="button" onClick={() => { setSelfieImage(null); setSelfiePreview(null); }} className="px-3 py-1.5 bg-rose-600 text-white rounded-lg text-[10px] font-bold flex items-center gap-1.5 hover:bg-rose-500 transition-all">
                              ✕ Remove
                            </button>
                          </div>
                          <div className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 bg-emerald-500/90 text-white text-[8px] font-bold rounded flex items-center gap-1">✓ Done</div>
                        </div>
                      ) : (
                        <button type="button" onClick={() => selfieInputRef.current?.click()}
                          className="w-full py-4 px-2 h-28 rounded-2xl border-2 border-dashed border-white/[0.1] hover:border-cyan-500/40 bg-white/[0.02] hover:bg-cyan-500/[0.05] transition-all flex flex-col items-center justify-center gap-1.5 group cursor-pointer">
                          <div className="w-8 h-8 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                            <span className="text-base">🤳</span>
                          </div>
                          <p className="text-xs font-bold text-slate-400 group-hover:text-cyan-300 transition-colors">Owner Selfie</p>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Email */}
                  <div>
                    <label className="block text-[9px] font-black uppercase tracking-[0.15em] mb-2 text-slate-500">Email Address</label>
                    <div className="relative group">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-emerald-400 transition-colors z-10 text-sm">📧</span>
                      <input type="email" name="email" value={regForm.email} onChange={handleRegisterChange}
                        className={fieldInputClass} placeholder="pharmacist@example.com" required />
                    </div>
                  </div>

                  {/* Password */}
                  <div>
                    <label className="block text-[9px] font-black uppercase tracking-[0.15em] mb-2 text-slate-500">Password</label>
                    <div className="relative group">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-emerald-400 transition-colors z-10 text-sm">🔒</span>
                      <input type={showPassword ? 'text' : 'password'} name="password" value={regForm.password} onChange={handleRegisterChange}
                        className={`${fieldInputClass} pr-11`} placeholder="••••••••" required />
                      <button type="button" onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors p-0.5 z-10">
                        {showPassword ? '🙈' : '👁️'}
                      </button>
                    </div>
                  </div>

                  {/* Submit */}
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full mt-2 relative overflow-hidden text-white font-bold rounded-2xl shadow-lg transition-all duration-200 active:scale-[0.96] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 px-6 py-3.5 text-sm"
                    style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 50%, #047857 100%)', boxShadow: '0 8px 32px rgba(16,185,129,0.35)' }}
                  >
                    <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full hover:translate-x-full transition-transform duration-700" />
                    {loading ? (
                      <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <span className="relative z-10 flex items-center gap-2">Create Account <span>→</span></span>
                    )}
                  </button>

                  {/* Switch to Login */}
                  <div className="mt-5 text-center">
                    <p className="text-sm text-slate-600">
                      Already have an account?
                      <button type="button" onClick={switchMode}
                        className="ml-2 text-emerald-400 font-bold hover:text-cyan-300 transition-colors">
                        Sign in
                      </button>
                    </p>
                  </div>
                </form>
              )}
            </div>
          </div>

          {/* Info Strip - Bottom Badges */}
          <div className="mt-4 grid grid-cols-3 gap-2.5">
            {[
              { icon: '🛡️', label: 'FDA Licensed', value: 'CDRR-NCR-882', color: 'text-emerald-400' },
              { icon: '🏅', label: 'App License', value: 'MV-WEB-2026', color: 'text-indigo-400' },
              { icon: '📞', label: 'Support', value: '09273523900', color: 'text-amber-400' },
            ].map(({ icon, label, value, color }) => (
              <div key={label} className="rounded-2xl border border-white/[0.06] p-2.5 sm:p-3 text-center bg-white/[0.02]">
                <div className={`flex justify-center mb-1 text-sm ${color}`}>{icon}</div>
                <div className="text-[8px] sm:text-[9px] text-slate-500 uppercase tracking-widest font-bold mb-0.5">{label}</div>
                <div className="text-[9px] sm:text-[10px] text-slate-300 font-black font-mono">{value}</div>
              </div>
            ))}
          </div>
          <p className="text-center text-[10px] text-slate-600 mt-4">© 2026 MediVend Systems · Secure & HIPAA-Compliant</p>
        </div>
      </div>

      {/* ═══════════════════════ RIGHT: Hero Panel ═══════════════════════ */}
      <div className={`hidden lg:flex flex-1 relative overflow-hidden flex-col items-center justify-center p-10 xl:p-12 transition-all duration-700 delay-200 border-l border-white/5 ${mounted ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-8'}`}>
        {/* Background layers */}
        <div className="absolute inset-0 bg-[#0B0F19]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-emerald-900/30 via-[#0B0F19] to-black opacity-90" />
        {/* Layer 1: Hexagonal Grid */}
        <div className="absolute inset-0 opacity-50" style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='56' height='100' viewBox='0 0 56 100'%3E%3Cpath d='M28 66L0 50V16l28-16 28 16v34L28 66zm0 34L0 84V50l28-16 28 16v34L28 100z' fill='none' stroke='%2310b981' stroke-width='0.5' stroke-opacity='0.12'/%3E%3C/svg%3E\")" }} />
        {/* Layer 2: Hex grid edge fade */}
        <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at center, transparent 30%, #0B0F19 75%)' }} />
        {/* Layer 3: Constellation particles */}
        <div className="absolute inset-0 opacity-80" style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='400' viewBox='0 0 400 400'%3E%3Ccircle cx='50' cy='80' r='1.5' fill='%2310b981' opacity='0.6'/%3E%3Ccircle cx='150' cy='40' r='1' fill='%2394a3b8' opacity='0.4'/%3E%3Ccircle cx='250' cy='100' r='1.8' fill='%2310b981' opacity='0.5'/%3E%3Ccircle cx='350' cy='60' r='1' fill='%2394a3b8' opacity='0.3'/%3E%3Ccircle cx='100' cy='180' r='1.2' fill='%2306b6d4' opacity='0.5'/%3E%3Ccircle cx='200' cy='200' r='2' fill='%2310b981' opacity='0.4'/%3E%3Ccircle cx='300' cy='150' r='1' fill='%2394a3b8' opacity='0.3'/%3E%3Ccircle cx='80' cy='300' r='1.5' fill='%2394a3b8' opacity='0.4'/%3E%3Ccircle cx='180' cy='330' r='1' fill='%2310b981' opacity='0.5'/%3E%3Ccircle cx='320' cy='280' r='1.8' fill='%2306b6d4' opacity='0.4'/%3E%3Ccircle cx='380' cy='350' r='1' fill='%2394a3b8' opacity='0.3'/%3E%3Ccircle cx='30' cy='370' r='1.2' fill='%2310b981' opacity='0.4'/%3E%3Cline x1='50' y1='80' x2='150' y2='40' stroke='%2310b981' stroke-width='0.3' opacity='0.15'/%3E%3Cline x1='150' y1='40' x2='250' y2='100' stroke='%2394a3b8' stroke-width='0.3' opacity='0.1'/%3E%3Cline x1='250' y1='100' x2='350' y2='60' stroke='%2310b981' stroke-width='0.3' opacity='0.12'/%3E%3Cline x1='100' y1='180' x2='200' y2='200' stroke='%2306b6d4' stroke-width='0.3' opacity='0.12'/%3E%3Cline x1='200' y1='200' x2='300' y2='150' stroke='%2394a3b8' stroke-width='0.3' opacity='0.1'/%3E%3Cline x1='50' y1='80' x2='100' y2='180' stroke='%2394a3b8' stroke-width='0.3' opacity='0.08'/%3E%3Cline x1='250' y1='100' x2='200' y2='200' stroke='%2310b981' stroke-width='0.3' opacity='0.1'/%3E%3Cline x1='80' y1='300' x2='180' y2='330' stroke='%2310b981' stroke-width='0.3' opacity='0.12'/%3E%3Cline x1='320' y1='280' x2='380' y2='350' stroke='%2306b6d4' stroke-width='0.3' opacity='0.1'/%3E%3Cline x1='300' y1='150' x2='320' y2='280' stroke='%2394a3b8' stroke-width='0.3' opacity='0.08'/%3E%3Cline x1='180' y1='330' x2='320' y2='280' stroke='%2310b981' stroke-width='0.3' opacity='0.1'/%3E%3Cline x1='30' y1='370' x2='80' y2='300' stroke='%2394a3b8' stroke-width='0.3' opacity='0.1'/%3E%3C/svg%3E\")" }} />
        
        <div className="relative z-10 max-w-xl">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-emerald-500/20 bg-emerald-500/[0.08] text-emerald-300 text-xs font-bold uppercase tracking-[0.15em] mb-10">
            <span className="animate-pulse">💊</span> Licensed Pharmacy Network
          </div>

          {/* Hero Title */}
          <h1 className="text-5xl xl:text-6xl 2xl:text-7xl font-black text-white leading-[1.05] tracking-tight mb-6">
            Secure<br />
            <span className="bg-gradient-to-r from-emerald-400 via-teal-400 to-cyan-400 bg-clip-text text-transparent">Dispensing</span><br />
            <span className="text-transparent" style={{ WebkitTextStroke: '1.5px rgba(148,163,184,0.3)' }}>Verified</span>
          </h1>

          {/* Description */}
          <p className="text-slate-400 text-base xl:text-lg leading-relaxed mb-10 max-w-md">
            Verify prescriptions, track dispensing records, and manage audit-compliant medication releases through MediVend's secure cloud platform.
          </p>

          {/* Feature Cards - 2x2 Grid */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { icon: '🔐', color: 'from-emerald-500 to-teal-500', shadow: 'shadow-emerald-500/20', title: 'Rx Verification', desc: 'Real-time prescription lookup' },
              { icon: '📊', color: 'from-blue-500 to-cyan-500', shadow: 'shadow-blue-500/20', title: 'Audit Trail', desc: 'Complete dispensing history' },
              { icon: '🪪', color: 'from-amber-500 to-orange-500', shadow: 'shadow-amber-500/20', title: 'ID Validation', desc: 'Government ID requirement' },
              { icon: '☁️', color: 'from-purple-500 to-indigo-500', shadow: 'shadow-purple-500/20', title: 'Cloud Ledger', desc: 'Realtime synced database' },
            ].map(({ icon, color, shadow, title, desc }) => (
              <div key={title} className="group p-4 xl:p-5 rounded-2xl border border-white/[0.06] transition-all duration-300 hover:border-white/[0.14] hover:bg-white/[0.04] cursor-default bg-white/[0.02]">
                <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center mb-3 shadow-lg ${shadow} group-hover:scale-110 group-hover:rotate-3 transition-all duration-300`}>
                  <span className="text-lg">{icon}</span>
                </div>
                <div className="font-bold text-white text-sm">{title}</div>
                <div className="text-xs text-slate-500 mt-0.5">{desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
