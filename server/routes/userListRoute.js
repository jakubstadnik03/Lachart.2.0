const express = require("express");
const router = express.Router();
const registerAbl = require("../abl/user-abl/register-abl");
const loginAbl = require("../abl/user-abl/login-abl");
const verifyToken = require("../middleware/verifyToken");
const UserDao = require("../dao/userDao");
const TrainingDao = require("../dao/trainingDao");
const forgotPasswordAbl = require("../abl/user-abl/forgot-password-abl");
const bcrypt = require("bcrypt");
const nodemailer = require("nodemailer");
const crypto = require("crypto");

const userDao = new UserDao();
const trainingDao = new TrainingDao();

// Register endpoint
router.post("/register", async (req, res) => {
    try {
        await registerAbl.register(req, res);
    } catch (error) {
        console.error("Registration route error:", error);
        res.status(500).json({ error: "Chyba při registraci" });
    }
});

// Login endpoint
router.post("/login", async (req, res) => {
    try {
        console.log("Login request received:", req.body);
        await loginAbl.login(req, res);
    } catch (error) {
        console.error("Login route error:", error);
        res.status(500).json({ error: "Chyba při přihlášení" });
    }
});

// Get coach's athletes
router.get("/coach/athletes", verifyToken, async (req, res) => {
    try {
        const coach = await userDao.findById(req.user.userId);
        
        if (!coach || coach.role !== 'coach') {
            return res.status(403).json({ error: "Přístup povolen pouze pro trenéry" });
        }

        const athletes = await userDao.findAthletesByCoachId(req.user.userId);
        res.status(200).json(athletes);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Add athlete to coach
router.post("/coach/add-athlete", verifyToken, async (req, res) => {
    try {
        console.log("Received add-athlete request:", req.body);
        const { 
            name, 
            surname, 
            email, 
            dateOfBirth, 
            address, 
            phone, 
            height, 
            weight, 
            sport, 
            specialization 
        } = req.body;
        
        // Validace povinných polí
        if (!email || !name || !surname) {
            console.log("Missing required fields");
            return res.status(400).json({ error: "Email, jméno a příjmení jsou povinné" });
        }

        console.log("Looking up coach with ID:", req.user.userId);
        const coach = await userDao.findById(req.user.userId);
        
        if (!coach || coach.role !== 'coach') {
            console.log("User is not a coach:", coach);
            return res.status(403).json({ error: "Přístup povolen pouze pro trenéry" });
        }

        // Kontrola, zda email již není registrován
        const existingUser = await userDao.findByEmail(email);
        if (existingUser) {
            console.log("Email already registered:", email);
            return res.status(400).json({ error: "Email je již registrován" });
        }

        // Generování dočasného hesla
        const tempPassword = Math.random().toString(36).slice(-8);
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(tempPassword, salt);

        // Vytvoření nového atleta
        const athleteData = {
            name,
            surname,
            email: email.toLowerCase(),
            password: hashedPassword,
            role: 'athlete',
            dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : undefined,
            address,
            phone,
            height: height ? Number(height) : undefined,
            weight: weight ? Number(weight) : undefined,
            sport,
            specialization,
            coachId: coach._id,
            isRegistrationComplete: false,
            registrationToken: crypto.randomBytes(32).toString('hex'),
            registrationTokenExpires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 dní
        };

        const athlete = await userDao.createUser(athleteData);

        // Přidání atleta k trenérovi
        await userDao.addAthleteToCoach(coach._id, athlete._id);

        // Odeslání emailu s instrukcemi
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_APP_PASSWORD
            }
        });

        const registrationLink = `${process.env.CLIENT_URL}/complete-registration/${athlete.registrationToken}`;
        
        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: email,
            subject: 'Dokončení registrace v LaChart',
            html: `
                <h2>Vítejte v LaChart!</h2>
                <p>Váš trenér ${coach.name} ${coach.surname} vás zaregistroval do systému LaChart.</p>
                <p>Pro dokončení registrace a nastavení vašeho hesla klikněte na následující odkaz:</p>
                <a href="${registrationLink}">Dokončit registraci</a>
                <p>Odkaz je platný 7 dní.</p>
                <p>Pokud jste tento email nevyžadovali, můžete ho ignorovat.</p>
            `
        });

        console.log("Successfully created athlete and sent registration email");
        res.status(201).json({ 
            message: "Atlet byl úspěšně zaregistrován a byl mu odeslán email s instrukcemi",
            athlete: {
                _id: athlete._id,
                name: athlete.name,
                surname: athlete.surname,
                email: athlete.email
            }
        });
    } catch (error) {
        console.error("Error adding athlete:", error);
        res.status(500).json({ error: error.message });
    }
});

