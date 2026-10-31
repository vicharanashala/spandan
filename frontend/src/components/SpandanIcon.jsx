import React from 'react'
import logo from '../assets/spandan-logo.png'

// The Spandan logo (white स्पंदन on the brand navy). Fills its parent tile — callers size and round the
// tile; the image inherits the tile's corner radius. `size` is kept for older callers that pass it.
const SpandanIcon = ({ size, style = {} }) => (
  <img
    src={logo}
    alt="Spandan"
    draggable="false"
    style={{ width: '100%', height: '100%', minWidth: size || undefined, objectFit: 'cover', borderRadius: 'inherit', display: 'block', ...style }}
  />
)

export default SpandanIcon
