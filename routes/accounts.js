const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const multer = require('multer');
const Account = require('../models/Account');
const { protect, admin } = require('../middleware/auth');
const path = require('path');
const stream = require('stream');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

let gfs;

// Initialize GridFS bucket
mongoose.connection.once('open', () => {
    gfs = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
        bucketName: 'uploads'
    });
    console.log('GridFS bucket initialized successfully');
});

// Configure multer memory storage
const storage = multer.memoryStorage();

// Initialize multer with memory storage
const upload = multer({
    storage: storage,
    limits: {
        fileSize: 50 * 1024 * 1024, // 50MB limit
        files: 1
    },
    fileFilter: (req, file, cb) => {
        const allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'application/pdf', 'text/plain'];
        if (allowedMimes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Only images, PDFs, and text files are allowed.'), false);
        }
    }
}).single('attachedFile');

// Helper function to store file in GridFS
async function storeInGridFS(fileBuffer, filename, mimetype, metadata = {}) {
    return new Promise((resolve, reject) => {
        const bufferStream = new stream.PassThrough();
        const writeStream = gfs.openUploadStream(filename, {
            contentType: mimetype,
            metadata: {
                ...metadata,
                originalname: filename,
                uploadedAt: new Date()
            }
        });

        bufferStream.end(fileBuffer);
        bufferStream
            .pipe(writeStream)
            .on('error', (error) => {
                reject(error);
            })
            .on('finish', () => {
                resolve(writeStream.id);
            });
    });
}

// Helper function to delete GridFS file
async function deleteGridFSFile(fileId) {
    if (!fileId || !gfs) return;
    try {
        await gfs.delete(new mongoose.Types.ObjectId(fileId));
        console.log('Deleted GridFS file:', fileId);
    } catch (error) {
        console.error('Error deleting GridFS file:', error);
    }
}

// Store temporary access tokens with expiration
const temporaryAccessTokens = new Map();

// Generate temporary access URL for file
router.post('/file/:accountId/generate-access', protect, async (req, res) => {
    try {
        const account = await Account.findById(req.params.accountId);
        
        if (!account || !account.attachedFile) {
            return res.status(404).json({ message: 'File not found' });
        }

        if (!req.user.isAdmin && account.user.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: 'Not authorized to access this file' });
        }

        // Generate temporary token
        const tempToken = crypto.randomBytes(32).toString('hex');
        
        // Store token with expiration (30 minutes)
        temporaryAccessTokens.set(tempToken, {
            accountId: req.params.accountId,
            expires: Date.now() + (30 * 60 * 1000) // 30 minutes
        });

        // Return temporary URL
        res.json({
            success: true,
            url: `/api/accounts/file/${req.params.accountId}?temp=${tempToken}`
        });
    } catch (err) {
        console.error('Error generating temporary access:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

// Clean up expired tokens periodically
setInterval(() => {
    for (const [token, data] of temporaryAccessTokens.entries()) {
        if (data.expires < Date.now()) {
            temporaryAccessTokens.delete(token);
        }
    }
}, 5 * 60 * 1000); // Clean every 5 minutes

// Upload file for an account
router.post('/upload/:accountId', protect, async (req, res) => {
    if (!gfs) {
        return res.status(503).json({
            success: false,
            message: 'Upload service not available',
            details: 'GridFS not initialized'
        });
    }

    try {
        // Handle the upload using multer
        await new Promise((resolve, reject) => {
            upload(req, res, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'No file uploaded'
            });
        }

        // Find the account
        const account = await Account.findById(req.params.accountId);
        if (!account) {
            return res.status(404).json({
                success: false,
                message: 'Account not found'
            });
        }

        // Check authorization
        if (!req.user.isAdmin && account.user.toString() !== req.user._id.toString()) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized'
            });
        }

        // Delete old file if exists
        if (account.attachedFile?.fileId) {
            await deleteGridFSFile(account.attachedFile.fileId);
        }

        // Store file in GridFS with original filename
        const fileId = await storeInGridFS(
            req.file.buffer,
            req.file.originalname,
            req.file.mimetype,
            {
                accountId: account._id,
                uploadedBy: req.user._id
            }
        );

        // Update account with new file information
        account.attachedFile = {
            filename: req.file.originalname,
            fileId: fileId.toString(),
            contentType: req.file.mimetype,
            size: req.file.size,
            uploadedAt: new Date()
        };

        await account.save();

        res.json({
            success: true,
            message: 'File uploaded successfully',
            file: {
                filename: req.file.originalname,
                id: fileId.toString(),
                contentType: req.file.mimetype,
                size: req.file.size,
                uploadedAt: account.attachedFile.uploadedAt
            }
        });
    } catch (error) {
        console.error('Error in file upload:', error);

        if (error instanceof multer.MulterError) {
            return res.status(400).json({
                success: false,
                message: 'File upload error',
                details: error.message
            });
        }

        res.status(500).json({
            success: false,
            message: 'Server error during file upload',
            details: error.message
        });
    }
});

// Create account
router.post('/', protect, async (req, res) => {
    try {
        const accountData = {
            ...req.body,
            user: req.user._id
        };

        const account = new Account(accountData);
        await account.save();

        res.status(201).json(account);
    } catch (err) {
        console.error('Error creating account:', err);
        res.status(500).json({ message: 'Server error', error: err.message });
    }
});

