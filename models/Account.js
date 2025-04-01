const mongoose = require('mongoose');
const moment = require('moment-timezone');

const accountSchema = new mongoose.Schema({
    serialNumber: {
        type: Number,
        unique: true
    },
    website: {
        type: String,
        required: true
    },
    name: {
        type: String,
        required: true
    },
    username: {
        type: String,
        required: true,
        unique: true
    },
    email: {
        type: String,
        required: true,
        unique: true
    },
    password: {
        type: String,
        required: true
    },
    weblogo: {
        type: String
    },
    attachedFile: {
        filename: String,
        fileId: mongoose.Schema.Types.ObjectId,
        contentType: String
    },
    note: {
        type: String
    },
    createdAt: {
        type: Date,
        default: () => moment().tz('Asia/Kolkata').toDate()
    },
    updatedAt: {
        type: Date,
        default: () => moment().tz('Asia/Kolkata').toDate()
    },
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    }
});

// Pre-save middleware to update timestamps
accountSchema.pre('save', function(next) {
    this.updatedAt = moment().tz('Asia/Kolkata').toDate();
    next();
});

// Pre-save middleware to handle auto-increment serialNumber
accountSchema.pre('save', async function(next) {
    if (this.isNew) {
        try {
            const lastAccount = await this.constructor.findOne({}, {}, { sort: { 'serialNumber': -1 } });
            this.serialNumber = lastAccount ? lastAccount.serialNumber + 1 : 1;
        } catch (error) {
            return next(error);
        }
    }
    next();
});

// Update the weblogo based on website URL
accountSchema.pre('save', async function(next) {
    if (this.isModified('website')) {
        try {
            // Clean up the URL to get the domain
            let url = this.website;
            if (!url.startsWith('http://') && !url.startsWith('https://')) {
                url = 'https://' + url;
            }
            const domain = new URL(url).hostname;
            // Try DuckDuckGo's favicon service first as it's more reliable
            this.weblogo = `https://icons.duckduckgo.com/ip3/${domain}.ico`;
            // Fallback to Google's favicon service is handled in frontend
        } catch (error) {
            // Don't log error for empty website URLs
            if (this.website) {
                console.warn('Error setting weblogo:', error);
            }
            this.weblogo = null; // Let frontend handle the default logo
        }
    }
    next();
});

module.exports = mongoose.model('Account', accountSchema); 