import React from 'react'
import useAuthStore from '../stores/authStore'
import SpandanIcon from '../components/SpandanIcon'
import useSocketStore from '../stores/socketStore'
import { useNavigate } from 'react-router-dom'

export function Header({ title, subtitle }) {
  const { user, logout } = useAuthStore()
  const { isConnected } = useSocketStore()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/')
  }

  return (
    <header style={{
      background: 'linear-gradient(to right, #1e40af, #1e3a8a)',
      color: 'white',
      padding: '16px 32px',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      boxShadow: '0 4px 20px rgba(0,0,0,0.15)'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{
          width: '48px',
          height: '48px',
          background: 'rgba(255,255,255,0.2)',
          borderRadius: '12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '24px'
        }}>
          <SpandanIcon />
        </div>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '700', margin: 0 }}>{title}</h1>
          {subtitle && <p style={{ fontSize: '12px', opacity: 0.8, margin: 0 }}>{subtitle}</p>}
        </div>
      </div>
      <div style={{ display: 'flex', gap: '24px', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: isConnected ? '#10b981' : '#ef4444'
          }}></div>
          <span style={{ fontSize: '14px' }}>{isConnected ? 'Connected' : 'Disconnected'}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '14px' }}>{user?.name}</span>
          <button
            onClick={handleLogout}
            style={{
              padding: '8px 16px',
              background: 'rgba(255,255,255,0.1)',
              border: '1px solid rgba(255,255,255,0.3)',
              borderRadius: '8px',
              color: 'white',
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            Logout
          </button>
        </div>
      </div>
    </header>
  )
}

