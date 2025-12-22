const UserDao = require("../../dao/userDao");
const nodemailer = require("nodemailer");
const bcrypt = require("bcryptjs");
const { JWT_SECRET } = require("../../config/jwt.config");
const jwt = require("jsonwebtoken");
const { generateEmailTemplate, getClientUrl } = require("../../utils/emailTemplate");

class ForgotPasswordAbl {
    constructor() {
        this.userDao = new UserDao();
        // Upravená konfigurace pro Gmail SMTP
        this.transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_APP_PASSWORD
            }
        });

        // Ověření konfigurace při startu
        this.transporter.verify((error, success) => {
            if (error) {
                console.error('SMTP Configuration Error:', error);
            } else {
                console.log('SMTP Server is ready to take messages');
            }
        });
    }

    async forgotPassword(req, res) {
        const { email } = req.body;
        
        try {
            console.log('Processing forgot password for email:', email);
            const user = await this.userDao.findByEmail(email);

            if (!user) {
                return res.status(200).json({
                    message: "Pokud účet existuje, byl odeslán email s instrukcemi pro reset hesla."
                });
            }

            // Vytvoření reset tokenu
            const resetToken = jwt.sign(
                { userId: user._id },
                JWT_SECRET,
                { expiresIn: '1h' }
            );

            // Uložení tokenu do databáze
            const salt = await bcrypt.genSalt(10);
            const resetTokenHash = await bcrypt.hash(resetToken, salt);
            await this.userDao.updateUser(user._id, {
                resetPasswordToken: resetTokenHash,
                resetPasswordExpires: Date.now() + 3600000 // 1 hodina
            });

            // Odeslání emailu
            const clientUrl = getClientUrl();
            const resetUrl = `${clientUrl}/reset-password/${resetToken}`;
            
            const emailContent = `
                <p>We received a request to reset the password for your account.</p>
                <p>To reset your password, please click the button below.</p>
            `;
            
            const mailOptions = {
                from: {
                    name: 'LaChart',
                    address: process.env.EMAIL_USER
                },
                to: user.email,
                subject: 'Reset Your Password - LaChart',
                html: generateEmailTemplate({
                    title: 'Reset Your Password',
                    content: emailContent,
                    buttonText: 'Reset Password',
                    buttonUrl: resetUrl,
                    footerText: 'This link is valid for 1 hour.'
                })
            };

            try {
                await this.transporter.sendMail(mailOptions);
                console.log('Reset password email sent successfully');
                res.status(200).json({
                    message: "Email s instrukcemi pro reset hesla byl odeslán."
                });
            } catch (emailError) {
                console.error('Error sending email:', emailError);
                throw new Error('Failed to send reset email');
            }

        } catch (error) {
            console.error("Forgot password error:", error);
            res.status(500).json({ 
                error: "Chyba při zpracování požadavku na reset hesla",
                details: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }

    async resetPassword(req, res) {
        try {
            const { token, newPassword } = req.body;

            // Ověření tokenu
            const decoded = jwt.verify(token, JWT_SECRET);
            const user = await this.userDao.findById(decoded.userId);

            if (!user || !user.resetPasswordToken || user.resetPasswordExpires < Date.now()) {
                return res.status(400).json({ error: "Neplatný nebo expirovaný token pro reset hesla" });
            }

            // Ověření, že token odpovídá uloženému hashy
            const isValidToken = await bcrypt.compare(token, user.resetPasswordToken);
            if (!isValidToken) {
                return res.status(400).json({ error: "Neplatný token pro reset hesla" });
            }

            // Hash nového hesla
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(newPassword, salt);

            // Aktualizace hesla a vymazání reset tokenu
            await this.userDao.updateUser(user._id, {
                password: hashedPassword,
                resetPasswordToken: null,
                resetPasswordExpires: null
            });

            res.status(200).json({ message: "Heslo bylo úspěšně změněno" });

        } catch (error) {
            console.error("Reset password error:", error);
            res.status(500).json({ error: "Chyba při resetu hesla" });
        }
    }
}

module.exports = new ForgotPasswordAbl(); 