// Get all accounts (admin sees all, users see only their own)
router.get('/', protect, async (req, res) => {
    try {
        const query = req.user.isAdmin ? {} : { user: req.user._id };
        const accounts = await Account.find(query).sort({ serialNumber: 1 });
        res.json(accounts);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Get single account
router.get('/:id', protect, async (req, res) => {
    try {
        const account = await Account.findById(req.params.id);
        
        if (!account) {
            return res.status(404).json({ message: 'Account not found' });
        }

        if (!req.user.isAdmin && account.user.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: 'Not authorized to access this account' });
        }

        res.json(account);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Update account
router.put('/:id', protect, async (req, res) => {
    try {
        let account = await Account.findById(req.params.id);
        
        if (!account) {
            return res.status(404).json({ message: 'Account not found' });
        }

        if (!req.user.isAdmin && account.user.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: 'Not authorized to update this account' });
        }

        // Keep existing values that shouldn't be updated
        const updateData = {
            ...req.body,
            user: account.user, // Preserve the original user
            serialNumber: account.serialNumber, // Preserve the serial number
            attachedFile: account.attachedFile // Preserve file attachment info
        };

        account = await Account.findByIdAndUpdate(
            req.params.id,
            updateData,
            { new: true, runValidators: true }
        );

        if (!account) {
            return res.status(404).json({ message: 'Account not found after update' });
        }

        res.json(account);
    } catch (err) {
        console.error('Error updating account:', err);
        res.status(500).json({ 
            message: 'Server error', 
            error: err.message 
        });
    }
});

// Delete account
router.delete('/:id', protect, async (req, res) => {
    try {
        const account = await Account.findById(req.params.id);
        
        if (!account) {
            return res.status(404).json({ message: 'Account not found' });
        }

        if (!req.user.isAdmin && account.user.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: 'Not authorized to delete this account' });
        }

        // Delete attached file from GridFS if exists
        if (account.attachedFile && account.attachedFile.fileId) {
            try {
                await deleteGridFSFile(account.attachedFile.fileId);
            } catch (error) {
                console.error('Error deleting file:', error);
            }
        }

        await account.deleteOne();
        res.json({ message: 'Account removed' });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Update the file route to handle both authenticated and temporary access
router.get('/file/:accountId', async (req, res) => {
    try {
        let isAuthorized = false;
        const tempToken = req.query.temp;
        const urlToken = req.query.token;

        console.log('Accessing file with:', {
            tempToken: tempToken ? 'present' : 'not present',
            urlToken: urlToken ? 'present' : 'not present',
            authHeader: req.headers.authorization ? 'present' : 'not present'
        });

        if (tempToken) {
            // Check temporary access token
            const tokenData = temporaryAccessTokens.get(tempToken);
            if (tokenData && tokenData.accountId === req.params.accountId && tokenData.expires > Date.now()) {
                isAuthorized = true;
                console.log('Authorized via temporary token');
            } else {
                console.log('Temporary token validation failed:', {
                    hasTokenData: !!tokenData,
                    matchesAccountId: tokenData ? tokenData.accountId === req.params.accountId : false,
                    isExpired: tokenData ? tokenData.expires < Date.now() : true
                });
            }
        }

        // If not authorized by temp token, check JWT from URL or header
        if (!isAuthorized && (urlToken || req.headers.authorization)) {
            try {
                const token = urlToken || req.headers.authorization?.split(' ')[1];
                if (token) {
                    const decoded = jwt.verify(token, process.env.JWT_SECRET);
                    req.user = decoded;
                    
                    const account = await Account.findById(req.params.accountId);
                    if (account && (req.user.isAdmin || account.user.toString() === req.user._id.toString())) {
                        isAuthorized = true;
                        console.log('Authorized via JWT');
                    } else {
                        console.log('JWT authorization failed:', {
                            accountFound: !!account,
                            isAdmin: req.user.isAdmin,
                            userMatch: account ? account.user.toString() === req.user._id.toString() : false
                        });
                    }
                }
            } catch (error) {
                console.error('Token verification failed:', {
                    error: error.message,
                    token: token ? token.substring(0, 10) + '...' : 'no token'
                });
            }
        }

        if (!isAuthorized) {
            console.log('Authorization failed for file access');
            return res.status(401).json({
                success: false,
                message: 'Authentication required. Please provide a valid token.',
                details: 'Invalid or expired access token'
            });
        }

        const account = await Account.findById(req.params.accountId);
        if (!account || !account.attachedFile) {
            return res.status(404).json({ message: 'File not found' });
        }

        const file = await mongoose.connection.db
            .collection('uploads.files')
            .findOne({ _id: new mongoose.Types.ObjectId(account.attachedFile.fileId) });

        if (!file) {
            return res.status(404).json({ message: 'File not found in storage' });
        }

        // Set content type and cache control headers
        res.set('Content-Type', file.contentType);
        res.set('Cache-Control', 'private, max-age=3600'); // 1 hour cache for better performance

        // Set disposition based on query parameter
        const disposition = req.query.download === 'true' ? 'attachment' : 'inline';
        res.set('Content-Disposition', `${disposition}; filename="${account.attachedFile.filename}"`);

        const downloadStream = gfs.openDownloadStream(new mongoose.Types.ObjectId(account.attachedFile.fileId));
        downloadStream.pipe(res);
    } catch (err) {
        console.error('Error accessing file:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router; 