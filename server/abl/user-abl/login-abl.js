const UserDao = require("../../dao/userDao");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { JWT_SECRET } = require("../../config/jwt.config");

class LoginAbl {
    constructor() {
        this.userDao = new UserDao();
    }
    async login(req, res) {
        const { email, password } = req.body;
        console.log("Login attempt for:", email);

        try {
            if (!email || !password) {
                return res.status(400).json({
                    error: "Email a heslo jsou povinné"
                });
            }

            const user = await this.userDao.findByEmail(email);
            console.log("Found user:", user ? "yes" : "no");

            if (!user) {
                console.log("User not found");
                return res.status(401).json({ error: "Neplatné přihlašovací údaje" });
            }

            console.log("Login attempt with password:", password); // POZOR: Pouze pro debug!
            console.log("Stored hash in DB:", user.password);
            
            const isValidPassword = await bcrypt.compare(password, user.password);
            console.log("Password comparison result:", isValidPassword);

            if (!isValidPassword) {
                console.log("Invalid password");
                return res.status(401).json({ error: "Neplatné přihlašovací údaje" });
            }

            const token = jwt.sign(
                {
                    userId: user._id,
                    email: user.email,
                    role: user.role
                },
                JWT_SECRET,
                { expiresIn: "24h" }
            );

            console.log("Token generated successfully");

            // Update lastLogin timestamp + increment loginCount
            await this.userDao.update(user._id, { 
                $set: { lastLogin: new Date() },
                $inc: { loginCount: 1 }
            });

            res.status(200).json({
                token,
                user: {
                    _id: user._id,
                    email: user.email,
                    name: user.name,
                    surname: user.surname,
                    role: user.role,
                    admin: user.admin,
                    athletes: user.athletes || []
                }
            });

        } catch (error) {
            console.error("Login error:", error);
            res.status(500).json({ error: "Chyba při přihlášení" });
        }
    }
}

module.exports = new LoginAbl();