// Complete athlete registration
router.post("/complete-registration/:token", async (req, res) => {
    try {
        const { token } = req.params;
        const { password } = req.body;

        if (!password) {
            return res.status(400).json({ error: "Heslo je povinné" });
        }

        // Najít atleta podle tokenu
        const athlete = await userDao.findByRegistrationToken(token);
        if (!athlete) {
            return res.status(404).json({ error: "Neplatný nebo expirovaný registrační token" });
        }

        if (athlete.isRegistrationComplete) {
            return res.status(400).json({ error: "Registrace již byla dokončena" });
        }

        if (athlete.registrationTokenExpires < new Date()) {
            return res.status(400).json({ error: "Registrační token vypršel" });
        }

        // Aktualizace hesla a dokončení registrace
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        await userDao.updateUser(athlete._id, {
            password: hashedPassword,
            isRegistrationComplete: true,
            registrationToken: null,
            registrationTokenExpires: null
        });

        // Odeslání potvrzovacího emailu
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_APP_PASSWORD
            }
        });

        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: athlete.email,
            subject: 'Registrace v LaChart byla dokončena',
            html: `
                <h2>Vítejte v LaChart!</h2>
                <p>Vážený/á ${athlete.name} ${athlete.surname},</p>
                <p>Vaše registrace v systému LaChart byla úspěšně dokončena.</p>
                <p>Nyní se můžete přihlásit do systému pomocí vašeho emailu a hesla.</p>
                <p>Pro přihlášení navštivte: <a href="${process.env.CLIENT_URL}/login">${process.env.CLIENT_URL}/login</a></p>
                <p>Pokud jste tento email nevyžadovali, kontaktujte prosím podporu.</p>
            `
        });

        res.status(200).json({ message: "Registrace byla úspěšně dokončena" });
    } catch (error) {
        console.error("Error completing registration:", error);
        res.status(500).json({ error: error.message });
    }
});

