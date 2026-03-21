const UserDao = require("../../dao/userDao");

class GetAbl {
    constructor() {
        this.userDao = new UserDao();
    }

    async getUser(req, res) {
        try {
            // Získáme ID uživatele z JWT tokenu (nastaveno v verifyToken middleware)
            const userId = req.user.userId;
            console.log("Getting user with ID:", userId);

            const user = await this.userDao.findById(userId);
            
            if (!user) {
                console.log("User not found");
                return res.status(404).json({ error: "Uživatel nenalezen" });
            }

            // Vrátíme data uživatele bez hesla
            const userData = {
                _id: user._id,
                email: user.email,
                name: user.name,
                surname: user.surname,
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

            console.log("User data retrieved successfully");
            res.json(userData);

        } catch (error) {
            console.error("Get user error:", error);
            res.status(500).json({ error: "Chyba při získávání uživatele" });
        }
    }

    async getAthletesByCoachId(coachId) {
        try {
            const coach = await this.userDao.findById(coachId);
            if (!coach || coach.role !== 'coach') {
                throw new Error('Trenér nenalezen');
            }

            return await this.userDao.findAthletesByCoachId(coachId);
        } catch (error) {
            throw error;
        }
    }

    async addAthleteToCoach(coachId, athleteEmail) {
        try {
            const { athleteHasCoachUser, mergeCoachIds } = require('../../utils/athleteCoachAccess');
            const athlete = await this.userDao.findByEmail(athleteEmail);
            if (!athlete) {
                throw new Error('Atlet nenalezen');
            }
            if (athlete.role !== 'athlete') {
                throw new Error('Uživatel není atlet');
            }
            if (athleteHasCoachUser(athlete, coachId)) {
                throw new Error('Atlet již je u tohoto trenéra');
            }

            const merged = mergeCoachIds(athlete, coachId);
            await this.userDao.addAthleteToCoach(coachId, athlete._id);
            await this.userDao.updateUser(athlete._id, {
                coachIds: merged.coachIds,
                coachId: merged.coachId
            });

            return { message: 'Atlet úspěšně přidán' };
        } catch (error) {
            throw error;
        }
    }

    async removeAthleteFromCoach(coachId, athleteId) {
        try {
            const { athleteHasCoachUser, removeCoachFromAthleteIds } = require('../../utils/athleteCoachAccess');
            const athlete = await this.userDao.findById(athleteId);
            if (!athlete) {
                throw new Error('Atlet nenalezen');
            }
            if (!athleteHasCoachUser(athlete, coachId)) {
                throw new Error('Atlet nepatří tomuto trenérovi');
            }

            await this.userDao.removeAthleteFromCoach(coachId, athleteId);
            const next = removeCoachFromAthleteIds(athlete, coachId);
            await this.userDao.updateUser(athleteId, {
                coachIds: next.coachIds,
                coachId: next.coachId
            });

            return { message: 'Atlet úspěšně odebrán' };
        } catch (error) {
            throw error;
        }
    }
}

module.exports = new GetAbl();
