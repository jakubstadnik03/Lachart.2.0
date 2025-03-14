const UserDao = require("../../dao/userDao");
const bcrypt = require("bcryptjs");

class RegisterAbl {
    constructor() {
        this.userDao = new UserDao();
    }

    async register(req, res) {
        try {
            const { email, password, confirmPassword, name, surname, role } = req.body;
            console.log("Registration attempt for:", email);

            // Validace vstupů
            if (!email || !password || !confirmPassword || !name || !surname) {
                return res.status(400).json({
                    error: "Všechna povinná pole musí být vyplněna"
                });
            }

            if (password !== confirmPassword) {
                return res.status(400).json({
                    error: "Hesla se neshodují"
                });
            }

            // Kontrola, zda uživatel již neexistuje
            const existingUser = await this.userDao.findByEmail(email);
            if (existingUser) {
                return res.status(400).json({
                    error: "Uživatel s tímto emailem již existuje"
                });
            }

            // Hash hesla
            console.log("Original password:", password); // POZOR: Pouze pro debug!
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(password, salt);
            console.log("Generated hash:", hashedPassword);

            // Vytvoření nového uživatele
            const userData = {
                email: email.toLowerCase(),
                password: hashedPassword,
                name,
                surname,
                role: role || 'athlete',
                athletes: role === 'coach' ? [] : undefined
            };

            console.log("Creating new user with hash:", hashedPassword);
            const newUser = await this.userDao.createUser(userData);
            console.log("User created, stored hash:", newUser.password);

            // Zkontrolujeme, že heslo bylo správně uloženo
            const savedUser = await this.userDao.findByEmail(email);
            console.log("Saved user password hash length:", savedUser.password.length);

            res.status(201).json({
                message: "Uživatel úspěšně vytvořen",
                user: {
                    _id: newUser._id,
                    email: newUser.email,
                    name: newUser.name,
                    surname: newUser.surname,
                    role: newUser.role,
                    athletes: newUser.athletes
                }
            });

        } catch (error) {
            console.error("Registration error:", error);
            res.status(500).json({
                error: "Chyba při registraci",
                details: error.message
            });
        }
    }
}

// Exportujeme instanci třídy
module.exports = new RegisterAbl();
