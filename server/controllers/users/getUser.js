const User = require('../../models/user');

const getUser = async (req, res) => {
    try {
        // req.user je nastaven v middleware z JWT tokenu
        const user = await User.findById(req.user.userId);

        if (!user) {
            return res.status(404).json({ error: 'Uživatel nenalezen' });
        }

        // Vrátit uživatele bez citlivých údajů
        const userData = {
            _id: user._id,
            googleId: user.googleId,
            role: user.role,
            name: user.name,
            surname: user.surname,
            dateOfBirth: user.dateOfBirth,
            address: user.address,
            email: user.email,
            phone: user.phone,
            height: user.height,
            weight: user.weight,
            sport: user.sport,
            specialization: user.specialization,
            bio: user.bio,
            coachId: user.coachId
        };

        res.json(userData);

    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({ error: 'Chyba při získávání uživatele' });
    }
};

module.exports = getUser; 