import React, { useState, useRef } from 'react';
import { collection, query, where, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebase';

export default function AuthScreen({ onLogin }) {
  const [activeTab, setActiveTab] = useState('login'); // 'login' or 'register'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);
  
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
    setError('');
    
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
      // Check if email already exists
      const q = query(collection(db, 'artifacts', 'medivend-local', 'public', 'data', 'pharmacists'), where('email', '==', regForm.email));
      const querySnapshot = await getDocs(q);
      
      if (!querySnapshot.empty) {
        setError('An account with this email already exists.');
        setLoading(false);
        return;
      }

      // Add to database
      await addDoc(collection(db, 'artifacts', 'medivend-local', 'public', 'data', 'pharmacists'), {
        ...regForm,
        licenseImage: licenseImage,
        selfieImage: selfieImage,
        role: 'pharmacist',
        status: 'pending',
        createdAt: serverTimestamp()
      });

      // Switch to login tab and show a success message
      setRegForm({ name: '', email: '', password: '', licenseNumber: '', pharmacyName: '' });
      setLicenseImage(null);
      setLicensePreview(null);
      setSelfieImage(null);
      setSelfiePreview(null);
      setActiveTab('login');
      setError('Registration successful! Your account is pending admin approval.');
    } catch (err) {
      console.error("Registration error:", err);
      setError('Failed to register. Please try again.');
    }
    setLoading(false);
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    
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
        setError('Invalid credentials.');
        setLoading(false);
        return;
      }

      const userDoc = querySnapshot.docs[0];
      const userData = { id: userDoc.id, ...userDoc.data() };

      if (userData.status === 'pending') {
        setError('Your account is pending admin approval.');
      } else if (userData.status === 'rejected') {
        setError('Your account has been rejected.');
      } else if (userData.status === 'active') {
        onLogin(userData); // Proceed to dashboard
      } else {
        setError('Account status unknown.');
      }
    } catch (err) {
      console.error("Login error:", err);
      setError('Failed to log in. Please check your connection.');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-[#050B14] flex flex-col items-center justify-center p-6 relative overflow-hidden font-sans">
      
      {/* Premium Background Effects */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-emerald-500/10 blur-[120px]" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-indigo-500/10 blur-[120px]" />

      <div className="w-full max-w-lg relative z-10 animate-scale-in">
        
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-600 to-indigo-600 shadow-lg shadow-emerald-500/20 mb-4">
            <span className="text-2xl text-white font-bold">Rx</span>
          </div>
          <h1 className="text-3xl font-black text-white tracking-tight">Pharmacist Portal</h1>
          <p className="text-slate-400 mt-2 text-sm">Secure dispensing verification system</p>
        </div>

        {/* Card */}
        <div className="bg-[#0A1120]/80 backdrop-blur-xl border border-white/10 rounded-3xl overflow-hidden shadow-2xl">
          
          {/* Tabs */}
          <div className="flex border-b border-white/5">
            <button
              onClick={() => { setActiveTab('login'); setError(''); }}
              className={`flex-1 py-4 text-sm tracking-wide font-bold transition-all ${
                activeTab === 'login' 
                  ? 'text-white border-b-2 border-emerald-500 bg-white/5' 
                  : 'text-slate-400 hover:text-slate-300 hover:bg-white/[0.02]'
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => { setActiveTab('register'); setError(''); }}
              className={`flex-1 py-4 text-sm tracking-wide font-bold transition-all ${
                activeTab === 'register' 
                  ? 'text-white border-b-2 border-emerald-500 bg-white/5' 
                  : 'text-slate-400 hover:text-slate-300 hover:bg-white/[0.02]'
              }`}
            >
              Register
            </button>
          </div>

          <div className="p-8">
            {/* Error Message */}
            {error && (
              <div className={`mb-6 p-4 rounded-xl text-sm font-bold border ${error.includes('successful') ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border-rose-500/20'}`}>
                {error}
              </div>
            )}

            {/* Login Form */}
            {activeTab === 'login' && (
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Email Address</label>
                  <input
                    type="email" name="email"
                    value={loginForm.email} onChange={handleLoginChange}
                    className="w-full bg-[#050B14] border border-white/10 rounded-xl px-4 py-3 text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all text-sm"
                    placeholder="pharmacist@example.com"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Password</label>
                  <input
                    type="password" name="password"
                    value={loginForm.password} onChange={handleLoginChange}
                    className="w-full bg-[#050B14] border border-white/10 rounded-xl px-4 py-3 text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all text-sm"
                    placeholder="••••••••"
                  />
                </div>
                
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full mt-6 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white font-bold py-3.5 rounded-xl shadow-lg shadow-emerald-500/20 transition-all active:scale-[0.98] disabled:opacity-70 flex justify-center"
                >
                  {loading ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : 'Secure Sign In'}
                </button>
              </form>
            )}

            {/* Registration Form */}
            {activeTab === 'register' && (
              <form onSubmit={handleRegister} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Full Name</label>
                  <input
                    type="text" name="name"
                    value={regForm.name} onChange={handleRegisterChange}
                    className="w-full bg-[#050B14] border border-white/10 rounded-xl px-4 py-3 text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all text-sm"
                    placeholder="Dr. John Doe"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Email Address</label>
                  <input
                    type="email" name="email"
                    value={regForm.email} onChange={handleRegisterChange}
                    className="w-full bg-[#050B14] border border-white/10 rounded-xl px-4 py-3 text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all text-sm"
                    placeholder="pharmacist@example.com"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">PRC License Number</label>
                  <input
                    type="text" name="licenseNumber"
                    value={regForm.licenseNumber} onChange={handleRegisterChange}
                    className="w-full bg-[#050B14] border border-white/10 rounded-xl px-4 py-3 text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all text-sm"
                    placeholder="1234567"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Pharmacy Workspace</label>
                  <input
                    type="text" name="pharmacyName"
                    value={regForm.pharmacyName} onChange={handleRegisterChange}
                    className="w-full bg-[#050B14] border border-white/10 rounded-xl px-4 py-3 text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all text-sm"
                    placeholder="e.g., Mercury Drug - Makati Ave"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Secure Password</label>
                  <input
                    type="password" name="password"
                    value={regForm.password} onChange={handleRegisterChange}
                    className="w-full bg-[#050B14] border border-white/10 rounded-xl px-4 py-3 text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all text-sm"
                    placeholder="Create a strong password"
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {/* License Photo Upload */}
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">PRC License <span className="text-rose-400">*</span></label>
                    <input ref={fileInputRef} type="file" accept="image/*" capture="environment" onChange={(e) => handleImageSelect(e, 'license')} className="hidden" />
                    {licensePreview ? (
                      <div className="relative rounded-xl overflow-hidden border border-white/10 group">
                        <img src={licensePreview} alt="License Preview" className="w-full h-32 object-cover" />
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-all flex flex-col items-center justify-center gap-2">
                          <button type="button" onClick={() => fileInputRef.current?.click()} className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-500 transition-all">Retake</button>
                          <button type="button" onClick={() => { setLicenseImage(null); setLicensePreview(null); }} className="px-3 py-1.5 bg-rose-600 text-white rounded-lg text-xs font-bold hover:bg-rose-500 transition-all">Remove</button>
                        </div>
                        <div className="absolute bottom-1 right-1 px-1.5 py-0.5 bg-emerald-500/90 text-white text-[9px] font-bold rounded">✓ Done</div>
                      </div>
                    ) : (
                      <button type="button" onClick={() => fileInputRef.current?.click()}
                        className="w-full py-4 px-2 h-32 rounded-xl border-2 border-dashed border-white/[0.1] hover:border-emerald-500/40 bg-white/[0.02] hover:bg-emerald-500/[0.04] transition-all flex flex-col items-center justify-center gap-1.5 group cursor-pointer">
                        <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                          <span className="text-lg">📷</span>
                        </div>
                        <p className="text-xs font-bold text-slate-400 group-hover:text-emerald-300 transition-colors">PRC Photo</p>
                      </button>
                    )}
                  </div>
                  {/* Selfie Photo Upload */}
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Owner Selfie <span className="text-rose-400">*</span></label>
                    <input type="file" accept="image/*" capture="user" onChange={(e) => handleImageSelect(e, 'selfie')} className="hidden" id="selfie-input" />
                    {selfiePreview ? (
                      <div className="relative rounded-xl overflow-hidden border border-white/10 group">
                        <img src={selfiePreview} alt="Selfie Preview" className="w-full h-32 object-cover" />
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-all flex flex-col items-center justify-center gap-2">
                          <button type="button" onClick={() => document.getElementById('selfie-input')?.click()} className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-500 transition-all">Retake</button>
                          <button type="button" onClick={() => { setSelfieImage(null); setSelfiePreview(null); }} className="px-3 py-1.5 bg-rose-600 text-white rounded-lg text-xs font-bold hover:bg-rose-500 transition-all">Remove</button>
                        </div>
                        <div className="absolute bottom-1 right-1 px-1.5 py-0.5 bg-emerald-500/90 text-white text-[9px] font-bold rounded">✓ Done</div>
                      </div>
                    ) : (
                      <button type="button" onClick={() => document.getElementById('selfie-input')?.click()}
                        className="w-full py-4 px-2 h-32 rounded-xl border-2 border-dashed border-white/[0.1] hover:border-cyan-500/40 bg-white/[0.02] hover:bg-cyan-500/[0.04] transition-all flex flex-col items-center justify-center gap-1.5 group cursor-pointer">
                        <div className="w-8 h-8 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                          <span className="text-lg">🤳</span>
                        </div>
                        <p className="text-xs font-bold text-slate-400 group-hover:text-cyan-300 transition-colors">Owner Selfie</p>
                      </button>
                    )}
                  </div>
                </div>
                
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full mt-6 bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white font-bold py-3.5 rounded-xl shadow-lg shadow-indigo-500/20 transition-all active:scale-[0.98] disabled:opacity-70 flex justify-center"
                >
                  {loading ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : 'Submit Registration'}
                </button>
              </form>
            )}

            <div className="mt-8 text-center border-t border-white/5 pt-6">
              <p className="text-xs text-slate-500 flex items-center justify-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Connection Secure
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
