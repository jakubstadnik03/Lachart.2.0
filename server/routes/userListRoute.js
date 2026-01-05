const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
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
const Test = require("../models/test");
const FitTraining = require("../models/fitTraining");
const StravaActivity = require("../models/StravaActivity");
const LactateSession = require("../models/lactateSession");
const Event = require("../models/Event");
const User = require("../models/UserModel");

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

// Register Expo push token for the logged-in user (mobile app)
router.post("/push-token", verifyToken, async (req, res) => {
    try {
        const { expoPushToken } = req.body || {};
        if (!expoPushToken || typeof expoPushToken !== "string") {
            return res.status(400).json({ error: "expoPushToken is required" });
        }

        // Basic validation (Expo tokens often look like: ExponentPushToken[xxxx])
        const tokenStr = expoPushToken.trim();
        if (tokenStr.length < 10) {
            return res.status(400).json({ error: "Invalid expoPushToken" });
        }

        await User.findByIdAndUpdate(
            req.user.userId,
            { $addToSet: { expoPushTokens: tokenStr } },
            { new: true }
        );

        res.status(200).json({ ok: true });
    } catch (error) {
        console.error("Error saving expo push token:", error);
        res.status(500).json({ error: "Failed to save push token" });
    }
});

// Send a test push notification to the logged-in user's saved Expo tokens
router.post("/push-test", verifyToken, async (req, res) => {
    try {
        const { title, body, data } = req.body || {};
        const user = await User.findById(req.user.userId).lean();
        const tokens = Array.isArray(user?.expoPushTokens) ? user.expoPushTokens : [];
        if (tokens.length === 0) {
            return res.status(200).json({ ok: true, sent: 0, message: "No push tokens registered" });
        }

        const messages = tokens.map((to) => ({
            to,
            sound: "default",
            title: title || "LaChart",
            body: body || "Test notification",
            data: data && typeof data === "object" ? data : {}
        }));

        // Expo push API accepts up to 100 messages per request
        const chunkSize = 100;
        const chunks = [];
        for (let i = 0; i < messages.length; i += chunkSize) {
            chunks.push(messages.slice(i, i + chunkSize));
        }

        const results = [];
        for (const chunk of chunks) {
            const resp = await fetch("https://exp.host/--/api/v2/push/send", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                    "Accept-Encoding": "gzip, deflate"
                },
                body: JSON.stringify(chunk)
            });
            const json = await resp.json().catch(() => null);
            results.push({ status: resp.status, body: json });
        }

        res.status(200).json({ ok: true, sent: tokens.length, results });
    } catch (error) {
        console.error("Error sending test push:", error);
        res.status(500).json({ error: "Failed to send push" });
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
        if (!name || !surname) {
            console.log("Missing required fields");
            return res.status(400).json({ error: "Name and surname are required" });
        }

        console.log("Looking up coach with ID:", req.user.userId);
        const coach = await userDao.findById(req.user.userId);
        
        if (!coach || coach.role !== 'coach') {
            console.log("User is not a coach:", coach);
            return res.status(403).json({ error: "Access allowed only for coaches" });
        }

        // Check if email is already registered (only if email is provided)
        if (email) {
            const existingUser = await userDao.findByEmail(email.toLowerCase());
        if (existingUser) {
            console.log("Email already registered:", email);
            return res.status(400).json({ error: "Email is already registered" });
            }
        }

        // Generate temporary password
        const tempPassword = Math.random().toString(36).slice(-8);
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(tempPassword, salt);

        // Create new athlete
        const athleteData = {
            name,
            surname,
            email: email ? email.toLowerCase() : undefined,
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

        // Send email with instructions (only if email is provided)
        if (email) {
            try {
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_APP_PASSWORD
            }
        });

        const { generateEmailTemplate, getClientUrl } = require('../utils/emailTemplate');
        const clientUrl = getClientUrl();
        const registrationLink = `${clientUrl}/complete-registration/${athlete.registrationToken}`;
        
        const emailContent = `
            <p>Your coach <strong>${coach.name} ${coach.surname}</strong> has registered you in the LaChart system.</p>
            <p>To complete your registration and set your password, please click the button below.</p>
        `;
        
        await transporter.sendMail({
            from: {
                name: 'LaChart',
                address: process.env.EMAIL_USER
            },
            to: email.toLowerCase(),
            subject: 'Complete Your Registration in LaChart',
            html: generateEmailTemplate({
                title: 'Welcome to LaChart!',
                content: emailContent,
                buttonText: 'Complete Registration',
                buttonUrl: registrationLink,
                footerText: 'This link is valid for 7 days.'
            })
        });
                console.log("Successfully sent registration email");
            } catch (emailError) {
                console.error("Error sending email:", emailError);
                // Don't fail the request if email fails
            }
        }

        console.log("Successfully created athlete" + (email ? " and sent registration email" : ""));
        res.status(201).json({ 
            message: email 
                ? "Athlete successfully registered and email with instructions has been sent"
                : "Athlete successfully registered",
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

        const { generateEmailTemplate, getClientUrl } = require('../utils/emailTemplate');
        const clientUrl = getClientUrl();
        
        const emailContent = `
            <p>Dear <strong>${athlete.name} ${athlete.surname}</strong>,</p>
            <p>Your registration in LaChart has been successfully completed.</p>
            <p>You can now log in to the system using your email and password.</p>
        `;
        
        await transporter.sendMail({
            from: {
                name: 'LaChart',
                address: process.env.EMAIL_USER
            },
            to: athlete.email,
            subject: 'LaChart Registration Completed',
            html: generateEmailTemplate({
                title: 'Welcome to LaChart!',
                content: emailContent,
                buttonText: 'Log In',
                buttonUrl: `${clientUrl}/login`
            })
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
        if (req.body.powerZones) updateData.powerZones = req.body.powerZones;
        if (req.body.heartRateZones) updateData.heartRateZones = req.body.heartRateZones;
        if (req.body.units) updateData.units = req.body.units;
        if (req.body.notifications) updateData.notifications = req.body.notifications;

        console.log('Updating user profile:', { userId, updateData });
        console.log('Heart Rate Zones being saved:', JSON.stringify(req.body.heartRateZones, null, 2));

        const updatedUser = await userDao.updateUser(userId, updateData);
        
        console.log('Updated user heartRateZones:', JSON.stringify(updatedUser?.heartRateZones, null, 2));
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
            admin: updatedUser.admin,
            dateOfBirth: updatedUser.dateOfBirth,
            address: updatedUser.address,
            phone: updatedUser.phone,
            height: updatedUser.height,
            weight: updatedUser.weight,
            sport: updatedUser.sport,
            specialization: updatedUser.specialization,
            bio: updatedUser.bio,
            avatar: updatedUser.avatar,
            coachId: updatedUser.coachId,
            athletes: updatedUser.athletes,
            powerZones: updatedUser.powerZones, // Include power zones
            heartRateZones: updatedUser.heartRateZones, // Include heart rate zones
            units: updatedUser.units || { distance: 'metric', weight: 'kg', temperature: 'celsius' }, // Include units
            notifications: updatedUser.notifications || {
                emailNotifications: true,
                trainingReminders: true,
                weeklyReports: true,
                achievementAlerts: true
            },
            strava: updatedUser.strava ? {
                athleteId: updatedUser.strava.athleteId,
                autoSync: updatedUser.strava.autoSync !== undefined ? updatedUser.strava.autoSync : false,
                lastSyncDate: updatedUser.strava.lastSyncDate
            } : null
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
            // If coach is loading their own trainings (athleteId === userId), allow access
            if (athleteId.toString() === userId.toString()) {
                // Coach can view their own trainings
            } else {
                // Coach is loading trainings for an athlete - check if athlete belongs to coach
            const athlete = await userDao.findById(athleteId);
            if (!athlete) {
                return res.status(404).json({ error: "Athlete not found" });
            }
            if (!athlete.coachId || athlete.coachId.toString() !== userId.toString()) {
                return res.status(403).json({ error: "This athlete does not belong to your team" });
                }
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
            avatar: athlete.avatar, // Include avatar
            coachId: athlete.coachId
        };

        res.status(200).json(athleteResponse);
    } catch (error) {
        console.error("Error getting athlete profile:", error);
        res.status(500).json({ error: error.message });
    }
});

// Get athlete's profile INCLUDING zones/units (for dashboards/testing recommendations)
router.get("/athlete/:athleteId/profile", verifyToken, async (req, res) => {
    try {
        const userId = req.user.userId;
        const { athleteId } = req.params;

        const user = await userDao.findById(userId);
        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        // Allow access either to the athlete's coach or to the athlete for their own profile
        if (user.role === 'coach') {
            const athlete = await userDao.findById(athleteId);
            if (!athlete) {
                return res.status(404).json({ error: "Athlete not found" });
            }
            if (!athlete.coachId || athlete.coachId.toString() !== userId.toString()) {
                return res.status(403).json({ error: "This athlete does not belong to your team" });
            }
        } else if (user.role === 'athlete' && userId !== athleteId) {
            return res.status(403).json({ error: "You are not authorized to view this profile" });
        }

        const athlete = await userDao.findById(athleteId);
        if (!athlete) {
            return res.status(404).json({ error: "Athlete not found" });
        }

        // Return data without sensitive information (but include zones/units for analytics)
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
            avatar: athlete.avatar,
            coachId: athlete.coachId,
            powerZones: athlete.powerZones,
            heartRateZones: athlete.heartRateZones,
            units: athlete.units || { distance: 'metric', weight: 'kg', temperature: 'celsius' },
            strava: athlete.strava ? {
              athleteId: athlete.strava.athleteId,
              autoSync: athlete.strava.autoSync !== undefined ? athlete.strava.autoSync : false,
              lastSyncDate: athlete.strava.lastSyncDate
            } : null
        };

        res.status(200).json(athleteResponse);
    } catch (error) {
        console.error("Error getting athlete profile (with zones):", error);
        res.status(500).json({ error: error.message });
    }
});

