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
const jwt = require("jsonwebtoken");
const { OAuth2Client } = require('google-auth-library');

const userDao = new UserDao();
const trainingDao = new TrainingDao();

// Google OAuth client
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Register endpoint
router.post("/register", async (req, res) => {
    try {
        await registerAbl.register(req, res);
    } catch (error) {
        console.error("Registration route error:", error);
        res.status(500).json({ error: "Registration error" });
    }
});

// Login endpoint
router.post("/login", async (req, res) => {
    try {
        console.log("Login request received:", req.body);
        await loginAbl.login(req, res);
    } catch (error) {
        console.error("Login route error:", error);
        res.status(500).json({ error: "Login error" });
    }
});

// Get coach's athletes
router.get("/coach/athletes", verifyToken, async (req, res) => {
    try {
        const coach = await userDao.findById(req.user.userId);
        
        if (!coach || coach.role !== 'coach') {
            return res.status(403).json({ error: "Access allowed only for coaches" });
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
        
        // Validate required fields
        if (!email || !name || !surname) {
            console.log("Missing required fields");
            return res.status(400).json({ error: "Email, name and surname are required" });
        }

        console.log("Looking up coach with ID:", req.user.userId);
        const coach = await userDao.findById(req.user.userId);
        
        if (!coach || coach.role !== 'coach') {
            console.log("User is not a coach:", coach);
            return res.status(403).json({ error: "Access allowed only for coaches" });
        }

        // Check if email is already registered
        const existingUser = await userDao.findByEmail(email);
        if (existingUser) {
            console.log("Email already registered:", email);
            return res.status(400).json({ error: "Email is already registered" });
        }

        // Generate temporary password
        const tempPassword = Math.random().toString(36).slice(-8);
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(tempPassword, salt);

        // Create new athlete
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
            registrationTokenExpires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
        };

        const athlete = await userDao.createUser(athleteData);

        // Add athlete to coach
        await userDao.addAthleteToCoach(coach._id, athlete._id);

        // Send email with instructions
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
            subject: 'Complete Your Registration in LaChart',
            html: `
                <h2>Welcome to LaChart!</h2>
                <p>Your coach ${coach.name} ${coach.surname} has registered you in the LaChart system.</p>
                <p>To complete your registration and set your password, click on the following link:</p>
                <a href="${registrationLink}">Complete Registration</a>
                <p>The link is valid for 7 days.</p>
                <p>If you did not request this email, you can ignore it.</p>
            `
        });

        console.log("Successfully created athlete and sent registration email");
        res.status(201).json({ 
            message: "Athlete successfully registered and email with instructions has been sent",
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
            return res.status(400).json({ error: "Password is required" });
        }

        // Find athlete by token
        const athlete = await userDao.findByRegistrationToken(token);
        if (!athlete) {
            return res.status(404).json({ error: "Invalid or expired registration token" });
        }

        if (athlete.isRegistrationComplete) {
            return res.status(400).json({ error: "Registration has already been completed" });
        }

        if (athlete.registrationTokenExpires < new Date()) {
            return res.status(400).json({ error: "Registration token has expired" });
        }

        // Update password and complete registration
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        await userDao.updateUser(athlete._id, {
            password: hashedPassword,
            isRegistrationComplete: true,
            registrationToken: null,
            registrationTokenExpires: null
        });

        // Send confirmation email
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
            subject: 'LaChart Registration Completed',
            html: `
                <h2>Welcome to LaChart!</h2>
                <p>Dear ${athlete.name} ${athlete.surname},</p>
                <p>Your registration in LaChart has been successfully completed.</p>
                <p>You can now log in to the system using your email and password.</p>
                <p>To log in, visit: <a href="${process.env.CLIENT_URL}/login">${process.env.CLIENT_URL}/login</a></p>
                <p>If you did not request this email, please contact support.</p>
            `
        });

        res.status(200).json({ message: "Registration successfully completed" });
    } catch (error) {
        console.error("Error completing registration:", error);
        res.status(500).json({ error: error.message });
    }
});

