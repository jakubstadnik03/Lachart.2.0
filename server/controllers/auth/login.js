const User = require('../../models/user');
const jwt = require('jsonwebtoken');

const login = async (req, res) => {
    try {
        const { googleId } = req.body;

        // Najít uživatele podle googleId
        let user = await User.findOne({ googleId });

        if (!user) {
            return res.status(404).json({ error: 'Uživatel nenalezen' });
        }

        // Vytvořit JWT token
        const token = jwt.sign(
            { userId: user._id, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        // Vrátit token a základní info o uživateli
        res.json({
            token,
            user: {
                _id: user._id,
                role: user.role,
                name: user.name,
                surname: user.surname,
                email: user.email
            }
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Chyba při přihlášení' });
    }
};

module.exports = login; 