// Get user profile (including power zones and units)
router.get("/profile", verifyToken, async (req, res) => {
    try {
        const userId = req.user.userId;
        const user = await userDao.findById(userId);

        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        // Hot endpoint: avoid heavy logs; enable only when explicitly debugging.
        if (process.env.DEBUG_PROFILE === '1') {
            console.log('Loading user profile - heartRateZones:', JSON.stringify(user.heartRateZones, null, 2));
            console.log('Loading user profile - avatar from DB:', user.avatar);
            console.log('Loading user profile - strava.autoSync from DB:', user.strava?.autoSync);
        }

        // Return data without sensitive information
        const userResponse = {
            _id: user._id,
            name: user.name,
            surname: user.surname,
            email: user.email,
            role: user.role,
            admin: user.admin,
            dateOfBirth: user.dateOfBirth,
            address: user.address,
            phone: user.phone,
            height: user.height,
            weight: user.weight,
            sport: user.sport,
            specialization: user.specialization,
            bio: user.bio,
            avatar: user.avatar, // Include avatar
            coachId: user.coachId,
            powerZones: user.powerZones, // Include power zones
            heartRateZones: user.heartRateZones, // Include heart rate zones
            units: user.units || { distance: 'metric', weight: 'kg', temperature: 'celsius' }, // Include units
            notifications: user.notifications || {
              emailNotifications: true,
              trainingReminders: true,
              weeklyReports: true,
              achievementAlerts: true
            },
            strava: user.strava ? {
              athleteId: user.strava.athleteId,
              autoSync: user.strava.autoSync !== undefined ? user.strava.autoSync : false,
              lastSyncDate: user.strava.lastSyncDate
              // Don't include accessToken, refreshToken, expiresAt for security
            } : null
        };
        if (process.env.DEBUG_PROFILE === '1') {
            console.log('Returning user profile - avatar:', userResponse.avatar);
            console.log('Returning user profile - strava.autoSync:', userResponse.strava?.autoSync);
        }

        res.set('Cache-Control', 'private, max-age=60');
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

    const { generateEmailTemplate, getClientUrl } = require('../utils/emailTemplate');
    const clientUrl = getClientUrl();
    const registrationLink = `${clientUrl}/complete-registration/${registrationToken}`;

    const emailContent = `
      <p>Your coach has invited you again to the LaChart system.</p>
      <p>To complete your registration and set your password, please click the button below.</p>
    `;

    await transporter.sendMail({
      from: {
        name: 'LaChart',
        address: process.env.EMAIL_USER
      },
      to: athlete.email,
      subject: 'Complete Your Registration in LaChart',
      html: generateEmailTemplate({
        title: 'Welcome to LaChart!',
        content: emailContent,
        buttonText: 'Complete Registration',
        buttonUrl: registrationLink,
        footerText: 'This link is valid for 24 hours.'
      })
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

        const { generateEmailTemplate, getClientUrl } = require('../utils/emailTemplate');
        const clientUrl = getClientUrl();
        const invitationLink = `${clientUrl}/accept-invitation/${invitationToken}`;

        const emailContent = `
            <p>Your coach <strong>${coach.name} ${coach.surname}</strong> has invited you to their team in LaChart.</p>
            <p>To confirm the invitation, please click the button below.</p>
        `;

        await transporter.sendMail({
            from: {
                name: 'LaChart',
                address: process.env.EMAIL_USER
            },
            to: email,
            subject: 'Team Invitation in LaChart',
            html: generateEmailTemplate({
                title: 'Team Invitation',
                content: emailContent,
                buttonText: 'Confirm Invitation',
                buttonUrl: invitationLink,
                footerText: 'This link is valid for 7 days.'
            })
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

        const { generateEmailTemplate, getClientUrl } = require('../utils/emailTemplate');
        const clientUrl = getClientUrl();
        const invitationLink = `${clientUrl}/accept-coach-invitation/${invitationToken}`;
        
        const emailContent = `
            <p>Athlete <strong>${athlete.name} ${athlete.surname}</strong> has invited you to be their coach in LaChart.</p>
            <p>To accept the invitation, please click the button below.</p>
        `;
        
        await transporter.sendMail({
            from: {
                name: 'LaChart',
                address: process.env.EMAIL_USER
            },
            to: coach.email,
            subject: 'Coach Invitation in LaChart',
            html: generateEmailTemplate({
                title: 'Coach Invitation',
                content: emailContent,
                buttonText: 'Accept Invitation',
                buttonUrl: invitationLink,
                footerText: 'This link is valid for 7 days.'
            })
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

        // Update lastLogin timestamp
        await userDao.updateUser(user._id, { lastLogin: new Date() });

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

// Admin endpoints
// Get all users for admin dashboard
router.get("/admin/users", verifyToken, async (req, res) => {
    try {
        const currentUser = await userDao.findById(req.user.userId);
        if (!currentUser || !currentUser.admin) {
            return res.status(403).json({ error: "Access denied. Admin privileges required." });
        }

        const users = await userDao.findAll();
        const Event = require('../models/Event');

        // Fallback: compute login counts from Event logs (if loginCount is missing/0 on the user document)
        const loginCountsByUserId = new Map();
        try {
            const loginAgg = await Event.aggregate([
                { $match: { type: 'login', userId: { $ne: null } } },
                { $group: { _id: '$userId', count: { $sum: 1 } } }
            ]);
            loginAgg.forEach(row => {
                if (row && row._id) loginCountsByUserId.set(String(row._id), Number(row.count || 0));
            });
        } catch (e) {
            console.warn('[Admin Users] Failed to aggregate login events:', e.message);
        }
        
        // Get counts for each user
        console.log('Processing users for admin dashboard...');
        const usersWithCounts = await Promise.all(users.map(async (user) => {
            let trainingCount = 0;
            let testCount = 0;
            
            // Count trainings and tests for athletes
            if (user.role === 'athlete') {
                try {
                    const athleteIdStr = String(user._id);
                    console.log(`[Admin Users] Counting data for athlete ${user._id} (${user.name} ${user.surname}), athleteIdStr: ${athleteIdStr}`);
                    
                    const trainings = await trainingDao.findByAthleteId(athleteIdStr);
                    
                    // Get all tests and filter manually to handle any ID format mismatch
                    const allTests = await Test.find({});
                    const matchingTests = allTests.filter(t => {
                        const testAthleteId = String(t.athleteId || '');
                        const athleteId = athleteIdStr;
                        // Try exact match
                        if (testAthleteId === athleteId) return true;
                        // Try without any whitespace
                        if (testAthleteId.trim() === athleteId.trim()) return true;
                        // Try comparing ObjectId strings
                        try {
                            if (mongoose.Types.ObjectId.isValid(testAthleteId) && mongoose.Types.ObjectId.isValid(athleteId)) {
                                return new mongoose.Types.ObjectId(testAthleteId).equals(new mongoose.Types.ObjectId(athleteId));
                            }
                        } catch (e) {
                            // Ignore conversion errors
                        }
                        return false;
                    });
                    
                    trainingCount = trainings.length;
                    testCount = matchingTests.length;
                    console.log(`[Admin Users] Found ${trainingCount} trainings and ${testCount} tests for ${user.name}`);
                } catch (error) {
                    console.error(`[Admin Users] Error counting data for user ${user._id}:`, error);
                }
            }
            
            // Count trainings and tests for coaches (sum of all their athletes' data)
            if (user.role === 'coach') {
                try {
                    console.log(`[Admin Users] Counting data for coach ${user._id} (${user.name} ${user.surname})`);
                    // Find all athletes assigned to this coach
                    const athletes = await userDao.findAthletesByCoachId(user._id);
                    console.log(`[Admin Users] Found ${athletes.length} athletes for coach ${user.name}:`, athletes.map(a => `${a.name} ${a.surname} (${a._id})`));
                    
                    // Count trainings and tests for all athletes
                    for (const athlete of athletes) {
                        try {
                            const athleteIdStr = String(athlete._id);
                            const trainings = await trainingDao.findByAthleteId(athleteIdStr);
                            const tests = await Test.find({ athleteId: athleteIdStr });
                            const athleteTrainingCount = trainings.length;
                            const athleteTestCount = tests.length;
                            trainingCount += athleteTrainingCount;
                            testCount += athleteTestCount;
                            console.log(`[Admin Users] Athlete ${athlete.name} ${athlete.surname} (${athleteIdStr}): ${athleteTrainingCount} trainings, ${athleteTestCount} tests`);
                        } catch (error) {
                            console.error(`[Admin Users] Error counting data for athlete ${athlete._id}:`, error);
                        }
                    }
                    
                    // Also count coach's own data (coaches can also be athletes)
                    try {
                        const coachIdStr = String(user._id);
                        console.log(`[Admin Users] Looking for coach's own data with ID: ${coachIdStr} (original: ${user._id}, type: ${typeof user._id})`);
                        
                        // Get all tests and filter manually to handle any ID format mismatch
                        const allTests = await Test.find({});
                        const matchingTests = allTests.filter(t => {
                            const testAthleteId = String(t.athleteId || '');
                            const coachId = coachIdStr;
                            // Try exact match
                            if (testAthleteId === coachId) return true;
                            // Try without any whitespace
                            if (testAthleteId.trim() === coachId.trim()) return true;
                            // Try comparing ObjectId strings
                            try {
                                if (mongoose.Types.ObjectId.isValid(testAthleteId) && mongoose.Types.ObjectId.isValid(coachId)) {
                                    return new mongoose.Types.ObjectId(testAthleteId).equals(new mongoose.Types.ObjectId(coachId));
                                }
                            } catch (e) {
                                // Ignore conversion errors
                            }
                            return false;
                        });
                        
                        const ownTrainings = await trainingDao.findByAthleteId(coachIdStr);
                        const ownTrainingCount = ownTrainings.length;
                        const ownTestCount = matchingTests.length;
                        
                        trainingCount += ownTrainingCount;
                        testCount += ownTestCount;
                        
                        console.log(`[Admin Users] Coach's own data (${coachIdStr}): ${ownTrainingCount} trainings, ${ownTestCount} tests`);
                        
                        // Debug: Show sample of what's in DB if no tests found
                        if (ownTestCount === 0 && allTests.length > 0) {
                            const sampleTests = allTests.slice(0, 5);
                            console.log(`[Admin Users] Sample test athleteIds in DB:`, sampleTests.map(t => ({ 
                                testId: t._id, 
                                athleteId: t.athleteId, 
                                athleteIdType: typeof t.athleteId,
                                athleteIdString: String(t.athleteId),
                                coachIdStr: coachIdStr,
                                matches: String(t.athleteId) === coachIdStr
                            })));
                        }
                    } catch (error) {
                        // Ignore if coach has no own data
                        console.error(`[Admin Users] Error getting coach's own data:`, error);
                    }
                    
                    console.log(`[Admin Users] Total for coach ${user.name}: ${trainingCount} trainings, ${testCount} tests (from ${athletes.length} athletes + own)`);
                } catch (error) {
                    console.error(`[Admin Users] Error counting data for coach ${user._id}:`, error);
                }
            }
            
            // Ensure counts are numbers
            const finalTrainingCount = Number(trainingCount) || 0;
            const finalTestCount = Number(testCount) || 0;
            
            if (user.role === 'coach') {
                console.log(`[Admin Users] Coach ${user.name} ${user.surname} (${user._id}): trainingCount=${finalTrainingCount}, testCount=${finalTestCount}`);
            }
            
            return {
                _id: user._id,
                name: user.name,
                surname: user.surname,
                email: user.email,
                role: user.role,
                admin: user.admin,
                dateOfBirth: user.dateOfBirth,
                sport: user.sport,
                createdAt: user.createdAt,
                lastLogin: user.lastLogin,
                loginCount: (user.loginCount && Number(user.loginCount) > 0)
                    ? Number(user.loginCount)
                    : (loginCountsByUserId.get(String(user._id)) || 0),
                stravaConnected: !!(user.strava && user.strava.athleteId),
                strava: user.strava ? {
                    athleteId: user.strava.athleteId,
                    lastSyncDate: user.strava.lastSyncDate
                } : null,
                isActive: user.isActive !== false, // Default to true if not set
                trainingCount: finalTrainingCount,
                testCount: finalTestCount
            };
        }));

        res.status(200).json(usersWithCounts);
    } catch (error) {
        console.error("Error fetching users for admin:", error);
        res.status(500).json({ error: "Failed to fetch users" });
    }
});

// Send weekly report emails for last week (admin only)
router.post("/admin/send-weekly-reports/last-week", verifyToken, async (req, res) => {
    try {
        const currentUser = await userDao.findById(req.user.userId);
        if (!currentUser || !currentUser.admin) {
            return res.status(403).json({ error: "Access denied. Admin privileges required." });
        }

        const { getLastWeekRangeUTC, sendWeeklyReportsForWeek } = require('../services/weeklyReportService');
        const { weekStart, weekEnd } = getLastWeekRangeUTC(new Date());

        const result = await sendWeeklyReportsForWeek({ weekStart, weekEnd, force: true });
        res.status(200).json({
            ok: true,
            weekStart: weekStart.toISOString(),
            weekEnd: weekEnd.toISOString(),
            result
        });
    } catch (error) {
        console.error("Error sending weekly reports (admin):", error);
        res.status(500).json({ error: "Failed to send weekly reports: " + error.message });
    }
});

// Get admin dashboard statistics
router.get("/admin/stats", verifyToken, async (req, res) => {
    try {
        const currentUser = await userDao.findById(req.user.userId);
        if (!currentUser || !currentUser.admin) {
            return res.status(403).json({ error: "Access denied. Admin privileges required." });
        }

        const users = await userDao.findAll();
        
        // Get test statistics by sport
        const allTests = await Test.find({});
        const testsBySport = {
            run: 0,
            bike: 0,
            swim: 0,
            total: allTests.length
        };
        
        allTests.forEach(test => {
            const sport = test.sport || '';
            if (sport === 'run') {
                testsBySport.run++;
            } else if (sport === 'bike') {
                testsBySport.bike++;
            } else if (sport === 'swim') {
                testsBySport.swim++;
            }
        });
        
        const stats = {
            totalUsers: users.length,
            usersByRole: {
                admin: users.filter(u => u.role === 'admin').length,
                coach: users.filter(u => u.role === 'coach').length,
                athlete: users.filter(u => u.role === 'athlete').length
            },
            usersBySport: users.reduce((acc, user) => {
                const sport = user.sport || 'Not specified';
                acc[sport] = (acc[sport] || 0) + 1;
                return acc;
            }, {}),
            testsBySport: testsBySport,
            recentRegistrations: users
                .filter(u => u.createdAt && new Date(u.createdAt) > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))
                .length,
            activeUsers: users.filter(u => u.isActive !== false).length
        };

        res.status(200).json(stats);
    } catch (error) {
        console.error("Error fetching admin stats:", error);
        res.status(500).json({ error: "Failed to fetch statistics" });
    }
});

// Update user (admin only)
router.put("/admin/users/:userId", verifyToken, async (req, res) => {
    try {
        const currentUser = await userDao.findById(req.user.userId);
        if (!currentUser || !currentUser.admin) {
            return res.status(403).json({ error: "Access denied. Admin privileges required." });
        }

        const { userId } = req.params;
        const { name, surname, email, role, admin, isActive } = req.body;

        const updateData = {};
        if (name !== undefined) updateData.name = name;
        if (surname !== undefined) updateData.surname = surname;
        if (email !== undefined) updateData.email = email;
        if (role !== undefined) updateData.role = role;
        if (admin !== undefined) updateData.admin = admin;
        if (isActive !== undefined) updateData.isActive = isActive;

        const updatedUser = await userDao.updateUser(userId, updateData);
        if (!updatedUser) {
            return res.status(404).json({ error: "User not found" });
        }

        res.status(200).json({
            message: "User updated successfully",
            user: {
                _id: updatedUser._id,
                name: updatedUser.name,
                surname: updatedUser.surname,
                email: updatedUser.email,
                role: updatedUser.role,
                admin: updatedUser.admin,
                isActive: updatedUser.isActive
            }
        });
    } catch (error) {
        console.error("Error updating user:", error);
        res.status(500).json({ error: "Failed to update user" });
    }
});

// Delete user account and all associated data
router.delete("/delete-account", verifyToken, async (req, res) => {
    try {
        const userId = req.user.userId;
        const userIdString = userId.toString();

        // Find user to get coachId before deletion
        const user = await userDao.findById(userId);
        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        // Delete all FIT trainings
        const fitTrainingsDeleted = await FitTraining.deleteMany({ athleteId: userIdString });
        console.log(`Deleted ${fitTrainingsDeleted.deletedCount} FIT trainings`);

        // Delete all trainings
        const Training = require("../models/training");
        const trainingsDeleted = await Training.deleteMany({ athleteId: userIdString });
        console.log(`Deleted ${trainingsDeleted.deletedCount} trainings`);

        // Delete all tests
        const testsDeleted = await Test.deleteMany({ athleteId: userIdString });
        console.log(`Deleted ${testsDeleted.deletedCount} tests`);

        // Delete all lactate sessions
        const lactateSessionsDeleted = await LactateSession.deleteMany({ athleteId: userIdString });
        console.log(`Deleted ${lactateSessionsDeleted.deletedCount} lactate sessions`);

        // Delete all Strava activities
        const stravaActivitiesDeleted = await StravaActivity.deleteMany({ userId: userId });
        console.log(`Deleted ${stravaActivitiesDeleted.deletedCount} Strava activities`);

        // Delete all events
        const eventsDeleted = await Event.deleteMany({ userId: userId });
        console.log(`Deleted ${eventsDeleted.deletedCount} events`);

        // Remove user from coach's athletes list if user has a coach
        if (user.coachId) {
            await userDao.removeAthleteFromCoach(user.coachId, userId);
            console.log(`Removed user from coach's athletes list`);
        }

        // Remove all athletes from user if user is a coach
        if (user.athletes && user.athletes.length > 0) {
            for (const athleteId of user.athletes) {
                await userDao.updateUser(athleteId, { coachId: null });
            }
            console.log(`Removed coach from ${user.athletes.length} athletes`);
        }

        // Finally, delete the user account
        await userDao.deleteById(userId);
        console.log(`Deleted user account ${userId}`);

        res.status(200).json({ 
            message: "Account and all associated data deleted successfully",
            deletedData: {
                fitTrainings: fitTrainingsDeleted.deletedCount,
                trainings: trainingsDeleted.deletedCount,
                tests: testsDeleted.deletedCount,
                lactateSessions: lactateSessionsDeleted.deletedCount,
                stravaActivities: stravaActivitiesDeleted.deletedCount,
                events: eventsDeleted.deletedCount
            }
        });
    } catch (error) {
        console.error("Error deleting account:", error);
        res.status(500).json({ error: "Failed to delete account: " + error.message });
    }
});

// Fitness metrics endpoints
const fitnessMetricsController = require('../controllers/fitnessMetricsController');

// Get Form & Fitness chart data
router.get("/athlete/:athleteId/form-fitness", verifyToken, async (req, res) => {
    try {
        const { athleteId } = req.params;
        const days = parseInt(req.query.days) || 60;
        const sportFilter = req.query.sport || 'all'; // 'all', 'bike', 'run', 'swim'
        
        // Check if user has access to this athlete
        const user = await User.findById(req.user.userId);
        if (!user) {
            return res.status(401).json({ error: "User not found" });
        }

        if (user.role === 'coach') {
            // Coach can access their athletes
            const hasAccess = user.athletes && user.athletes.some(a => 
                String(a.athleteId) === String(athleteId) || String(a._id) === String(athleteId)
            );
            if (!hasAccess && String(user._id) !== String(athleteId)) {
                return res.status(403).json({ error: "Access denied" });
            }
        } else {
            // Regular user can only access their own data
            if (String(user._id) !== String(athleteId)) {
                return res.status(403).json({ error: "Access denied" });
            }
        }

        const data = await fitnessMetricsController.calculateFormFitnessData(athleteId, days, sportFilter);
        res.json(data);
    } catch (error) {
        console.error("Error getting form fitness data:", error);
        console.error("Error stack:", error.stack);
        res.status(500).json({ error: "Failed to get form fitness data: " + error.message });
    }
});

// Get today's metrics (Fitness, Fatigue, Form)
router.get("/athlete/:athleteId/today-metrics", verifyToken, async (req, res) => {
    try {
        const { athleteId } = req.params;
        
        // Check if user has access to this athlete
        const user = await User.findById(req.user.userId);
        if (!user) {
            return res.status(401).json({ error: "User not found" });
        }

        if (user.role === 'coach') {
            const hasAccess = user.athletes && user.athletes.some(a => 
                String(a.athleteId) === String(athleteId) || String(a._id) === String(athleteId)
            );
            if (!hasAccess && String(user._id) !== String(athleteId)) {
                return res.status(403).json({ error: "Access denied" });
            }
        } else {
            if (String(user._id) !== String(athleteId)) {
                return res.status(403).json({ error: "Access denied" });
            }
        }

        const metrics = await fitnessMetricsController.calculateTodayMetrics(athleteId);
        res.json(metrics);
    } catch (error) {
        console.error("Error getting today metrics:", error);
        res.status(500).json({ error: "Failed to get today metrics: " + error.message });
    }
});

// Get training status
router.get("/athlete/:athleteId/training-status", verifyToken, async (req, res) => {
    try {
        const { athleteId } = req.params;
        
        // Check if user has access to this athlete
        const user = await User.findById(req.user.userId);
        if (!user) {
            return res.status(401).json({ error: "User not found" });
        }

        if (user.role === 'coach') {
            const hasAccess = user.athletes && user.athletes.some(a => 
                String(a.athleteId) === String(athleteId) || String(a._id) === String(athleteId)
            );
            if (!hasAccess && String(user._id) !== String(athleteId)) {
                return res.status(403).json({ error: "Access denied" });
            }
        } else {
            if (String(user._id) !== String(athleteId)) {
                return res.status(403).json({ error: "Access denied" });
            }
        }

        const status = await fitnessMetricsController.calculateTrainingStatus(athleteId);
        res.json(status);
    } catch (error) {
        console.error("Error getting training status:", error);
        res.status(500).json({ error: "Failed to get training status: " + error.message });
    }
});

// Get weekly training load
router.get("/athlete/:athleteId/weekly-training-load", verifyToken, async (req, res) => {
    try {
        const { athleteId } = req.params;
        const months = parseInt(req.query.months) || 3;
        const sportFilter = req.query.sport || 'all'; // 'all', 'bike', 'run', 'swim'
        
        // Check if user has access to this athlete
        const user = await User.findById(req.user.userId);
        if (!user) {
            return res.status(401).json({ error: "User not found" });
        }

        if (user.role === 'coach') {
            const hasAccess = user.athletes && user.athletes.some(a => 
                String(a.athleteId) === String(athleteId) || String(a._id) === String(athleteId)
            );
            if (!hasAccess && String(user._id) !== String(athleteId)) {
                return res.status(403).json({ error: "Access denied" });
            }
        } else {
            if (String(user._id) !== String(athleteId)) {
                return res.status(403).json({ error: "Access denied" });
            }
        }

        const result = await fitnessMetricsController.calculateWeeklyTrainingLoad(athleteId, months, sportFilter);
        res.json(result);
    } catch (error) {
        console.error("Error getting weekly training load:", error);
        res.status(500).json({ error: "Failed to get weekly training load: " + error.message });
    }
});

module.exports = router;