// Remove athlete from coach
router.delete("/coach/remove-athlete/:athleteId", verifyToken, async (req, res) => {
    try {
        const coach = await userDao.findById(req.user.userId);
        
        if (!coach || coach.role !== 'coach') {
            return res.status(403).json({ error: "Access allowed only for coaches" });
        }

        const athlete = await userDao.findById(req.params.athleteId);
        if (!athlete) {
            return res.status(404).json({ error: "Athlete not found" });
        }

        if (athlete.coachId.toString() !== coach._id.toString()) {
            return res.status(403).json({ error: "You are not authorized to remove this athlete" });
        }

        // Remove athlete from coach's list
        await userDao.removeAthleteFromCoach(coach._id, athlete._id);
        
        // Delete athlete's account
        await userDao.deleteById(athlete._id);

        res.status(200).json({ message: "Athlete successfully removed" });
    } catch (error) {
        console.error("Error removing athlete:", error);
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

        // Validate data
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
            return res.status(404).json({ error: "User not found" });
        }

        // Return updated data without sensitive information
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

        // Check if user is a coach
        const coach = await userDao.findById(coachId);
        if (!coach || coach.role !== 'coach') {
            return res.status(403).json({ error: "Access allowed only for coaches" });
        }

        // Check if athlete belongs to the coach
        const athlete = await userDao.findById(athleteId);
        if (!athlete) {
            return res.status(404).json({ error: "Athlete not found" });
        }
        if (!athlete.coachId || athlete.coachId.toString() !== coachId) {
            return res.status(403).json({ error: "This athlete does not belong to your team" });
        }

        // Validate and prepare data for update
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

        // Return updated data without sensitive information
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
            message: "Athlete profile successfully updated",
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
            return res.status(404).json({ error: "User not found" });
        }

        // Allow access either to the athlete's coach or to the athlete for their own trainings
        if (user.role === 'coach') {
            const athlete = await userDao.findById(athleteId);
            if (!athlete) {
                return res.status(404).json({ error: "Athlete not found" });
            }
            if (!athlete.coachId || athlete.coachId.toString() !== userId.toString()) {
                return res.status(403).json({ error: "This athlete does not belong to your team" });
            }
        } else if (user.role === 'athlete' && userId !== athleteId) {
            return res.status(403).json({ error: "You are not authorized to view these trainings" });
        }

        // Load athlete's trainings
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
            return res.status(404).json({ error: "User not found" });
        }

        // Allow access either to the athlete's coach or to the athlete for their own profile
        if (user.role === 'coach') {
            // Check for coach
            const athlete = await userDao.findById(athleteId);
            if (!athlete) {
                return res.status(404).json({ error: "Athlete not found" });
            }
            if (!athlete.coachId || athlete.coachId.toString() !== userId.toString()) {
                return res.status(403).json({ error: "This athlete does not belong to your team" });
            }
        } else if (user.role === 'athlete' && userId !== athleteId) {
            // Athlete can only see their own profile
            return res.status(403).json({ error: "You are not authorized to view this profile" });
        }

        const athlete = await userDao.findById(athleteId);
        if (!athlete) {
            return res.status(404).json({ error: "Athlete not found" });
        }

        // Return data without sensitive information
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
            return res.status(404).json({ error: "User not found" });
        }

        // Return data without sensitive information
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
        // Get token from header
        const token = req.headers.authorization.split(' ')[1];
        
        // Here you can add token to blacklist if you implement blacklist
        // await blacklistToken(token);
        
        res.status(200).json({ message: "Logout successful" });
    } catch (error) {
        console.error("Logout error:", error);
        res.status(500).json({ error: "Logout error" });
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
        res.status(500).json({ error: "Error processing password reset request" });
    }
});

// Reset password endpoint
router.post("/reset-password", async (req, res) => {
    try {
        await forgotPasswordAbl.resetPassword(req, res);
    } catch (error) {
        console.error("Reset password route error:", error);
        res.status(500).json({ error: "Error resetting password" });
    }
});

