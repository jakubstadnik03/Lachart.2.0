const UserDao = require("../../dao/userDao");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { JWT_SECRET } = require("../../config/jwt.config");
const { sendEmailVerificationEmail } = require("../../services/emailVerificationService");
const { saveRegistrationLocation } = require("../../utils/geoip");
const { notifyAdminNewUserRegistered } = require("../../utils/expoPushNotifications");

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
                    error: "Please fill in all required fields."
                });
            }

            if (password !== confirmPassword) {
                return res.status(400).json({
                    error: "Passwords don't match."
                });
            }

            // M9 — enforce minimum password length
            if (password.length < 8) {
                return res.status(400).json({
                    error: "Password must be at least 8 characters long."
                });
            }

            // Kontrola, zda uživatel již neexistuje
            const existingUser = await this.userDao.findByEmail(email);
            if (existingUser) {
                return res.status(400).json({
                    error: "An account with this email already exists.",
                    code: "EMAIL_EXISTS"
                });
            }

            // Hash hesla
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(password, salt);

            // Generate email verification token
            const emailVerificationToken = crypto.randomBytes(32).toString('hex');
            const emailVerificationTokenExpires = new Date();
            emailVerificationTokenExpires.setHours(emailVerificationTokenExpires.getHours() + 24); // 24 hours

            // Vytvoření nového uživatele
            const userData = {
                email: email.toLowerCase(),
                password: hashedPassword,
                signupMethod: 'email',
                name,
                surname,
                role: ['athlete', 'coach', 'tester', 'testing'].includes(role) ? role : 'athlete',
                athletes: (role === 'coach' || role === 'tester' || role === 'testing') ? [] : undefined,
                emailVerified: false,
                emailVerificationToken: emailVerificationToken,
                emailVerificationTokenExpires: emailVerificationTokenExpires,
                onboarding: {
                    basicProfileDone: false,
                    unitsDone: false,
                    trainingZonesDone: false,
                    walkthroughDone: false
                }
            };

            const newUser = await this.userDao.createUser(userData);

            // Zkontrolujeme, že heslo bylo správně uloženo
            const savedUser = await this.userDao.findByEmail(email);

            // Save registration location (fire-and-forget)
            saveRegistrationLocation(this.userDao, newUser._id, req);

            // Notify admins about new registration (fire-and-forget)
            notifyAdminNewUserRegistered(newUser).catch(() => {});

            // Po úspěšné registraci pošleme verifikační e‑mail (best effort, neblokuje registraci)
            try {
                if (savedUser?.email) {
                    const emailResult = await sendEmailVerificationEmail(savedUser, emailVerificationToken);
                    if (!emailResult.sent) {
                        console.warn("Email verification email not sent:", emailResult.reason);
                    }
                }
            } catch (emailError) {
                console.error("Email verification email error:", emailError);
                // Nevracíme chybu uživateli – registrace proběhla, jen se nepovedlo odeslat e‑mail
            }

            // Generate JWT so the client can immediately use the new account
            // (e.g. save a test created before registration)
            const token = jwt.sign(
                { userId: newUser._id, email: newUser.email, role: newUser.role },
                JWT_SECRET,
                { expiresIn: "24h" }
            );

            res.status(201).json({
                message: "Account created successfully",
                token,
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
                error: "Something went wrong during registration. Please try again.",
                details: error.message
            });
        }
    }
}

// Exportujeme instanci třídy
module.exports = new RegisterAbl();
