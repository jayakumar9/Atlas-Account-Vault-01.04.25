const jwt = require('jsonwebtoken');
const User = require('../models/User');

exports.protect = async (req, res, next) => {
    try {
        let token;
        
        // Check for token in different places
        if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
            token = req.headers.authorization.split(' ')[1];
        } else if (req.cookies && req.cookies.token) {
            token = req.cookies.token;
        } else if (req.query && req.query.token) {
            token = req.query.token;
        }

        if (!token) {
            return res.status(401).json({ 
                success: false,
                message: 'Authentication required. Please provide a valid token.',
                details: 'No token provided'
            });
        }

        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            
            // Check token expiration
            if (decoded.exp && Date.now() >= decoded.exp * 1000) {
                return res.status(401).json({
                    success: false,
                    message: 'Token has expired',
                    details: 'Please log in again'
                });
            }

            // Get user and check if still exists
            const user = await User.findById(decoded.id);
            if (!user) {
                return res.status(401).json({
                    success: false,
                    message: 'User no longer exists',
                    details: 'The user associated with this token was not found'
                });
            }

            req.user = user;
            next();
        } catch (err) {
            console.error('Token verification error:', err);
            return res.status(401).json({
                success: false,
                message: 'Invalid token',
                details: err.message
            });
        }
    } catch (err) {
        console.error('Auth middleware error:', err);
        res.status(500).json({
            success: false,
            message: 'Server error during authentication',
            details: err.message
        });
    }
};

exports.admin = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({
            success: false,
            message: 'Authentication required',
            details: 'No user found in request'
        });
    }
    
    if (!req.user.isAdmin) {
        return res.status(403).json({
            success: false,
            message: 'Access denied',
            details: 'Admin privileges required'
        });
    }
    
    next();
}; 