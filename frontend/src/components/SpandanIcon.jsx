import React from 'react'

const SpandanIcon = ({ size = 24, style = {} }) => (
  <span 
    style={{ 
      fontSize: size * 0.65, 
      fontWeight: '700',
      fontFamily: '"Segoe UI", "Noto Sans", sans-serif',
      color: 'white',
      lineHeight: 1,
      display: 'inline-block',
      textAlign: 'center',
      whiteSpace: 'nowrap',
      letterSpacing: '-0.02em',
      ...style 
    }}
  >
    स्पंदन
  </span>
)

export default SpandanIcon