import mongoose from 'mongoose'

const rosterEntrySchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    maxlength: [200, 'Name cannot exceed 200 characters']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email']
  },
  invited: {
    type: Boolean,
    default: false
  }
}, { _id: false })

const roomRosterSchema = new mongoose.Schema({
  roomId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Room',
    required: true,
    unique: true
  },
  entries: {
    type: [rosterEntrySchema],
    default: []
  }
}, {
  timestamps: true
})

const RoomRoster = mongoose.model('RoomRoster', roomRosterSchema)

export default RoomRoster
