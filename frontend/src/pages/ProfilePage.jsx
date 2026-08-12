import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import useAuthStore from '../stores/authStore'
import Sidebar from '../components/Sidebar'
import ThemeToggle from '../components/ThemeToggle'
import ProfileDropdown from '../components/ProfileDropdown'
import PasswordInput from '../components/PasswordInput'
import useIsMobile from '../hooks/useIsMobile'
import { API_URL } from '../config.js'

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
    borderRadius: 'var(--radius-lg)',
    boxShadow: 'var(--shadow-md)',
    overflow: 'hidden'
  }
  const inputStyle = {
    width: '100%',
    boxSizing: 'border-box',
    padding: '11px 14px',
    fontSize: '14px',
    border: '1px solid var(--border-color)',
    borderRadius: 'var(--radius)',
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
    boxShadow: disabled ? 'none' : '0 2px 10px rgba(30,64,175,.25)',
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

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-primary)', fontFamily: '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif' }}>
      <Sidebar user={user} />
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', marginLeft: 'var(--sidebar-width, 240px)' }}>
        <header style={{ background: 'var(--header-bg)', color: 'white', padding: isMobile ? '16px 16px 16px 64px' : '20px 32px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h1 style={{ margin: 0, fontSize: isMobile ? '22px' : '26px', fontWeight: '700', letterSpacing: '-0.02em' }}>Profile</h1>
              <p style={{ margin: '4px 0 0', fontSize: '13px', opacity: 0.85 }}>Manage your account details</p>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <ThemeToggle />
              <ProfileDropdown />
            </div>
          </div>
        </header>

        <div style={{ flex: 1, padding: contentPad, maxWidth: '100%', boxSizing: 'border-box' }}>
          {/* Tabs */}
          <div style={{ display: 'flex', gap: '4px', marginBottom: '24px', borderBottom: '2px solid var(--border-color)', paddingBottom: '0', flexWrap: 'wrap' }}>
            <button
              onClick={() => { setActiveTab('profile'); setIsEditing(false) }}
              style={{
                padding: '12px 24px',
                fontSize: '14px',
                fontWeight: '600',
                background: activeTab === 'profile' ? 'var(--accent-gradient)' : 'transparent',
                color: activeTab === 'profile' ? 'white' : 'var(--text-secondary)',
                border: 'none',
                borderBottom: activeTab === 'profile' ? '3px solid var(--accent)' : '3px solid transparent',
                borderRadius: 'var(--radius-sm) var(--radius-sm) 0 0',
                cursor: 'pointer'
              }}
            >
              My Profile
            </button>
            <button
              onClick={() => { setActiveTab('password'); setIsEditing(false) }}
              style={{
                padding: '12px 24px',
                fontSize: '14px',
                fontWeight: '600',
                background: activeTab === 'password' ? 'var(--accent-gradient)' : 'transparent',
                color: activeTab === 'password' ? 'white' : 'var(--text-secondary)',
                border: 'none',
                borderBottom: activeTab === 'password' ? '3px solid var(--accent)' : '3px solid transparent',
                borderRadius: 'var(--radius-sm) var(--radius-sm) 0 0',
                cursor: 'pointer'
              }}
            >
              Change Password
            </button>
          </div>

          {/* Back Button */}
          <button
            onClick={() => navigate(roleDashboard)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '11px 18px',
              background: 'var(--bg-card)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius)',
              boxShadow: 'var(--shadow-sm)',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer',
              marginBottom: '24px'
            }}
          >
            ← Back to Dashboard
          </button>

          {activeTab === 'password' ? (
            <div style={{
              ...cardStyle,
              padding: isMobile ? '20px' : '24px',
              maxWidth: '500px'
            }}>
              <h2 style={{ fontSize: '20px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '8px', letterSpacing: '-0.01em' }}>
                Change Password
              </h2>
              <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '24px' }}>
                Enter your current password and a new password.
              </p>

              {passwordError && (
                <div style={errorBanner}>
                  {passwordError}
                </div>
              )}
              {passwordSuccess && (
                <div style={successBanner}>
                  {passwordSuccess}
                </div>
              )}

              <form onSubmit={handlePasswordSubmit} style={{ display: 'grid', gap: '20px' }}>
                <div>
                  <label style={labelStyle}>
                    Current Password
                  </label>
                  <PasswordInput
                    value={passwordData.oldPassword}
                    onChange={(e) => setPasswordData(p => ({ ...p, oldPassword: e.target.value }))}
                    placeholder="Enter current password"
                  />
                </div>
                <div>
                  <label style={labelStyle}>
                    New Password
                  </label>
                  <PasswordInput
                    value={passwordData.newPassword}
                    onChange={(e) => setPasswordData(p => ({ ...p, newPassword: e.target.value }))}
                    placeholder="Enter new password"
                  />
                  <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '6px' }}>
                    Min 8 chars with 1 uppercase, 1 lowercase, 1 digit, 1 special character
                  </p>
                </div>
                <div>
                  <label style={labelStyle}>
                    Confirm New Password
                  </label>
                  <PasswordInput
                    value={passwordData.confirmPassword}
                    onChange={(e) => setPasswordData(p => ({ ...p, confirmPassword: e.target.value }))}
                    placeholder="Confirm new password"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isPasswordLoading}
                  style={{ ...primaryBtnStyle(isPasswordLoading), width: '100%', padding: '13px', fontSize: '15px' }}
                >
                  {isPasswordLoading ? 'Updating...' : 'Update Password'}
                </button>
              </form>
            </div>
          ) : (
            <>
              {success && (
                <div style={successBanner}>
                  {success}
                </div>
              )}
              {error && (
                <div style={errorBanner}>
                  {error}
                </div>
              )}

              {isEditing ? (
                <form onSubmit={handleSubmit}>
                  <div style={cardStyle}>
                    <div style={{
                      background: 'var(--accent-gradient)',
                      padding: isMobile ? '24px 20px' : '30px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: isMobile ? '16px' : '24px',
                      flexWrap: 'wrap'
                    }}>
                      <div style={{ position: 'relative' }}>
                        <div
                          onClick={() => fileInputRef.current?.click()}
                          style={{
                            width: '100px',
                            height: '100px',
                            borderRadius: '50%',
                            background: formData.profileImage ? 'transparent' : 'rgba(255,255,255,0.2)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            border: '4px solid white',
                            overflow: 'hidden',
                            cursor: 'pointer'
                          }}
                        >
                          {formData.profileImage ? (
                            <img src={formData.profileImage} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : (
                            <span style={{ fontSize: '40px', color: 'white', fontWeight: '700' }}>
                              {formData.name?.charAt(0)?.toUpperCase() || 'U'}
                            </span>
                          )}
                        </div>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/*"
                          onChange={handleImageUpload}
                          style={{ display: 'none' }}
                        />
                        <div style={{
                          position: 'absolute',
                          bottom: '0',
                          right: '0',
                          background: 'white',
                          borderRadius: '50%',
                          width: '28px',
                          height: '28px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                          fontSize: '14px'
                        }}>
                          📷
                        </div>
                      </div>
                      <div style={{ color: 'white' }}>
                        <h2 style={{ margin: 0, fontSize: '24px', fontWeight: '700' }}>{formData.name}</h2>
                        <p style={{ margin: '4px 0 0', fontSize: '14px', opacity: 0.85, textTransform: 'capitalize' }}>{user?.role}</p>
                      </div>
                    </div>

                    <div style={{ padding: isMobile ? '20px' : '32px', display: 'grid', gap: '20px' }}>
                      <div style={twoCol}>
                        <div>
                          <label style={labelStyle}>Full Name</label>
                          <input type="text" value={formData.name} onChange={(e) => handleChange('name', e.target.value)} style={inputStyle} />
                        </div>
                        <div>
                          <label style={labelStyle}>Phone</label>
                          <input type="text" value={formData.phone} onChange={(e) => handleChange('phone', e.target.value)} placeholder="+91 98765 43210" style={inputStyle} />
                        </div>
                      </div>

                      <div style={twoCol}>
                        <div>
                          <label style={labelStyle}>Date of Birth</label>
                          <input type="date" value={formData.dateOfBirth} onChange={(e) => handleChange('dateOfBirth', e.target.value)} style={inputStyle} />
                        </div>
                        <div>
                          <label style={labelStyle}>Gender</label>
                          <select value={formData.gender} onChange={(e) => handleChange('gender', e.target.value)} style={inputStyle}>
                            <option value="">Select</option>
                            <option value="male">Male</option>
                            <option value="female">Female</option>
                            <option value="other">Other</option>
                          </select>
                        </div>
                      </div>

                      <div>
                        <label style={labelStyle}>Bio</label>
                        <textarea value={formData.bio} onChange={(e) => handleChange('bio', e.target.value)} placeholder="Tell us about yourself..." rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
                      </div>

                      <p style={sectionHeadingStyle}>
                        Address
                      </p>
                      <div style={twoCol}>
                        <div>
                          <label style={labelStyle}>Street</label>
                          <input type="text" value={formData.address.street} onChange={(e) => handleChange('address.street', e.target.value)} placeholder="123 Main Street" style={inputStyle} />
                        </div>
                        <div>
                          <label style={labelStyle}>City</label>
                          <input type="text" value={formData.address.city} onChange={(e) => handleChange('address.city', e.target.value)} placeholder="Mumbai" style={inputStyle} />
                        </div>
                        <div>
                          <label style={labelStyle}>State</label>
                          <input type="text" value={formData.address.state} onChange={(e) => handleChange('address.state', e.target.value)} placeholder="Maharashtra" style={inputStyle} />
                        </div>
                        <div>
                          <label style={labelStyle}>ZIP Code</label>
                          <input type="text" value={formData.address.zipCode} onChange={(e) => handleChange('address.zipCode', e.target.value)} placeholder="400001" style={inputStyle} />
                        </div>
                      </div>
                      <div>
                        <label style={labelStyle}>Country</label>
                        <input type="text" value={formData.address.country} onChange={(e) => handleChange('address.country', e.target.value)} placeholder="India" style={inputStyle} />
                      </div>

                      <p style={sectionHeadingStyle}>
                        Social Links
                      </p>
                      <div style={threeCol}>
                        <div>
                          <label style={labelStyle}>Twitter / X</label>
                          <input type="text" value={formData.socialLinks.twitter} onChange={(e) => handleChange('socialLinks.twitter', e.target.value)} placeholder="@username" style={inputStyle} />
                        </div>
                        <div>
                          <label style={labelStyle}>LinkedIn</label>
                          <input type="text" value={formData.socialLinks.linkedin} onChange={(e) => handleChange('socialLinks.linkedin', e.target.value)} placeholder="linkedin.com/in/username" style={inputStyle} />
                        </div>
                        <div>
                          <label style={labelStyle}>GitHub</label>
                          <input type="text" value={formData.socialLinks.github} onChange={(e) => handleChange('socialLinks.github', e.target.value)} placeholder="github.com/username" style={inputStyle} />
                        </div>
                      </div>

                      {user?.role === 'student' && (
                        <>
                          <p style={sectionHeadingStyle}>
                            Student Details
                          </p>
                          <div style={twoCol}>
                            <div>
                              <label style={labelStyle}>Enrollment Number</label>
                              <input type="text" value={formData.enrollmentNumber} onChange={(e) => handleChange('enrollmentNumber', e.target.value)} placeholder="2021BCS001" style={inputStyle} />
                            </div>
                            <div>
                              <label style={labelStyle}>Class / Section</label>
                              <input type="text" value={formData.class} onChange={(e) => handleChange('class', e.target.value)} placeholder="BCS - A" style={inputStyle} />
                            </div>
                          </div>
                        </>
                      )}

                      {user?.role === 'teacher' && (
                        <>
                          <p style={sectionHeadingStyle}>
                            Teacher Details
                          </p>
                          <div style={twoCol}>
                            <div>
                              <label style={labelStyle}>Employee ID</label>
                              <input type="text" value={formData.employeeId} onChange={(e) => handleChange('employeeId', e.target.value)} placeholder="EMP001" style={inputStyle} />
                            </div>
                            <div>
                              <label style={labelStyle}>Department</label>
                              <input type="text" value={formData.department} onChange={(e) => handleChange('department', e.target.value)} placeholder="Computer Science" style={inputStyle} />
                            </div>
                          </div>
                          <div>
                            <label style={labelStyle}>Qualifications</label>
                            <input type="text" value={formData.qualifications} onChange={(e) => handleChange('qualifications', e.target.value)} placeholder="Ph.D., M.Tech" style={inputStyle} />
                          </div>
                        </>
                      )}
                    </div>

                    <div style={{ padding: isMobile ? '16px 20px' : '20px 32px', borderTop: '1px solid var(--border-color)', display: 'flex', gap: '12px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                      <button type="button" onClick={handleCancel} style={secondaryBtnStyle}>
                        Cancel
                      </button>
                      <button type="submit" disabled={isSaving} style={primaryBtnStyle(isSaving)}>
                        {isSaving ? 'Saving...' : 'Save Changes'}
                      </button>
                    </div>
                  </div>
                </form>
              ) : (
                <div style={cardStyle}>
                  <div style={{
                    background: 'var(--accent-gradient)',
                    padding: isMobile ? '24px 20px' : '30px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: isMobile ? '16px' : '24px',
                    flexWrap: 'wrap'
                  }}>
                    <div style={{
                      width: isMobile ? '76px' : '100px',
                      height: isMobile ? '76px' : '100px',
                      flexShrink: 0,
                      borderRadius: '50%',
                      background: formData.profileImage ? 'transparent' : 'rgba(255,255,255,0.2)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      border: '4px solid white',
                      overflow: 'hidden'
                    }}>
                      {formData.profileImage ? (
                        <img src={formData.profileImage} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <span style={{ fontSize: isMobile ? '32px' : '40px', color: 'white', fontWeight: '700' }}>
                          {formData.name?.charAt(0)?.toUpperCase() || 'U'}
                        </span>
                      )}
                    </div>
                    <div style={{ color: 'white', minWidth: 0 }}>
                      <h2 style={{ margin: 0, fontSize: isMobile ? '20px' : '24px', fontWeight: '700', letterSpacing: '-0.01em', wordBreak: 'break-word' }}>{user?.name}</h2>
                      <p style={{ margin: '4px 0 0', fontSize: '14px', opacity: 0.85, textTransform: 'capitalize' }}>{user?.role}</p>
                      <p style={{ margin: '2px 0 0', fontSize: '12px', opacity: 0.7, wordBreak: 'break-word' }}>{user?.email}</p>
                    </div>
                    <button
                      onClick={() => setIsEditing(true)}
                      style={{
                        marginLeft: isMobile ? 0 : 'auto',
                        padding: '10px 20px',
                        background: 'white',
                        color: 'var(--accent-strong)',
                        border: 'none',
                        borderRadius: 'var(--radius)',
                        boxShadow: '0 2px 8px rgba(0,0,0,.15)',
                        fontSize: '14px',
                        fontWeight: '600',
                        cursor: 'pointer'
                      }}
                    >
                      Edit Profile
                    </button>
                  </div>

                  <div style={{ padding: isMobile ? '20px' : '32px' }}>
                    <div style={twoColView}>
                      <div>
                        <p style={fieldLabelView}>PHONE</p>
                        <p style={fieldValueView}>{formData.phone || '—'}</p>
                      </div>
                      <div>
                        <p style={fieldLabelView}>GENDER</p>
                        <p style={{ ...fieldValueView, textTransform: 'capitalize' }}>{formData.gender || '—'}</p>
                      </div>
                      <div>
                        <p style={fieldLabelView}>DATE OF BIRTH</p>
                        <p style={fieldValueView}>{formData.dateOfBirth ? new Date(formData.dateOfBirth).toLocaleDateString('en-IN') : '—'}</p>
                      </div>
                      <div>
                        <p style={fieldLabelView}>BIO</p>
                        <p style={fieldValueView}>{formData.bio || '—'}</p>
                      </div>
                    </div>

                    {formData.address?.street && (
                      <>
                        <p style={sectionHeadingStyle}>
                          Address
                        </p>
                        <div style={{ ...twoColView, marginTop: '12px' }}>
                          <div>
                            <p style={fieldLabelView}>STREET</p>
                            <p style={fieldValueView}>{formData.address.street || '—'}</p>
                          </div>
                          <div>
                            <p style={fieldLabelView}>CITY</p>
                            <p style={fieldValueView}>{formData.address.city || '—'}</p>
                          </div>
                          <div>
                            <p style={fieldLabelView}>STATE</p>
                            <p style={fieldValueView}>{formData.address.state || '—'}</p>
                          </div>
                          <div>
                            <p style={fieldLabelView}>ZIP CODE</p>
                            <p style={fieldValueView}>{formData.address.zipCode || '—'}</p>
                          </div>
                          <div>
                            <p style={fieldLabelView}>COUNTRY</p>
                            <p style={fieldValueView}>{formData.address.country || '—'}</p>
                          </div>
                        </div>
                      </>
                    )}

                    {(formData.socialLinks?.twitter || formData.socialLinks?.linkedin || formData.socialLinks?.github) && (
                      <>
                        <p style={sectionHeadingStyle}>
                          Social Links
                        </p>
                        <div style={{ ...threeColView, marginTop: '12px' }}>
                          {formData.socialLinks?.twitter && (
                            <div>
                              <p style={fieldLabelView}>TWITTER</p>
                              <p style={fieldValueView}>𝕏 {formData.socialLinks.twitter}</p>
                            </div>
                          )}
                          {formData.socialLinks?.linkedin && (
                            <div>
                              <p style={fieldLabelView}>LINKEDIN</p>
                              <p style={fieldValueView}>{formData.socialLinks.linkedin}</p>
                            </div>
                          )}
                          {formData.socialLinks?.github && (
                            <div>
                              <p style={fieldLabelView}>GITHUB</p>
                              <p style={fieldValueView}>{formData.socialLinks.github}</p>
                            </div>
                          )}
                        </div>
                      </>
                    )}

                    {user?.role === 'student' && (
                      <>
                        <p style={sectionHeadingStyle}>
                          Student Details
                        </p>
                        <div style={{ ...twoColView, marginTop: '12px', marginBottom: 0 }}>
                          <div>
                            <p style={fieldLabelView}>ENROLLMENT NUMBER</p>
                            <p style={fieldValueView}>{formData.enrollmentNumber || '—'}</p>
                          </div>
                          <div>
                            <p style={fieldLabelView}>CLASS / SECTION</p>
                            <p style={fieldValueView}>{formData.class || '—'}</p>
                          </div>
                        </div>
                      </>
                    )}

                    {user?.role === 'teacher' && (
                      <>
                        <p style={sectionHeadingStyle}>
                          Teacher Details
                        </p>
                        <div style={{ ...twoColView, marginTop: '12px', marginBottom: 0 }}>
                          <div>
                            <p style={fieldLabelView}>EMPLOYEE ID</p>
                            <p style={fieldValueView}>{formData.employeeId || '—'}</p>
                          </div>
                          <div>
                            <p style={fieldLabelView}>DEPARTMENT</p>
                            <p style={fieldValueView}>{formData.department || '—'}</p>
                          </div>
                          <div style={{ gridColumn: isMobile ? 'auto' : 'span 2' }}>
                            <p style={fieldLabelView}>QUALIFICATIONS</p>
                            <p style={fieldValueView}>{formData.qualifications || '—'}</p>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default ProfilePage