export function StatCard({ icon, label, value, color }) {
  return (
    <div style={{
      background: 'white',
      borderRadius: '16px',
      padding: '24px',
      boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
      border: '1px solid #e5e7eb'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
        <span style={{ fontSize: '24px' }}>{icon}</span>
        <span style={{ fontSize: '14px', color: '#6b7280', fontWeight: '500' }}>{label}</span>
      </div>
      <div style={{ fontSize: '28px', fontWeight: '700', color }}>
        {value}
      </div>
    </div>
  )
}

export function FeatureCard({ icon, title, description }) {
  return (
    <div style={{
      background: 'white',
      borderRadius: '16px',
      padding: '24px',
      boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
      border: '1px solid #e5e7eb',
      textAlign: 'center'
    }}>
      <div style={{
        width: '64px',
        height: '64px',
        background: 'linear-gradient(135deg, #1e40af, #3b82f6)',
        borderRadius: '16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        margin: '0 auto 16px',
        fontSize: '32px'
      }}>
        {icon}
      </div>
      <h4 style={{ fontSize: '16px', fontWeight: '600', color: '#1f2937', marginBottom: '8px' }}>
        {title}
      </h4>
      <p style={{ fontSize: '14px', color: '#6b7280', margin: 0 }}>
        {description}
      </p>
    </div>
  )
}

export function RoomCard({ room, onOpen, onDelete, onToggle }) {
  return (
    <div
      style={{
        padding: '20px',
        border: '1px solid #e5e7eb',
        borderRadius: '12px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        transition: 'all 0.2s',
        background: 'white'
      }}
      onMouseOver={(e) => {
        e.currentTarget.style.borderColor = '#3b82f6'
        e.currentTarget.style.boxShadow = '0 4px 12px rgba(59, 130, 246, 0.15)'
      }}
      onMouseOut={(e) => {
        e.currentTarget.style.borderColor = '#e5e7eb'
        e.currentTarget.style.boxShadow = 'none'
      }}
    >
      <div>
        <h4 style={{ fontSize: '16px', fontWeight: '600', color: '#1f2937', marginBottom: '4px' }}>
          {room.name}
        </h4>
        <p style={{ fontSize: '14px', color: '#6b7280' }}>
          Code: <strong style={{ color: '#1e40af' }}>{room.code}</strong> • 
          <span style={{ color: room.isActive ? '#10b981' : '#6b7280' }}>
            {room.isActive ? ' Active' : ' Inactive'}
          </span>
        </p>
      </div>
      <div style={{ display: 'flex', gap: '8px' }}>
        <button
          onClick={() => onToggle && onToggle(room)}
          style={{
            padding: '8px 16px',
            background: room.isActive ? '#fef3c7' : '#d1fae5',
            color: room.isActive ? '#d97706' : '#059669',
            border: `1px solid ${room.isActive ? '#fcd34d' : '#6ee7b7'}`,
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '14px'
          }}
        >
          {room.isActive ? 'Deactivate' : 'Activate'}
        </button>
        <button
          onClick={() => onOpen && onOpen(room)}
          style={{
            padding: '8px 16px',
            background: '#eff6ff',
            color: '#1e40af',
            border: '1px solid #bfdbfe',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '14px'
          }}
        >
          Open
        </button>
        <button
          onClick={() => onDelete && onDelete(room._id)}
          style={{
            padding: '8px 16px',
            background: '#fef2f2',
            color: '#dc2626',
            border: '1px solid #fecaca',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '14px'
          }}
        >
          Delete
        </button>
      </div>
    </div>
  )
}

export function Button({ children, variant = 'primary', size = 'md', disabled, onClick, style = {} }) {
  const variants = {
    primary: {
      background: disabled ? '#9ca3af' : 'linear-gradient(135deg, #1e40af, #3b82f6)',
      color: 'white',
      border: 'none',
      boxShadow: '0 4px 15px rgba(30, 64, 175, 0.3)'
    },
    secondary: {
      background: '#f3f4f6',
      color: '#374151',
      border: '1px solid #e5e7eb',
      boxShadow: 'none'
    },
    danger: {
      background: '#fef2f2',
      color: '#dc2626',
      border: '1px solid #fecaca',
      boxShadow: 'none'
    },
    success: {
      background: disabled ? '#9ca3af' : 'linear-gradient(135deg, #059669, #10b981)',
      color: 'white',
      border: 'none',
      boxShadow: '0 4px 15px rgba(16, 185, 129, 0.4)'
    }
  }

  const sizes = {
    sm: { padding: '8px 16px', fontSize: '14px' },
    md: { padding: '12px 24px', fontSize: '16px' },
    lg: { padding: '16px 32px', fontSize: '18px' }
  }

  return (
    <button
      disabled={disabled}
      onClick={onClick}
      style={{
        ...variants[variant],
        ...sizes[size],
        borderRadius: '12px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontWeight: '600',
        transition: 'all 0.3s',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '8px',
        ...style
      }}
      onMouseOver={(e) => {
        if (!disabled) {
          e.target.style.transform = 'translateY(-2px)'
        }
      }}
      onMouseOut={(e) => {
        e.target.style.transform = 'translateY(0)'
      }}
    >
      {children}
    </button>
  )
}

export function Input({ label, placeholder, value, onChange, type = 'text', error, style = {} }) {
  return (
    <div style={{ ...style }}>
      {label && (
        <label style={{
          display: 'block',
          fontSize: '14px',
          fontWeight: '500',
          color: '#374151',
          marginBottom: '8px'
        }}>
          {label}
        </label>
      )}
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        style={{
          width: '100%',
          padding: '14px 16px',
          fontSize: '16px',
          border: `2px solid ${error ? '#fecaca' : '#e5e7eb'}`,
          borderRadius: '12px',
          outline: 'none',
          transition: 'border-color 0.3s',
          background: 'white',
          ...style
        }}
        onFocus={(e) => e.target.style.borderColor = '#3b82f6'}
        onBlur={(e) => e.target.style.borderColor = error ? '#fecaca' : '#e5e7eb'}
      />
      {error && (
        <p style={{ color: '#dc2626', fontSize: '12px', marginTop: '4px' }}>{error}</p>
      )}
    </div>
  )
}

export function Modal({ isOpen, onClose, title, children }) {
  if (!isOpen) return null

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      backdropFilter: 'blur(4px)'
    }}>
      <div style={{
        background: 'white',
        borderRadius: '24px',
        padding: '32px',
        maxWidth: '500px',
        width: '90%',
        boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
        animation: 'fadeInUp 0.3s ease-out'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <h3 style={{ fontSize: '20px', fontWeight: '600', color: '#1f2937', margin: 0 }}>
            {title}
          </h3>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '24px',
              color: '#9ca3af',
              cursor: 'pointer'
            }}
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function EmptyState({ icon, title, description }) {
  return (
    <div style={{ textAlign: 'center', padding: '40px', color: '#6b7280' }}>
      <span style={{ fontSize: '48px', display: 'block', marginBottom: '16px' }}>{icon}</span>
      <h4 style={{ fontSize: '18px', fontWeight: '600', color: '#374151', marginBottom: '8px' }}>{title}</h4>
      <p style={{ fontSize: '14px' }}>{description}</p>
    </div>
  )
}

export function LoadingSpinner({ message = 'Loading...' }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '40px'
    }}>
      <div style={{
        width: '48px',
        height: '48px',
        border: '4px solid #e5e7eb',
        borderTopColor: '#3b82f6',
        borderRadius: '50%',
        animation: 'spin 1s linear infinite'
      }}></div>
      <p style={{ marginTop: '16px', color: '#6b7280', fontSize: '14px' }}>{message}</p>
    </div>
  )
}

export function Alert({ type = 'info', message }) {
  const styles = {
    info: { background: '#eff6ff', border: '#bfdbfe', color: '#1e40af' },
    success: { background: '#ecfdf5', border: '#6ee7b7', color: '#059669' },
    error: { background: '#fef2f2', border: '#fecaca', color: '#dc2626' },
    warning: { background: '#fffbeb', border: '#fcd34d', color: '#d97706' }
  }

  return (
    <div style={{
      ...styles[type],
      border: '1px solid',
      borderRadius: '12px',
      padding: '16px',
      marginBottom: '20px',
      fontSize: '14px'
    }}>
      {message}
    </div>
  )
}

export default {
  Header,
  StatCard,
  FeatureCard,
  RoomCard,
  Button,
  Input,
  Modal,
  EmptyState,
  LoadingSpinner,
  Alert
}