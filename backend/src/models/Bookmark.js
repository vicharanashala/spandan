import mongoose from 'mongoose'

const bookmarkSchema = new mongoose.Schema(
    {
        studentId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true
        },

        questionId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Question',
            required: true
        },

        roomId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Room',
            required: true,
            index: true
        },

        note: {
            type: String,
            default: '',
            maxlength: 1000,
            trim: true
        }
    },
    {
        timestamps: true
    }
)

// A student can bookmark a particular question only once.
bookmarkSchema.index(
    { studentId: 1, questionId: 1 },
    { unique: true }
)

// Useful for listing a student's bookmarks newest-first.
bookmarkSchema.index({
    studentId: 1,
    createdAt: -1
})

const Bookmark = mongoose.model('Bookmark', bookmarkSchema)

export default Bookmark