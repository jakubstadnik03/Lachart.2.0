const express = require("express");
const router = express.Router();
const rateLimit = require('express-rate-limit');
const mongoose = require("mongoose");

// H6 — 5 requests per 15 minutes for password/verification endpoints
const authActionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please wait 15 minutes before trying again.' },
  skip: (req) => req.method === 'OPTIONS',
});
const registerAbl = require("../abl/user-abl/register-abl");
const loginAbl = require("../abl/user-abl/login-abl");
const verifyToken = require("../middleware/verifyToken");
const { blacklistToken } = require("../middleware/authManager");
const UserDao = require("../dao/userDao");
const TrainingDao = require("../dao/trainingDao");
const forgotPasswordAbl = require("../abl/user-abl/forgot-password-abl");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { JWT_SECRET } = require("../config/jwt.config");
const { OAuth2Client } = require('google-auth-library');

const { saveRegistrationLocation, saveLoginLocation } = require("../utils/geoip");
const { resolveSignupMethodForProfile, publicRegistrationLocation } = require("../utils/signupMethod");

const userDao = new UserDao();
const trainingDao = new TrainingDao();
const Test = require("../models/test");
const FitTraining = require("../models/fitTraining");
const StravaActivity = require("../models/StravaActivity");
const LactateSession = require("../models/lactateSession");
const Event = require("../models/Event");
const User = require("../models/UserModel");
const { resolvePremiumForUserDocument } = require("../utils/premiumAccess");
const CoachOutreachLead = require("../models/CoachOutreachLead");
const { sendLactateTestReportEmail } = require("../services/lactateTestReportEmailService");
const {
  isCoachLikeRole,
  athleteHasCoachUser,
  mergeCoachIds,
  removeCoachFromAthleteIds,
  athleteCoachIdSet,
} = require("../utils/athleteCoachAccess");

/** Shared transporter: defaults to Zoho when only EMAIL_USER + APP_PASSWORD are set (avoids null transport). */
const { createEmailTransporter } = require("../utils/createEmailTransporter");
const { sendNotification, notifyCoachesOfAthlete } = require("../utils/notificationHelper");

/** Safe subset of Nodemailer/SMTP errors for admin-only responses (no secrets). */
function smtpDiagFromError(err) {
    if (!err || typeof err !== "object") return undefined;
    const code = err.code != null ? String(err.code) : undefined;
    const command = err.command != null ? String(err.command) : undefined;
    const responseCode = err.responseCode != null ? Number(err.responseCode) : undefined;
    if (!code && !command && responseCode == null) return undefined;
    return { code, command, responseCode };
}

function hasPendingInviteFromCoach(athlete, coachUser) {
    if (!athlete || !coachUser) return false;
    const coachId = String(coachUser._id || "");
    if (!coachId) return false;
    if (String(athlete.pendingCoachId || "") === coachId) return true;
    if (Array.isArray(coachUser.pendingAthleteIds)) {
        return coachUser.pendingAthleteIds.some((id) => String(id) === String(athlete._id));
    }
    return false;
}

/** Load linked coaches for an athlete (legacy coachId + coachIds). */
async function getAthleteCoachesPayload(athleteId) {
    const athlete = await userDao.findById(athleteId);
    if (!athlete) {
        return { coaches: [], coach: null };
    }
    // Migrate legacy single coachId into coachIds once
    if (athlete.coachId && (!athlete.coachIds || athlete.coachIds.length === 0)) {
        try {
            await userDao.updateUser(athlete._id, { coachIds: [athlete.coachId] });
            athlete.coachIds = [athlete.coachId];
        } catch (e) {
            console.warn("migrate coachIds legacy:", e);
        }
    }
    const ids = Array.from(athleteCoachIdSet(athlete));
    if (ids.length === 0) {
        return { coaches: [], coach: null };
    }
    const oids = ids.map((id) =>
        mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : id
    );
    const coachDocs = await User.find({ _id: { $in: oids } }).select("name surname email role");
    const coaches = coachDocs
        .filter((c) => isCoachLikeRole(c.role))
        .map((c) => ({
            _id: c._id,
            name: c.name,
            surname: c.surname,
            email: c.email,
            role: c.role,
        }));
    return { coaches, coach: coaches[0] || null };
}

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
        // In non-production, log only basic info (no password)
        if (process.env.NODE_ENV !== 'production') {
            console.log("Login request received:", { email: req.body?.email });
        }
        await loginAbl.login(req, res);
    } catch (error) {
        console.error("Login route error:", error);
        res.status(500).json({ error: "Login error" });
    }
});

// Verify email endpoint
router.get("/verify-email/:token", async (req, res) => {
    try {
        const { token } = req.params;
        
        if (!token) {
            return res.status(400).json({ error: "Verification token is required" });
        }

        // Find user by verification token
        const user = await User.findOne({ 
            emailVerificationToken: token,
            emailVerificationTokenExpires: { $gt: new Date() }
        });

        if (!user) {
            return res.status(404).json({ 
                error: "Invalid or expired verification token",
                message: "The verification link is invalid or has expired. Please request a new verification email."
            });
        }

        if (user.emailVerified) {
            return res.status(400).json({ 
                error: "Email already verified",
                message: "This email address has already been verified."
            });
        }

        // Update user to mark email as verified
        await User.findByIdAndUpdate(user._id, {
            emailVerified: true,
            emailVerificationToken: null,
            emailVerificationTokenExpires: null
        });

        res.status(200).json({ 
            success: true,
            message: "Email successfully verified",
            user: {
                _id: user._id,
                email: user.email,
                name: user.name,
                surname: user.surname
            }
        });
    } catch (error) {
        console.error("Error verifying email:", error);
        res.status(500).json({ error: "Failed to verify email", details: error.message });
    }
});