// Add new endpoint for resending invitation
router.post('/coach/resend-invitation/:athleteId', verifyToken, async (req, res) => {
  try {
    const { athleteId } = req.params;
    const coachId = req.user.userId;

    // Find athlete
    const athlete = await userDao.findById(athleteId);
    if (!athlete) {
      return res.status(404).json({ success: false, message: 'Athlete not found' });
    }

    // Check if athlete is assigned to coach
    if (!athlete.coachId || athlete.coachId.toString() !== coachId.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorized to resend invitation' });
    }

    // Check if registration is completed
    if (athlete.isRegistrationComplete) {
      return res.status(400).json({ success: false, message: 'Athlete has already completed registration' });
    }

    // Generate new token
    const registrationToken = crypto.randomBytes(32).toString('hex');
    const registrationTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Update token in database
    await userDao.updateUser(athlete._id, {
      registrationToken: registrationToken,
      registrationTokenExpires: registrationTokenExpires
    });

    // Send new email
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
      subject: 'Complete Your Registration in LaChart',
      html: `
        <h2>Welcome to LaChart!</h2>
        <p>Your coach has invited you again to the LaChart system.</p>
        <p>To complete your registration and set your password, click on the following link:</p>
        <a href="${registrationLink}">Complete Registration</a>
        <p>The link is valid for 24 hours.</p>
        <p>If you did not request this email, you can ignore it.</p>
      `
    });

    res.status(200).json({ 
      success: true,
      message: 'Invitation successfully resent',
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
      message: 'Error resending invitation',
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
            return res.status(404).json({ error: "Invalid or expired registration token" });
        }

        if (athlete.isRegistrationComplete) {
            return res.status(400).json({ error: "Registration has already been completed" });
        }

        if (athlete.registrationTokenExpires < new Date()) {
            return res.status(400).json({ error: "Registration token has expired" });
        }

        // Return only necessary information
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
            return res.status(400).json({ error: "Email is required" });
        }

        // Check if user is a coach
        const coach = await userDao.findById(coachId);
        if (!coach || coach.role !== 'coach') {
            return res.status(403).json({ error: "Access allowed only for coaches" });
        }

        // Find athlete by email
        const athlete = await userDao.findByEmail(email);
        if (!athlete) {
            return res.status(404).json({ error: "Athlete with this email not found" });
        }

        if (athlete.role !== 'athlete') {
            return res.status(400).json({ error: "User with this email is not an athlete" });
        }

        // Check if athlete already has a coach
        if (athlete.coachId) {
            return res.status(400).json({ error: "This athlete already has an assigned coach" });
        }

        // Generate invitation token
        const invitationToken = crypto.randomBytes(32).toString('hex');
        const invitationTokenExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

        // Save token and coach ID to database
        await userDao.updateUser(athlete._id, {
            invitationToken,
            invitationTokenExpires,
            pendingCoachId: coachId
        });

        // Send invitation email
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
            subject: 'Team Invitation in LaChart',
            html: `
                <h2>Team Invitation</h2>
                <p>Your coach ${coach.name} ${coach.surname} has invited you to their team in LaChart.</p>
                <p>To confirm the invitation, click on the following link:</p>
                <a href="${invitationLink}">Confirm Invitation</a>
                <p>The link is valid for 7 days.</p>
                <p>If you did not request this email, you can ignore it.</p>
            `
        });

        res.status(200).json({ 
            message: "Invitation successfully sent",
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

// Accept invitation endpoint (public via token)
router.post("/accept-invitation/:token", async (req, res) => {
    try {
        const { token } = req.params;
        // Find athlete by invitation token
        const athlete = await userDao.findByInvitationToken(token);
        if (!athlete) {
            return res.status(404).json({ error: "Invalid or expired invitation" });
        }

        if (athlete.invitationTokenExpires < new Date()) {
            return res.status(400).json({ error: "Invitation has expired" });
        }

        // Resolve coach from pendingCoachId
        const coach = await userDao.findById(athlete.pendingCoachId);
        if (!coach) {
            return res.status(404).json({ error: "Coach not found for this invitation" });
        }

        // Link athlete and coach
        await userDao.addAthleteToCoach(coach._id, athlete._id);
        await userDao.updateUser(athlete._id, {
            coachId: coach._id,
            invitationToken: null,
            invitationTokenExpires: null,
            pendingCoachId: null
        });

        // Send confirmation email to coach
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_APP_PASSWORD
            }
        });

        if (coach?.email) {
            await transporter.sendMail({
                from: process.env.EMAIL_USER,
                to: coach.email,
                subject: 'Athlete Accepted Team Invitation',
                html: `
                    <h2>Invitation Accepted</h2>
                    <p>Athlete ${athlete.name} ${athlete.surname} has accepted your team invitation.</p>
                    <p>They will now appear in your athletes list.</p>
                `
            });
        }

        res.status(200).json({ 
            message: "Invitation successfully accepted",
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
            return res.status(404).json({ error: "Invalid or expired invitation" });
        }

        if (athlete.invitationTokenExpires < new Date()) {
            return res.status(400).json({ error: "Invitation has expired" });
        }

        // Return only necessary information
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

// Remove coach from athlete
router.delete("/athlete/remove-coach", verifyToken, async (req, res) => {
    try {
        const athleteId = req.user.userId;
        
        // Find athlete
        const athlete = await userDao.findById(athleteId);
        if (!athlete) {
            return res.status(404).json({ error: "Athlete not found" });
        }

        if (!athlete.coachId) {
            return res.status(400).json({ error: "Athlete does not have an assigned coach" });
        }

        // Save coach ID for later use
        const coachId = athlete.coachId;

        // Remove coach from athlete's profile
        await userDao.updateUser(athleteId, {
            coachId: null
        });

        // Remove athlete from coach's list
        await userDao.removeAthleteFromCoach(coachId, athleteId);

        // Send notification emails to both coach and athlete
        const coach = await userDao.findById(coachId);
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_APP_PASSWORD
            }
        });

        if (coach?.email) {
            await transporter.sendMail({
                from: process.env.EMAIL_USER,
                to: coach.email,
                subject: 'Athlete Left Team',
                html: `
                    <h2>Athlete Left Team</h2>
                    <p>Athlete ${athlete.name} ${athlete.surname} has left your team.</p>
                `
            });
        }

        if (athlete?.email) {
            await transporter.sendMail({
                from: process.env.EMAIL_USER,
                to: athlete.email,
                subject: 'Coach Removed',
                html: `
                    <h2>Coach Removed</h2>
                    <p>You have successfully removed your coach${coach ? ` ${coach.name} ${coach.surname}` : ''}.</p>
                `
            });
        }

        res.status(200).json({ 
            message: "Coach successfully removed",
            athlete: {
                _id: athlete._id,
                name: athlete.name,
                surname: athlete.surname,
                email: athlete.email
            }
        });
    } catch (error) {
        console.error("Error removing coach:", error);
        res.status(500).json({ error: error.message });
    }
});

