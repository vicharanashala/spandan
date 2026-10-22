import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import useAuthStore from '../stores/authStore'
import Sidebar from '../components/Sidebar'
import { PageHeader, pageWash, primaryButton, ghostButton } from '../components/AppUI'
import { SectionHeader } from '../components/InsightUI'
import PasswordInput from '../components/PasswordInput'
import useIsMobile from '../hooks/useIsMobile'
import { API_URL } from '../config.js'
import { ArrowLeft, Backpack, Cake, Camera, Check, Circle, FileText, GraduationCap, IdCard, Landmark, Link as LinkIcon, Lock as LockIcon, Mail, MapPin, Pencil, Phone as PhoneIcon, School, ScrollText, ShieldCheck, User, UserRound, VenusAndMars, X } from 'lucide-react'
import { GithubLogo, Ico, LinkedinLogo, XLogo, renderIcon } from '../components/icons'

function ProfilePage() {
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const { user, token, updateUser, logout } = useAuthStore()

  const [isEditing, setIsEditing] = useState(false)
  const [activeTab, setActiveTab] = useState('profile')
  const [isSaving, setIsSaving] = useState(false)
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')
  const fileInputRef = useRef(null)

  // Password tab state
  const [passwordData, setPasswordData] = useState({ oldPassword: '', newPassword: '', confirmPassword: '' })
  const [passwordError, setPasswordError] = useState('')
  const [passwordSuccess, setPasswordSuccess] = useState('')
  const [isPasswordLoading, setIsPasswordLoading] = useState(false)

  const [formData, setFormData] = useState({
    name: user?.name || '',
    phone: user?.phone || '',
    bio: user?.bio || '',
    dateOfBirth: user?.dateOfBirth ? new Date(user.dateOfBirth).toISOString().split('T')[0] : '',
    gender: user?.gender || '',
    profileImage: user?.profileImage || '',
    address: {
      street: user?.address?.street || '',
      city: user?.address?.city || '',
      state: user?.address?.state || '',
      zipCode: user?.address?.zipCode || '',
      country: user?.address?.country || ''
    },
    socialLinks: {
      twitter: user?.socialLinks?.twitter || '',
      linkedin: user?.socialLinks?.linkedin || '',
      github: user?.socialLinks?.github || ''
    },
    enrollmentNumber: user?.enrollmentNumber || '',
    class: user?.class || '',
    department: user?.department || '',
    employeeId: user?.employeeId || '',
    qualifications: user?.qualifications || ''
  })

  const roleDashboard = user?.role === 'teacher' ? '/teacher' : '/student'

  useEffect(() => {
    if (!token) {
      navigate('/')
      return
    }
    if (user) {
      setFormData({
        name: user.name || '',
        phone: user.phone || '',
        bio: user.bio || '',
        dateOfBirth: user.dateOfBirth ? new Date(user.dateOfBirth).toISOString().split('T')[0] : '',
        gender: user.gender || '',
        profileImage: user.profileImage || '',
        address: {
          street: user.address?.street || '',
          city: user.address?.city || '',
          state: user.address?.state || '',
          zipCode: user.address?.zipCode || '',
          country: user.address?.country || ''
        },
        socialLinks: {
          twitter: user.socialLinks?.twitter || '',
          linkedin: user.socialLinks?.linkedin || '',
          github: user.socialLinks?.github || ''
        },
        enrollmentNumber: user.enrollmentNumber || '',
        class: user.class || '',
        department: user.department || '',
        employeeId: user.employeeId || '',
        qualifications: user.qualifications || ''
      })
    }
  }, [user, token, navigate])

  const handleChange = (field, value) => {
    if (field.includes('.')) {
      const [parent, child] = field.split('.')
      setFormData(prev => ({
        ...prev,
        [parent]: { ...prev[parent], [child]: value }
      }))
    } else {
      setFormData(prev => ({ ...prev, [field]: value }))
    }
  }

  const handleImageUpload = (e) => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onloadend = () => {
      handleChange('profileImage', reader.result)
    }
    reader.readAsDataURL(file)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    setIsSaving(true)

    try {
      const response = await fetch(`${API_URL}/auth/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(formData)
      })

      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Failed to update profile')

      updateUser(data.user)
      setSuccess('Profile updated successfully!')
      setIsEditing(false)
    } catch (err) {
      setError(err.message)
    } finally {
      setIsSaving(false)
    }
  }

  const handleCancel = () => {
    setIsEditing(false)
    setError('')
    setSuccess('')
    if (user) {
      setFormData({
        name: user.name || '',
        phone: user.phone || '',
        bio: user.bio || '',
        dateOfBirth: user.dateOfBirth ? new Date(user.dateOfBirth).toISOString().split('T')[0] : '',
        gender: user.gender || '',
        profileImage: user.profileImage || '',
        address: {
          street: user.address?.street || '',
          city: user.address?.city || '',
          state: user.address?.state || '',
          zipCode: user.address?.zipCode || '',
          country: user.address?.country || ''
        },
        socialLinks: {
          twitter: user.socialLinks?.twitter || '',
          linkedin: user.socialLinks?.linkedin || '',
          github: user.socialLinks?.github || ''
        },
        enrollmentNumber: user.enrollmentNumber || '',
        class: user.class || '',
        department: user.department || '',
        employeeId: user.employeeId || '',
        qualifications: user.qualifications || ''
      })
    }
  }

  const handlePasswordSubmit = async (e) => {
    e.preventDefault()
    setPasswordError('')
    setPasswordSuccess('')

    if (!passwordData.oldPassword || !passwordData.newPassword || !passwordData.confirmPassword) {
      setPasswordError('All fields are required')
      return
    }
    if (passwordData.newPassword.length < 8) {
      setPasswordError('Password must be at least 8 characters')
      return
    }
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setPasswordError('New passwords do not match')
      return
    }

    setIsPasswordLoading(true)
    try {
      const response = await fetch(`${API_URL}/auth/password`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(passwordData)
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Failed to update password')
      setPasswordSuccess('Password updated successfully! You will be logged out now.')
      setPasswordData({ oldPassword: '', newPassword: '', confirmPassword: '' })
      // Force logout after showing success so user must re-login with new password
      setTimeout(() => {
        logout()
        navigate('/')
      }, 2000)
    } catch (err) {
      setPasswordError(err.message)
    } finally {
      setIsPasswordLoading(false)
    }
  }

  // ---- Presentation helpers (styling only) ----
  const contentPad = isMobile ? '16px' : '32px'
  const cardStyle = {
    background: 'var(--bg-card)',
    border: '1px solid var(--border-color)',
    borderRadius: '20px',
    boxShadow: '0 1px 2px rgba(16,24,40,0.04), 0 8px 24px rgba(16,24,40,0.06)',
    overflow: 'hidden'
  }
  const inputStyle = {
    width: '100%',
    boxSizing: 'border-box',
    padding: '12px 14px',
    fontSize: '14px',
    border: '1px solid var(--border-color)',
    borderRadius: '12px',
    background: 'var(--input-bg)',
    color: 'var(--text-primary)',
    outline: 'none'
  }
  const labelStyle = {
    fontSize: '12px',
    fontWeight: '600',
    color: 'var(--text-secondary)',
    display: 'block',
    marginBottom: '6px',
    letterSpacing: '.01em'
  }
  const sectionHeadingStyle = {
    fontSize: '13px',
    fontWeight: '700',
    color: 'var(--text-secondary)',
    textTransform: 'uppercase',
    letterSpacing: '.06em',
    margin: '8px 0 4px',
    paddingBottom: '10px',
    borderBottom: '1px solid var(--border-color)'
  }
  const primaryBtnStyle = (disabled) => ({
    padding: '11px 18px',
    fontSize: '14px',
    fontWeight: '600',
    background: disabled ? '#9ca3af' : 'var(--accent-gradient)',
    color: '#fff',
    border: 'none',
    borderRadius: 'var(--radius)',
    boxShadow: disabled ? 'none' : '0 2px 10px rgba(8,32,73,.25)',
    cursor: disabled ? 'not-allowed' : 'pointer'
  })
  const secondaryBtnStyle = {
    padding: '11px 18px',
    fontSize: '14px',
    fontWeight: '600',
    background: 'var(--bg-primary)',
    color: 'var(--text-primary)',
    border: '1px solid var(--border-color)',
    borderRadius: 'var(--radius)',
    cursor: 'pointer'
  }
  const twoCol = { display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '16px' }
  const threeCol = { display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: '16px' }
  const twoColView = { display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '20px', marginBottom: '24px' }
  const threeColView = { display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: '20px', marginBottom: '24px' }
  const fieldLabelView = { fontSize: '11px', fontWeight: '700', letterSpacing: '.06em', color: 'var(--text-secondary)', margin: '0 0 4px' }
  const fieldValueView = { fontSize: '15px', fontWeight: '600', color: 'var(--text-primary)', margin: 0, wordBreak: 'break-word' }
  const errorBanner = { background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 'var(--radius)', padding: '12px 16px', marginBottom: '20px', color: '#dc2626', fontSize: '14px' }
  const successBanner = { background: '#ecfdf5', border: '1px solid #6ee7b7', borderRadius: 'var(--radius)', padding: '12px 16px', marginBottom: '20px', color: '#059669', fontSize: '14px' }

  if (!user) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-primary)', fontFamily: '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif' }}>
        <Sidebar user={null} />
        <div style={{ flex: 1, minWidth: 0, marginLeft: 'var(--sidebar-width, 240px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ color: 'var(--text-secondary)' }}>Loading...</p>
        </div>
      </div>
    )
  }

  // ---- view helpers ----
  const softCard = { ...cardStyle, padding: isMobile ? '18px' : '22px 24px' }
  const notAdded = <span style={{ color: 'var(--text-secondary)', fontWeight: 500, fontStyle: 'italic' }}>Not added</span>
  const Field = ({ icon, label, value, span }) => (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', gridColumn: span && !isMobile ? 'span 2' : 'auto', minWidth: 0 }}>
      <span aria-hidden="true" style={{ width: 34, height: 34, flexShrink: 0, borderRadius: 10, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, color: 'var(--accent)', background: 'color-mix(in srgb, var(--accent) 9%, transparent)' }}>{renderIcon(icon, 16)}</span>
      <div style={{ minWidth: 0 }}>
        <p style={{ ...fieldLabelView, textTransform: 'uppercase' }}>{label}</p>
        <p style={fieldValueView}>{value || notAdded}</p>
      </div>
    </div>
  )
  const fieldGrid = { display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '18px 24px' }
  const roleLabel = user?.role === 'teacher' ? 'Teacher details' : 'Student details'
  const hasAddress = Object.values(formData.address || {}).some(Boolean)
  const hasSocial = Object.values(formData.socialLinks || {}).some(Boolean)

  // live password checklist (same rules the server enforces; the server stays the authority)
  const pw = passwordData.newPassword
  const rules = [
    ['At least 8 characters', pw.length >= 8],
    ['An uppercase letter', /[A-Z]/.test(pw)],
    ['A lowercase letter', /[a-z]/.test(pw)],
    ['A digit', /\d/.test(pw)],
    ['A special character', /[^A-Za-z0-9]/.test(pw)],
  ]
  const passed = rules.filter(([, ok]) => ok).length
  const strength = !pw ? null : passed <= 2 ? ['Weak', '#ef4444'] : passed <= 4 ? ['Fair', '#f59e0b'] : ['Strong', '#10b981']
  const matches = passwordData.confirmPassword && passwordData.confirmPassword === pw

  // Cover card: gradient band + overlapping avatar (editable in edit mode)
  const avatarSize = isMobile ? 84 : 104
  const ProfileCover = ({ editable }) => (
    <div style={{ ...cardStyle, marginBottom: 20 }}>
      <div style={{ position: 'relative', height: isMobile ? 84 : 110, background: 'var(--header-bg)', overflow: 'hidden' }}>
        <span aria-hidden="true" style={{ position: 'absolute', width: 320, height: 320, right: -80, top: -180, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,255,255,0.18), rgba(255,255,255,0) 70%)' }} />
        <span aria-hidden="true" style={{ position: 'absolute', width: 220, height: 220, left: '35%', bottom: -150, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,255,255,0.10), rgba(255,255,255,0) 70%)' }} />
      </div>
      <div style={{ padding: isMobile ? '0 18px 18px' : '0 26px 22px', display: 'flex', alignItems: isMobile ? 'flex-start' : 'flex-end', gap: isMobile ? 12 : 20, flexDirection: isMobile ? 'column' : 'row' }}>
        <div style={{ position: 'relative', marginTop: -avatarSize / 2, flexShrink: 0 }}>
          <div
            onClick={editable ? () => fileInputRef.current?.click() : undefined}
            role={editable ? 'button' : undefined}
            aria-label={editable ? 'Change profile photo' : undefined}
            style={{
              width: avatarSize, height: avatarSize, borderRadius: '50%', overflow: 'hidden', cursor: editable ? 'pointer' : 'default',
              background: formData.profileImage ? 'var(--bg-card)' : 'var(--accent-gradient)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: '4px solid var(--bg-card)', boxShadow: '0 8px 20px rgba(16,24,40,0.18)'
            }}
          >
            {formData.profileImage
              ? <img src={formData.profileImage} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <span style={{ fontSize: avatarSize * 0.4, color: 'white', fontWeight: 800 }}>{formData.name?.charAt(0)?.toUpperCase() || 'U'}</span>}
          </div>
          {editable && (
            <>
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageUpload} style={{ display: 'none' }} />
              <span aria-hidden="true" onClick={() => fileInputRef.current?.click()} style={{
                position: 'absolute', bottom: 4, right: 4, width: 30, height: 30, borderRadius: '50%', cursor: 'pointer', fontSize: 14,
                display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-card)', border: '1px solid var(--border-color)', boxShadow: '0 2px 6px rgba(16,24,40,0.15)', color: 'var(--text-primary)'
              }}><Camera size={15} /></span>
            </>
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0, paddingTop: isMobile ? 0 : 12 }}>
          <h2 style={{ margin: 0, fontSize: isMobile ? 20 : 24, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text-primary)', wordBreak: 'break-word' }}>{editable ? (formData.name || user?.name) : user?.name}</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
            <span style={{ padding: '2px 10px', borderRadius: 999, fontSize: 11.5, fontWeight: 700, textTransform: 'capitalize', color: 'var(--accent)', background: 'color-mix(in srgb, var(--accent) 12%, transparent)' }}>{user?.role}</span>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)', wordBreak: 'break-all' }}><Ico as={Mail} /> {user?.email}</span>
          </div>
        </div>
        {!editable && (
          <button data-tour="edit-profile" onClick={() => setIsEditing(true)} style={primaryButton(false, { padding: '10px 18px', alignSelf: isMobile ? 'stretch' : 'auto' })}>
            <Ico as={Pencil} /> Edit Profile
          </button>
        )}
      </div>
    </div>
  )

  const L = ({ children, htmlFor }) => <label htmlFor={htmlFor} style={labelStyle}>{children}</label>
  const inp = (extra = {}) => ({ ...inputStyle, ...extra })

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-primary)', fontFamily: '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif' }}>
      <Sidebar user={user} />
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', marginLeft: 'var(--sidebar-width, 240px)' }}>
        <PageHeader isMobile={isMobile} icon={User} title="Profile" subtitle="Manage your account details" />

        <div style={{ flex: 1, padding: contentPad, maxWidth: '100%', boxSizing: 'border-box', background: pageWash }}>
          {/* Back arrow + tabs on one line */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 22, flexWrap: 'wrap' }}>
            <button onClick={() => navigate(roleDashboard)} aria-label="Back to dashboard" title="Back to dashboard" style={{
              width: 44, height: 44, flexShrink: 0, borderRadius: 14, border: '1px solid var(--border-color)', background: 'var(--bg-card)',
              color: 'var(--text-primary)', fontSize: 18, fontWeight: 700, cursor: 'pointer', boxShadow: '0 1px 2px rgba(16,24,40,0.06)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center'
            }}><ArrowLeft size={18} aria-hidden="true" /></button>
            <div role="tablist" aria-label="Profile sections" style={{ display: 'inline-flex', gap: 4, padding: 4, borderRadius: 14, background: 'color-mix(in srgb, var(--text-secondary) 10%, var(--bg-card))', border: '1px solid var(--border-color)' }}>
              {[['profile', User, 'My Profile'], ['password', LockIcon, 'Change Password']].map(([key, TabIcon, text]) => {
                const on = activeTab === key
                return (
                  <button key={key} role="tab" aria-selected={on} onClick={() => { setActiveTab(key); setIsEditing(false) }} style={{
                    padding: isMobile ? '8px 12px' : '9px 18px', fontSize: isMobile ? '13px' : '14px', fontWeight: on ? 700 : 600, border: 'none', borderRadius: 11, cursor: 'pointer', whiteSpace: 'nowrap',
                    background: on ? 'var(--bg-card)' : 'transparent', color: on ? 'var(--accent)' : 'var(--text-secondary)',
                    boxShadow: on ? '0 1px 2px rgba(16,24,40,0.06), 0 4px 10px rgba(16,24,40,0.06)' : 'none'
                  }}><Ico as={TabIcon} /> {text}</button>
                )
              })}
            </div>
          </div>

          {activeTab === 'password' ? (
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 560px) minmax(240px, 320px)', gap: 20, alignItems: 'start' }}>
              <div data-tour="change-password" style={softCard}>
                <SectionHeader icon={LockIcon} title="Change Password" hint="Enter your current password, then choose a new one." />
                {passwordError && <div role="alert" style={errorBanner}>{passwordError}</div>}
                {passwordSuccess && <div role="status" style={successBanner}>{passwordSuccess}</div>}

                <form onSubmit={handlePasswordSubmit} style={{ display: 'grid', gap: '18px' }}>
                  <div>
                    <L>Current Password</L>
                    <PasswordInput value={passwordData.oldPassword} onChange={(e) => setPasswordData(p => ({ ...p, oldPassword: e.target.value }))} placeholder="Enter current password" />
                  </div>
                  <div>
                    <L>New Password</L>
                    <PasswordInput value={passwordData.newPassword} onChange={(e) => setPasswordData(p => ({ ...p, newPassword: e.target.value }))} placeholder="Enter new password" />
                    {strength && (
                      <div style={{ marginTop: 10 }}>
                        <div style={{ display: 'flex', gap: 4 }} aria-hidden="true">
                          {rules.map((_, i) => <span key={i} style={{ flex: 1, height: 5, borderRadius: 5, background: i < passed ? strength[1] : 'var(--border-color)' }} />)}
                        </div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: strength[1], marginTop: 6 }}>Strength: {strength[0]}</div>
                      </div>
                    )}
                    <ul style={{ listStyle: 'none', margin: '10px 0 0', padding: 0, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '4px 12px' }}>
                      {rules.map(([t, ok]) => (
                        <li key={t} style={{ fontSize: 12.5, color: ok ? '#10b981' : 'var(--text-secondary)', fontWeight: ok ? 600 : 500 }}>{ok ? <Ico as={Check} /> : <Ico as={Circle} size="0.8em" />} {t}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <L>Confirm New Password</L>
                    <PasswordInput value={passwordData.confirmPassword} onChange={(e) => setPasswordData(p => ({ ...p, confirmPassword: e.target.value }))} placeholder="Confirm new password" />
                    {passwordData.confirmPassword && (
                      <div style={{ fontSize: 12.5, fontWeight: 600, marginTop: 6, color: matches ? '#10b981' : '#ef4444' }}>{matches ? <><Ico as={Check} /> Passwords match</> : <><Ico as={X} /> Passwords do not match yet</>}</div>
                    )}
                  </div>
                  <button type="submit" disabled={isPasswordLoading} style={primaryButton(isPasswordLoading, { width: '100%', padding: '13px', fontSize: '15px' })}>
                    {isPasswordLoading ? 'Updating…' : 'Update Password'}
                  </button>
                </form>
              </div>

              <div style={softCard}>
                <SectionHeader icon={ShieldCheck} tint="#10b981" title="Keep your account safe" />
                <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 10, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  <li>Use a password you don't use on other sites.</li>
                  <li>A short sentence with a number and a symbol is easy to remember and hard to guess.</li>
                  <li>After you change it you will be signed out on this device; sign in again with the new password.</li>
                </ul>
              </div>
            </div>
          ) : (
            <>
              {success && <div role="status" style={successBanner}>{success}</div>}
              {error && <div role="alert" style={errorBanner}>{error}</div>}

              {isEditing ? (
                <form onSubmit={handleSubmit}>
                  <ProfileCover editable />
                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 20, alignItems: 'start' }}>
                    <div style={softCard}>
                      <SectionHeader icon={UserRound} title="Personal information" />
                      <div style={{ display: 'grid', gap: 16 }}>
                        <div><L htmlFor="pf-name">Full Name</L><input id="pf-name" className="app-input" type="text" value={formData.name} onChange={(e) => handleChange('name', e.target.value)} style={inp()} /></div>
                        <div style={twoCol}>
                          <div><L htmlFor="pf-phone">Phone</L><input id="pf-phone" className="app-input" type="text" value={formData.phone} onChange={(e) => handleChange('phone', e.target.value)} placeholder="+91 98765 43210" style={inp()} /></div>
                          <div><L htmlFor="pf-dob">Date of Birth</L><input id="pf-dob" className="app-input" type="date" value={formData.dateOfBirth} onChange={(e) => handleChange('dateOfBirth', e.target.value)} style={inp()} /></div>
                        </div>
                        <div>
                          <L htmlFor="pf-gender">Gender</L>
                          <select id="pf-gender" className="app-input" value={formData.gender} onChange={(e) => handleChange('gender', e.target.value)} style={inp()}>
                            <option value="">Select</option><option value="male">Male</option><option value="female">Female</option><option value="other">Other</option>
                          </select>
                        </div>
                        <div><L htmlFor="pf-bio">Bio</L><textarea id="pf-bio" className="app-input" value={formData.bio} onChange={(e) => handleChange('bio', e.target.value)} placeholder="Tell us about yourself..." rows={3} style={inp({ resize: 'vertical' })} /></div>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gap: 20 }}>
                      <div style={softCard}>
                        <SectionHeader icon={user?.role === 'teacher' ? GraduationCap : Backpack} title={roleLabel} />
                        {user?.role === 'student' ? (
                          <div style={twoCol}>
                            <div><L htmlFor="pf-enr">Enrollment Number</L><input id="pf-enr" className="app-input" type="text" value={formData.enrollmentNumber} onChange={(e) => handleChange('enrollmentNumber', e.target.value)} placeholder="2021BCS001" style={inp()} /></div>
                            <div><L htmlFor="pf-class">Class / Section</L><input id="pf-class" className="app-input" type="text" value={formData.class} onChange={(e) => handleChange('class', e.target.value)} placeholder="BCS - A" style={inp()} /></div>
                          </div>
                        ) : (
                          <div style={{ display: 'grid', gap: 16 }}>
                            <div style={twoCol}>
                              <div><L htmlFor="pf-emp">Employee ID</L><input id="pf-emp" className="app-input" type="text" value={formData.employeeId} onChange={(e) => handleChange('employeeId', e.target.value)} placeholder="EMP001" style={inp()} /></div>
                              <div><L htmlFor="pf-dept">Department</L><input id="pf-dept" className="app-input" type="text" value={formData.department} onChange={(e) => handleChange('department', e.target.value)} placeholder="Computer Science" style={inp()} /></div>
                            </div>
                            <div><L htmlFor="pf-qual">Qualifications</L><input id="pf-qual" className="app-input" type="text" value={formData.qualifications} onChange={(e) => handleChange('qualifications', e.target.value)} placeholder="Ph.D., M.Tech" style={inp()} /></div>
                          </div>
                        )}
                      </div>
                      <div style={softCard}>
                        <SectionHeader icon={LinkIcon} title="Social links" />
                        <div style={{ display: 'grid', gap: 14 }}>
                          <div><L htmlFor="pf-tw">Twitter / X</L><input id="pf-tw" className="app-input" type="text" value={formData.socialLinks.twitter} onChange={(e) => handleChange('socialLinks.twitter', e.target.value)} placeholder="@username" style={inp()} /></div>
                          <div><L htmlFor="pf-li">LinkedIn</L><input id="pf-li" className="app-input" type="text" value={formData.socialLinks.linkedin} onChange={(e) => handleChange('socialLinks.linkedin', e.target.value)} placeholder="linkedin.com/in/username" style={inp()} /></div>
                          <div><L htmlFor="pf-gh">GitHub</L><input id="pf-gh" className="app-input" type="text" value={formData.socialLinks.github} onChange={(e) => handleChange('socialLinks.github', e.target.value)} placeholder="github.com/username" style={inp()} /></div>
                        </div>
                      </div>
                    </div>

                    <div style={{ ...softCard, gridColumn: isMobile ? 'auto' : 'span 2' }}>
                      <SectionHeader icon={MapPin} title="Address" />
                      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '2fr 1fr 1fr', gap: 16 }}>
                        <div><L htmlFor="pf-st">Street</L><input id="pf-st" className="app-input" type="text" value={formData.address.street} onChange={(e) => handleChange('address.street', e.target.value)} placeholder="123 Main Street" style={inp()} /></div>
                        <div><L htmlFor="pf-city">City</L><input id="pf-city" className="app-input" type="text" value={formData.address.city} onChange={(e) => handleChange('address.city', e.target.value)} placeholder="Mumbai" style={inp()} /></div>
                        <div><L htmlFor="pf-state">State</L><input id="pf-state" className="app-input" type="text" value={formData.address.state} onChange={(e) => handleChange('address.state', e.target.value)} placeholder="Maharashtra" style={inp()} /></div>
                        <div><L htmlFor="pf-zip">ZIP Code</L><input id="pf-zip" className="app-input" type="text" value={formData.address.zipCode} onChange={(e) => handleChange('address.zipCode', e.target.value)} placeholder="400001" style={inp()} /></div>
                        <div><L htmlFor="pf-country">Country</L><input id="pf-country" className="app-input" type="text" value={formData.address.country} onChange={(e) => handleChange('address.country', e.target.value)} placeholder="India" style={inp()} /></div>
                      </div>
                    </div>
                  </div>

                  {/* actions */}
                  <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', flexWrap: 'wrap', marginTop: 20, flexDirection: isMobile ? 'column-reverse' : 'row' }}>
                    <button type="button" onClick={handleCancel} style={ghostButton({ padding: '12px 20px', fontSize: 14 })}>Cancel</button>
                    <button type="submit" disabled={isSaving} style={primaryButton(isSaving)}>{isSaving ? 'Saving…' : 'Save Changes'}</button>
                  </div>
                </form>
              ) : (
                <>
                  <ProfileCover />
                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 20, alignItems: 'start' }}>
                    <div style={softCard}>
                      <SectionHeader icon={UserRound} title="Personal information" />
                      <div style={fieldGrid}>
                        <Field icon={PhoneIcon} label="Phone" value={formData.phone} />
                        <Field icon={VenusAndMars} label="Gender" value={formData.gender && <span style={{ textTransform: 'capitalize' }}>{formData.gender}</span>} />
                        <Field icon={Cake} label="Date of birth" value={formData.dateOfBirth ? new Date(formData.dateOfBirth).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : ''} />
                        <Field icon={FileText} label="Bio" value={formData.bio} span />
                      </div>
                    </div>
                    <div style={softCard}>
                      <SectionHeader icon={user?.role === 'teacher' ? GraduationCap : Backpack} title={roleLabel} />
                      <div style={fieldGrid}>
                        {user?.role === 'student' ? (
                          <>
                            <Field icon={IdCard} label="Enrollment number" value={formData.enrollmentNumber} />
                            <Field icon={School} label="Class / section" value={formData.class} />
                          </>
                        ) : (
                          <>
                            <Field icon={IdCard} label="Employee ID" value={formData.employeeId} />
                            <Field icon={Landmark} label="Department" value={formData.department} />
                            <Field icon={ScrollText} label="Qualifications" value={formData.qualifications} span />
                          </>
                        )}
                      </div>
                    </div>
                    {hasAddress && (
                      <div style={softCard}>
                        <SectionHeader icon={MapPin} title="Address" />
                        <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.6 }}>
                          {[formData.address.street, [formData.address.city, formData.address.state].filter(Boolean).join(', '), [formData.address.zipCode, formData.address.country].filter(Boolean).join(' · ')].filter(Boolean).map((line, i) => <span key={i} style={{ display: 'block' }}>{line}</span>)}
                        </p>
                      </div>
                    )}
                    {hasSocial && (
                      <div style={softCard}>
                        <SectionHeader icon={LinkIcon} title="Social links" />
                        <div style={{ display: 'grid', gap: 14 }}>
                          {formData.socialLinks.twitter && <Field icon={<XLogo size={16} aria-hidden="true" style={{ color: 'var(--text-primary)' }} />} label="Twitter / X" value={formData.socialLinks.twitter} />}
                          {formData.socialLinks.linkedin && <Field icon={<LinkedinLogo size={16} aria-hidden="true" style={{ color: 'color-mix(in srgb, #0A66C2, white var(--tone-lift))' }} />} label="LinkedIn" value={formData.socialLinks.linkedin} />}
                          {formData.socialLinks.github && <Field icon={<GithubLogo size={16} aria-hidden="true" style={{ color: 'var(--text-primary)' }} />} label="GitHub" value={formData.socialLinks.github} />}
                        </div>
                      </div>
                    )}
                    {!hasAddress && !hasSocial && (
                      <div style={{ ...softCard, gridColumn: isMobile ? 'auto' : 'span 2', textAlign: 'center', borderStyle: 'dashed', boxShadow: 'none' }}>
                        <p style={{ margin: 0, fontSize: 13.5, color: 'var(--text-secondary)' }}>Add your address and social links with <strong>Edit Profile</strong>.</p>
                      </div>
                    )}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default ProfilePage