// Remove athlete from coach
router.post("/coach/remove-athlete", verifyToken, async (req, res) => {
    try {
        const { athleteId } = req.body;
        
        if (!athleteId) {
            return res.status(400).json({ error: "ID atleta je povinné" });
        }

        const coach = await userDao.findById(req.user.userId);
        
        if (!coach || coach.role !== 'coach') {
            return res.status(403).json({ error: "Přístup povolen pouze pro trenéry" });
        }

        const athlete = await userDao.findById(athleteId);
        if (!athlete) {
            return res.status(404).json({ error: "Atlet nenalezen" });
        }

        if (athlete.coachId.toString() !== coach._id.toString()) {
            return res.status(403).json({ error: "Tento atlet nepatří k vašemu týmu" });
        }

        // Odstranit atleta od trenéra
        await userDao.removeAthleteFromCoach(coach._id, athleteId);
        // Odstranit trenéra atletovi
        await userDao.updateUser(athleteId, { coachId: null });

        res.status(200).json({ message: "Atlet úspěšně odebrán" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Edit user profile
router.put("/edit-profile", verifyToken, async (req, res) => {
    try {
        const userId = req.user.userId;
        const {
            name,
            surname,
            dateOfBirth,
            address,
            phone,
            height,
            weight,
            sport,
            specialization,
            bio
        } = req.body;

        // Validace dat
        const updateData = {};
        if (name) updateData.name = name;
        if (surname) updateData.surname = surname;
        if (dateOfBirth) updateData.dateOfBirth = new Date(dateOfBirth);
        if (address) updateData.address = address;
        if (phone) updateData.phone = phone;
        if (height) updateData.height = Number(height);
        if (weight) updateData.weight = Number(weight);
        if (sport) updateData.sport = sport;
        if (specialization) updateData.specialization = specialization;
        if (bio) updateData.bio = bio;

        console.log('Updating user profile:', { userId, updateData });

        const updatedUser = await userDao.updateUser(userId, updateData);
        if (!updatedUser) {
            return res.status(404).json({ error: "Uživatel nenalezen" });
        }

        // Vrátíme aktualizovaná data bez citlivých informací
        const userResponse = {
            _id: updatedUser._id,
            name: updatedUser.name,
            surname: updatedUser.surname,
            email: updatedUser.email,
            role: updatedUser.role,
            dateOfBirth: updatedUser.dateOfBirth,
            address: updatedUser.address,
            phone: updatedUser.phone,
            height: updatedUser.height,
            weight: updatedUser.weight,
            sport: updatedUser.sport,
            specialization: updatedUser.specialization,
            bio: updatedUser.bio,
            athletes: updatedUser.athletes
        };

        res.status(200).json(userResponse);
    } catch (error) {
        console.error("Error updating user profile:", error);
        res.status(500).json({ error: error.message });
    }
});

// Coach can edit athlete's profile
router.put("/coach/edit-athlete/:athleteId", verifyToken, async (req, res) => {
    try {
        const coachId = req.user.userId;
        const { athleteId } = req.params;
        const {
            name,
            surname,
            dateOfBirth,
            address,
            phone,
            height,
            weight,
            sport,
            specialization,
            bio
        } = req.body;

        // Kontrola, zda je uživatel trenér
        const coach = await userDao.findById(coachId);
        if (!coach || coach.role !== 'coach') {
            return res.status(403).json({ error: "Přístup povolen pouze pro trenéry" });
        }

        // Kontrola, zda atlet patří k trenérovi
        const athlete = await userDao.findById(athleteId);
        if (!athlete) {
            return res.status(404).json({ error: "Atlet nenalezen" });
        }
        if (!athlete.coachId || athlete.coachId.toString() !== coachId) {
            return res.status(403).json({ error: "Tento atlet nepatří k vašemu týmu" });
        }

        // Validace a příprava dat pro update
        const updateData = {};
        if (name) updateData.name = name;
        if (surname) updateData.surname = surname;
        if (dateOfBirth) updateData.dateOfBirth = new Date(dateOfBirth);
        if (address) updateData.address = address;
        if (phone) updateData.phone = phone;
        if (height) updateData.height = Number(height);
        if (weight) updateData.weight = Number(weight);
        if (sport) updateData.sport = sport;
        if (specialization) updateData.specialization = specialization;
        if (bio) updateData.bio = bio;

        console.log('Coach updating athlete profile:', { coachId, athleteId, updateData });

        const updatedAthlete = await userDao.updateUser(athleteId, updateData);

        // Vrátíme aktualizovaná data bez citlivých informací
        const athleteResponse = {
            _id: updatedAthlete._id,
            name: updatedAthlete.name,
            surname: updatedAthlete.surname,
            email: updatedAthlete.email,
            role: updatedAthlete.role,
            dateOfBirth: updatedAthlete.dateOfBirth,
            address: updatedAthlete.address,
            phone: updatedAthlete.phone,
            height: updatedAthlete.height,
            weight: updatedAthlete.weight,
            sport: updatedAthlete.sport,
            specialization: updatedAthlete.specialization,
            bio: updatedAthlete.bio
        };

        res.status(200).json({
            message: "Profil atleta byl úspěšně aktualizován",
            athlete: athleteResponse
        });
    } catch (error) {
        console.error("Error updating athlete profile:", error);
        res.status(500).json({ error: error.message });
    }
});

// Get athlete's trainings
router.get("/athlete/:athleteId/trainings", verifyToken, async (req, res) => {
    try {
        const userId = req.user.userId;
        const { athleteId } = req.params;

        const user = await userDao.findById(userId);
        if (!user) {
            return res.status(404).json({ error: "Uživatel nenalezen" });
        }

        // Povolíme přístup buď trenérovi daného atleta, nebo atletovi k jeho vlastním tréninkům
        if (user.role === 'coach') {
            const athlete = await userDao.findById(athleteId);
            if (!athlete) {
                return res.status(404).json({ error: "Atlet nenalezen" });
            }
            if (!athlete.coachId || athlete.coachId.toString() !== userId.toString()) {
                return res.status(403).json({ error: "Tento atlet nepatří k vašemu týmu" });
            }
        } else if (user.role === 'athlete' && userId !== athleteId) {
            return res.status(403).json({ error: "Nemáte oprávnění k zobrazení těchto tréninků" });
        }

        // Načtení tréninků atleta
        const trainings = await trainingDao.findByAthleteId(athleteId);
        res.status(200).json(trainings);
    } catch (error) {
        console.error("Error getting athlete trainings:", error);
        res.status(500).json({ error: error.message });
    }
});

// Get athlete's profile
router.get("/athlete/:athleteId", verifyToken, async (req, res) => {
    try {
        const userId = req.user.userId;
        const { athleteId } = req.params;

        const user = await userDao.findById(userId);
        if (!user) {
            return res.status(404).json({ error: "Uživatel nenalezen" });
        }

        // Povolíme přístup buď trenérovi daného atleta, nebo atletovi k jeho vlastnímu profilu
        if (user.role === 'coach') {
            // Kontrola pro trenéra
            const athlete = await userDao.findById(athleteId);
            if (!athlete) {
                return res.status(404).json({ error: "Atlet nenalezen" });
            }
            if (!athlete.coachId || athlete.coachId.toString() !== userId.toString()) {
                return res.status(403).json({ error: "Tento atlet nepatří k vašemu týmu" });
            }
        } else if (user.role === 'athlete' && userId !== athleteId) {
            // Atlet může vidět pouze svůj vlastní profil
            return res.status(403).json({ error: "Nemáte oprávnění k zobrazení tohoto profilu" });
        }

        const athlete = await userDao.findById(athleteId);
        if (!athlete) {
            return res.status(404).json({ error: "Atlet nenalezen" });
        }

        // Vrátíme data bez citlivých informací
        const athleteResponse = {
            _id: athlete._id,
            name: athlete.name,
            surname: athlete.surname,
            email: athlete.email,
            role: athlete.role,
            dateOfBirth: athlete.dateOfBirth,
            address: athlete.address,
            phone: athlete.phone,
            height: athlete.height,
            weight: athlete.weight,
            sport: athlete.sport,
            specialization: athlete.specialization,
            bio: athlete.bio,
            coachId: athlete.coachId
        };

        res.status(200).json(athleteResponse);
    } catch (error) {
        console.error("Error getting athlete profile:", error);
        res.status(500).json({ error: error.message });
    }
});

// Get user profile
router.get("/profile", verifyToken, async (req, res) => {
    try {
        const userId = req.user.userId;
        const user = await userDao.findById(userId);

        if (!user) {
            return res.status(404).json({ error: "Uživatel nenalezen" });
        }

        // Vrátíme data bez citlivých informací
        const userResponse = {
            _id: user._id,
            name: user.name,
            surname: user.surname,
            email: user.email,
            role: user.role,
            dateOfBirth: user.dateOfBirth,
            address: user.address,
            phone: user.phone,
            height: user.height,
            weight: user.weight,
            sport: user.sport,
            specialization: user.specialization,
            bio: user.bio,
            coachId: user.coachId
        };

        res.status(200).json(userResponse);
    } catch (error) {
        console.error("Error getting user profile:", error);
        res.status(500).json({ error: error.message });
    }
});

// Logout endpoint
router.post("/logout", verifyToken, async (req, res) => {
    try {
        // Získat token z hlavičky
        const token = req.headers.authorization.split(' ')[1];
        
        // Zde můžete přidat token do blacklistu, pokud implementujete blacklist
        // await blacklistToken(token);
        
        res.status(200).json({ message: "Logout successful" });
    } catch (error) {
        console.error("Logout error:", error);
        res.status(500).json({ error: "Chyba při odhlášení" });
    }
});

// Get athlete's tests
router.get("/athlete/:athleteId/tests", verifyToken, async (req, res) => {
    try {
        const { athleteId } = req.params;
        console.log('Fetching tests for athlete:', athleteId); // Debug log

        const tests = await userDao.getAthleteTests(athleteId);
        console.log('Found tests:', tests); // Debug log

        res.status(200).json(tests);
    } catch (error) {
        console.error("Error getting athlete tests:", error);
        res.status(500).json({ error: error.message });
    }
});

// Forgot password endpoint
router.post("/forgot-password", async (req, res) => {
    try {
        await forgotPasswordAbl.forgotPassword(req, res);
    } catch (error) {
        console.error("Forgot password route error:", error);
        res.status(500).json({ error: "Chyba při zpracování požadavku na reset hesla" });
    }
});

// Reset password endpoint
router.post("/reset-password", async (req, res) => {
    try {
        await forgotPasswordAbl.resetPassword(req, res);
    } catch (error) {
        console.error("Reset password route error:", error);
        res.status(500).json({ error: "Chyba při resetu hesla" });
    }
});

// Přidání nového endpointu pro opakované odeslání pozvánky
router.post('/coach/resend-invitation/:athleteId', verifyToken, async (req, res) => {
  try {
    const { athleteId } = req.params;
    const coachId = req.user.userId;

    // Najít atleta
    const athlete = await userDao.findById(athleteId);
    if (!athlete) {
      return res.status(404).json({ success: false, message: 'Athlete not found' });
    }

    // Zkontrolovat, zda je atlet přiřazen k trenérovi
    if (!athlete.coachId || athlete.coachId.toString() !== coachId.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorized to resend invitation' });
    }

    // Zkontrolovat, zda je registrace dokončena
    if (athlete.isRegistrationComplete) {
      return res.status(400).json({ success: false, message: 'Athlete has already completed registration' });
    }

    // Generovat nový token
    const registrationToken = crypto.randomBytes(32).toString('hex');
    const registrationTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hodin

    // Aktualizovat token v databázi
    await userDao.updateUser(athlete._id, {
      registrationToken: registrationToken,
      registrationTokenExpires: registrationTokenExpires
    });

    // Odeslat nový email
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_APP_PASSWORD
      }
    });

    const registrationLink = `${process.env.CLIENT_URL}/complete-registration/${registrationToken}`;

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: athlete.email,
      subject: 'Dokončení registrace v LaChart',
      html: `
        <h2>Vítejte v LaChart!</h2>
        <p>Váš trenér vás znovu pozval do systému LaChart.</p>
        <p>Pro dokončení registrace a nastavení vašeho hesla klikněte na následující odkaz:</p>
        <a href="${registrationLink}">Dokončit registraci</a>
        <p>Odkaz je platný 24 hodin.</p>
        <p>Pokud jste tento email nevyžadovali, můžete ho ignorovat.</p>
      `
    });

    res.status(200).json({ 
      success: true,
      message: 'Pozvánka byla úspěšně znovu odeslána',
      athlete: {
        _id: athlete._id,
        name: athlete.name,
        surname: athlete.surname,
        email: athlete.email
      }
    });
  } catch (error) {
    console.error('Error resending invitation:', error);
    res.status(500).json({ 
      success: false,
      message: 'Chyba při opakovaném odesílání pozvánky',
      error: error.message 
    });
  }
});