// Get user by ID
router.get("/user/:userId", verifyToken, async (req, res) => {
    try {
        const { userId } = req.params;
        const user = await userDao.findById(userId);

        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        // Return data without sensitive information
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
            bio: user.bio
        };

        res.status(200).json(userResponse);
    } catch (error) {
        console.error("Error getting user:", error);
        res.status(500).json({ error: error.message });
    }
});

// Get coach profile for athlete
router.get("/coach/profile", verifyToken, async (req, res) => {
    try {
        console.log('Fetching coach profile for athlete ID:', req.user.userId);
        
        // Find athlete by ID
        const athlete = await userDao.findById(req.user.userId);
        console.log('Found athlete:', athlete);
        
        if (!athlete) {
            return res.status(404).json({ error: 'Athlete not found' });
        }

        if (!athlete.coachId) {
            return res.status(404).json({ error: 'Athlete does not have an assigned coach' });
        }

        // Find coach by ID
        console.log('Looking for coach with ID:', athlete.coachId);
        const coach = await userDao.findOne({ _id: athlete.coachId, role: 'coach' });
        console.log('Found coach:', coach);

        if (!coach) {
            return res.status(404).json({ error: 'Coach not found' });
        }

        if (coach.role !== 'coach') {
            return res.status(400).json({ error: 'User is not a coach' });
        }

        // Return coach data (without sensitive information)
        const coachData = {
            _id: coach._id,
            name: coach.name,
            surname: coach.surname,
            email: coach.email,
            role: coach.role
        };

        console.log('Sending coach data:', coachData);
        res.json(coachData);
    } catch (error) {
        console.error('Error getting coach profile:', error);
        res.status(500).json({ error: 'Error getting coach profile' });
    }
});