// Resend verification email endpoint — rate limited (H6)
router.post("/resend-verification-email", authActionLimiter, async (req, res) => {
    try {
        const { email } = req.body;
        
        if (!email) {
            return res.status(400).json({ error: "Email is required" });
        }

        const user = await User.findOne({ email: email.toLowerCase() });

        if (!user) {
            // Don't reveal if user exists for security
            return res.status(200).json({ 
                message: "If an account with this email exists, a verification email has been sent."
            });
        }

        if (user.emailVerified) {
            return res.status(400).json({ 
                error: "Email already verified",
                message: "This email address has already been verified."
            });
        }

        // Generate new verification token
        const crypto = require("crypto");
        const emailVerificationToken = crypto.randomBytes(32).toString('hex');
        const emailVerificationTokenExpires = new Date();
        emailVerificationTokenExpires.setHours(emailVerificationTokenExpires.getHours() + 24); // 24 hours

        // Update user with new token
        await User.findByIdAndUpdate(user._id, {
            emailVerificationToken: emailVerificationToken,
            emailVerificationTokenExpires: emailVerificationTokenExpires
        });

        // Send verification email
        const { sendEmailVerificationEmail } = require("../services/emailVerificationService");
        const emailResult = await sendEmailVerificationEmail(user, emailVerificationToken);

        if (!emailResult.sent) {
            console.error("Failed to send verification email:", emailResult.reason);
            return res.status(500).json({ 
                error: "Failed to send verification email",
                reason: emailResult.reason
            });
        }

        res.status(200).json({ 
            success: true,
            message: "Verification email sent successfully"
        });
    } catch (error) {
        console.error("Error resending verification email:", error);
        res.status(500).json({ error: "Failed to resend verification email", details: error.message });
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
        const coachRole = String(coach?.role || '').toLowerCase();
        const isCoachLikeUser = ['coach', 'tester', 'testing', 'admin'].includes(coachRole) ||
          (coach?.admin === true && coachRole !== 'athlete');

        if (!coach || !isCoachLikeUser) {
            return res.status(403).json({ error: "Access allowed only for coach/tester roles" });
        }

        const linkedAthletes = await userDao.findAthletesByCoachId(req.user.userId);
        const pendingByCoachFlag = await User.find({
            pendingCoachId: coach._id
        });
        const pendingByCoachList = Array.isArray(coach.pendingAthleteIds) && coach.pendingAthleteIds.length > 0
            ? await User.find({ _id: { $in: coach.pendingAthleteIds } })
            : [];

        const byId = new Map();
        [...linkedAthletes, ...pendingByCoachFlag, ...pendingByCoachList].forEach((athlete) => {
            if (!athlete?._id) return;
            const key = String(athlete._id);
            const isPendingInvite =
                (String(athlete.pendingCoachId || '') === String(coach._id) ||
                 (Array.isArray(coach.pendingAthleteIds) && coach.pendingAthleteIds.some((id) => String(id) === String(athlete._id)))) &&
                !athleteHasCoachUser(athlete, coach._id);

            byId.set(key, {
                ...athlete.toObject?.() || athlete,
                invitationPending: Boolean(isPendingInvite),
                coachLinkStatus: isPendingInvite ? 'pending' : 'active'
            });
        });

        res.status(200).json(Array.from(byId.values()));
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
            specialization,
            gender
        } = req.body;
        
        // Validate required fields
        if (!name || !surname) {
            console.log("Missing required fields");
            return res.status(400).json({ error: "Name and surname are required" });
        }

        console.log("Looking up coach with ID:", req.user.userId);
        const coach = await userDao.findById(req.user.userId);
        
        const addAthleteRole = String(coach?.role || '').toLowerCase();
        const isCoachLikeAdd = ['coach', 'tester', 'testing', 'admin'].includes(addAthleteRole) ||
          (coach?.admin === true && addAthleteRole !== 'athlete');
        if (!coach || !isCoachLikeAdd) {
            console.log("User is not in coach-like role:", coach);
            return res.status(403).json({ error: "Access allowed only for coach/tester roles" });
        }

        // ── Free-plan athlete limit ───────────────────────────────────────
        if (process.env.SUBSCRIPTION_ENABLED === 'true') {
            const { resolvePremiumForUserDocument } = require('../utils/premiumAccess');
            const fullCoach = await userDao.findById(req.user.userId);
            const { isPremium } = await resolvePremiumForUserDocument(fullCoach);
            if (!isPremium) {
                // Count athletes already assigned to this coach
                const User = require('../models/UserModel');
                const athleteCount = await User.countDocuments({ coachId: String(req.user.userId) });
                if (athleteCount >= 1) {
                    return res.status(403).json({
                        error: 'FREE_PLAN_LIMIT',
                        feature: 'athletes',
                        message: 'Free plan allows only 1 athlete. Upgrade to Coach plan to manage more athletes.'
                    });
                }
            }
        }
        // ─────────────────────────────────────────────────────────────────

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

        // Create new athlete (omit email when empty so DB allows multiple athletes without email)
        const athleteData = {
            name,
            surname,
            password: hashedPassword,
            signupMethod: 'coach_invite',
            role: 'athlete',
            dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : undefined,
            address: address || undefined,
            phone: phone || undefined,
            height: height ? Number(height) : undefined,
            weight: weight ? Number(weight) : undefined,
            sport: sport || undefined,
            specialization: specialization || undefined,
            gender: gender || 'male',
            coachId: coach._id,
            isRegistrationComplete: false,
            registrationToken: crypto.randomBytes(32).toString('hex'),
            registrationTokenExpires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
        };
        if (email && email.trim()) {
            athleteData.email = email.trim().toLowerCase();
        }

        const athlete = await userDao.createUser(athleteData);
        saveRegistrationLocation(userDao, athlete._id, req);

        // Add athlete to coach
        await userDao.addAthleteToCoach(coach._id, athlete._id);

        // Send email with instructions (only if email is provided)
        if (email) {
            try {
        const transporter = createEmailTransporter();
        if (!transporter) {
            return res.status(503).json({
                error: "Email is not configured on the server.",
                reason: "Set EMAIL_USER/EMAIL_APP_PASSWORD (and optionally SMTP_HOST/SMTP_PORT/SMTP_SECURE) in server .env to send emails."
            });
        }

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
        const transporter = createEmailTransporter();
        if (!transporter) {
            return res.status(503).json({
                error: "Email is not configured on the server.",
                reason: "Set EMAIL_USER/EMAIL_APP_PASSWORD (and optionally SMTP_HOST/SMTP_PORT/SMTP_SECURE) in server .env to send emails."
            });
        }

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
        
        if (!coach || !['coach', 'tester', 'testing'].includes(coach.role)) {
            return res.status(403).json({ error: "Access allowed only for coach/tester roles" });
        }

        const athlete = await userDao.findById(req.params.athleteId);
        if (!athlete) {
            return res.status(404).json({ error: "Athlete not found" });
        }

        const hasPendingInviteFromCoach =
            String(athlete.pendingCoachId || '') === String(coach._id) ||
            (Array.isArray(coach.pendingAthleteIds) && coach.pendingAthleteIds.some((id) => String(id) === String(athlete._id)));
        if (!athleteHasCoachUser(athlete, coach._id) && !hasPendingInviteFromCoach) {
            return res.status(403).json({ error: "You are not authorized to remove this athlete" });
        }

        // Remove athlete from coach's list
        await userDao.removeAthleteFromCoach(coach._id, athlete._id);
        await User.findByIdAndUpdate(coach._id, { $pull: { pendingAthleteIds: athlete._id } });

        // Unlink coach from athlete profile (never delete athlete account here).
        // Handles both legacy single-coach and new multi-coach schema.
        const nextCoachLinks = removeCoachFromAthleteIds(athlete, coach._id);
        const athleteUpdate = {
            coachIds: nextCoachLinks.coachIds,
            coachId: nextCoachLinks.coachId
        };
        if (String(athlete.pendingCoachId || '') === String(coach._id)) {
            athleteUpdate.pendingCoachId = null;
            athleteUpdate.invitationToken = null;
            athleteUpdate.invitationSentAt = null;
        }
        await userDao.updateUser(athlete._id, athleteUpdate);

        res.status(200).json({ message: "Athlete successfully unlinked from coach" });
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
            role,
            dateOfBirth,
            address,
            phone,
            height,
            weight,
            sport,
            specialization,
            gender,
            bio
        } = req.body;

        // Validate data
        const updateData = {};
        if (name) updateData.name = name;
        if (surname) updateData.surname = surname;
        if (role && ['coach', 'athlete'].includes(role)) updateData.role = role;
        if (dateOfBirth) updateData.dateOfBirth = new Date(dateOfBirth);
        if (address) updateData.address = address;
        if (phone) updateData.phone = phone;
        if (height) updateData.height = Number(height);
        if (weight) updateData.weight = Number(weight);
        if (sport) updateData.sport = sport;
        if (specialization) updateData.specialization = specialization;
        if (gender) updateData.gender = gender;
        if (bio) updateData.bio = bio;

        // Load current user to snapshot previous zones into history before updating
        const existingUser = await userDao.findById(userId);
        if (existingUser) {
            if (updateData.role === 'coach') {
                // Ensure coach has an athletes array for downstream code.
                if (!Array.isArray(existingUser.athletes)) {
                    updateData.athletes = [];
                }
            }
            // Archive previous power zones if they exist and new ones are provided
            if (req.body.powerZones && existingUser.powerZones && Object.keys(existingUser.powerZones || {}).length > 0) {
                existingUser.powerZonesHistory = existingUser.powerZonesHistory || [];
                existingUser.powerZonesHistory.push({
                    zones: existingUser.powerZones,
                    source: req.body.zonesSource || 'profile',
                    note: req.body.zonesNote || null,
                    createdAt: new Date()
                });
                updateData.powerZonesHistory = existingUser.powerZonesHistory;
                updateData.powerZones = req.body.powerZones;
            } else if (req.body.powerZones) {
                updateData.powerZones = req.body.powerZones;
            }

            // Archive previous HR zones if they exist and new ones are provided
            if (req.body.heartRateZones && existingUser.heartRateZones && Object.keys(existingUser.heartRateZones || {}).length > 0) {
                existingUser.heartRateZonesHistory = existingUser.heartRateZonesHistory || [];
                existingUser.heartRateZonesHistory.push({
                    zones: existingUser.heartRateZones,
                    source: req.body.zonesSource || 'profile',
                    note: req.body.zonesNote || null,
                    createdAt: new Date()
                });
                updateData.heartRateZonesHistory = existingUser.heartRateZonesHistory;
                updateData.heartRateZones = req.body.heartRateZones;
            } else if (req.body.heartRateZones) {
                updateData.heartRateZones = req.body.heartRateZones;
            }
        } else {
            if (req.body.powerZones) updateData.powerZones = req.body.powerZones;
            if (req.body.heartRateZones) updateData.heartRateZones = req.body.heartRateZones;
        }
        if (req.body.units) updateData.units = req.body.units;
        if (req.body.notifications) updateData.notifications = req.body.notifications;
        // Training preferences (RPE scale, pace display, zones method, custom
        // zones). Merge against the existing document so partial updates
        // don't wipe other fields, since SettingsPage sends one prop at a
        // time (e.g. just paceDisplay) and we don't want to reset the rest.
        if (req.body.trainingPreferences && typeof req.body.trainingPreferences === 'object') {
            const existingTp = existingUser?.trainingPreferences
                ? (typeof existingUser.trainingPreferences.toObject === 'function'
                    ? existingUser.trainingPreferences.toObject()
                    : { ...existingUser.trainingPreferences })
                : {};
            updateData.trainingPreferences = {
                ...existingTp,
                ...req.body.trainingPreferences,
                // Preserve the customZones sub-object across partial updates.
                customZones: {
                    ...(existingTp.customZones || {}),
                    ...(req.body.trainingPreferences.customZones || {}),
                },
            };
        }
        if (req.body.onboarding && typeof req.body.onboarding === 'object') {
            const existing = await userDao.findById(userId);
            const current = existing?.onboarding
                ? (typeof existing.onboarding.toObject === 'function' ? existing.onboarding.toObject() : { ...existing.onboarding })
                : { basicProfileDone: false, unitsDone: false, trainingZonesDone: false, walkthroughDone: false };
            const ob = req.body.onboarding;
            updateData.onboarding = {
                basicProfileDone: ob.basicProfileDone === true || current.basicProfileDone === true,
                unitsDone: ob.unitsDone === true || current.unitsDone === true,
                trainingZonesDone: ob.trainingZonesDone === true || current.trainingZonesDone === true,
                walkthroughDone: ob.walkthroughDone === true || current.walkthroughDone === true
            };
        }

        console.log('Updating user profile:', { userId, updateData });
        console.log('Heart Rate Zones being saved:', JSON.stringify(req.body.heartRateZones, null, 2));

        const updatedUser = await userDao.updateUser(userId, updateData);
        
        console.log('Updated user heartRateZones:', JSON.stringify(updatedUser?.heartRateZones, null, 2));
        if (!updatedUser) {
            return res.status(404).json({ error: "User not found" });
        }

        const premiumState = await resolvePremiumForUserDocument(updatedUser);

        // Return updated data without sensitive information
        const userResponse = {
            _id: updatedUser._id,
            name: updatedUser.name,
            surname: updatedUser.surname,
            email: updatedUser.email,
            role: updatedUser.role,
            admin: updatedUser.admin,
            premium: updatedUser.premium === true,
            isPremium: premiumState.isPremium,
            premiumSource: premiumState.source,
            dateOfBirth: updatedUser.dateOfBirth,
            address: updatedUser.address,
            phone: updatedUser.phone,
            height: updatedUser.height,
            weight: updatedUser.weight,
            sport: updatedUser.sport,
            specialization: updatedUser.specialization,
            gender: updatedUser.gender || 'male',
            bio: updatedUser.bio,
            avatar: updatedUser.avatar,
            coachId: updatedUser.coachId,
            athletes: updatedUser.athletes,
            powerZones: updatedUser.powerZones, // Include power zones
            heartRateZones: updatedUser.heartRateZones, // Include heart rate zones
            units: updatedUser.units || { distance: 'metric', weight: 'kg', temperature: 'celsius' }, // Include units
            trainingPreferences: updatedUser.trainingPreferences || {
                rpeScale: 'rpe',
                paceDisplay: 'minpkm',
                zonesMethod: 'lactate',
                customZones: { enabled: false },
            },
            notifications: updatedUser.notifications || {
                emailNotifications: true,
                trainingReminders: true,
                weeklyReports: true,
                achievementAlerts: true
            },
            onboarding: updatedUser.onboarding || { basicProfileDone: false, unitsDone: false, trainingZonesDone: false, walkthroughDone: false },
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

// Get history of training zones (power + HR) for current user
router.get("/zones/history", verifyToken, async (req, res) => {
    try {
        const user = await userDao.findById(req.user.userId);
        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        res.status(200).json({
            powerZonesHistory: user.powerZonesHistory || [],
            heartRateZonesHistory: user.heartRateZonesHistory || []
        });
    } catch (error) {
        console.error("Error fetching zone history:", error);
        res.status(500).json({ error: "Failed to fetch zone history" });
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
            gender,
            bio
        } = req.body;

        // Check if user has coach-like permissions
        const coach = await userDao.findById(coachId);
        if (!coach || !['coach', 'tester', 'testing'].includes(coach.role)) {
            return res.status(403).json({ error: "Access allowed only for coach/tester roles" });
        }

        // Check if athlete belongs to the coach
        const athlete = await userDao.findById(athleteId);
        if (!athlete) {
            return res.status(404).json({ error: "Athlete not found" });
        }
        if (!athleteHasCoachUser(athlete, coachId)) {
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
        if (gender) updateData.gender = gender;
        if (bio) updateData.bio = bio;

        // Snapshot zones history if coach updates zones for athlete (optional – future use)
        if (req.body.powerZones || req.body.heartRateZones) {
            if (athlete.powerZones && Object.keys(athlete.powerZones || {}).length > 0 && req.body.powerZones) {
                athlete.powerZonesHistory = athlete.powerZonesHistory || [];
                athlete.powerZonesHistory.push({
                    zones: athlete.powerZones,
                    source: req.body.zonesSource || 'coach',
                    note: req.body.zonesNote || null,
                    createdAt: new Date()
                });
                updateData.powerZonesHistory = athlete.powerZonesHistory;
                updateData.powerZones = req.body.powerZones;
            }
            if (athlete.heartRateZones && Object.keys(athlete.heartRateZones || {}).length > 0 && req.body.heartRateZones) {
                athlete.heartRateZonesHistory = athlete.heartRateZonesHistory || [];
                athlete.heartRateZonesHistory.push({
                    zones: athlete.heartRateZones,
                    source: req.body.zonesSource || 'coach',
                    note: req.body.zonesNote || null,
                    createdAt: new Date()
                });
                updateData.heartRateZonesHistory = athlete.heartRateZonesHistory;
                updateData.heartRateZones = req.body.heartRateZones;
            }
        }

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
            gender: updatedAthlete.gender || 'male',
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

// List coaches linked to the athlete (supports multiple coaches)
// NOTE: Must be declared before dynamic /athlete/:athleteId routes.
// Otherwise "/athlete/my-coaches" is interpreted as athleteId="my-coaches" and returns 403.
router.get("/athlete/my-coaches", verifyToken, async (req, res) => {
    try {
        const { coaches, coach } = await getAthleteCoachesPayload(req.user.userId);
        res.json({ coaches, coach });
    } catch (error) {
        console.error("Error listing coaches:", error);
        res.status(500).json({ error: "Error listing coaches" });
    }
});

// Get athlete's trainings
router.get("/athlete/:athleteId/trainings", verifyToken, async (req, res) => {
    try {
        const userId = req.user.userId;
        const { athleteId } = req.params;
        const uid = String(userId);
        const aid = String(athleteId);

        const user = await userDao.findById(userId);
        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        const roleLower = String(user.role || '').toLowerCase();

        // Allow access either to the athlete's coach/tester or to the athlete for their own trainings
        if (['coach', 'tester', 'testing'].includes(roleLower)) {
            if (aid === uid) {
                // Coach/tester viewing own trainings
            } else {
            const athlete = await userDao.findById(athleteId);
            if (!athlete) {
                return res.status(404).json({ error: "Athlete not found" });
            }
            if (!athleteHasCoachUser(athlete, userId)) {
                return res.status(403).json({ error: "This athlete does not belong to your team" });
                }
            }
        } else if (roleLower === 'athlete' && uid !== aid) {
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
        const uid = String(userId);
        const aid = String(athleteId);

        const user = await userDao.findById(userId);
        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        const roleLower = String(user.role || '').toLowerCase();

        // Allow access either to the athlete's coach/tester or to the athlete for their own profile
        if (['coach', 'tester', 'testing'].includes(roleLower)) {
            // Check for coach
            const athlete = await userDao.findById(athleteId);
            if (!athlete) {
                return res.status(404).json({ error: "Athlete not found" });
            }
            if (hasPendingInviteFromCoach(athlete, user)) {
                return res.status(403).json({ error: "Athlete invitation is pending confirmation" });
            }
            if (!athleteHasCoachUser(athlete, userId)) {
                return res.status(403).json({ error: "This athlete does not belong to your team" });
            }
        } else if (roleLower === 'athlete' && uid !== aid) {
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

        // Allow access either to the athlete's coach/tester or to the athlete for their own profile
        if (['coach', 'tester', 'testing'].includes(user.role)) {
            const athlete = await userDao.findById(athleteId);
            if (!athlete) {
                return res.status(404).json({ error: "Athlete not found" });
            }
            if (hasPendingInviteFromCoach(athlete, user)) {
                return res.status(403).json({ error: "Athlete invitation is pending confirmation" });
            }
            if (!athleteHasCoachUser(athlete, userId)) {
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

        const signup = resolveSignupMethodForProfile(user);
        const regLoc = publicRegistrationLocation(user);

        const premiumState = await resolvePremiumForUserDocument(user);

        // Return data without sensitive information
        const userResponse = {
            _id: user._id,
            name: user.name,
            surname: user.surname,
            email: user.email,
            role: user.role,
            admin: user.admin,
            premium: user.premium === true,
            isPremium: premiumState.isPremium,
            premiumSource: premiumState.source,
            createdAt: user.createdAt || null,
            signupMethod: signup.method,
            signupMethodSource: signup.source,
            registrationLocation: regLoc,
            lastLoginLocation: user.lastLoginLocation || null,
            dateOfBirth: user.dateOfBirth,
            address: user.address,
            phone: user.phone,
            height: user.height,
            weight: user.weight,
            sport: user.sport,
            specialization: user.specialization,
            gender: user.gender || 'male',
            bio: user.bio,
            avatar: user.avatar, // Include avatar
            coachId: user.coachId,
            coachIds: user.coachIds || [],
            powerZones: user.powerZones, // Include power zones
            heartRateZones: user.heartRateZones, // Include heart rate zones
            units: user.units || { distance: 'metric', weight: 'kg', temperature: 'celsius' }, // Include units
            trainingPreferences: user.trainingPreferences || {
              rpeScale: 'rpe',
              paceDisplay: 'minpkm',
              zonesMethod: 'lactate',
              customZones: { enabled: false },
            },
            notifications: user.notifications || {
              emailNotifications: true,
              trainingReminders: true,
              weeklyReports: true,
              achievementAlerts: true
            },
            onboarding: user.onboarding || { basicProfileDone: false, unitsDone: false, trainingZonesDone: false, walkthroughDone: false },
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
        const authHeader = req.headers.authorization;
        const token = authHeader && typeof authHeader === 'string' ? authHeader.split(' ')[1] : null;
        if (token) blacklistToken(token);
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

// Forgot password endpoint — rate limited (H6)
router.post("/forgot-password", authActionLimiter, async (req, res) => {
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
    const coach = await userDao.findById(coachId);
    if (!coach || !['coach', 'tester', 'testing'].includes(coach.role)) {
      return res.status(403).json({ success: false, message: 'Access allowed only for coach/tester roles' });
    }

    // Find athlete
    const athlete = await userDao.findById(athleteId);
    if (!athlete) {
      return res.status(404).json({ success: false, message: 'Athlete not found' });
    }

    // Check if athlete is assigned to coach OR pending under this coach
    const hasPendingInviteFromCoach =
      String(athlete.pendingCoachId || '') === String(coachId) ||
      (Array.isArray(coach.pendingAthleteIds) &&
        coach.pendingAthleteIds.some((id) => String(id) === String(athlete._id)));
    if (!athleteHasCoachUser(athlete, coachId) && !hasPendingInviteFromCoach) {
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
    const transporter = createEmailTransporter();

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
        if (!coach || !['coach', 'tester', 'testing'].includes(coach.role)) {
            return res.status(403).json({ error: "Access allowed only for coach/tester roles" });
        }

        // Find athlete by email — if not found, create a stub pre-registered account
        let athlete = await userDao.findByEmail(email);
        let isNewUser = false;

        if (!athlete) {
            // No account yet → create a pending stub so the invitation can be sent
            isNewUser = true;
            const salt = await bcrypt.genSalt(10);
            const stubPassword = await bcrypt.hash(crypto.randomBytes(16).toString('hex'), salt);
            athlete = await User.create({
                email: email.toLowerCase().trim(),
                name: '',
                surname: '',
                role: 'athlete',
                signupMethod: 'coach_invite',
                password: stubPassword,
                isPreRegistered: true,
            });
        } else if (athlete.role !== 'athlete') {
            return res.status(400).json({ error: "User with this email is not an athlete" });
        }

        // Already linked to this coach (multi-coach: block duplicate link only)
        if (athleteHasCoachUser(athlete, coachId)) {
            return res.status(400).json({ error: "This athlete is already on your team" });
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
        await User.findByIdAndUpdate(coach._id, {
            $addToSet: { pendingAthleteIds: athlete._id }
        });

        // Send invitation email
        const transporter = createEmailTransporter();

        const { generateEmailTemplate, getClientUrl } = require('../utils/emailTemplate');
        const clientUrl = getClientUrl();
        const invitationLink = `${clientUrl}/accept-invitation/${invitationToken}`;

        // Different email copy for brand-new vs existing users
        const emailContent = isNewUser
            ? `
                <p>Coach <strong>${coach.name} ${coach.surname}</strong> has invited you to join their team on LaChart — a platform for tracking training, lactate tests and athlete progress.</p>
                <p>Click the button below to create your free account and connect with your coach. It takes less than a minute.</p>
              `
            : `
                <p>Your coach <strong>${coach.name} ${coach.surname}</strong> has invited you to their team in LaChart.</p>
                <p>To confirm the invitation, please click the button below.</p>
              `;

        await transporter.sendMail({
            from: { name: 'LaChart', address: process.env.EMAIL_USER },
            to: email,
            subject: isNewUser ? `${coach.name} ${coach.surname} invited you to LaChart` : 'Team Invitation in LaChart',
            html: generateEmailTemplate({
                title: isNewUser ? 'You\'ve been invited to LaChart' : 'Team Invitation',
                content: emailContent,
                buttonText: isNewUser ? 'Create account & join team' : 'Confirm Invitation',
                buttonUrl: invitationLink,
                footerText: 'This link is valid for 7 days.'
            })
        });

        res.status(200).json({
            message: "Invitation successfully sent",
            isNewUser,
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

        // Link athlete and coach (supports multiple coaches)
        const mergedTeam = mergeCoachIds(athlete, coach._id);
        await userDao.updateUser(athlete._id, {
            coachIds: mergedTeam.coachIds,
            coachId: mergedTeam.coachId,
            invitationToken: null,
            invitationTokenExpires: null,
            pendingCoachId: null
        });
        await userDao.addAthleteToCoach(coach._id, athlete._id);
        await User.findByIdAndUpdate(coach._id, {
            $pull: { pendingAthleteIds: athlete._id }
        });

        // Send confirmation emails to both coach and athlete (best effort; do not block acceptance flow)
        const transporter = createEmailTransporter();
        const { generateEmailTemplate, getClientUrl } = require('../utils/emailTemplate');
        const clientUrl = getClientUrl();

        if (transporter) {
            try {
                if (coach?.email) {
                    const coachContent = `
                        <p>Hi ${coach.name},</p>
                        <p>Athlete <strong>${athlete.name} ${athlete.surname}</strong> has accepted your team invitation in LaChart.</p>
                        <p>They will now appear in your athletes list and you can view their shared data from your coach dashboard.</p>
                    `;

                    await transporter.sendMail({
                        from: {
                            name: 'LaChart',
                            address: process.env.EMAIL_USER
                        },
                        to: coach.email.toLowerCase(),
                        subject: 'Invitation Accepted – LaChart',
                        html: generateEmailTemplate({
                            title: 'Invitation Accepted',
                            content: coachContent,
                            loginButtonText: 'Open LaChart',
                            loginButtonUrl: clientUrl,
                            footerText: 'You can manage your athletes and invitations from your LaChart coach dashboard.'
                        })
                    });
                }

                if (athlete?.email) {
                    const athleteContent = `
                        <p>Hi ${athlete.name},</p>
                        <p>You have successfully confirmed your invitation and joined coach <strong>${coach.name} ${coach.surname}</strong> in LaChart.</p>
                        <p>Your account is now linked and your coach can work with your training data.</p>
                    `;

                    await transporter.sendMail({
                        from: {
                            name: 'LaChart',
                            address: process.env.EMAIL_USER
                        },
                        to: athlete.email.toLowerCase(),
                        subject: 'Team Invitation Confirmed – LaChart',
                        html: generateEmailTemplate({
                            title: 'Invitation Confirmed',
                            content: athleteContent,
                            loginButtonText: 'Open LaChart',
                            loginButtonUrl: clientUrl,
                            footerText: 'If this was not expected, contact support at lachart@lachart.net.'
                        })
                    });
                }
            } catch (emailError) {
                console.error('Invitation acceptance emails failed:', emailError?.message || emailError);
            }
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
        // needsRegistration = true when this is a stub account (invited but no name yet)
        res.status(200).json({
            _id: athlete._id,
            email: athlete.email,
            name: athlete.name,
            surname: athlete.surname,
            needsRegistration: !!(athlete.isPreRegistered || (!athlete.name && !athlete.surname)),
        });
    } catch (error) {
        console.error("Error verifying invitation token:", error);
        res.status(500).json({ error: error.message });
    }
});

// Complete registration for a new user who was invited by a coach (no existing account)
// POST /user/complete-registration/:token  { name, surname, password }
router.post("/complete-registration/:token", async (req, res) => {
    try {
        const { token } = req.params;
        const { name, surname, password } = req.body;

        if (!name || !surname || !password) {
            return res.status(400).json({ error: "Name, surname and password are required" });
        }
        if (password.length < 6) {
            return res.status(400).json({ error: "Password must be at least 6 characters" });
        }

        const athlete = await userDao.findByInvitationToken(token);
        if (!athlete) {
            return res.status(404).json({ error: "Invalid or expired invitation link" });
        }
        if (athlete.invitationTokenExpires < new Date()) {
            return res.status(400).json({ error: "This invitation link has expired" });
        }

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Get the coach before clearing pendingCoachId
        const coach = athlete.pendingCoachId ? await userDao.findById(athlete.pendingCoachId) : null;

        // Activate the account + link coach
        const mergedTeam = coach ? mergeCoachIds(athlete, coach._id) : { coachIds: athlete.coachIds || [], coachId: athlete.coachId || null };
        await userDao.updateUser(athlete._id, {
            name: name.trim(),
            surname: surname.trim(),
            password: hashedPassword,
            isPreRegistered: false,
            invitationToken: null,
            invitationTokenExpires: null,
            pendingCoachId: null,
            coachIds: mergedTeam.coachIds,
            coachId: mergedTeam.coachId,
        });

        if (coach) {
            await userDao.addAthleteToCoach(coach._id, athlete._id);
            await User.findByIdAndUpdate(coach._id, { $pull: { pendingAthleteIds: athlete._id } });

            // Notify coach (best-effort)
            try {
                const { generateEmailTemplate, getClientUrl } = require('../utils/emailTemplate');
                const transporter = createEmailTransporter();
                if (transporter && coach.email) {
                    await transporter.sendMail({
                        from: { name: 'LaChart', address: process.env.EMAIL_USER },
                        to: coach.email,
                        subject: 'New athlete joined your team – LaChart',
                        html: generateEmailTemplate({
                            title: 'Athlete joined your team',
                            content: `<p>Hi ${coach.name},</p><p><strong>${name.trim()} ${surname.trim()}</strong> accepted your invitation and created their LaChart account. They are now on your team.</p>`,
                            loginButtonText: 'Open LaChart',
                            loginButtonUrl: getClientUrl(),
                        })
                    });
                }
            } catch (_) { /* email is best-effort */ }
        }

        // Sign a JWT so the user is immediately logged in
        const jwtToken = jwt.sign(
            { userId: String(athlete._id), role: athlete.role },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.status(200).json({
            message: "Registration complete",
            token: jwtToken,
            user: {
                _id: athlete._id,
                name: name.trim(),
                surname: surname.trim(),
                email: athlete.email,
                role: athlete.role,
            }
        });
    } catch (error) {
        console.error("Error completing registration:", error);
        res.status(500).json({ error: error.message });
    }
});

// Remove coach from athlete (?coachId= for one coach; omit to remove all)
router.delete("/athlete/remove-coach", verifyToken, async (req, res) => {
    try {
        const athleteId = req.user.userId;
        const coachIdParam = req.query.coachId || req.body?.coachId;

        // Find athlete
        const athlete = await userDao.findById(athleteId);
        if (!athlete) {
            return res.status(404).json({ error: "Athlete not found" });
        }

        const linked = athleteCoachIdSet(athlete);
        if (linked.size === 0) {
            return res.status(400).json({ error: "Athlete does not have an assigned coach" });
        }

        const coachesToNotify = [];

        if (coachIdParam) {
            const cid = String(coachIdParam);
            if (!linked.has(cid)) {
                return res.status(400).json({ error: "That coach is not linked to your account" });
            }
            const next = removeCoachFromAthleteIds(athlete, cid);
            await userDao.updateUser(athleteId, {
                coachIds: next.coachIds,
                coachId: next.coachId
            });
            await userDao.removeAthleteFromCoach(cid, athleteId);
            const coach = await userDao.findById(cid);
            if (coach) coachesToNotify.push(coach);
        } else {
            const ids = Array.from(linked);
            for (const cid of ids) {
                await userDao.removeAthleteFromCoach(cid, athleteId);
                const c = await userDao.findById(cid);
                if (c) coachesToNotify.push(c);
            }
            await userDao.updateUser(athleteId, {
                coachId: null,
                coachIds: []
            });
        }

        const coach = coachesToNotify[0];
        const transporter = createEmailTransporter();

        // Use unified branded template for coach/athlete notifications
        const { generateEmailTemplate, getClientUrl } = require('../utils/emailTemplate');
        const clientUrl = getClientUrl();

        if (coach?.email) {
            const coachContent = `
                <p>Hi ${coach.name},</p>
                <p>Athlete <strong>${athlete.name} ${athlete.surname}</strong> has left your team in LaChart.</p>
                <p>You can still see their past tests and workouts that were already shared, but you will no longer receive new data from this athlete.</p>
            `;

            await transporter.sendMail({
                from: {
                    name: 'LaChart',
                    address: process.env.EMAIL_USER
                },
                to: coach.email.toLowerCase(),
                subject: 'Athlete Left Team',
                html: generateEmailTemplate({
                    title: 'Athlete Left Your Team',
                    content: coachContent,
                    loginButtonText: 'Open LaChart',
                    loginButtonUrl: clientUrl,
                    footerText: 'You can invite athletes to your team any time from your LaChart coach dashboard.'
                })
            });
        }

        if (athlete?.email) {
            const athleteContent = `
                <p>Hi ${athlete.name},</p>
                <p>You have successfully removed your coach${coach ? ` <strong>${coach.name} ${coach.surname}</strong>` : ''} in LaChart.</p>
                <p>Your tests, training data and thresholds stay safely stored in your account. You can continue using LaChart on your own or connect with another coach at any time.</p>
            `;

            await transporter.sendMail({
                from: {
                    name: 'LaChart',
                    address: process.env.EMAIL_USER
                },
                to: athlete.email.toLowerCase(),
                subject: 'Coach Removed from Your LaChart Account',
                html: generateEmailTemplate({
                    title: 'Coach Removed',
                    content: athleteContent,
                    loginButtonText: 'Go to LaChart',
                    loginButtonUrl: clientUrl,
                    footerText: 'You can add or change your coach in LaChart whenever you need. Your data always stays under your control.'
                })
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

// Get user by ID — M1: only self, coach, or admin may fetch a user profile
router.get("/user/:userId", verifyToken, async (req, res) => {
    try {
        const { userId } = req.params;
        const requesterId  = String(req.user.userId);
        const requesterDoc = await userDao.findById(requesterId);
        const role         = String(requesterDoc?.role || '').toLowerCase();
        const isPrivileged = ['admin', 'coach', 'tester', 'testing'].includes(role) || requesterDoc?.admin === true;

        if (!isPrivileged && requesterId !== String(userId)) {
            return res.status(403).json({ error: 'Access denied' });
        }

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

// Get coach profile for athlete (backward compatible: single `coach` + full `coaches` array)
router.get("/coach/profile", verifyToken, async (req, res) => {
    try {
        const { coaches, coach } = await getAthleteCoachesPayload(req.user.userId);
        res.json({
            ...(coach || {}),
            coaches,
            coach,
        });
    } catch (error) {
        console.error("Error getting coach profile:", error);
        res.status(500).json({ error: "Error getting coach profile" });
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

        // Find coach by email
        const coach = await userDao.findByEmail(email);
        console.log('Found coach:', coach);

        if (!coach) {
            console.log('Coach not found for email:', email);
            return res.status(404).json({ error: "Coach not found" });
        }

        // Verify coach-like role
        if (!isCoachLikeRole(coach.role)) {
            console.log('User is not a coach:', coach.role);
            return res.status(400).json({ error: "User with this email is not a coach" });
        }

        // Already linked to this coach (multi-coach allowed for others)
        if (athleteHasCoachUser(athlete, coach._id)) {
            console.log('Athlete already linked to this coach:', coach._id);
            return res.status(400).json({ error: "This coach is already linked to your account" });
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
        const transporter = createEmailTransporter();

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

        if (athleteHasCoachUser(athlete, coach._id)) {
            console.log('Athlete already linked to this coach:', coach._id);
            await userDao.updateUser(coach._id, {
                invitationToken: null,
                invitationTokenExpires: null,
                pendingAthleteId: null
            });
            return res.status(200).json({
                message: "Already linked to this coach",
                alreadyLinked: true,
                coach: {
                    _id: coach._id,
                    name: coach.name,
                    surname: coach.surname,
                    email: coach.email
                }
            });
        }

        const merged = mergeCoachIds(athlete, coach._id);
        console.log('Adding coach to athlete:', { athleteId: athlete._id, coachId: coach._id });
        await userDao.updateUser(athlete._id, {
            coachIds: merged.coachIds,
            coachId: merged.coachId
        });

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
        const transporter = createEmailTransporter();

        // Branded confirmation email to athlete when coach accepts the invitation
        const { generateEmailTemplate, getClientUrl } = require('../utils/emailTemplate');
        const clientUrl = getClientUrl();

        const acceptedContent = `
            <p>Hi ${athlete.name},</p>
            <p>Your coach <strong>${coach.name} ${coach.surname}</strong> has accepted your invitation in LaChart.</p>
            <p>Your coach is now connected to your account and can see your lactate tests, training zones and progress over time.</p>
        `;

        await transporter.sendMail({
            from: {
                name: 'LaChart',
                address: process.env.EMAIL_USER
            },
            to: athlete.email.toLowerCase(),
            subject: 'Coach Accepted Your Invitation',
            html: generateEmailTemplate({
                title: 'Invitation Accepted',
                content: acceptedContent,
                loginButtonText: 'Open LaChart',
                loginButtonUrl: clientUrl,
                footerText: 'You can manage your coach connection any time from your LaChart profile.'
            })
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
            return res.status(404).json({ error: 'Invitation not found' });
        }
        if (coach.invitationTokenExpires < new Date()) {
            return res.status(400).json({ error: 'Invitation has expired' });
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
        res.status(500).json({ error: 'Error verifying invitation' });
    }
});

// Google authentication endpoint
router.post("/google-auth", async (req, res) => {
    try {
        const googleClientId = process.env.GOOGLE_CLIENT_ID;
        if (!googleClientId) {
            console.error("Google auth: GOOGLE_CLIENT_ID is not set");
            return res.status(503).json({
                error: "Google sign-in is not configured on the server (missing GOOGLE_CLIENT_ID)."
            });
        }

        const { credential, role } = req.body;
        if (!credential) {
            return res.status(400).json({ error: "Missing Google credential" });
        }

        const normalizedRole = role && ['coach', 'athlete'].includes(role) ? role : 'athlete';

        // Accept both web and iOS client IDs as valid audiences
        // iOS native sign-in produces tokens with the iOS client ID as `aud`
        const validAudiences = [googleClientId];
        if (process.env.GOOGLE_IOS_CLIENT_ID) {
            validAudiences.push(process.env.GOOGLE_IOS_CLIENT_ID);
        }

        // Verify Google token
        const ticket = await client.verifyIdToken({
            idToken: credential,
            audience: validAudiences
        });
        
        const payload = ticket.getPayload();
        const { email, name, given_name, family_name, sub: googleId } = payload;

        if (!email || !googleId) {
            return res.status(400).json({ error: "Invalid Google token payload (missing email or subject)" });
        }

        // UserModel requires name/surname; Google may omit given_name/family_name
        const firstName = (given_name && String(given_name).trim()) || (name && String(name).split(/\s+/)[0]) || "User";
        const restFromFull = name && String(name).trim().includes(" ")
            ? String(name).trim().slice(String(name).trim().indexOf(" ") + 1).trim()
            : "";
        const lastName = (family_name && String(family_name).trim()) || restFromFull || "-";

        // Find or create user
        let user = await userDao.findByEmail(email);
        
        if (!user) {
            const emailVerificationToken = crypto.randomBytes(32).toString('hex');
            const emailVerificationTokenExpires = new Date();
            emailVerificationTokenExpires.setHours(emailVerificationTokenExpires.getHours() + 24);

            // Create new user if doesn't exist
            user = await userDao.createUser({
                email,
                name: firstName,
                surname: lastName,
                googleId,
                signupMethod: 'google',
                emailVerified: false,
                emailVerificationToken,
                emailVerificationTokenExpires,
                role: normalizedRole,
                athletes: normalizedRole === 'coach' ? [] : undefined,
                isRegistrationComplete: true,
                onboarding: {
                    basicProfileDone: false,
                    unitsDone: false,
                    trainingZonesDone: false,
                    walkthroughDone: false
                }
            });
            // Save registration location (fire-and-forget)
            saveRegistrationLocation(userDao, user._id, req);

            // Send verification email (best effort, should not block Google login).
            try {
                const { sendEmailVerificationEmail } = require("../services/emailVerificationService");
                const emailResult = await sendEmailVerificationEmail(user, emailVerificationToken);
                if (!emailResult?.sent) {
                    console.warn("Google signup verification email not sent:", emailResult?.reason);
                }
            } catch (emailError) {
                console.error("Google signup verification email error:", emailError);
            }
        } else if (!user.googleId) {
            // Link Google account to existing user
            user = await userDao.updateUser(user._id, { googleId });
        }

        // Role is only applied on first Google registration creation.

        // Use same secret as verifyToken (jwt.config fallback). process.env.JWT_SECRET alone is often unset on Render → jwt.sign throws → 500.
        const token = jwt.sign(
            { userId: String(user._id), role: user.role },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        // Update lastLogin + loginCount for all Google sign-ins (existing + new users)
        await userDao.update(user._id, {
            $set: { lastLogin: new Date() },
            $inc: { loginCount: 1 }
        });
        // Save login location and backfill registration location when missing.
        saveLoginLocation(userDao, user, req);

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
        console.error("Google auth error:", error?.message || error, error?.stack);
        const msg = error?.message || String(error);
        const isGoogleVerify =
            /audience|Token used too late|expired|Invalid token|Wrong number of segments/i.test(msg);
        res.status(500).json({
            error: "Google authentication failed",
            code: isGoogleVerify ? "GOOGLE_TOKEN_INVALID" : "GOOGLE_AUTH_ERROR",
            details: process.env.NODE_ENV === "development" ? msg : undefined
        });
    }
});

// ── Apple Sign In ──────────────────────────────────────────────────────────────
// Verifies an Apple identity token (produced by the iOS native plugin) and
// returns a LaChart JWT. Apple only sends the user's name on the FIRST login,
// so we fall back to "Apple User" if it's missing on subsequent logins.
router.post("/apple-auth", async (req, res) => {
    // App Store rejection 2.1(a) (submission 6d7103fa, May 2026) said the
    // Apple Sign In flow "displays an error message". Without per-step
    // logs in production we couldn't tell whether the reviewer hit a
    // token-verify failure, a database error, a JWT signing problem, or
    // something else. Walk the flow with explicit logging so every future
    // failure has a fingerprint in the Render logs that says exactly
    // which step bailed.
    const reqId = Math.random().toString(36).slice(2, 8);
    const log = (msg, extra) => console.log(`[AppleAuth ${reqId}] ${msg}`, extra ?? '');
    try {
        log('request received', {
            hasIdentityToken: !!req.body?.identityToken,
            tokenLength: req.body?.identityToken?.length ?? 0,
            hasUserPayload: !!req.body?.user,
            role: req.body?.role,
            userAgent: req.headers['user-agent']?.slice(0, 80),
        });
        const { identityToken, user: appleUser, role } = req.body;
        if (!identityToken) {
            log('rejected: missing identity token');
            return res.status(400).json({ error: "Missing Apple identity token" });
        }

        const appleSignin = require('apple-signin-auth');
        const expectedAudience = process.env.APPLE_BUNDLE_ID || 'com.lachart.app';
        log('verifying token', { expectedAudience });
        let applePayload;
        try {
            applePayload = await appleSignin.verifyIdToken(identityToken, {
                audience: expectedAudience,
                ignoreExpiration: false,
            });
            log('token verified', {
                sub: applePayload?.sub?.slice(0, 12) + '…', // truncated for privacy
                hasEmail: !!applePayload?.email,
                emailVerified: applePayload?.email_verified,
                iss: applePayload?.iss,
                aud: applePayload?.aud,
            });
        } catch (verifyErr) {
            // Surface the exact reason so the client (and logs) can tell whether
            // it's an audience mismatch, expired token, network issue fetching
            // Apple's JWKS, etc. Don't leak the raw token, but the reason is fine.
            const reason = verifyErr?.message || 'unknown verification error';
            const tokenAud = (() => {
                try {
                    const part = String(identityToken).split('.')[1];
                    return JSON.parse(Buffer.from(part, 'base64').toString('utf8'))?.aud;
                } catch { return null; }
            })();
            console.error(`[AppleAuth ${reqId}] Token verification failed:`, reason, {
                expectedAudience,
                tokenAud,
                audMatches: tokenAud === expectedAudience,
            });
            return res.status(401).json({
                error: 'Apple identity token is invalid or expired',
                reason,
                hint: tokenAud && tokenAud !== expectedAudience
                  ? `Bundle ID mismatch: token audience is "${tokenAud}" but server expected "${expectedAudience}". Set APPLE_BUNDLE_ID env on the server to match.`
                  : 'If reason mentions audience/aud, the iOS bundle ID does not match the server APPLE_BUNDLE_ID env variable.',
            });
        }

        const { sub: appleId, email } = applePayload;
        if (!appleId) {
            log('rejected: token has no subject');
            return res.status(400).json({ error: 'Apple token missing subject (user ID)' });
        }

        const normalizedRole = role && ['coach', 'athlete'].includes(role) ? role : 'athlete';

        // Apple only provides email on first sign-in. After that, look up by appleId.
        let user;
        try {
            user = await userDao.findOne({ appleId });
            if (!user && email) {
                user = await userDao.findByEmail(email);
                log('lookup by email', { found: !!user });
            } else {
                log('lookup by appleId', { found: !!user });
            }
        } catch (dbErr) {
            console.error(`[AppleAuth ${reqId}] database lookup failed:`, dbErr?.message || dbErr);
            return res.status(500).json({ error: 'User lookup failed', reason: dbErr?.message });
        }

        if (!user) {
            // First time — create account. Name may come from the client payload.
            const firstName = appleUser?.givenName || appleUser?.name?.split(' ')[0] || 'Apple';
            const lastName  = appleUser?.familyName || (appleUser?.name?.includes(' ') ? appleUser.name.split(' ').slice(1).join(' ') : 'User');
            const userEmail = email || `apple_${appleId}@privaterelay.appleid.com`;
            log('creating new user', { firstName, lastName, emailIsPrivateRelay: !email });

            user = await userDao.createUser({
                email: userEmail,
                name: firstName,
                surname: lastName,
                appleId,
                signupMethod: 'apple',
                emailVerified: true, // Apple verifies emails
                role: normalizedRole,
                isRegistrationComplete: true,
                onboarding: {
                    basicProfileDone: false,
                    unitsDone: false,
                    trainingZonesDone: false,
                    walkthroughDone: false,
                },
            });
            saveRegistrationLocation(userDao, user._id, req);
        } else if (!user.appleId) {
            // Link Apple ID to existing account (same email, different login method)
            user = await userDao.updateUser(user._id, { appleId });
        }

        const token = jwt.sign(
            { userId: String(user._id), role: user.role },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        await User.findByIdAndUpdate(user._id, {
            $set: { lastLogin: new Date() },
            $inc: { loginCount: 1 },
        });
        saveLoginLocation(userDao, user, req);

        log('success', { userId: String(user._id), isNewUser: user.loginCount === undefined || user.loginCount === 0 });
        res.json({
            token,
            user: {
                _id: user._id,
                role: user.role,
                name: user.name,
                surname: user.surname,
                email: user.email,
                appleId: user.appleId,
            },
        });
    } catch (error) {
        // Full stack trace + name so we can tell Mongoose validation
        // errors apart from JWT signing errors apart from anything else.
        console.error(`[AppleAuth ${reqId}] Unhandled error:`, {
            name: error?.name,
            message: error?.message,
            code: error?.code,
            stack: error?.stack?.split('\n').slice(0, 6).join('\n'),
        });
        res.status(500).json({ error: 'Apple authentication failed', reason: error?.message });
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

        // Validate password length (M9 — minimum 8 characters)
        if (newPassword.length < 8) {
            return res.status(400).json({ error: "New password must be at least 8 characters long" });
        }

        // Find user
        const user = await userDao.findById(userId);
        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        // If user has no password set (e.g., Google signup), they must use reset-password via email.
        if (!user.password || typeof user.password !== 'string' || user.password.trim() === '') {
            return res.status(400).json({
                error: "This account does not have a password set. Use 'Forgot password' to set a password via email.",
                reason: "no_password_set"
            });
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
                    
                    // Find tests - handle both ObjectId and String formats
                    const tests = await Test.find({
                        $or: [
                            { athleteId: athleteIdStr },
                            { athleteId: mongoose.Types.ObjectId.isValid(user._id) ? new mongoose.Types.ObjectId(user._id) : athleteIdStr }
                        ]
                    });
                    
                    trainingCount = trainings.length;
                    testCount = tests.length;
                    console.log(`[Admin Users] Found ${trainingCount} trainings and ${testCount} tests for ${user.name}`);
                } catch (error) {
                    console.error(`[Admin Users] Error counting data for user ${user._id}:`, error);
                }
            }
            
            // Count trainings and tests for coaches (sum of all their athletes' data).
            // Important: we only return a preview list of athletes (first N), so the admin UI doesn't pull everything at once.
            let athletesList = [];
            let athletesWithPasswordCount = 0;
            let athletesLinkedCount = 0; // includes athletes without password as well
            if (user.role === 'coach') {
                try {
                    const previewLimit = 20;
                    const { athletesLinkedToCoachQuery } = require('../utils/athleteCoachAccess');

                    const coachIdStr = String(user._id);
                    const athletesQuery = athletesLinkedToCoachQuery(user._id);

                    // Totals (used for labels and "load more" UI).
                    athletesLinkedCount = await User.countDocuments(athletesQuery);
                    athletesWithPasswordCount = await User.countDocuments({
                        ...athletesQuery,
                        password: { $exists: true, $ne: null, $ne: '' }
                    });

                    // Preview athletes for the coach (sorted by registration date / createdAt).
                    const athletesPreview = await User.find(athletesQuery)
                        .sort({ createdAt: -1 })
                        .limit(previewLimit)
                        .select('_id name surname email sport password lastLogin createdAt')
                        .lean();

                    const previewIdsWithPassword = athletesPreview
                        .filter(a => !!(a.password && typeof a.password === 'string' && a.password.trim() !== ''))
                        .map(a => String(a._id));

                    // Batch counts for the preview (only for athletes with password).
                    const previewTrainingCountMap = await trainingDao.countByAthleteIdsGrouped(previewIdsWithPassword);
                    const previewTestCountMap = new Map();
                    if (previewIdsWithPassword.length > 0) {
                        const testRows = await Test.aggregate([
                            { $match: { athleteId: { $in: previewIdsWithPassword } } },
                            { $group: { _id: '$athleteId', count: { $sum: 1 } } }
                        ]);
                        (testRows || []).forEach(r => previewTestCountMap.set(String(r._id), Number(r.count || 0)));
                    }

                    athletesList = athletesPreview.map(athlete => {
                        const hasPassword = !!(athlete.password && typeof athlete.password === 'string' && athlete.password.trim() !== '');
                        const athleteIdStr = String(athlete._id);
                        return {
                            _id: athlete._id,
                            name: athlete.name,
                            surname: athlete.surname,
                            email: athlete.email,
                            sport: athlete.sport,
                            hasPassword,
                            lastLogin: athlete.lastLogin || null,
                            createdAt: athlete.createdAt || null,
                            trainingCount: hasPassword ? (previewTrainingCountMap.get(athleteIdStr) || 0) : 0,
                            testCount: hasPassword ? (previewTestCountMap.get(athleteIdStr) || 0) : 0
                        };
                    });

                    // Coach totals (sum trainings/tests across all linked athletes with password).
                    // This still needs athleteIds, but we avoid N× queries by batching counts.
                    const allAthletesWithPassword = await User.find({
                        ...athletesQuery,
                        password: { $exists: true, $ne: null, $ne: '' }
                    }).select('_id').lean();

                    const athleteIdsWithPasswordAll = (allAthletesWithPassword || []).map(a => String(a._id));

                    if (athleteIdsWithPasswordAll.length > 0) {
                        trainingCount = await trainingDao.countByAthleteIds(athleteIdsWithPasswordAll);
                        testCount = await Test.countDocuments({ athleteId: { $in: athleteIdsWithPasswordAll } });
                    }

                    // Also count coach's own data (coaches can also be athletes) - only if not already included.
                    if (!athleteIdsWithPasswordAll.includes(coachIdStr)) {
                        const ownTrainingsCount = await trainingDao.countByAthleteIds([coachIdStr]);
                        const ownTestCount = await Test.countDocuments({ athleteId: coachIdStr });
                        trainingCount += ownTrainingsCount;
                        testCount += ownTestCount;
                    }
                } catch (error) {
                    console.error(`[Admin Users] Error counting data for coach ${user._id}:`, error);
                }
            }
            
            // Ensure counts are numbers
            const finalTrainingCount = Number(trainingCount) || 0;
            const finalTestCount = Number(testCount) || 0;

            const baseLoginCount = (user.loginCount && Number(user.loginCount) > 0)
                ? Number(user.loginCount)
                : (loginCountsByUserId.get(String(user._id)) || 0);

            // For athletes: if they never logged in, treat registration as the first "login"
            // so the admin UI shows the registration date and a non-zero login count.
            const effectiveLastLogin = user.role === 'athlete' && !user.lastLogin && user.createdAt
                ? user.createdAt
                : user.lastLogin;

            const effectiveLoginCount = user.role === 'athlete' && baseLoginCount === 0 && user.createdAt
                ? 1
                : baseLoginCount;
            
            if (user.role === 'coach') {
                console.log(`[Admin Users] Coach ${user.name} ${user.surname} (${user._id}): trainingCount=${finalTrainingCount}, testCount=${finalTestCount}`);
            }
            
            return {
                _id: user._id,
                name: user.name,
                surname: user.surname,
                email: user.email,
                hasPassword: !!(user.password),
                role: user.role,
                admin: user.admin,
                premium: user.premium === true,
                dateOfBirth: user.dateOfBirth,
                sport: user.sport,
                createdAt: user.createdAt,
                lastLogin: effectiveLastLogin,
                loginCount: effectiveLoginCount,
                stravaConnected: !!(user.strava && user.strava.athleteId),
                strava: user.strava ? {
                    athleteId: user.strava.athleteId,
                    lastSyncDate: user.strava.lastSyncDate
                } : null,
                units: user.units || { distance: 'metric', weight: 'kg', temperature: 'celsius' },
                isActive: user.isActive !== false, // Default to true if not set
                notifications: user.notifications || {
                    emailNotifications: true,
                    trainingReminders: true,
                    weeklyReports: true,
                    achievementAlerts: true
                },
                thankYouEmail: user.thankYouEmail || {
                    sent: false,
                    sentCount: 0,
                    lastSent: null
                },
                featureAnnouncementEmail: user.featureAnnouncementEmail || { sent: false, sentCount: 0, lastSent: null },
                stravaReminderEmail: user.stravaReminderEmail || {
                    sent: false,
                    sentCount: 0,
                    lastSent: null
                },
                trainingCount: finalTrainingCount,
                testCount: finalTestCount,
                athletes: user.role === 'coach' ? athletesList : undefined,
                athletesCount: user.role === 'coach' ? athletesWithPasswordCount : undefined,
                athletesLinkedCount: user.role === 'coach' ? athletesLinkedCount : undefined,
                registrationLocation: user.registrationLocation || null,
                lastLoginLocation: user.lastLoginLocation || null
            };
        }));

        res.status(200).json(usersWithCounts);
    } catch (error) {
        console.error("Error fetching users for admin:", error);
        res.status(500).json({ error: "Failed to fetch users" });
    }
});

// Admin endpoint: fetch athletes assigned to a specific coach with pagination.
// This avoids returning all athletes in one big `/admin/users` payload.
router.get("/admin/coach-athletes/:coachId", verifyToken, async (req, res) => {
    try {
        const currentUser = await userDao.findById(req.user.userId);
        if (!currentUser || !currentUser.admin) {
            return res.status(403).json({ error: "Access denied. Admin privileges required." });
        }

        const { coachId } = req.params;
        const limit = Math.min(Number(req.query.limit) || 20, 50);
        const offset = Math.max(Number(req.query.offset) || 0, 0);

        const { athletesLinkedToCoachQuery } = require('../utils/athleteCoachAccess');

        let coachIdObj = coachId;
        try {
            coachIdObj = mongoose.Types.ObjectId.isValid(coachId) ? new mongoose.Types.ObjectId(coachId) : coachId;
        } catch {
            coachIdObj = coachId;
        }

        const athletesQuery = athletesLinkedToCoachQuery(coachIdObj);

        const totalLinked = await User.countDocuments(athletesQuery);
        const totalWithPassword = await User.countDocuments({
            ...athletesQuery,
            password: { $exists: true, $ne: null, $ne: '' }
        });

        const athletesPage = await User.find(athletesQuery)
            .sort({ createdAt: -1 })
            .skip(offset)
            .limit(limit)
            .select('_id name surname email sport password lastLogin createdAt')
            .lean();

        const idsWithPassword = (athletesPage || [])
            .filter(a => !!(a.password && typeof a.password === 'string' && a.password.trim() !== ''))
            .map(a => String(a._id));

        const trainingCountMap = await trainingDao.countByAthleteIdsGrouped(idsWithPassword);
        const testCountMap = new Map();
        if (idsWithPassword.length > 0) {
            const testRows = await Test.aggregate([
                { $match: { athleteId: { $in: idsWithPassword } } },
                { $group: { _id: '$athleteId', count: { $sum: 1 } } }
            ]);
            (testRows || []).forEach(r => testCountMap.set(String(r._id), Number(r.count || 0)));
        }

        const athletes = (athletesPage || []).map(athlete => {
            const hasPassword = !!(athlete.password && typeof athlete.password === 'string' && athlete.password.trim() !== '');
            const athleteIdStr = String(athlete._id);
            return {
                _id: athlete._id,
                name: athlete.name,
                surname: athlete.surname,
                email: athlete.email,
                sport: athlete.sport,
                hasPassword,
                // Treat registration as the first "login" date for UI.
                lastLogin: athlete.lastLogin || athlete.createdAt || null,
                createdAt: athlete.createdAt || null,
                trainingCount: hasPassword ? (trainingCountMap.get(athleteIdStr) || 0) : 0,
                testCount: hasPassword ? (testCountMap.get(athleteIdStr) || 0) : 0
            };
        });

        const loaded = athletes.length;
        res.status(200).json({
            athletes,
            totalLinked,
            totalWithPassword,
            nextOffset: offset + loaded,
            hasMore: offset + loaded < totalLinked
        });
    } catch (error) {
        console.error("Error fetching coach athletes:", error);
        res.status(500).json({ error: "Failed to fetch coach athletes" });
    }
});

// Admin impersonation endpoint - allow admin to log in as another user without knowing their password
router.post("/admin/impersonate/:userId", verifyToken, async (req, res) => {
    try {
        // Verify that current user has admin privileges
        const currentUser = await userDao.findById(req.user.userId);
        if (!currentUser || !currentUser.admin) {
            return res.status(403).json({ error: "Access denied. Admin privileges required." });
        }

        const { userId } = req.params;
        const targetUser = await userDao.findById(userId);

        if (!targetUser) {
            return res.status(404).json({ error: "User not found" });
        }

        // Build token payload as if target user logged in
        const payload = {
            userId: targetUser._id,
            email: targetUser.email,
            role: targetUser.role,
            admin: targetUser.admin,
            // Track who initiated impersonation (for potential audit/logging)
            impersonatedBy: currentUser._id
        };

        const token = jwt.sign(payload, JWT_SECRET, { expiresIn: "12h" });

        return res.status(200).json({
            token,
            user: {
                _id: targetUser._id,
                email: targetUser.email,
                name: targetUser.name,
                surname: targetUser.surname,
                role: targetUser.role,
                admin: targetUser.admin
            }
        });
    } catch (error) {
        console.error("Admin impersonate error:", error);
        return res.status(500).json({ error: "Failed to impersonate user" });
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
        
        // Build country breakdown from registrationLocation
        const usersByCountry = {};
        users.forEach(u => {
            const country = u.registrationLocation?.country || 'Unknown';
            usersByCountry[country] = (usersByCountry[country] || 0) + 1;
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
            usersByCountry,
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

// Send reactivation email with latest lactate test (admin only)
router.post("/admin/send-reactivation-email/:userId", verifyToken, async (req, res) => {
    try {
        const currentUser = await userDao.findById(req.user.userId);
        if (!currentUser || !currentUser.admin) {
            return res.status(403).json({ error: "Access denied. Admin privileges required." });
        }

        if (!process.env.EMAIL_USER || !process.env.EMAIL_APP_PASSWORD) {
            return res.status(503).json({
                error: "Email is not configured on the server.",
                reason: "Set EMAIL_USER and EMAIL_APP_PASSWORD in server .env to send emails."
            });
        }

        const { userId } = req.params;
        const targetUser = await userDao.findById(userId);
        if (!targetUser) {
            return res.status(404).json({ error: "User not found" });
        }

        if (!targetUser.email) {
            return res.status(400).json({ error: "User has no email address configured" });
        }

        // Respect global emailNotifications preference
        if (targetUser.notifications && targetUser.notifications.emailNotifications === false) {
            return res.status(400).json({ error: "Email notifications are disabled for this user" });
        }

        // Find latest lactate test for this user
        const latestTest = await Test.findOne({ athleteId: String(targetUser._id) })
            .sort({ date: -1, createdAt: -1 })
            .exec();

        // Prefer sending the latest test report when available; otherwise send a generic reactivation email.
        if (latestTest) {
            const result = await sendLactateTestReportEmail({
                requesterUserId: currentUser._id,
                testId: latestTest._id,
                toEmail: targetUser.email,
                overrides: {
                    promo: true,
                    subject: "Your last lactate test in LaChart – plan your next block",
                    // Admin-triggered reactivation should not be blocked by user notification toggle.
                    ignoreEmailPreferences: true
                }
            });

            if (!result.sent) {
                return res.status(400).json({ error: "Failed to send email", reason: result.reason });
            }

            await userDao.updateUser(userId, {
                reactivationEmail: {
                    sent: true,
                    sentCount: (targetUser.reactivationEmail?.sentCount || 0) + 1,
                    lastSent: new Date()
                }
            });

            return res.status(200).json({ ok: true, message: "Reactivation email sent", testId: latestTest._id });
        }

        const { generateEmailTemplate, getClientUrl } = require('../utils/emailTemplate');
        const clientUrl = getClientUrl();
        const imageUrl = `${clientUrl}/images/lactate_testing.png`;
        const userName = targetUser.name || 'there';

        const emailContent = `
            <p>Hi ${userName},</p>
            <p>Just a quick note — you can get a lot more value from <strong>LaChart</strong> with a simple setup:</p>
            <ul style="margin: 15px 0; padding-left: 20px; line-height: 1.8;">
                <li>Connect Strava (optional) so your trainings sync automatically</li>
                <li>Create your first lactate test (or try the demo) to generate zones and recommendations</li>
                <li>Export/share results (email/PDF) once you have a test saved</li>
            </ul>
            <p style="margin-top: 22px;">
                <img src="${imageUrl}" alt="LaChart Lactate Testing" style="max-width: 100%; height: auto; border-radius: 8px; margin: 20px 0;" />
            </p>
            <p>If you have any questions, just reply to this email — I’ll help.</p>
            <p style="margin-top: 30px;">Thanks,<br/><strong>Jakub Stádník</strong><br/>Creator of LaChart</p>
        `;

        const transporter = createEmailTransporter();
        if (!transporter) {
            return res.status(503).json({
                error: "Email is not configured on the server.",
                reason: "SMTP transporter could not be created. Check SMTP_HOST/PORT or EMAIL_USER/EMAIL_APP_PASSWORD."
            });
        }

        await transporter.sendMail({
            from: {
                name: 'Jakub - LaChart',
                address: process.env.EMAIL_USER
            },
            to: targetUser.email,
            subject: 'Get the most out of LaChart',
            html: generateEmailTemplate({
                title: 'Welcome back',
                content: emailContent,
                buttonText: 'Open LaChart',
                buttonUrl: `${clientUrl}/login`,
                footerText: 'If you need help, reply to this email.'
            })
        });

        await userDao.updateUser(userId, {
            reactivationEmail: {
                sent: true,
                sentCount: (targetUser.reactivationEmail?.sentCount || 0) + 1,
                lastSent: new Date()
            }
        });

        return res.status(200).json({ ok: true, message: "Reactivation email sent (no test available)" });
    } catch (error) {
        console.error("Error sending reactivation email:", error);
      const code = error?.code ? String(error.code) : '';
      const rawMessage = error?.message ? String(error.message) : String(error);
      const reason = rawMessage || 'Unknown server error';

      // SMTP auth problems are configuration issues, not generic server failures.
      if (code === 'EAUTH' || rawMessage.includes('535 Authentication Failed')) {
        return res.status(400).json({
          error: 'SMTP authentication failed',
          reason: 'Check EMAIL_APP_PASSWORD for Zoho SMTP (must be the Zoho SMTP app password).'
        });
      }

      // Surface server-side reason to admin UI so failures are actionable.
      return res.status(500).json({
        error: "Failed to send reactivation email",
        reason,
        code: code || undefined
      });
    }
});

// Send thank you email to a specific user (admin only)
router.post("/admin/send-thank-you-email/:userId", verifyToken, async (req, res) => {
    try {
        const currentUser = await userDao.findById(req.user.userId);
        if (!currentUser || !currentUser.admin) {
            return res.status(403).json({ error: "Access denied. Admin privileges required." });
        }

        if (!process.env.EMAIL_USER || !process.env.EMAIL_APP_PASSWORD) {
            return res.status(503).json({
                error: "Email is not configured on the server.",
                reason: "Set EMAIL_USER and EMAIL_APP_PASSWORD in server .env to send emails."
            });
        }

        const { userId } = req.params;
        const targetUser = await userDao.findById(userId);
        if (!targetUser) {
            return res.status(404).json({ error: "User not found" });
        }

        if (!targetUser.email) {
            return res.status(400).json({ error: "User has no email address configured" });
        }

        // Respect global emailNotifications preference
        if (targetUser.notifications && targetUser.notifications.emailNotifications === false) {
            return res.status(400).json({ error: "Email notifications are disabled for this user" });
        }

        const { generateEmailTemplate, getClientUrl } = require('../utils/emailTemplate');
        const clientUrl = getClientUrl();
        const imageUrl = `${clientUrl}/images/lactate_testing.png`;

        const userName = targetUser.name || 'there';
        const userRole = targetUser.role === 'coach' ? 'coach' : 'athlete';

        const emailContent = `
            <p>Hi ${userName},</p>
            <p>I wanted to personally thank you for using <strong>LaChart</strong> 🙏</p>
            <p>Right now, it's a completely free project and I really care about making it truly useful in practice.</p>
            <p>I'd love to ask you a few questions – just one sentence each is fine:</p>
            <ol style="margin: 20px 0; padding-left: 20px;">
                <li style="margin-bottom: 10px;">What was the most difficult or unclear thing when you first used it?</li>
                <li style="margin-bottom: 10px;">What did you miss most after generating your lactate curve?</li>
                <li style="margin-bottom: 10px;">Do you use LaChart more as an athlete or as a coach?</li>
            </ol>
            <p>Every answer helps me improve the app in the right direction.</p>
            <p>If you'd like, I'm happy to reach out personally and show you what I'm working on now.</p>
            <p style="margin-top: 30px;">
                <img src="${imageUrl}" alt="LaChart Lactate Testing" style="max-width: 100%; height: auto; border-radius: 8px; margin: 20px 0;" />
            </p>
            <p style="margin-top: 20px;"><strong>LaChart Features:</strong></p>
            <ul style="margin: 15px 0; padding-left: 20px; line-height: 1.8;">
                <li>📊 Advanced lactate testing and analysis</li>
                <li>📈 Training load monitoring and TSS calculation</li>
                <li>🎯 Personalized training zones based on your tests</li>
                <li>📱 Strava integration for automatic activity tracking</li>
                <li>👥 Coach-athlete collaboration tools</li>
                <li>📧 Weekly training reports</li>
                <li>🔬 Power metrics and performance analytics</li>
                <li>📅 Training calendar and planning</li>
                <li>🏃 Multi-sport support (cycling, running, swimming)</li>
                <li>💪 Testing protocol recommendations</li>
            </ul>
            <p style="margin-top: 20px;">If you find LaChart useful, I'd be incredibly grateful if you could:</p>
            <ul style="margin: 15px 0; padding-left: 20px; line-height: 1.8;">
                <li>Share it with other athletes or coaches who might benefit</li>
                <li>Let me know your thoughts and feedback</li>
                <li>Tell me if you're a coach (I'm building features specifically for coaches)</li>
            </ul>
            <p style="margin-top: 30px;">Thanks again!</p>
            <p><strong>Jakub Stádník</strong><br/>Creator of LaChart<br/><a href="https://lachart.net" style="color: #767EB5;">https://lachart.net</a></p>
        `;

        const transporter = createEmailTransporter();
        if (!transporter) {
            return res.status(503).json({
                error: "Email is not configured on the server.",
                reason: "Set EMAIL_USER, EMAIL_APP_PASSWORD, and optionally SMTP_HOST/SMTP_PORT (or rely on default Zoho service)."
            });
        }

        await transporter.sendMail({
            from: {
                name: 'Jakub - LaChart',
                address: process.env.EMAIL_USER
            },
            to: targetUser.email,
            subject: 'Thank you for using LaChart 🙏',
            html: generateEmailTemplate({
                title: 'Thank you for using LaChart!',
                content: emailContent,
                buttonText: 'Open LaChart',
                buttonUrl: clientUrl,
                footerText: 'From the creator Jakub Stádník. I am trying to create a useful tool for coaches and athletes. Please let me know if you are using the app as a coach or as an athlete and if you understand the tools or need some more explanation.'
            })
        });

        // Update tracking only (atomic $set). Avoid userDao.updateUser + full document save — legacy
        // user docs can fail Mongoose validation on unrelated fields and surface as 500 after a successful send.
        const nextThankYouCount = (targetUser.thankYouEmail?.sentCount || 0) + 1;
        const trackResult = await User.updateOne(
            { _id: targetUser._id },
            {
                $set: {
                    'thankYouEmail.sent': true,
                    'thankYouEmail.sentCount': nextThankYouCount,
                    'thankYouEmail.lastSent': new Date()
                }
            }
        );
        if (trackResult.matchedCount === 0) {
            console.warn('[thank-you-email] tracking update matched no document', userId);
        }

        res.status(200).json({ ok: true, message: "Thank you email sent" });
    } catch (error) {
        console.error("Error sending thank you email:", error);
        const rawMessage = (error && (error.message || error.reason || String(error))) || "Send failed.";
        const rc = error && error.responseCode != null ? Number(error.responseCode) : null;
        const isAuthError =
            /invalid login|EAUTH|username and password|authentication failed|535|534/i.test(rawMessage) ||
            (error.code && String(error.code).toUpperCase().includes('EAUTH')) ||
            (rc != null && rc >= 530 && rc < 540);
        const isDbValidation = error && error.name === 'ValidationError';
        const isNetwork =
            /ETIMEDOUT|ECONNRESET|ECONNREFUSED|ESOCKET|socket|timeout/i.test(rawMessage) ||
            (error.code && /^(ETIMEDOUT|ECONNRESET|ECONNREFUSED|ESOCKET)$/i.test(String(error.code)));
        const errorTitle = isAuthError ? "Email credentials invalid. Check EMAIL_APP_PASSWORD (Zoho app password)." : "Failed to send thank you email";
        let reason = isAuthError
            ? rawMessage
            : isDbValidation
              ? "Saving user after send failed (validation). Check server logs."
              : isNetwork
                ? "SMTP connection issue (timeout or network). Retry in a moment."
                : process.env.NODE_ENV === 'development'
                  ? rawMessage
                  : "Check server logs. Common: invalid EMAIL_APP_PASSWORD, SMTP blocked, or transient provider errors.";
        if (isAuthError) {
            return res.status(400).json({
                error: 'SMTP authentication failed',
                reason: errorTitle,
                smtp: smtpDiagFromError(error)
            });
        }
        res.status(500).json({ error: errorTitle, reason, smtp: smtpDiagFromError(error) });
    }
});

// Send thank you email to all users (admin only)
router.post("/admin/send-thank-you-email/all", verifyToken, async (req, res) => {
    try {
        const currentUser = await userDao.findById(req.user.userId);
        if (!currentUser || !currentUser.admin) {
            return res.status(403).json({ error: "Access denied. Admin privileges required." });
        }

        // Get all active users with email notifications enabled
        const allUsers = await userDao.findAll();
        if (!Array.isArray(allUsers)) {
            console.error("userDao.findAll() did not return an array:", allUsers);
            return res.status(500).json({ error: "Failed to fetch users" });
        }

        const eligibleUsers = allUsers.filter(user => 
            user && 
            user.email && 
            typeof user.email === 'string' &&
            user.email.trim() !== '' &&
            (!user.notifications || user.notifications.emailNotifications !== false) &&
            user.isActive !== false
        );

        if (eligibleUsers.length === 0) {
            return res.status(200).json({ 
                ok: true, 
                message: "No eligible users found",
                successCount: 0,
                failCount: 0,
                total: 0
            });
        }

        const { generateEmailTemplate, getClientUrl } = require('../utils/emailTemplate');
        const clientUrl = getClientUrl();
        if (!clientUrl) {
            console.error("getClientUrl() returned undefined or null");
            return res.status(500).json({ error: "Failed to get client URL" });
        }

        const imageUrl = `${clientUrl}/images/lactate_testing.png`;

        if (!process.env.EMAIL_USER || !process.env.EMAIL_APP_PASSWORD) {
            return res.status(503).json({
                error: "Email is not configured on the server.",
                reason: "Set EMAIL_USER and EMAIL_APP_PASSWORD in server .env to send emails."
            });
        }

        const transporter = createEmailTransporter();

        let successCount = 0;
        let failCount = 0;
        const errors = [];

        // Send emails in batches to avoid rate limiting
        for (let i = 0; i < eligibleUsers.length; i++) {
            const user = eligibleUsers[i];
            try {
                if (!user || !user.email) {
                    console.warn(`Skipping user at index ${i}: missing email`);
                    failCount++;
                    errors.push({ email: user?.email || 'unknown', error: 'Missing email address' });
                    continue;
                }

                const userName = user.name || 'there';
                const userRole = user.role === 'coach' ? 'coach' : 'athlete';

                const emailContent = `
                    <p>Hi ${userName},</p>
                    <p>I wanted to personally thank you for using <strong>LaChart</strong> 🙏</p>
                    <p>Right now, it's a completely free project and I really care about making it truly useful in practice.</p>
                    <p>I'd love to ask you a few questions – just one sentence each is fine:</p>
                    <ol style="margin: 20px 0; padding-left: 20px;">
                        <li style="margin-bottom: 10px;">What was the most difficult or unclear thing when you first used it?</li>
                        <li style="margin-bottom: 10px;">What did you miss most after generating your lactate curve?</li>
                        <li style="margin-bottom: 10px;">Do you use LaChart more as an athlete or as a coach?</li>
                    </ol>
                    <p>Every answer helps me improve the app in the right direction.</p>
                    <p>If you'd like, I'm happy to reach out personally and show you what I'm working on now.</p>
                    <p style="margin-top: 30px;">
                        <img src="${imageUrl}" alt="LaChart Lactate Testing" style="max-width: 100%; height: auto; border-radius: 8px; margin: 20px 0;" />
                    </p>
                    <p style="margin-top: 20px;"><strong>LaChart Features:</strong></p>
                    <ul style="margin: 15px 0; padding-left: 20px; line-height: 1.8;">
                        <li>📊 Advanced lactate testing and analysis</li>
                        <li>📈 Training load monitoring and TSS calculation</li>
                        <li>🎯 Personalized training zones based on your tests</li>
                        <li>📱 Strava integration for automatic activity tracking</li>
                        <li>👥 Coach-athlete collaboration tools</li>
                        <li>📧 Weekly training reports</li>
                        <li>🔬 Power metrics and performance analytics</li>
                        <li>📅 Training calendar and planning</li>
                        <li>🏃 Multi-sport support (cycling, running, swimming)</li>
                        <li>💪 Training protocol recommendations</li>
                    </ul>
                    <p style="margin-top: 20px;">If you find LaChart useful, I'd be incredibly grateful if you could:</p>
                    <ul style="margin: 15px 0; padding-left: 20px; line-height: 1.8;">
                        <li>Share it with other athletes or coaches who might benefit</li>
                        <li>Let me know your thoughts and feedback</li>
                        <li>Tell me if you're a coach (I'm building features specifically for coaches)</li>
                    </ul>
                    <p style="margin-top: 30px;">Thanks again!</p>
                    <p><strong>Jakub Stádník</strong><br/>Creator of LaChart<br/><a href="https://lachart.net" style="color: #767EB5;">https://lachart.net</a></p>
                `;

                if (typeof generateEmailTemplate !== 'function') {
                    throw new Error('generateEmailTemplate is not a function');
                }

                const emailHtml = generateEmailTemplate({
                    title: 'Thank you for using LaChart!',
                    content: emailContent,
                    buttonText: 'Open LaChart',
                    buttonUrl: clientUrl,
                    footerText: 'From the creator Jakub Stádník. I am trying to create a useful tool for coaches and athletes. Please let me know if you are using the app as a coach or as an athlete and if you understand the tools or need some more explanation.'
                });

                if (!emailHtml || typeof emailHtml !== 'string') {
                    throw new Error('generateEmailTemplate did not return valid HTML');
                }

                await transporter.sendMail({
                    from: {
                        name: 'Jakub - LaChart',
                        address: process.env.EMAIL_USER
                    },
                    to: user.email.trim().toLowerCase(),
                    subject: 'Thank you for using LaChart 🙏',
                    html: emailHtml
                });

                const nextCount = (user.thankYouEmail?.sentCount || 0) + 1;
                await User.updateOne(
                    { _id: user._id },
                    {
                        $set: {
                            'thankYouEmail.sent': true,
                            'thankYouEmail.sentCount': nextCount,
                            'thankYouEmail.lastSent': new Date()
                        }
                    }
                );

                successCount++;
                
                // Small delay to avoid rate limiting
                if (i < eligibleUsers.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
            } catch (error) {
                failCount++;
                const errorMessage = error?.message || String(error) || 'Unknown error';
                errors.push({ email: user?.email || 'unknown', error: errorMessage });
                console.error(`Error sending email to ${user?.email || 'unknown'}:`, error);
            }
        }

        res.status(200).json({ 
            ok: true, 
            message: `Thank you emails sent: ${successCount} successful, ${failCount} failed`,
            successCount,
            failCount,
            total: eligibleUsers.length,
            errors: errors.length > 0 ? errors : undefined
        });
    } catch (error) {
        console.error("Error sending thank you emails to all users:", error);
        res.status(500).json({ error: "Failed to send thank you emails" });
    }
});

// Send feature announcement email to a specific user (admin only)
router.post("/admin/send-feature-announcement-email/:userId", verifyToken, async (req, res) => {
    try {
        const currentUser = await userDao.findById(req.user.userId);
        if (!currentUser || !currentUser.admin) {
            return res.status(403).json({ error: "Access denied. Admin privileges required." });
        }

        if (!process.env.EMAIL_USER || !process.env.EMAIL_APP_PASSWORD) {
            return res.status(503).json({
                error: "Email is not configured on the server.",
                reason: "Set EMAIL_USER and EMAIL_APP_PASSWORD in server .env to send emails."
            });
        }

        const { userId } = req.params;
        const { emailType = 'newFeatures' } = req.body; // 'newFeatures', 'googleLoginFix', 'improvements', 'tips', 'community', 'thresholdLogicUpdate'
        
        const targetUser = await userDao.findById(userId);
        if (!targetUser) {
            return res.status(404).json({ error: "User not found" });
        }

        if (!targetUser.email) {
            return res.status(400).json({ error: "User has no email address configured" });
        }

        // Respect global emailNotifications preference
        if (targetUser.notifications && targetUser.notifications.emailNotifications === false) {
            return res.status(400).json({ error: "Email notifications are disabled for this user" });
        }

        const { generateEmailTemplate, getClientUrl } = require('../utils/emailTemplate');
        const clientUrl = getClientUrl();
        const imageUrl = `${clientUrl}/images/lactate_testing.png`;

        const userName = targetUser.name || 'there';
        const userRole = targetUser.role === 'coach' ? 'coach' : 'athlete';

        // Different email templates based on emailType
        let emailContent = '';
        let subject = '';
        let title = '';
        let buttonText = 'Open LaChart';
        let buttonUrl = clientUrl;

        switch (emailType) {
            case 'newFeatures':
                title = 'New Features in LaChart 🚀';
                subject = 'New Features in LaChart 🚀';
                emailContent = `
                    <p>Hi ${userName},</p>
                    <p>I'm excited to share some new features I've added to <strong>LaChart</strong>!</p>
                    <p style="margin-top: 30px;">
                        <img src="${imageUrl}" alt="LaChart Lactate Testing" style="max-width: 100%; height: auto; border-radius: 8px; margin: 20px 0;" />
                    </p>
                    <h3 style="margin-top: 30px; color: #767EB5;">✨ What's New:</h3>
                    <ul style="margin: 15px 0; padding-left: 20px; line-height: 1.8;">
                        <li><strong>Population Insights:</strong> Compare your lactate thresholds with population data and see where you rank</li>
                        <li><strong>HR-First Test Planning:</strong> Get personalized test recommendations based on your Strava activities</li>
                        <li><strong>Enhanced Test Comparison:</strong> Compare multiple tests side-by-side with improved visualizations</li>
                        <li><strong>Better Lactate Curves:</strong> Improved polynomial regression for more accurate threshold detection</li>
                        <li><strong>Training Zones:</strong> More precise zone calculations based on your latest tests</li>
                    </ul>
                    <p style="margin-top: 20px;">These features are designed to make your training analysis even more powerful and insightful.</p>
                    <p style="margin-top: 20px;">I'd love to hear your feedback on these new features!</p>
                    <p style="margin-top: 30px;">Thanks for being part of the LaChart community!</p>
                    <p><strong>Jakub Stádník</strong><br/>Creator of LaChart<br/><a href="https://lachart.net" style="color: #767EB5;">https://lachart.net</a></p>
                `;
                break;
            case 'googleLoginFix':
                title = 'Google Login Fix + New Features in LaChart';
                subject = 'Google Login issue fixed + New Features in LaChart';
                emailContent = `
                    <p>Hi ${userName},</p>
                    <p>Quick update: the recent <strong>Google login issue has been fixed</strong> and should work normally now.</p>
                    <p style="margin-top: 30px;">
                        <img src="${imageUrl}" alt="LaChart Lactate Testing" style="max-width: 100%; height: auto; border-radius: 8px; margin: 20px 0;" />
                    </p>
                    <h3 style="margin-top: 30px; color: #767EB5;">What's new</h3>
                    <ul style="margin: 15px 0; padding-left: 20px; line-height: 1.8;">
                        <li><strong>Generate PDF from test:</strong> export a complete report directly from the lactate curve.</li>
                        <li><strong>Better swim support:</strong> improved pace units and interval handling.</li>
                        <li><strong>Smoother auth flow:</strong> less redirect flicker and better login feedback.</li>
                        <li><strong>More stable Strava sync:</strong> improved token handling and autosync reliability.</li>
                    </ul>
                    <p style="margin-top: 22px; margin-bottom: 10px;"><strong>Quick actions</strong></p>
                    <div style="margin: 10px 0 24px 0;">
                        <a href="${clientUrl}/login" style="display:inline-block;background:#767EB5;color:#ffffff;text-decoration:none;padding:10px 14px;border-radius:8px;margin-right:8px;margin-bottom:8px;">Login</a>
                        <a href="${clientUrl}/testing" style="display:inline-block;background:#1f8f55;color:#ffffff;text-decoration:none;padding:10px 14px;border-radius:8px;margin-right:8px;margin-bottom:8px;">Generate PDF from test</a>
                        <a href="${clientUrl}/settings" style="display:inline-block;background:#fc4c02;color:#ffffff;text-decoration:none;padding:10px 14px;border-radius:8px;margin-bottom:8px;">Connect Strava</a>
                    </div>
                    <p>Thanks for using LaChart${userRole === 'coach' ? ' with your athletes' : ''} - more updates are coming soon.</p>
                    <p style="margin-top: 30px;"><strong>Jakub Stádník</strong><br/>Creator of LaChart<br/><a href="https://lachart.net" style="color: #767EB5;">https://lachart.net</a></p>
                `;
                break;
            case 'improvements':
                title = 'LaChart Improvements & Updates 📈';
                subject = 'LaChart Improvements & Updates 📈';
                emailContent = `
                    <p>Hi ${userName},</p>
                    <p>I've been working hard to improve <strong>LaChart</strong> based on feedback from users like you!</p>
                    <p style="margin-top: 30px;">
                        <img src="${imageUrl}" alt="LaChart Lactate Testing" style="max-width: 100%; height: auto; border-radius: 8px; margin: 20px 0;" />
                    </p>
                    <h3 style="margin-top: 30px; color: #767EB5;">🔧 Recent Improvements:</h3>
                    <ul style="margin: 15px 0; padding-left: 20px; line-height: 1.8;">
                        <li><strong>Faster Performance:</strong> Optimized data loading and caching for smoother experience</li>
                        <li><strong>Better Accuracy:</strong> Improved threshold calculations for more reliable results</li>
                        <li><strong>Enhanced UI:</strong> Cleaner interface and better mobile experience</li>
                        <li><strong>Bug Fixes:</strong> Fixed issues with test comparison and curve generation</li>
                        <li><strong>Data Export:</strong> Improved export functionality for your test data</li>
                    </ul>
                    <p style="margin-top: 20px;">Your experience should be noticeably better now. Let me know if you notice any issues or have suggestions!</p>
                    <p style="margin-top: 30px;">Thanks for using LaChart!</p>
                    <p><strong>Jakub Stádník</strong><br/>Creator of LaChart<br/><a href="https://lachart.net" style="color: #767EB5;">https://lachart.net</a></p>
                `;
                break;
            case 'tips':
                title = 'Tips for Getting the Most Out of LaChart 💡';
                subject = 'Tips for Getting the Most Out of LaChart 💡';
                emailContent = `
                    <p>Hi ${userName},</p>
                    <p>I wanted to share some tips to help you get the most out of <strong>LaChart</strong>!</p>
                    <p style="margin-top: 30px;">
                        <img src="${imageUrl}" alt="LaChart Lactate Testing" style="max-width: 100%; height: auto; border-radius: 8px; margin: 20px 0;" />
                    </p>
                    <h3 style="margin-top: 30px; color: #767EB5;">💡 Pro Tips:</h3>
                    <ul style="margin: 15px 0; padding-left: 20px; line-height: 1.8;">
                        <li><strong>Regular Testing:</strong> Test every 4-6 weeks to track your progress accurately</li>
                        <li><strong>Base Lactate:</strong> Always measure baseline lactate before starting your test</li>
                        <li><strong>Compare Tests:</strong> Use the test comparison feature to see improvements over time</li>
                        <li><strong>Training Zones:</strong> Update your zones after each new test for optimal training</li>
                        <li><strong>Strava Integration:</strong> Connect Strava for automatic activity tracking and analysis</li>
                        <li><strong>Population Insights:</strong> Use population comparison to see how you stack up</li>
                    </ul>
                    <p style="margin-top: 20px;">${userRole === 'coach' ? 'As a coach, you can manage multiple athletes and track their progress over time. Use the comparison features to show your athletes their improvements!' : 'If you\'re working with a coach, share your test results with them for personalized training guidance.'}</p>
                    <p style="margin-top: 30px;">Have questions? Just reply to this email - I'm happy to help!</p>
                    <p><strong>Jakub Stádník</strong><br/>Creator of LaChart<br/><a href="https://lachart.net" style="color: #767EB5;">https://lachart.net</a></p>
                `;
                break;
            case 'community':
                title = 'Join the LaChart Community 🌟';
                subject = 'Join the LaChart Community 🌟';
                emailContent = `
                    <p>Hi ${userName},</p>
                    <p>I'm building <strong>LaChart</strong> with the goal of creating the best lactate testing tool for athletes and coaches.</p>
                    <p style="margin-top: 30px;">
                        <img src="${imageUrl}" alt="LaChart Lactate Testing" style="max-width: 100%; height: auto; border-radius: 8px; margin: 20px 0;" />
                    </p>
                    <h3 style="margin-top: 30px; color: #767EB5;">🌟 How You Can Help:</h3>
                    <ul style="margin: 15px 0; padding-left: 20px; line-height: 1.8;">
                        <li><strong>Share Feedback:</strong> Tell me what features you'd like to see or what's confusing</li>
                        <li><strong>Spread the Word:</strong> Share LaChart with other athletes and coaches</li>
                        <li><strong>Report Issues:</strong> Let me know if you encounter any bugs or problems</li>
                        <li><strong>Feature Requests:</strong> Have an idea? I'd love to hear it!</li>
                    </ul>
                    <p style="margin-top: 20px;">LaChart is completely free and will stay that way. Your feedback helps me prioritize what to build next.</p>
                    <p style="margin-top: 20px;">${userRole === 'coach' ? 'As a coach, you have unique insights into what tools would be most valuable. I\'d especially love to hear from you!' : 'Your experience as an athlete helps me understand what features matter most.'}</p>
                    <p style="margin-top: 30px;">Thanks for being part of this journey!</p>
                    <p><strong>Jakub Stádník</strong><br/>Creator of LaChart<br/><a href="https://lachart.net" style="color: #767EB5;">https://lachart.net</a></p>
                `;
                break;
            case 'thresholdLogicUpdate': {
                title = 'More precise LT1/LT2 + zone generation';
                subject = 'LaChart update: more precise LT1/LT2 and training zones';
                buttonText = 'Login and check previous test';
                buttonUrl = `${clientUrl}/testing`;

                const latestTest = await Test.findOne({ athleteId: String(targetUser._id) })
                    .sort({ date: -1, createdAt: -1 })
                    .lean();
                const previousTest = latestTest
                    ? await Test.findOne({
                        athleteId: String(targetUser._id),
                        _id: { $ne: latestTest._id },
                        sport: latestTest.sport
                      })
                        .sort({ date: -1, createdAt: -1 })
                        .lean()
                    : null;

                const { calculateThresholds } = require('../utils/lactateThresholds');
                const { buildLactateCurveSvg } = require('../utils/lactateReportSvgs');

                const safeNum = (v, d = 2) => (Number.isFinite(Number(v)) ? Number(v).toFixed(d) : '—');
                const fmtDate = (v) => {
                    try {
                        return new Date(v).toLocaleDateString('cs-CZ', { day: '2-digit', month: '2-digit', year: 'numeric' });
                    } catch {
                        return '—';
                    }
                };
                const fmtIntensity = (sport, v) => {
                    const n = Number(v);
                    if (!Number.isFinite(n)) return '—';
                    if (sport === 'bike') return `${Math.round(n)} W`;
                    const sec = Math.max(0, Math.round(n));
                    const m = Math.floor(sec / 60);
                    const s = sec % 60;
                    return `${m}:${String(s).padStart(2, '0')}${sport === 'swim' ? '/100m' : '/km'}`;
                };

                let latestBlock = `
                  <div style="margin-top:16px;padding:12px 14px;border:1px solid #e5e7eb;border-radius:10px;background:#f9fafb;color:#6b7280;">
                    No lactate test found yet for this athlete.
                  </div>
                `;

                if (latestTest && Array.isArray(latestTest.results) && latestTest.results.length >= 3) {
                    const thr = calculateThresholds(latestTest) || {};
                    const lt1 = Number(thr?.LTP1);
                    const lt2 = Number(thr?.LTP2);
                    const la1 = Number(thr?.lactates?.LTP1);
                    const la2 = Number(thr?.lactates?.LTP2);
                    const hr1 = Number(thr?.heartRates?.LTP1);
                    const hr2 = Number(thr?.heartRates?.LTP2);

                    const curveSvg = buildLactateCurveSvg({
                        results: latestTest.results,
                        sportLabel: `${(latestTest.sport || 'sport').toUpperCase()} • ${fmtDate(latestTest.date || latestTest.createdAt)}`,
                        xLabel: latestTest.sport === 'bike' ? 'Power (W)' : 'Pace',
                        sport: latestTest.sport || 'bike',
                        unitSystem: latestTest.unitSystem || 'metric',
                        inputMode: latestTest.inputMode || 'pace',
                        lt1: Number.isFinite(lt1) ? { x: lt1, label: 'LT1', color: '#16a34a' } : null,
                        lt2: Number.isFinite(lt2) ? { x: lt2, label: 'LT2', color: '#dc2626' } : null
                    });

                    latestBlock = `
                      <div style="margin-top:18px;padding:14px;border:1px solid #e5e7eb;border-radius:12px;background:#ffffff;">
                        <div style="font-weight:700;color:#111827;margin-bottom:8px;">Your latest test snapshot</div>
                        <div style="color:#6b7280;font-size:13px;margin-bottom:10px;">
                          ${fmtDate(latestTest.date || latestTest.createdAt)} • ${String(latestTest.sport || '').toUpperCase()}
                        </div>
                        <div style="margin:8px 0 14px 0;">${curveSvg || ''}</div>
                        <table role="presentation" style="width:100%;border-collapse:collapse;font-size:13px;">
                          <tr>
                            <td style="padding:6px 0;border-bottom:1px solid #eef2f7;font-weight:700;color:#111827;">LT1</td>
                            <td style="padding:6px 0;border-bottom:1px solid #eef2f7;color:#111827;">${fmtIntensity(latestTest.sport, lt1)}</td>
                            <td style="padding:6px 0;border-bottom:1px solid #eef2f7;color:#111827;text-align:right;">HR ${safeNum(hr1, 0)} • La ${safeNum(la1, 2)}</td>
                          </tr>
                          <tr>
                            <td style="padding:6px 0;font-weight:700;color:#111827;">LT2</td>
                            <td style="padding:6px 0;color:#111827;">${fmtIntensity(latestTest.sport, lt2)}</td>
                            <td style="padding:6px 0;color:#111827;text-align:right;">HR ${safeNum(hr2, 0)} • La ${safeNum(la2, 2)}</td>
                          </tr>
                        </table>
                      </div>
                    `;
                }

                const prevHint = previousTest
                    ? `<p style="margin-top:14px;">Previous ${String(previousTest.sport || '').toUpperCase()} test: <strong>${fmtDate(previousTest.date || previousTest.createdAt)}</strong>. Compare it with the latest one after login.</p>`
                    : `<p style="margin-top:14px;">You have one test saved now. After your next test, comparison to previous test will be available immediately.</p>`;

                emailContent = `
                    <p>Hi ${userName},</p>
                    <p>I shipped an update to improve <strong>LT1/LT2 detection</strong> and <strong>training zone generation</strong> in LaChart.</p>
                    <p style="margin-top:10px;">What changed:</p>
                    <ul style="margin: 10px 0; padding-left: 20px; line-height: 1.8;">
                        <li><strong>LT1 detection:</strong> better handling of early rise vs. delayed jump, so LT1 is less likely to be overestimated.</li>
                        <li><strong>Zone generation:</strong> zones now align better with measured lactate response and threshold positions.</li>
                        <li><strong>Stability:</strong> noisy points and false starts have lower impact on final LT values.</li>
                    </ul>
                    <p style="margin-top:14px;">Result: your thresholds and generated zones should be more precise and more usable for daily training.</p>
                    ${latestBlock}
                    ${prevHint}
                    <div style="margin: 16px 0 8px 0;">
                        <a href="${clientUrl}/login" style="display:inline-block;background:#767EB5;color:#ffffff;text-decoration:none;padding:10px 14px;border-radius:8px;margin-right:8px;margin-bottom:8px;">Login</a>
                        <a href="${clientUrl}/testing" style="display:inline-block;background:#1f8f55;color:#ffffff;text-decoration:none;padding:10px 14px;border-radius:8px;margin-bottom:8px;">Open Tests & Compare</a>
                    </div>
                    <p style="margin-top: 24px;">Thanks for testing LaChart and helping improve the calculations.</p>
                    <p><strong>Jakub Stádník</strong><br/>Creator of LaChart<br/><a href="https://lachart.net" style="color: #767EB5;">https://lachart.net</a></p>
                `;
                break;
            }
            default:
                title = 'Update from LaChart 📧';
                subject = 'Update from LaChart 📧';
                emailContent = `
                    <p>Hi ${userName},</p>
                    <p>I wanted to reach out and share some updates about <strong>LaChart</strong>!</p>
                    <p style="margin-top: 30px;">
                        <img src="${imageUrl}" alt="LaChart Lactate Testing" style="max-width: 100%; height: auto; border-radius: 8px; margin: 20px 0;" />
                    </p>
                    <p style="margin-top: 20px;">I'm constantly working to improve LaChart and add features that make your training analysis more powerful.</p>
                    <p style="margin-top: 20px;">If you have any feedback, questions, or suggestions, I'd love to hear from you!</p>
                    <p style="margin-top: 30px;">Thanks for using LaChart!</p>
                    <p><strong>Jakub Stádník</strong><br/>Creator of LaChart<br/><a href="https://lachart.net" style="color: #767EB5;">https://lachart.net</a></p>
                `;
        }

        const transporter = createEmailTransporter();

        await transporter.sendMail({
            from: {
                name: 'Jakub - LaChart',
                address: process.env.EMAIL_USER
            },
            to: targetUser.email,
            subject: subject,
            html: generateEmailTemplate({
                title: title,
                content: emailContent,
                buttonText,
                buttonUrl,
                footerText: 'From the creator Jakub Stádník. I am trying to create a useful tool for coaches and athletes. Please let me know if you are using the app as a coach or as an athlete and if you understand the tools or need some more explanation.'
            })
        });

        // Update tracking information
        const updateData = {
            featureAnnouncementEmail: {
                sent: true,
                sentCount: (targetUser.featureAnnouncementEmail?.sentCount || 0) + 1,
                lastSent: new Date(),
                lastType: emailType
            }
        };
        await userDao.updateUser(userId, updateData);

        res.status(200).json({ ok: true, message: "Feature announcement email sent", emailType });
    } catch (error) {
        console.error("Error sending feature announcement email:", error);
        const rawMessage = (error && (error.message || error.reason || String(error))) || "Send failed.";
        const isAuthError = /invalid login|EAUTH|username and password|authentication failed/i.test(rawMessage) || (error.code && String(error.code).toUpperCase().includes('EAUTH'));
        const errorTitle = isAuthError ? "Email credentials invalid. Check EMAIL_APP_PASSWORD (Zoho app password)." : "Failed to send feature announcement email";
        const reason = isAuthError ? rawMessage : (process.env.NODE_ENV === 'development' ? rawMessage : "Check server logs. Common: missing/invalid EMAIL_USER or EMAIL_APP_PASSWORD.");
        res.status(500).json({ error: errorTitle, reason });
    }
});

// Send Strava connection reminder email to a specific user (admin only)
router.post("/admin/send-strava-reminder-email/:userId", verifyToken, async (req, res) => {
    try {
        const currentUser = await userDao.findById(req.user.userId);
        if (!currentUser || !currentUser.admin) {
            return res.status(403).json({ error: "Access denied. Admin privileges required." });
        }

        if (!process.env.EMAIL_USER || !process.env.EMAIL_APP_PASSWORD) {
            return res.status(503).json({
                error: "Email is not configured on the server.",
                reason: "Set EMAIL_USER and EMAIL_APP_PASSWORD in server .env to send emails."
            });
        }

        const { userId } = req.params;
        const targetUser = await userDao.findById(userId);
        if (!targetUser) {
            return res.status(404).json({ error: "User not found" });
        }

        if (!targetUser.email) {
            return res.status(400).json({ error: "User has no email address configured" });
        }

        // Check if already connected
        if (targetUser.strava?.athleteId) {
            return res.status(400).json({ error: "User already has Strava connected" });
        }

        // Respect global emailNotifications preference
        if (targetUser.notifications && targetUser.notifications.emailNotifications === false) {
            return res.status(400).json({ error: "Email notifications are disabled for this user" });
        }

        const { generateEmailTemplate, getClientUrl } = require('../utils/emailTemplate');
        const clientUrl = getClientUrl();
        const imageUrl = `${clientUrl}/images/lactate_testing.png`;
        const stravaAuthUrl = `${clientUrl}/api/integrations/strava/auth-url`;

        const userName = targetUser.name || 'there';

        const emailContent = `
            <p>Hi ${userName},</p>
            <p>I noticed you haven't connected your Strava account yet. Connecting Strava unlocks powerful features that make LaChart much more useful!</p>
            <p style="margin-top: 30px;">
                <img src="${imageUrl}" alt="LaChart Lactate Testing" style="max-width: 100%; height: auto; border-radius: 8px; margin: 20px 0;" />
            </p>
            <h3 style="margin-top: 30px; color: #767EB5;">🚀 What You're Missing:</h3>
            <ul style="margin: 15px 0; padding-left: 20px; line-height: 1.8;">
                <li><strong>Automatic Activity Import:</strong> All your runs, rides, and swims automatically synced to LaChart</li>
                <li><strong>Smart Test Recommendations:</strong> Get personalized lactate test protocols based on your Strava data</li>
                <li><strong>Progress Tracking:</strong> See your performance trends and improvements over time</li>
                <li><strong>Training Load Analysis:</strong> Monitor TSS, form, and fitness automatically</li>
                <li><strong>HR-First Test Planning:</strong> Get test recommendations based on your Strava heart rate data</li>
                <li><strong>Profile Sync:</strong> Automatically update your profile picture from Strava</li>
            </ul>
            <p style="margin-top: 20px;">Connecting takes just 30 seconds and it's completely free!</p>
            <p style="margin-top: 20px;">If you have any questions or need help, just reply to this email.</p>
            <p style="margin-top: 30px;">Thanks!</p>
            <p><strong>Jakub Stádník</strong><br/>Creator of LaChart<br/><a href="https://lachart.net" style="color: #767EB5;">https://lachart.net</a></p>
        `;

        const transporter = createEmailTransporter();
        if (!transporter) {
            return res.status(503).json({
                error: "Email is not configured on the server.",
                reason: "Set EMAIL_USER, EMAIL_APP_PASSWORD, and optionally SMTP_HOST/SMTP_PORT (or default Zoho service)."
            });
        }

        await transporter.sendMail({
            from: {
                name: 'Jakub - LaChart',
                address: process.env.EMAIL_USER
            },
            to: targetUser.email,
            subject: 'Connect Strava to Unlock More Features 🚀',
            html: generateEmailTemplate({
                title: 'Connect Strava to Unlock More Features',
                content: emailContent,
                buttonText: 'Connect Strava Now',
                buttonUrl: `${clientUrl}/settings`,
                footerText: 'From the creator Jakub Stádník. Connecting Strava takes just 30 seconds and unlocks powerful features!'
            })
        });

        // Update tracking information
        const updateData = {
            stravaReminderEmail: {
                sent: true,
                sentCount: (targetUser.stravaReminderEmail?.sentCount || 0) + 1,
                lastSent: new Date()
            }
        };
        await userDao.updateUser(userId, updateData);

        res.status(200).json({ ok: true, message: "Strava reminder email sent" });
    } catch (error) {
        console.error("Error sending Strava reminder email:", error);
        const rawMessage = (error && (error.message || error.reason || String(error))) || "Send failed.";
        const isAuthError = /invalid login|EAUTH|username and password|authentication failed/i.test(rawMessage) || (error.code && String(error.code).toUpperCase().includes('EAUTH'));
        const isDbValidation = error && error.name === 'ValidationError';
        const isNetwork =
            /ETIMEDOUT|ECONNRESET|ECONNREFUSED|ESOCKET|socket|timeout/i.test(rawMessage) ||
            (error.code && /^(ETIMEDOUT|ECONNRESET|ECONNREFUSED|ESOCKET)$/i.test(String(error.code)));
        const errorTitle = isAuthError ? "Email credentials invalid. Check EMAIL_APP_PASSWORD (Zoho app password)." : "Failed to send Strava reminder email";
        const reason = isAuthError
            ? rawMessage
            : isDbValidation
              ? "Saving user after send failed (validation). Check server logs."
              : isNetwork
                ? "SMTP connection issue (timeout or network). Retry in a moment."
                : process.env.NODE_ENV === 'development'
                  ? rawMessage
                  : "Check server logs. Common: invalid EMAIL_APP_PASSWORD, SMTP blocked, or transient provider errors.";
        if (isAuthError) {
            return res.status(400).json({
                error: 'SMTP authentication failed',
                reason: errorTitle,
                smtp: smtpDiagFromError(error)
            });
        }
        res.status(500).json({ error: errorTitle, reason, smtp: smtpDiagFromError(error) });
    }
});

// Send custom outreach email to a coach/tester contact (admin only)
router.post("/admin/send-coach-outreach-email", verifyToken, async (req, res) => {
    try {
        const currentUser = await userDao.findById(req.user.userId);
        if (!currentUser || !currentUser.admin) {
            return res.status(403).json({ error: "Access denied. Admin privileges required." });
        }

        if (!process.env.EMAIL_USER || !process.env.EMAIL_APP_PASSWORD) {
            return res.status(503).json({
                error: "Email is not configured on the server.",
                reason: "Set EMAIL_USER and EMAIL_APP_PASSWORD in server .env to send emails."
            });
        }

        const rawName = (req.body?.name || "").toString().trim();
        const rawEmail = (req.body?.email || "").toString().trim().toLowerCase();
        const customSubject = (req.body?.subject || "").toString().trim();
        const customBody = (req.body?.body || "").toString().trim(); // plain text → converted to HTML paragraphs
        const isPreview = req.body?.preview === true; // send to admin's own email, skip lead tracking

        if (!rawEmail) {
            return res.status(400).json({ error: "Email is required." });
        }
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(rawEmail)) {
            return res.status(400).json({ error: "Invalid email format." });
        }

        // In preview mode, deliver to the requesting admin's own address
        const deliveryEmail = isPreview ? currentUser.email : rawEmail;
        if (!deliveryEmail) {
            return res.status(400).json({ error: "Admin account has no email address." });
        }

        const contactName = rawName || "";
        const { generateEmailTemplate, getClientUrl } = require('../utils/emailTemplate');
        const clientUrl = getClientUrl() || 'https://lachart.net';
        const imageUrl = `${clientUrl}/images/lactate_testing.png`;

        let subject, content;

        if (customSubject && customBody) {
            // Custom personalised email — convert plain text to HTML paragraphs
            subject = customSubject;
            const htmlParagraphs = customBody
                .split(/\n{2,}/)
                .map(block => `<p style="margin-top:14px;line-height:1.6;">${block.replace(/\n/g, '<br/>')}</p>`)
                .join('\n');
            content = `
                ${htmlParagraphs}
                <p style="margin-top: 20px;">
                    <img src="${imageUrl}" alt="LaChart Lactate Testing" style="max-width: 100%; height: auto; border-radius: 8px; margin: 8px 0;" />
                </p>
            `;
        } else {
            // Default generic template
            subject = "Free tool for lactate testing coaches - LaChart";
            const greeting = contactName ? `Hi ${contactName},` : `Hi,`;
            content = `
                <p>${greeting}</p>
                <p>I am building <strong>LaChart</strong>, a free web app for lactate testing coaches and testers.</p>
                <p style="margin-top: 20px;">LaChart helps you:</p>
                <ul style="margin: 15px 0; padding-left: 20px; line-height: 1.8;">
                    <li>log lactate step tests quickly,</li>
                    <li>auto-calculate <strong>LT1 / LT2</strong> and training zones,</li>
                    <li>generate and send a clear <strong>PDF report</strong>,</li>
                    <li>manage athletes and keep test history in one place.</li>
                </ul>
                <p style="margin-top: 20px;">
                    <img src="${imageUrl}" alt="LaChart Lactate Testing" style="max-width: 100%; height: auto; border-radius: 8px; margin: 8px 0;" />
                </p>
                <p style="margin-top: 20px;">If this could be useful for your coaching/testing workflow, I would love your feedback.</p>
                <p style="margin-top: 20px;">You can try it here: <a href="https://lachart.net" style="color: #767EB5;">https://lachart.net</a></p>
                <p style="margin-top: 26px;">Best regards,</p>
                <p><strong>Jakub Stadnik</strong><br/>Creator of LaChart</p>
            `;
        }

        const transporter = createEmailTransporter();
        if (!transporter) {
            return res.status(503).json({
                error: "Email transporter is not configured.",
                reason: "Set SMTP_HOST, SMTP_PORT, EMAIL_USER and EMAIL_APP_PASSWORD."
            });
        }

        await transporter.sendMail({
            from: {
                name: 'Jakub - LaChart',
                address: process.env.EMAIL_USER
            },
            to: deliveryEmail,
            subject: isPreview ? `[PREVIEW] ${subject}` : subject,
            html: generateEmailTemplate({
                title: 'LaChart — Lactate Analysis Tool',
                content: isPreview
                    ? `<p style="background:#fef9c3;border:1px solid #fde047;padding:10px 14px;border-radius:6px;font-size:13px;margin-bottom:18px;">
                        📧 <strong>Preview mode</strong> — this is how the email will look when sent to <em>${rawEmail}</em>. Lead tracking was NOT updated.
                       </p>${content}`
                    : content,
                buttonText: 'Open LaChart',
                buttonUrl: 'https://lachart.net',
                footerText: isPreview
                    ? `This is a preview sent to you (${deliveryEmail}). The actual email will go to ${rawEmail}.`
                    : 'You are receiving this message because we are reaching out to coaches and lactate testers who may benefit from LaChart.'
            })
        });

        // Only update lead tracking when NOT in preview mode
        if (!isPreview) {
            const now = new Date();
            await CoachOutreachLead.findOneAndUpdate(
                { email: rawEmail },
                {
                    $set: {
                        name: contactName,
                        lastSentAt: now,
                        lastUpdatedBy: currentUser._id
                    },
                    $setOnInsert: {
                        createdBy: currentUser._id
                    },
                    $inc: { sentCount: 1 }
                },
                { upsert: true, new: true }
            );
        }

        return res.status(200).json({
            ok: true,
            message: isPreview
                ? `Preview sent to ${deliveryEmail}`
                : "Coach outreach email sent successfully."
        });
    } catch (error) {
        console.error("Error sending coach outreach email:", error);
        const rawMessage = (error && (error.message || error.reason || String(error))) || "Send failed.";
        const isAuthError = /invalid login|EAUTH|username and password|authentication failed/i.test(rawMessage) || (error.code && String(error.code).toUpperCase().includes('EAUTH'));
        const errorTitle = isAuthError ? "Email credentials invalid. Check EMAIL_APP_PASSWORD (Zoho app password)." : "Failed to send coach outreach email";
        const reason = isAuthError ? rawMessage : (process.env.NODE_ENV === 'development' ? rawMessage : "Check server logs. Common: missing/invalid EMAIL_USER or EMAIL_APP_PASSWORD.");
        return res.status(500).json({ error: errorTitle, reason });
    }
});

// Get outreach leads list (admin only)
router.get("/admin/coach-outreach-leads", verifyToken, async (req, res) => {
    try {
        const currentUser = await userDao.findById(req.user.userId);
        if (!currentUser || !currentUser.admin) {
            return res.status(403).json({ error: "Access denied. Admin privileges required." });
        }
        const leads = await CoachOutreachLead.find({})
            .sort({ lastSentAt: -1, createdAt: -1 })
            .lean();
        return res.status(200).json(leads);
    } catch (error) {
        console.error("Error fetching coach outreach leads:", error);
        return res.status(500).json({ error: "Failed to fetch outreach leads" });
    }
});

// Update outreach lead status (admin only)
router.patch("/admin/coach-outreach-leads/:leadId", verifyToken, async (req, res) => {
    try {
        const currentUser = await userDao.findById(req.user.userId);
        if (!currentUser || !currentUser.admin) {
            return res.status(403).json({ error: "Access denied. Admin privileges required." });
        }

        const { leadId } = req.params;
        const { responded, registered, notes, name } = req.body || {};
        const update = { lastUpdatedBy: currentUser._id };
        if (typeof responded === "boolean") update.responded = responded;
        if (typeof registered === "boolean") update.registered = registered;
        if (typeof notes === "string") update.notes = notes;
        if (typeof name === "string") update.name = name.trim();

        const lead = await CoachOutreachLead.findByIdAndUpdate(
            leadId,
            { $set: update },
            { new: true }
        );
        if (!lead) {
            return res.status(404).json({ error: "Outreach lead not found" });
        }
        return res.status(200).json(lead);
    } catch (error) {
        console.error("Error updating coach outreach lead:", error);
        return res.status(500).json({ error: "Failed to update outreach lead" });
    }
});

// ── Retention email test-send (admin only) ────────────────────────────────────
// POST /user/admin/send-retention-email/:userId
// Body: { type: 'weekly' | 'monthly' | 'testReminder' | 'reEngagement' |
//               'milestone_firstTest' | 'milestone_fiveTests' | 'milestone_tenTests' |
//               'anniversary_6' | 'anniversary_12' | 'lt2Improvement' }
router.post("/admin/send-retention-email/:userId", verifyToken, async (req, res) => {
    try {
        const currentUser = await userDao.findById(req.user.userId);
        if (!currentUser || !currentUser.admin) {
            return res.status(403).json({ error: "Access denied. Admin privileges required." });
        }

        const targetUser = await User.findById(req.params.userId).lean();
        if (!targetUser) return res.status(404).json({ error: "User not found." });
        if (!targetUser.email) return res.status(400).json({ error: "User has no email address." });

        const { type } = req.body;
        if (!type) return res.status(400).json({ error: "Missing 'type' field in request body." });

        const {
            sendWeeklyProgressEmail,
            sendMonthlyReportEmail,
            sendTestReminderEmail,
            sendReengagementEmail,
            sendMilestoneEmail,
            sendAnniversaryEmail,
            sendLT2ImprovementEmail,
            sendInviteCoachEmail,
            estimateLT2,
            getRecentTests,
        } = require('../services/retentionEmailService');

        let ok = false;

        if (type === 'weekly')        ok = await sendWeeklyProgressEmail(targetUser);
        else if (type === 'monthly')  ok = await sendMonthlyReportEmail(targetUser);
        else if (type === 'testReminder') ok = await sendTestReminderEmail(targetUser);
        else if (type === 'reEngagement') ok = await sendReengagementEmail(targetUser);
        else if (type === 'anniversary_6')  ok = await sendAnniversaryEmail(targetUser, 6);
        else if (type === 'anniversary_12') ok = await sendAnniversaryEmail(targetUser, 12);
        else if (type.startsWith('milestone_')) {
            const key = type.replace('milestone_', '');
            ok = await sendMilestoneEmail(targetUser, key);
        } else if (type === 'inviteCoach') {
            ok = await sendInviteCoachEmail(targetUser);
        } else if (type === 'lt2Improvement') {
            const tests = await getRecentTests(targetUser._id, 5);
            const lt2   = tests.length ? estimateLT2(tests[0]) : null;
            if (!lt2) return res.status(400).json({ error: "User has no tests with valid LT2 data." });
            ok = await sendLT2ImprovementEmail(targetUser, 8, lt2.value, lt2.sport);
        } else {
            return res.status(400).json({ error: `Unknown email type: ${type}` });
        }

        if (ok) {
            return res.status(200).json({ success: true, message: `Retention email "${type}" sent to ${targetUser.email}.` });
        } else {
            return res.status(500).json({ error: "Email send returned false — check server SMTP logs." });
        }
    } catch (error) {
        console.error("[admin/send-retention-email] error:", error);
        return res.status(500).json({ error: "Failed to send retention email.", detail: error.message });
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
        const { name, surname, email, role, admin, isActive, premium } = req.body;

        const updateData = {};
        if (name !== undefined) updateData.name = name;
        if (surname !== undefined) updateData.surname = surname;
        if (email !== undefined) updateData.email = email;
        if (role !== undefined) updateData.role = role;
        if (admin !== undefined) updateData.admin = admin;
        if (isActive !== undefined) updateData.isActive = isActive;
        if (premium !== undefined) updateData.premium = Boolean(premium);

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
                isActive: updatedUser.isActive,
                premium: updatedUser.premium === true
            }
        });
    } catch (error) {
        console.error("Error updating user:", error);
        res.status(500).json({ error: "Failed to update user" });
    }
});

// Delete athlete with all tests (admin or coach) - safer deletion for problematic athletes
router.delete("/admin/athlete/:athleteId/delete-with-tests", verifyToken, async (req, res) => {
    try {
        const currentUser = await userDao.findById(req.user.userId);
        if (!currentUser) {
            return res.status(401).json({ error: "Unauthorized" });
        }

        // Allow admin or coach (if athlete belongs to coach)
        const isAdmin = currentUser.admin;
        const athleteId = req.params.athleteId;
        
        const athlete = await userDao.findById(athleteId);
        if (!athlete) {
            return res.status(404).json({ error: "Athlete not found" });
        }

        // Check permissions (coach/tester/testing + multi-coach)
        if (!isAdmin && (!isCoachLikeRole(currentUser.role) || !athleteHasCoachUser(athlete, currentUser._id))) {
            return res.status(403).json({ error: "Access denied. You can only delete your own athletes." });
        }

        // Prevent self-deletion
        if (athleteId === currentUser._id.toString()) {
            return res.status(400).json({ error: "You cannot delete your own account using this endpoint." });
        }

        const athleteIdString = athleteId.toString();
        const Training = require("../models/training");

        // Delete all associated data
        const fitTrainingsDeleted = await FitTraining.deleteMany({ athleteId: athleteIdString });
        const trainingsDeleted = await Training.deleteMany({ athleteId: athleteIdString });
        const testsDeleted = await Test.deleteMany({ athleteId: athleteIdString });
        const lactateSessionsDeleted = await LactateSession.deleteMany({ athleteId: athleteIdString });
        const stravaActivitiesDeleted = await StravaActivity.deleteMany({ userId: athleteId });
        const eventsDeleted = await Event.deleteMany({ userId: athleteId });

        // Remove from all linked coaches' athlete lists
        for (const cid of athleteCoachIdSet(athlete)) {
            await userDao.removeAthleteFromCoach(cid, athleteId);
        }

        // Delete athlete account
        await userDao.deleteById(athleteId);

        res.status(200).json({
            message: "Athlete and all associated data deleted successfully",
            deletedData: {
                fitTrainings: fitTrainingsDeleted.deletedCount,
                trainings: trainingsDeleted.deletedCount,
                tests: testsDeleted.deletedCount,
                lactateSessions: lactateSessionsDeleted.deletedCount,
                stravaActivities: stravaActivitiesDeleted.deletedCount,
                events: eventsDeleted.deletedCount
            },
            athleteId: athleteId,
            clearLocalStorage: true
        });
    } catch (error) {
        console.error("Error deleting athlete with tests:", error);
        res.status(500).json({ error: "Failed to delete athlete: " + error.message });
    }
});

// Delete user (admin only) – deletes the user and all associated data
router.delete("/admin/users/:userId", verifyToken, async (req, res) => {
    try {
        const currentUser = await userDao.findById(req.user.userId);
        if (!currentUser || !currentUser.admin) {
            return res.status(403).json({ error: "Access denied. Admin privileges required." });
        }

        const targetUserId = req.params.userId;
        if (targetUserId === req.user.userId || targetUserId === currentUser._id?.toString()) {
            return res.status(400).json({ error: "You cannot delete your own account from here." });
        }

        const user = await userDao.findById(targetUserId);
        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        const userIdString = targetUserId.toString();
        const userId = targetUserId;
        const Training = require("../models/training");

        const fitTrainingsDeleted = await FitTraining.deleteMany({ athleteId: userIdString });
        const trainingsDeleted = await Training.deleteMany({ athleteId: userIdString });
        const testsDeleted = await Test.deleteMany({ athleteId: userIdString });
        const lactateSessionsDeleted = await LactateSession.deleteMany({ athleteId: userIdString });
        const stravaActivitiesDeleted = await StravaActivity.deleteMany({ userId: userId });
        const eventsDeleted = await Event.deleteMany({ userId: userId });

        if (user.coachId) {
            await userDao.removeAthleteFromCoach(user.coachId, userId);
        }
        if (user.athletes && user.athletes.length > 0) {
            for (const athleteId of user.athletes) {
                await userDao.updateUser(athleteId, { coachId: null });
            }
        }

        await userDao.deleteById(targetUserId);

        res.status(200).json({
            message: "User and all associated data deleted successfully",
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
        console.error("Error deleting user (admin):", error);
        res.status(500).json({ error: "Failed to delete user: " + error.message });
    }
});

/** GDPR / portability: strip secrets from stored user document before export. */
function sanitizeUserDocumentForExport(userLean) {
    if (!userLean || typeof userLean !== "object") return userLean;
    const u = JSON.parse(JSON.stringify(userLean));
    delete u.password;
    delete u.resetPasswordToken;
    delete u.resetPasswordExpires;
    delete u.registrationToken;
    delete u.registrationTokenExpires;
    delete u.invitationToken;
    delete u.invitationTokenExpires;
    delete u.emailVerificationToken;
    delete u.emailVerificationTokenExpires;
    if (u.strava && typeof u.strava === "object") {
        u.strava = {
            athleteId: u.strava.athleteId ?? null,
            autoSync: u.strava.autoSync,
            lastSyncDate: u.strava.lastSyncDate ?? null,
            expiresAt: u.strava.expiresAt ?? null,
        };
    }
    if (u.garmin && typeof u.garmin === "object") {
        u.garmin = {
            athleteId: u.garmin.athleteId ?? null,
            autoSync: u.garmin.autoSync,
            lastSyncDate: u.garmin.lastSyncDate ?? null,
            expiresAt: u.garmin.expiresAt ?? null,
        };
    }
    return u;
}

function dedupeMongoDocsById(docs) {
    const map = new Map();
    for (const d of docs || []) {
        if (d && d._id != null) map.set(String(d._id), d);
    }
    return Array.from(map.values());
}

// GDPR: export all personal data for the authenticated user (JSON)
router.get("/export-all-data", verifyToken, async (req, res) => {
    try {
        const userId = req.user.userId;
        const userIdString = userId.toString();

        const user = await User.findById(userId).lean();
        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        const Training = require("../models/training");
        const TestComment = require("../models/TestComment");
        const ProtocolTemplate = require("../models/ProtocolTemplate");
        const Subscription = require("../models/SubscriptionModel");
        const GarminActivity = require("../models/GarminActivity");

        const [
            trainings,
            fitTrainings,
            tests,
            lactateSessions,
            stravaActivities,
            garminActivities,
            events,
            protocolTemplates,
            subscription,
            commentsByAuthor,
        ] = await Promise.all([
            Training.find({ athleteId: userIdString }).lean(),
            FitTraining.find({ athleteId: userIdString }).select("-records").lean(),
            Test.find({ athleteId: userIdString }).lean(),
            LactateSession.find({ athleteId: userIdString }).lean(),
            StravaActivity.find({ userId }).select("-raw").lean(),
            GarminActivity.find({ userId }).select("-raw").lean(),
            Event.find({ $or: [{ userId: userIdString }, { userId: userId }] }).lean(),
            ProtocolTemplate.find({
                $or: [{ createdBy: userId }, { sharedWithAthletes: userId }],
            }).lean(),
            Subscription.findOne({ userId }).lean(),
            TestComment.find({ authorId: userId }).lean(),
        ]);

        const testIds = (tests || []).map((t) => t._id).filter(Boolean);
        const commentsOnMyTests =
            testIds.length > 0 ? await TestComment.find({ testId: { $in: testIds } }).lean() : [];
        const testComments = dedupeMongoDocsById([...(commentsOnMyTests || []), ...(commentsByAuthor || [])]);

        const exportPayload = {
            exportVersion: 1,
            app: "LaChart",
            generatedAt: new Date().toISOString(),
            notes: {
                fitPerSecondRecords:
                    "fitTrainings[].records are omitted (per-second streams; very large). Summaries, laps, zones, and metadata are included. Contact support if you need original FIT files.",
                stravaGarminRaw:
                    "stravaActivities[].raw and garminActivities[].raw are omitted (large third-party payloads). Activity metadata and laps are included.",
            },
            profile: sanitizeUserDocumentForExport(user),
            trainings,
            fitTrainings,
            tests,
            lactateSessions,
            stravaActivities,
            garminActivities,
            events,
            protocolTemplates,
            subscription: subscription || null,
            testComments,
        };

        res.set("Cache-Control", "no-store");
        return res.status(200).json(exportPayload);
    } catch (error) {
        console.error("GDPR export-all-data error:", error);
        return res.status(500).json({ error: "Failed to export data: " + (error.message || "unknown") });
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