// Verify registration token
router.get("/verify-registration-token/:token", async (req, res) => {
    try {
        const { token } = req.params;
        const athlete = await userDao.findByRegistrationToken(token);
        
        if (!athlete) {
            return res.status(404).json({ error: "Neplatný nebo expirovaný registrační token" });
        }

        if (athlete.isRegistrationComplete) {
            return res.status(400).json({ error: "Registrace již byla dokončena" });
        }

        if (athlete.registrationTokenExpires < new Date()) {
            return res.status(400).json({ error: "Registrační token vypršel" });
        }

        // Vrátíme pouze potřebné informace
        res.status(200).json({
            _id: athlete._id,
            email: athlete.email,
            name: athlete.name,
            surname: athlete.surname
        });
    } catch (error) {
        console.error("Error verifying registration token:", error);
        res.status(500).json({ error: error.message });
    }
});

// Invite existing athlete to coach's team
router.post("/coach/invite-athlete", verifyToken, async (req, res) => {
    try {
        const { email } = req.body;
        const coachId = req.user.userId;

        if (!email) {
            return res.status(400).json({ error: "Email je povinný" });
        }

        // Kontrola, zda je uživatel trenér
        const coach = await userDao.findById(coachId);
        if (!coach || coach.role !== 'coach') {
            return res.status(403).json({ error: "Přístup povolen pouze pro trenéry" });
        }

        // Najít atleta podle emailu
        const athlete = await userDao.findByEmail(email);
        if (!athlete) {
            return res.status(404).json({ error: "Atlet s tímto emailem nebyl nalezen" });
        }

        if (athlete.role !== 'athlete') {
            return res.status(400).json({ error: "Uživatel s tímto emailem není atlet" });
        }

        // Kontrola, zda už atlet nemá trenéra
        if (athlete.coachId) {
            return res.status(400).json({ error: "Tento atlet už má přiřazeného trenéra" });
        }

        // Generovat token pro potvrzení pozvánky
        const invitationToken = crypto.randomBytes(32).toString('hex');
        const invitationTokenExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 dní

        // Uložit token a ID trenéra do databáze
        await userDao.updateUser(athlete._id, {
            invitationToken,
            invitationTokenExpires,
            pendingCoachId: coachId
        });

        // Odeslat email s pozvánkou
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_APP_PASSWORD
            }
        });

        const invitationLink = `${process.env.CLIENT_URL}/accept-invitation/${invitationToken}`;

        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: email,
            subject: 'Pozvánka do týmu v LaChart',
            html: `
                <h2>Pozvánka do týmu</h2>
                <p>Váš trenér ${coach.name} ${coach.surname} vás pozval do svého týmu v systému LaChart.</p>
                <p>Pro potvrzení pozvánky klikněte na následující odkaz:</p>
                <a href="${invitationLink}">Potvrdit pozvánku</a>
                <p>Odkaz je platný 7 dní.</p>
                <p>Pokud jste tento email nevyžadovali, můžete ho ignorovat.</p>
            `
        });

        res.status(200).json({ 
            message: "Pozvánka byla úspěšně odeslána",
            athlete: {
                _id: athlete._id,
                name: athlete.name,
                surname: athlete.surname,
                email: athlete.email,
                invitationPending: true
            }
        });
    } catch (error) {
        console.error("Error inviting athlete:", error);
        res.status(500).json({ error: error.message });
    }
});