// Endpoint for athlete to invite coach
router.post('/athlete/invite-coach', verifyToken, async (req, res) => {
    try {
        console.log('Received invite-coach request:', {
            userId: req.user.userId,
            body: req.body
        });

        const { email } = req.body;
        const athleteId = req.user.userId;

        // Validate email
        if (!email) {
            console.log('Email validation failed: email is missing');
            return res.status(400).json({ error: "Email is required" });
        }

        // Check if user is an athlete
        const athlete = await userDao.findById(athleteId);
        console.log('Found athlete:', athlete);

        if (!athlete) {
            console.log('Athlete not found for ID:', athleteId);
            return res.status(404).json({ error: "Athlete not found" });
        }

        if (athlete.role !== 'athlete') {
            console.log('User is not an athlete:', athlete.role);
            return res.status(403).json({ error: "Access allowed only for athletes" });
        }

        // Check if athlete already has a coach
        if (athlete.coachId) {
            console.log('Athlete already has a coach:', athlete.coachId);
            return res.status(400).json({ error: "You already have a coach assigned" });
        }

        // Find coach by email
        const coach = await userDao.findByEmail(email);
        console.log('Found coach:', coach);

        if (!coach) {
            console.log('Coach not found for email:', email);
            return res.status(404).json({ error: "Coach not found" });
        }

        // Verify coach role
        if (coach.role !== 'coach') {
            console.log('User is not a coach:', coach.role);
            return res.status(400).json({ error: "User with this email is not a coach" });
        }

        // Check if coach has reached maximum number of athletes (10)
        const coachAthletes = await userDao.findAthletesByCoachId(coach._id);
        console.log('Coach athletes count:', coachAthletes.length);

        if (coachAthletes.length >= 10) {
            console.log('Coach has reached maximum athletes');
            return res.status(400).json({ error: "Coach has reached maximum number of athletes" });
        }

        // Generate invitation token
        const invitationToken = crypto.randomBytes(32).toString('hex');
        const invitationTokenExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

        // Save token and athlete ID to database
        console.log('Saving invitation data:', {
            coachId: coach._id,
            invitationToken,
            invitationTokenExpires,
            pendingAthleteId: athleteId
        });
        
        const updatedCoach = await userDao.updateUser(coach._id, {
            invitationToken,
            invitationTokenExpires,
            pendingAthleteId: athleteId
        });
        
        console.log('Coach after update:', {
            id: updatedCoach._id,
            invitationToken: updatedCoach.invitationToken,
            pendingAthleteId: updatedCoach.pendingAthleteId
        });

        // Send invitation email
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_APP_PASSWORD
            }
        });

        const invitationLink = `${process.env.CLIENT_URL}/accept-coach-invitation/${invitationToken}`;
        
        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: coach.email,
            subject: 'Coach Invitation in LaChart',
            html: `
                <h2>Coach Invitation</h2>
                <p>Athlete ${athlete.name} ${athlete.surname} has invited you to be their coach in LaChart.</p>
                <p>To accept the invitation, click on the following link:</p>
                <a href="${invitationLink}">Accept Invitation</a>
                <p>The link is valid for 7 days.</p>
                <p>If you did not request this email, you can ignore it.</p>
            `
        });

        console.log('Coach invitation sent successfully');
        res.status(200).json({ message: "Coach invitation sent successfully" });
    } catch (error) {
        console.error("Error inviting coach:", error);
        res.status(500).json({ error: error.message });
    }
});

// Accept coach invitation endpoint
router.post("/accept-coach-invitation/:token", verifyToken, async (req, res) => {
    try {
        const { token } = req.params;
        const coachId = req.user.userId;

        console.log('Accepting coach invitation:', { token, coachId });

        // Find coach by token
        const coach = await userDao.findByInvitationToken(token);
        if (!coach) {
            console.log('Coach not found for token:', token);
            return res.status(404).json({ error: "Invalid or expired invitation" });
        }

        console.log('Found coach:', {
            id: coach._id,
            invitationToken: coach.invitationToken,
            pendingAthleteId: coach.pendingAthleteId,
            invitationTokenExpires: coach.invitationTokenExpires
        });

        if (coach._id.toString() !== coachId.toString()) {
            console.log('Coach ID mismatch:', { tokenCoachId: coach._id, currentCoachId: coachId });
            return res.status(403).json({ error: "You are not authorized to accept this invitation" });
        }

        if (coach.invitationTokenExpires < new Date()) {
            console.log('Invitation expired:', coach.invitationTokenExpires);
            return res.status(400).json({ error: "Invitation has expired" });
        }

        // Find athlete using pendingAthleteId from coach
        console.log('Looking for athlete with ID:', coach.pendingAthleteId);
        const athlete = await userDao.findById(coach.pendingAthleteId);
        if (!athlete) {
            console.log('Athlete not found for ID:', coach.pendingAthleteId);
            return res.status(404).json({ error: "Athlete not found" });
        }

        // Check if athlete already has a coach
        if (athlete.coachId) {
            console.log('Athlete already has a coach:', athlete.coachId);
            return res.status(400).json({ error: "Athlete already has a coach" });
        }

        // Add coach to athlete
        console.log('Adding coach to athlete:', { athleteId: athlete._id, coachId: coach._id });
        await userDao.updateUser(athlete._id, {
            coachId: coach._id
        });

        // Add athlete to coach's list
        console.log('Adding athlete to coach list');
        await userDao.addAthleteToCoach(coach._id, athlete._id);

        // Clean up invitation
        console.log('Cleaning up invitation');
        await userDao.updateUser(coach._id, {
            invitationToken: null,
            invitationTokenExpires: null,
            pendingAthleteId: null
        });

        // Send confirmation email to athlete
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
            subject: 'Coach Accepted Your Invitation',
            html: `
                <h2>Invitation Accepted</h2>
                <p>Coach ${coach.name} ${coach.surname} has accepted your invitation.</p>
                <p>Your coach is now set in the system.</p>
            `
        });

        console.log('Invitation accepted successfully');
        res.status(200).json({ 
            message: "Invitation successfully accepted",
            coach: {
                _id: coach._id,
                name: coach.name,
                surname: coach.surname,
                email: coach.email
            }
        });
    } catch (error) {
        console.error("Error accepting coach invitation:", error);
        res.status(500).json({ error: error.message });
    }
});

