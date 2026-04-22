const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
    console.error('FATAL: JWT_SECRET environment variable is not set. Server will not start without it.');
    process.exit(1);
}

module.exports = { JWT_SECRET };
