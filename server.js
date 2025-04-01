const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const rateLimit = require('express-rate-limit');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const dotenv = require('dotenv');

dotenv.config();

const app = express();

// Enable CORS for all routes with credentials
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    res.header('Access-Control-Allow-Credentials', 'true');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

// Basic middleware with increased limits
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // limit each IP to 100 requests per windowMs
});
app.use('/api/', limiter);

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Global error handler:', err);
    if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
        return res.status(400).json({ message: 'Invalid JSON' });
    }
    if (err.type === 'entity.too.large') {
        return res.status(413).json({ message: 'Request entity too large' });
    }
    res.status(500).json({ message: 'Internal server error', error: err.message });
});

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 10000, // Increased timeout
    socketTimeoutMS: 45000,
}).then(() => {
    console.log('Connected to MongoDB Atlas');
    console.log('Database Name:', mongoose.connection.name);
    console.log('Host:', mongoose.connection.host);
}).catch(err => {
    console.error('MongoDB connection error. Please check your connection string and network.');
    console.error('Error details:', err.message);
    if (err.name === 'MongoServerSelectionError') {
        console.error('Could not connect to any MongoDB server.');
        console.error('Please check if:');
        console.error('1. Your MongoDB Atlas cluster is running');
        console.error('2. Your IP address is whitelisted in MongoDB Atlas');
        console.error('3. Your credentials are correct');
    }
});

// Session configuration
app.use(session({
    secret: process.env.JWT_SECRET || 'your-secret-key',
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
        mongoUrl: process.env.MONGODB_URI,
        collectionName: 'sessions',
        ttl: 24 * 60 * 60
    }),
    cookie: {
        maxAge: 1000 * 60 * 60 * 24 // 24 hours
    }
}));

// API Routes - Define API routes before static files
app.use('/api', (req, res, next) => {
    res.setHeader('Content-Type', 'application/json');
    next();
});

// Database status endpoint
app.get('/api/status', (req, res) => {
    try {
        const status = {
            isConnected: mongoose.connection.readyState === 1,
            state: ['disconnected', 'connected', 'connecting', 'disconnecting'][mongoose.connection.readyState],
            gridFS: mongoose.connection.readyState === 1,
            lastError: mongoose.connection.lastError || null
        };
        res.json(status);
    } catch (error) {
        console.error('Error checking database status:', error);
        res.status(500).json({
            isConnected: false,
            state: 'error',
            gridFS: false,
            lastError: error.message
        });
    }
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api/accounts', require('./routes/accounts'));

// Static files - after API routes
app.use(express.static(path.join(__dirname, 'public')));

// Catch-all route for SPA - must be last
app.get('*', (req, res) => {
    if (req.xhr || req.headers.accept.indexOf('json') > -1) {
        res.status(404).json({ error: 'Not Found' });
    } else {
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
    }
});

// Monitor database connection
mongoose.connection.on('error', (err) => {
    console.error('MongoDB connection error:', err);
});

mongoose.connection.on('disconnected', () => {
    console.log('MongoDB connection disconnected');
    // Attempt to reconnect
    setTimeout(() => {
        mongoose.connect(process.env.MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
        }).catch(err => console.error('Reconnection failed:', err));
    }, 5000);
});

process.on('SIGINT', async () => {
    await mongoose.connection.close();
    process.exit(0);
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log('=================================');
    console.log(`Server is running on port ${PORT}`);
    console.log(`MongoDB Status: ${mongoose.connection.readyState}`);
    console.log(`MongoDB Connection State: ${['disconnected', 'connected', 'connecting', 'disconnecting'][mongoose.connection.readyState]}`);
    console.log('=================================');
});

// Add error handler for uncaught exceptions
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
    console.error('Stack:', err.stack);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise);
    console.error('Reason:', reason);
}); 