// Verify coach invitation token
router.get('/verify-coach-invitation-token/:token', verifyToken, async (req, res) => {
    try {
        const { token } = req.params;
        // Najdi coacha podle tokenu
        const coach = await userDao.findByInvitationToken(token);
        if (!coach) {
            return res.status(404).json({ error: 'Pozvánka nebyla nalezena' });
        }
        if (coach.invitationTokenExpires < new Date()) {
            return res.status(400).json({ error: 'Pozvánka vypršela' });
        }
        // Vrať informace o coachovi
        res.json({
            coach: {
                id: coach._id,
                name: coach.name,
                email: coach.email
            }
        });
    } catch (error) {
        console.error('Error verifying coach invitation:', error);
        res.status(500).json({ error: 'Chyba při ověřování pozvánky' });
    }
});

// Google authentication endpoint
router.post("/google-auth", async (req, res) => {
    try {
        const { credential } = req.body;
        
        // Verify Google token
        const ticket = await client.verifyIdToken({
            idToken: credential,
            audience: process.env.GOOGLE_CLIENT_ID
        });
        
        const payload = ticket.getPayload();
        const { email, name, given_name, family_name, sub: googleId } = payload;

        // Find or create user
        let user = await userDao.findByEmail(email);
        
        if (!user) {
            // Create new user if doesn't exist
            user = await userDao.createUser({
                email,
                name: given_name,
                surname: family_name,
                googleId,
                role: 'athlete', // Default role
                isRegistrationComplete: true
            });
        } else if (!user.googleId) {
            // Link Google account to existing user
            user = await userDao.updateUser(user._id, { googleId });
        }

        // Generate JWT token
        const token = jwt.sign(
            { userId: user._id, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        // Return token and user data
        res.json({
            token,
            user: {
                _id: user._id,
                role: user.role,
                name: user.name,
                surname: user.surname,
                email: user.email,
                googleId: user.googleId
            }
        });

    } catch (error) {
        console.error("Google auth error:", error);
        res.status(500).json({ error: "Google authentication failed" });
    }
});

// Change password endpoint
router.post("/change-password", verifyToken, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const userId = req.user.userId;

        // Validate required fields
        if (!currentPassword || !newPassword) {
            return res.status(400).json({ error: "Current password and new password are required" });
        }

        // Validate password length
        if (newPassword.length < 6) {
            return res.status(400).json({ error: "New password must be at least 6 characters long" });
        }

        // Find user
        const user = await userDao.findById(userId);
        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        // Verify current password
        const isValidPassword = await bcrypt.compare(currentPassword, user.password);
        if (!isValidPassword) {
            return res.status(400).json({ error: "Current password is incorrect" });
        }

        // Check if new password is same as current password
        const isSamePassword = await bcrypt.compare(newPassword, user.password);
        if (isSamePassword) {
            return res.status(400).json({ error: "New password must be different from current password" });
        }

        // Hash new password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);

        // Update password
        await userDao.updateUser(userId, { password: hashedPassword });

        res.status(200).json({ message: "Password successfully changed" });
    } catch (error) {
        console.error("Error changing password:", error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
