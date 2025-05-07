"use strict";
const crypto = require("crypto");
const mongoose = require('mongoose');
const UserModel = require("../models/UserModel"); // Adjust the path as necessary

class UserDao {
  constructor() {}

  async create(object) {
    object.id = crypto.randomBytes(8).toString("hex");
    const user = new UserModel(object);
    await user.save();
    return user;
  }

  async edit(userId, newData) {
    const updatedUser = await UserModel.findByIdAndUpdate(userId, newData, { new: true });
    return updatedUser;
  }

  async delete(userId) {
    await UserModel.findOneAndDelete({_id: userId});
  }

  async deleteById(userId) {
    try {
      const result = await UserModel.findByIdAndDelete(userId);
      return result;
    } catch (error) {
      console.error("Error deleting user by ID:", error);
      throw error;
    }
  }

  async update(userId, newData) {
    const updatedUser = await UserModel.findByIdAndUpdate(userId, newData, { new: true });
    return updatedUser;
  }

  async list() {
    return await UserModel.find();
  }

  async get(userId) {
    return await UserModel.findOne({ id: userId });
  }

  // Method to find a user by their email address
  async findByEmail(email) {
    try {
      console.log("Looking for user with email:", email);
      const user = await UserModel.findOne({ email: email.toLowerCase() });
      console.log("User found:", user ? "yes" : "no");
      return user;
    } catch (error) {
      console.error("Error finding user by email:", error);
      throw error;
    }
  }

  async findById(id) {
    try {
      console.log('Finding user by ID:', id);
      // Convert string ID to MongoDB ObjectId if needed
      const objectId = mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : id;
      const user = await UserModel.findById(objectId);
      console.log('Found user:', user ? 'yes' : 'no');
      return user;
    } catch (error) {
      console.error("Error finding user by ID:", error);
      throw error;
    }
  }

  async createUser(userData) {
    try {
      console.log("Creating user with data:", { ...userData, password: '[HIDDEN]' });
      const user = new UserModel(userData);
      const savedUser = await user.save();
      console.log("User created with ID:", savedUser._id);
      return savedUser;
    } catch (error) {
      console.error("Error creating user:", error);
      throw error;
    }
  }

  async updateUser(id, updateData) {
    try {
      return await UserModel.findByIdAndUpdate(id, updateData, { new: true });
    } catch (error) {
      console.error("Error updating user:", error);
      throw error;
    }
  }

  async addAthleteToCoach(coachId, athleteId) {
    try {
      return await UserModel.findByIdAndUpdate(
        coachId,
        { $addToSet: { athletes: athleteId } },
        { new: true }
      );
    } catch (error) {
      console.error("Error adding athlete to coach:", error);
      throw error;
    }
  }

  async removeAthleteFromCoach(coachId, athleteId) {
    try {
      return await UserModel.findByIdAndUpdate(
        coachId,
        { $pull: { athletes: athleteId } },
        { new: true }
      );
    } catch (error) {
      console.error("Error removing athlete from coach:", error);
      throw error;
    }
  }

  async findAthletesByCoachId(coachId) {
    try {
      return await UserModel.find({ coachId });
    } catch (error) {
      console.error("Error finding athletes by coach ID:", error);
      throw error;
    }
  }

  async getAthleteTests(athleteId) {
    try {
      const athlete = await this.findById(athleteId);
      return athlete.tests || [];
    } catch (error) {
      console.error('Error in getAthleteTests:', error);
      throw error;
    }
  }

  async findByRegistrationToken(token) {
    return await UserModel.findOne({ 
      registrationToken: token,
      registrationTokenExpires: { $gt: new Date() }
    });
  }

  // Find user by invitation token
  async findByInvitationToken(token) {
    try {
      return await UserModel.findOne({ invitationToken: token });
    } catch (error) {
      throw new Error("Error finding user by invitation token: " + error.message);
    }
  }

  async findByGoogleId(googleId) {
    try {
      const user = await UserModel.findOne({ googleId });
      return user;
    } catch (error) {
      console.error('Error finding user by Google ID:', error);
      throw error;
    }
  }
}

// Exportujeme třídu, ne instanci
module.exports = UserDao;
