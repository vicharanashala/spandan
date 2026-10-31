import React from 'react'
import iconUrl from '../assets/confused-icon.png'

/**
 * ConfusedIcon renders the user's custom 'scratching head with question mark' icon.
 * It uses CSS mask with backgroundColor: currentColor so the icon effortlessly
 * inherits the text color (amber when active, silver/white in dark mode, brown in alerts).
 */
export default function ConfusedIcon({ size = 20, style = {}, className = '' }) {
  return (
    <span
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: `${size}px`,
        height: `${size}px`,
        backgroundColor: 'currentColor',
        maskImage: `url(${iconUrl})`,
        WebkitMaskImage: `url(${iconUrl})`,
        maskSize: 'contain',
        WebkitMaskSize: 'contain',
        maskRepeat: 'no-repeat',
        WebkitMaskRepeat: 'no-repeat',
        maskPosition: 'center',
        WebkitMaskPosition: 'center',
        flexShrink: 0,
        verticalAlign: 'middle',
        lineHeight: 1,
        ...style
      }}
      aria-hidden="true"
    />
  )
}
