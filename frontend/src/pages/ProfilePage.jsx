import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import useAuthStore from '../stores/authStore'
import Sidebar from '../components/Sidebar'
import ThemeToggle from '../components/ThemeToggle'
import ProfileDropdown from '../components/ProfileDropdown'
import PasswordInput from '../components/PasswordInput'
import { API_URL } from '../config.js'

function ProfilePage() {
  const navigate = useNavigate()
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

  if (!user) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-primary)', fontFamily: '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif' }}>
        <Sidebar user={null} />
        <div style={{ flex: 1,marginLeft: 'var(--sidebar-width)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p>Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-primary)', fontFamily: '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif' }}>
      <Sidebar user={user} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column',marginLeft: 'var(--sidebar-width)' }}>
        <header style={{ background: 'var(--header-bg)', color: 'white', padding: '16px 32px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h1 style={{ margin: 0, fontSize: '20px', fontWeight: '700' }}>Profile</h1>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <ThemeToggle />
              <ProfileDropdown />
            </div>
          </div>
        </header>

        <div style={{ flex: 1, padding: '32px' }}>
          {/* Tabs */}
          <div style={{ display: 'flex', gap: '4px', marginBottom: '24px', borderBottom: '2px solid var(--border-color)', paddingBottom: '0' }}>
            <button
              onClick={() => { setActiveTab('profile'); setIsEditing(false) }}
              style={{
                padding: '12px 24px',
                fontSize: '14px',
                fontWeight: '600',
                background: activeTab === 'profile' ? 'linear-gradient(135deg, #1e40af, #3b82f6)' : 'transparent',
                color: activeTab === 'profile' ? 'white' : 'var(--text-secondary)',
                border: 'none',
                borderBottom: activeTab === 'profile' ? '3px solid #3b82f6' : '3px solid transparent',
                borderRadius: '8px 8px 0 0',
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
                background: activeTab === 'password' ? 'linear-gradient(135deg, #1e40af, #3b82f6)' : 'transparent',
                color: activeTab === 'password' ? 'white' : 'var(--text-secondary)',
                border: 'none',
                borderBottom: activeTab === 'password' ? '3px solid #3b82f6' : '3px solid transparent',
                borderRadius: '8px 8px 0 0',
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
              padding: '10px 20px',
              background: 'var(--bg-card)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-color)',
              borderRadius: '10px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer',
              marginBottom: '24px'
            }}
          >
            Back to Dashboard
          </button>

          {activeTab === 'password' ? (
            <div style={{
              background: 'var(--bg-card)',
              borderRadius: '16px',
              boxShadow: 'var(--card-shadow)',
              border: '1px solid var(--border-color)',
              padding: '32px',
              maxWidth: '500px'
            }}>
              <h2 style={{ fontSize: '20px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '8px' }}>
                Change Password
              </h2>
              <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '24px' }}>
                Enter your current password and a new password.
              </p>

              {passwordError && (
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '12px 16px', marginBottom: '20px', color: '#dc2626', fontSize: '14px' }}>
                  {passwordError}
                </div>
              )}
              {passwordSuccess && (
                <div style={{ background: '#ecfdf5', border: '1px solid #6ee7b7', borderRadius: '8px', padding: '12px 16px', marginBottom: '20px', color: '#059669', fontSize: '14px' }}>
                  {passwordSuccess}
                </div>
              )}

              <form onSubmit={handlePasswordSubmit} style={{ display: 'grid', gap: '20px' }}>
                <div>
                  <label style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                    Current Password
                  </label>
                  <PasswordInput
                    value={passwordData.oldPassword}
                    onChange={(e) => setPasswordData(p => ({ ...p, oldPassword: e.target.value }))}
                    placeholder="Enter current password"
                  />
                </div>
                <div>
                  <label style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                    New Password
                  </label>
                  <PasswordInput
                    value={passwordData.newPassword}
                    onChange={(e) => setPasswordData(p => ({ ...p, newPassword: e.target.value }))}
                    placeholder="Enter new password"
                  />
                  <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                    Min 8 chars with 1 uppercase, 1 lowercase, 1 digit, 1 special character
                  </p>
                </div>
                <div>
                  <label style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
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
                  style={{
                    width: '100%',
                    padding: '14px',
                    fontSize: '16px',
                    fontWeight: '600',
                    background: isPasswordLoading ? '#9ca3af' : 'linear-gradient(135deg, #1e40af, #3b82f6)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '10px',
                    cursor: isPasswordLoading ? 'not-allowed' : 'pointer'
                  }}
                >
                  {isPasswordLoading ? 'Updating...' : 'Update Password'}
                </button>
              </form>
            </div>
          ) : (
            <>
              {success && (
                <div style={{ background: '#ecfdf5', border: '1px solid #6ee7b7', borderRadius: '8px', padding: '12px 16px', marginBottom: '20px', color: '#059669', fontSize: '14px' }}>
                  {success}
                </div>
              )}
              {error && (
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '12px 16px', marginBottom: '20px', color: '#dc2626', fontSize: '14px' }}>
                  {error}
                </div>
              )}

              {isEditing ? (
                <form onSubmit={handleSubmit}>
                  <div style={{
                    background: 'var(--bg-card)',
                    borderRadius: '16px',
                    boxShadow: 'var(--card-shadow)',
                    border: '1px solid var(--border-color)',
                    overflow: 'hidden'
                  }}>
                    <div style={{
                      background: 'linear-gradient(135deg, #1e40af, #3b82f6)',
                      padding: '30px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '24px'
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

                    <div style={{ padding: '32px', display: 'grid', gap: '20px' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                        <div>
                          <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Full Name</label>
                          <input type="text" value={formData.name} onChange={(e) => handleChange('name', e.target.value)} style={{ width: '100%', padding: '8px 12px', fontSize: '13px', border: '1px solid var(--border-color)', borderRadius: '6px', background: 'var(--bg-primary)', color: 'var(--text-primary)', outline: 'none' }} />
                        </div>
                        <div>
                          <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Phone</label>
                          <input type="text" value={formData.phone} onChange={(e) => handleChange('phone', e.target.value)} placeholder="+91 98765 43210" style={{ width: '100%', padding: '8px 12px', fontSize: '13px', border: '1px solid var(--border-color)', borderRadius: '6px', background: 'var(--bg-primary)', color: 'var(--text-primary)', outline: 'none' }} />
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                        <div>
                          <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Date of Birth</label>
                          <input type="date" value={formData.dateOfBirth} onChange={(e) => handleChange('dateOfBirth', e.target.value)} style={{ width: '100%', padding: '8px 12px', fontSize: '13px', border: '1px solid var(--border-color)', borderRadius: '6px', background: 'var(--bg-primary)', color: 'var(--text-primary)', outline: 'none' }} />
                        </div>
                        <div>
                          <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Gender</label>
                          <select value={formData.gender} onChange={(e) => handleChange('gender', e.target.value)} style={{ width: '100%', padding: '8px 12px', fontSize: '13px', border: '1px solid var(--border-color)', borderRadius: '6px', background: 'var(--bg-primary)', color: 'var(--text-primary)', outline: 'none' }}>
                            <option value="">Select</option>
                            <option value="male">Male</option>
                            <option value="female">Female</option>
                            <option value="other">Other</option>
                          </select>
                        </div>
                      </div>

                      <div>
                        <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Bio</label>
                        <textarea value={formData.bio} onChange={(e) => handleChange('bio', e.target.value)} placeholder="Tell us about yourself..." rows={3} style={{ width: '100%', padding: '8px 12px', fontSize: '13px', border: '1px solid var(--border-color)', borderRadius: '6px', background: 'var(--bg-primary)', color: 'var(--text-primary)', outline: 'none', resize: 'vertical' }} />
                      </div>

                      <p style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)', margin: '8px 0 12px', paddingBottom: '8px', borderBottom: '1px solid var(--border-color)' }}>
                        Address
                      </p>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                        <div>
                          <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Street</label>
                          <input type="text" value={formData.address.street} onChange={(e) => handleChange('address.street', e.target.value)} placeholder="123 Main Street" style={{ width: '100%', padding: '8px 12px', fontSize: '13px', border: '1px solid var(--border-color)', borderRadius: '6px', background: 'var(--bg-primary)', color: 'var(--text-primary)', outline: 'none' }} />
                        </div>
                        <div>
                          <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>City</label>
                          <input type="text" value={formData.address.city} onChange={(e) => handleChange('address.city', e.target.value)} placeholder="Mumbai" style={{ width: '100%', padding: '8px 12px', fontSize: '13px', border: '1px solid var(--border-color)', borderRadius: '6px', background: 'var(--bg-primary)', color: 'var(--text-primary)', outline: 'none' }} />
                        </div>
                        <div>
                          <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>State</label>
                          <input type="text" value={formData.address.state} onChange={(e) => handleChange('address.state', e.target.value)} placeholder="Maharashtra" style={{ width: '100%', padding: '8px 12px', fontSize: '13px', border: '1px solid var(--border-color)', borderRadius: '6px', background: 'var(--bg-primary)', color: 'var(--text-primary)', outline: 'none' }} />
                        </div>
                        <div>
                          <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>ZIP Code</label>
                          <input type="text" value={formData.address.zipCode} onChange={(e) => handleChange('address.zipCode', e.target.value)} placeholder="400001" style={{ width: '100%', padding: '8px 12px', fontSize: '13px', border: '1px solid var(--border-color)', borderRadius: '6px', background: 'var(--bg-primary)', color: 'var(--text-primary)', outline: 'none' }} />
                        </div>
                      </div>
                      <div>
                        <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Country</label>
                        <input type="text" value={formData.address.country} onChange={(e) => handleChange('address.country', e.target.value)} placeholder="India" style={{ width: '100%', padding: '8px 12px', fontSize: '13px', border: '1px solid var(--border-color)', borderRadius: '6px', background: 'var(--bg-primary)', color: 'var(--text-primary)', outline: 'none' }} />
                      </div>

                      <p style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)', margin: '8px 0 12px', paddingBottom: '8px', borderBottom: '1px solid var(--border-color)' }}>
                        Social Links
                      </p>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
                        <div>
                          <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Twitter / X</label>
                          <input type="text" value={formData.socialLinks.twitter} onChange={(e) => handleChange('socialLinks.twitter', e.target.value)} placeholder="@username" style={{ width: '100%', padding: '8px 12px', fontSize: '13px', border: '1px solid var(--border-color)', borderRadius: '6px', background: 'var(--bg-primary)', color: 'var(--text-primary)', outline: 'none' }} />
                        </div>
                        <div>
                          <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>LinkedIn</label>
                          <input type="text" value={formData.socialLinks.linkedin} onChange={(e) => handleChange('socialLinks.linkedin', e.target.value)} placeholder="linkedin.com/in/username" style={{ width: '100%', padding: '8px 12px', fontSize: '13px', border: '1px solid var(--border-color)', borderRadius: '6px', background: 'var(--bg-primary)', color: 'var(--text-primary)', outline: 'none' }} />
                        </div>
                        <div>
                          <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>GitHub</label>
                          <input type="text" value={formData.socialLinks.github} onChange={(e) => handleChange('socialLinks.github', e.target.value)} placeholder="github.com/username" style={{ width: '100%', padding: '8px 12px', fontSize: '13px', border: '1px solid var(--border-color)', borderRadius: '6px', background: 'var(--bg-primary)', color: 'var(--text-primary)', outline: 'none' }} />
                        </div>
                      </div>

                      {user?.role === 'student' && (
                        <>
                          <p style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)', margin: '8px 0 12px', paddingBottom: '8px', borderBottom: '1px solid var(--border-color)' }}>
                            Student Details
                          </p>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                            <div>
                              <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Enrollment Number</label>
                              <input type="text" value={formData.enrollmentNumber} onChange={(e) => handleChange('enrollmentNumber', e.target.value)} placeholder="2021BCS001" style={{ width: '100%', padding: '8px 12px', fontSize: '13px', border: '1px solid var(--border-color)', borderRadius: '6px', background: 'var(--bg-primary)', color: 'var(--text-primary)', outline: 'none' }} />
                            </div>
                            <div>
                              <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Class / Section</label>
                              <input type="text" value={formData.class} onChange={(e) => handleChange('class', e.target.value)} placeholder="BCS - A" style={{ width: '100%', padding: '8px 12px', fontSize: '13px', border: '1px solid var(--border-color)', borderRadius: '6px', background: 'var(--bg-primary)', color: 'var(--text-primary)', outline: 'none' }} />
                            </div>
                          </div>
                        </>
                      )}

                      {user?.role === 'teacher' && (
                        <>
                          <p style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)', margin: '8px 0 12px', paddingBottom: '8px', borderBottom: '1px solid var(--border-color)' }}>
                            Teacher Details
                          </p>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                            <div>
                              <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Employee ID</label>
                              <input type="text" value={formData.employeeId} onChange={(e) => handleChange('employeeId', e.target.value)} placeholder="EMP001" style={{ width: '100%', padding: '8px 12px', fontSize: '13px', border: '1px solid var(--border-color)', borderRadius: '6px', background: 'var(--bg-primary)', color: 'var(--text-primary)', outline: 'none' }} />
                            </div>
                            <div>
                              <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Department</label>
                              <input type="text" value={formData.department} onChange={(e) => handleChange('department', e.target.value)} placeholder="Computer Science" style={{ width: '100%', padding: '8px 12px', fontSize: '13px', border: '1px solid var(--border-color)', borderRadius: '6px', background: 'var(--bg-primary)', color: 'var(--text-primary)', outline: 'none' }} />
                            </div>
                          </div>
                          <div>
                            <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Qualifications</label>
                            <input type="text" value={formData.qualifications} onChange={(e) => handleChange('qualifications', e.target.value)} placeholder="Ph.D., M.Tech" style={{ width: '100%', padding: '8px 12px', fontSize: '13px', border: '1px solid var(--border-color)', borderRadius: '6px', background: 'var(--bg-primary)', color: 'var(--text-primary)', outline: 'none' }} />
                          </div>
                        </>
                      )}
                    </div>

                    <div style={{ padding: '20px 32px', borderTop: '1px solid var(--border-color)', display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                      <button type="button" onClick={handleCancel} style={{ padding: '10px 20px', fontSize: '14px', fontWeight: '600', background: 'var(--bg-primary)', color: 'var(--text-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px', cursor: 'pointer' }}>
                        Cancel
                      </button>
                      <button type="submit" disabled={isSaving} style={{ padding: '10px 20px', fontSize: '14px', fontWeight: '600', background: isSaving ? '#9ca3af' : 'linear-gradient(135deg, #1e40af, #3b82f6)', color: 'white', border: 'none', borderRadius: '8px', cursor: isSaving ? 'not-allowed' : 'pointer' }}>
                        {isSaving ? 'Saving...' : 'Save Changes'}
                      </button>
                    </div>
                  </div>
                </form>
              ) : (
                <div style={{
                  background: 'var(--bg-card)',
                  borderRadius: '16px',
                  boxShadow: 'var(--card-shadow)',
                  border: '1px solid var(--border-color)',
                  overflow: 'hidden'
                }}>
                  <div style={{
                    background: 'linear-gradient(135deg, #1e40af, #3b82f6)',
                    padding: '30px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '24px'
                  }}>
                    <div style={{
                      width: '100px',
                      height: '100px',
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
                        <span style={{ fontSize: '40px', color: 'white', fontWeight: '700' }}>
                          {formData.name?.charAt(0)?.toUpperCase() || 'U'}
                        </span>
                      )}
                    </div>
                    <div style={{ color: 'white' }}>
                      <h2 style={{ margin: 0, fontSize: '24px', fontWeight: '700' }}>{user?.name}</h2>
                      <p style={{ margin: '4px 0 0', fontSize: '14px', opacity: 0.85, textTransform: 'capitalize' }}>{user?.role}</p>
                      <p style={{ margin: '2px 0 0', fontSize: '12px', opacity: 0.7 }}>{user?.email}</p>
                    </div>
                    <button
                      onClick={() => setIsEditing(true)}
                      style={{
                        marginLeft: 'auto',
                        padding: '10px 20px',
                        background: 'white',
                        color: '#1e40af',
                        border: 'none',
                        borderRadius: '8px',
                        fontSize: '14px',
                        fontWeight: '600',
                        cursor: 'pointer'
                      }}
                    >
                      Edit Profile
                    </button>
                  </div>

                  <div style={{ padding: '32px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '24px' }}>
                      <div>
                        <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '0 0 4px' }}>PHONE</p>
                        <p style={{ fontSize: '15px', fontWeight: '600', color: 'var(--text-primary)', margin: 0 }}>{formData.phone || '—'}</p>
                      </div>
                      <div>
                        <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '0 0 4px' }}>GENDER</p>
                        <p style={{ fontSize: '15px', fontWeight: '600', color: 'var(--text-primary)', margin: 0, textTransform: 'capitalize' }}>{formData.gender || '—'}</p>
                      </div>
                      <div>
                        <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '0 0 4px' }}>DATE OF BIRTH</p>
                        <p style={{ fontSize: '15px', fontWeight: '600', color: 'var(--text-primary)', margin: 0 }}>{formData.dateOfBirth ? new Date(formData.dateOfBirth).toLocaleDateString('en-IN') : '—'}</p>
                      </div>
                      <div>
                        <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '0 0 4px' }}>BIO</p>
                        <p style={{ fontSize: '15px', fontWeight: '600', color: 'var(--text-primary)', margin: 0 }}>{formData.bio || '—'}</p>
                      </div>
                    </div>

                    {formData.address?.street && (
                      <>
                        <p style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)', margin: '16px 0 12px', paddingBottom: '8px', borderBottom: '1px solid var(--border-color)' }}>
                          Address
                        </p>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '24px' }}>
                          <div>
                            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '0 0 4px' }}>STREET</p>
                            <p style={{ fontSize: '15px', fontWeight: '600', color: 'var(--text-primary)', margin: 0 }}>{formData.address.street || '—'}</p>
                          </div>
                          <div>
                            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '0 0 4px' }}>CITY</p>
                            <p style={{ fontSize: '15px', fontWeight: '600', color: 'var(--text-primary)', margin: 0 }}>{formData.address.city || '—'}</p>
                          </div>
                          <div>
                            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '0 0 4px' }}>STATE</p>
                            <p style={{ fontSize: '15px', fontWeight: '600', color: 'var(--text-primary)', margin: 0 }}>{formData.address.state || '—'}</p>
                          </div>
                          <div>
                            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '0 0 4px' }}>ZIP CODE</p>
                            <p style={{ fontSize: '15px', fontWeight: '600', color: 'var(--text-primary)', margin: 0 }}>{formData.address.zipCode || '—'}</p>
                          </div>
                          <div>
                            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '0 0 4px' }}>COUNTRY</p>
                            <p style={{ fontSize: '15px', fontWeight: '600', color: 'var(--text-primary)', margin: 0 }}>{formData.address.country || '—'}</p>
                          </div>
                        </div>
                      </>
                    )}

                    {(formData.socialLinks?.twitter || formData.socialLinks?.linkedin || formData.socialLinks?.github) && (
                      <>
                        <p style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)', margin: '16px 0 12px', paddingBottom: '8px', borderBottom: '1px solid var(--border-color)' }}>
                          Social Links
                        </p>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '24px', marginBottom: '24px' }}>
                          {formData.socialLinks?.twitter && (
                            <div>
                              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '0 0 4px' }}>TWITTER</p>
                              <p style={{ fontSize: '15px', fontWeight: '600', color: 'var(--text-primary)', margin: 0 }}>𝕏 {formData.socialLinks.twitter}</p>
                            </div>
                          )}
                          {formData.socialLinks?.linkedin && (
                            <div>
                              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '0 0 4px' }}>LINKEDIN</p>
                              <p style={{ fontSize: '15px', fontWeight: '600', color: 'var(--text-primary)', margin: 0 }}>{formData.socialLinks.linkedin}</p>
                            </div>
                          )}
                          {formData.socialLinks?.github && (
                            <div>
                              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '0 0 4px' }}>GITHUB</p>
                              <p style={{ fontSize: '15px', fontWeight: '600', color: 'var(--text-primary)', margin: 0 }}>{formData.socialLinks.github}</p>
                            </div>
                          )}
                        </div>
                      </>
                    )}

                    {user?.role === 'student' && (
                      <>
                        <p style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)', margin: '16px 0 12px', paddingBottom: '8px', borderBottom: '1px solid var(--border-color)' }}>
                          Student Details
                        </p>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                          <div>
                            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '0 0 4px' }}>ENROLLMENT NUMBER</p>
                            <p style={{ fontSize: '15px', fontWeight: '600', color: 'var(--text-primary)', margin: 0 }}>{formData.enrollmentNumber || '—'}</p>
                          </div>
                          <div>
                            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '0 0 4px' }}>CLASS / SECTION</p>
                            <p style={{ fontSize: '15px', fontWeight: '600', color: 'var(--text-primary)', margin: 0 }}>{formData.class || '—'}</p>
                          </div>
                        </div>
                      </>
                    )}

                    {user?.role === 'teacher' && (
                      <>
                        <p style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)', margin: '16px 0 12px', paddingBottom: '8px', borderBottom: '1px solid var(--border-color)' }}>
                          Teacher Details
                        </p>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                          <div>
                            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '0 0 4px' }}>EMPLOYEE ID</p>
                            <p style={{ fontSize: '15px', fontWeight: '600', color: 'var(--text-primary)', margin: 0 }}>{formData.employeeId || '—'}</p>
                          </div>
                          <div>
                            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '0 0 4px' }}>DEPARTMENT</p>
                            <p style={{ fontSize: '15px', fontWeight: '600', color: 'var(--text-primary)', margin: 0 }}>{formData.department || '—'}</p>
                          </div>
                          <div style={{ gridColumn: 'span 2' }}>
                            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '0 0 4px' }}>QUALIFICATIONS</p>
                            <p style={{ fontSize: '15px', fontWeight: '600', color: 'var(--text-primary)', margin: 0 }}>{formData.qualifications || '—'}</p>
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