// Accept invitation endpoint
router.post("/accept-invitation/:token", verifyToken, async (req, res) => {
    try {
        const { token } = req.params;
        const athleteId = req.user.userId;

        // Najít atleta podle tokenu
        const athlete = await userDao.findByInvitationToken(token);
        if (!athlete) {
            return res.status(404).json({ error: "Neplatná nebo expirovaná pozvánka" });
        }

        if (athlete._id.toString() !== athleteId.toString()) {
            return res.status(403).json({ error: "Nemáte oprávnění k přijetí této pozvánky" });
        }

        if (athlete.invitationTokenExpires < new Date()) {
            return res.status(400).json({ error: "Pozvánka vypršela" });
        }

        // Přidat atleta k trenérovi
        await userDao.addAthleteToCoach(athlete.pendingCoachId, athlete._id);
        await userDao.updateUser(athlete._id, { 
            coachId: athlete.pendingCoachId,
            invitationToken: null,
            invitationTokenExpires: null,
            pendingCoachId: null
        });

        // Odeslat potvrzovací email trenérovi
        const coach = await userDao.findById(athlete.pendingCoachId);
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_APP_PASSWORD
            }
        });

        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: coach.email,
            subject: 'Atlet přijal pozvánku do týmu',
            html: `
                <h2>Pozvánka byla přijata</h2>
                <p>Atlet ${athlete.name} ${athlete.surname} přijal vaši pozvánku do týmu.</p>
                <p>Nyní se zobrazí ve vašem seznamu atletů.</p>
            `
        });

        res.status(200).json({ 
            message: "Pozvánka byla úspěšně přijata",
            athlete: {
                _id: athlete._id,
                name: athlete.name,
                surname: athlete.surname,
                email: athlete.email
            }
        });
    } catch (error) {
        console.error("Error accepting invitation:", error);
        res.status(500).json({ error: error.message });
    }
});

// Verify invitation token
router.get("/verify-invitation-token/:token", async (req, res) => {
    try {
        const { token } = req.params;
        const athlete = await userDao.findByInvitationToken(token);
        
        if (!athlete) {
            return res.status(404).json({ error: "Neplatná nebo expirovaná pozvánka" });
        }

        if (athlete.invitationTokenExpires < new Date()) {
            return res.status(400).json({ error: "Pozvánka vypršela" });
        }

        // Vrátíme pouze potřebné informace
        res.status(200).json({
            _id: athlete._id,
            email: athlete.email,
            name: athlete.name,
            surname: athlete.surname
        });
    } catch (error) {
        console.error("Error verifying invitation token:", error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
