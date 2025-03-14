const express = require("express");
const router = express.Router();
const registerAbl = require("../abl/user-abl/register-abl");
const loginAbl = require("../abl/user-abl/login-abl");
const verifyToken = require("../middleware/verifyToken");
const UserDao = require("../dao/userDao");

const userDao = new UserDao();

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
        const { athleteEmail } = req.body;
        
        if (!athleteEmail) {
            return res.status(400).json({ error: "Email atleta je povinný" });
        }

        const coach = await userDao.findById(req.user.userId);
        
        if (!coach || coach.role !== 'coach') {
            return res.status(403).json({ error: "Přístup povolen pouze pro trenéry" });
        }

        // Najít atleta podle emailu
        const athlete = await userDao.findByEmail(athleteEmail);
        if (!athlete) {
            return res.status(404).json({ error: "Atlet nenalezen" });
        }
        if (athlete.role !== 'athlete') {
            return res.status(400).json({ error: "Uživatel není atlet" });
        }
        if (athlete.coachId) {
            return res.status(400).json({ error: "Atlet již má přiřazeného trenéra" });
        }

        // Přidat atleta k trenérovi
        await userDao.addAthleteToCoach(coach._id, athlete._id);
        // Nastavit trenéra atletovi
        await userDao.updateUser(athlete._id, { coachId: coach._id });

        res.status(200).json({ 
            message: "Atlet úspěšně přidán",
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

// Get athlete's profile (for coach)
router.get("/coach/athlete/:athleteId", verifyToken, async (req, res) => {
    try {
        const coachId = req.user.userId;
        const { athleteId } = req.params;

        // Kontrola, zda je uživatel trenér
        const coach = await userDao.findById(coachId);
        if (!coach || coach.role !== 'coach') {
            return res.status(403).json({ error: "Přístup povolen pouze pro trenéry" });
        }

        // Načtení atleta
        const athlete = await userDao.findById(athleteId);
        if (!athlete) {
            return res.status(404).json({ error: "Atlet nenalezen" });
        }
        if (!athlete.coachId || athlete.coachId.toString() !== coachId) {
            return res.status(403).json({ error: "Tento atlet nepatří k vašemu týmu" });
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
            bio: athlete.bio
        };

        res.status(200).json(athleteResponse);
    } catch (error) {
        console.error("Error getting athlete profile:", error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
