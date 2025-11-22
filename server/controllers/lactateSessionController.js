const LactateSession = require('../models/lactateSession');
const fs = require('fs');
const path = require('path');

const lactateSessionController = {
  // Create new lactate session
  createSession: async (req, res) => {
    try {
      const sessionData = {
        ...req.body,
        athleteId: req.user.userId,
        startedAt: new Date(),
        status: 'active'
      };
      
      const session = new LactateSession(sessionData);
      await session.save();
      
      res.status(201).json({
        success: true,
        session
      });
    } catch (error) {
      console.error('Error creating lactate session:', error);
      res.status(400).json({
        error: 'Error creating session',
        message: error.message
      });
    }
  },

  // Get all sessions for athlete
  getSessions: async (req, res) => {
    try {
      const { athleteId } = req.params;
      const sessions = await LactateSession.find({ athleteId })
        .sort({ date: -1 })
        .select('-measurements'); // Don't send all measurements by default
      
      res.json(sessions);
    } catch (error) {
      console.error('Error fetching lactate sessions:', error);
      res.status(500).json({
        error: 'Error fetching sessions',
        message: error.message
      });
    }
  },

  // Get single session with all data
  getSessionById: async (req, res) => {
    try {
      const { id } = req.params;
      const session = await LactateSession.findById(id);
      
      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }
      
      res.json(session);
    } catch (error) {
      console.error('Error fetching lactate session:', error);
      res.status(500).json({
        error: 'Error fetching session',
        message: error.message
      });
    }
  },

  // Update session (add measurements, update status, etc.)
  updateSession: async (req, res) => {
    try {
      const { id } = req.params;
      const updateData = req.body;
      
      // If adding measurements, append to array
      if (updateData.measurements) {
        const session = await LactateSession.findById(id);
        if (!session) {
          return res.status(404).json({ error: 'Session not found' });
        }
        
        session.measurements.push(...updateData.measurements);
        await session.save();
        res.json({ success: true, session });
        return;
      }
      
      // Regular update
      const session = await LactateSession.findByIdAndUpdate(
        id, 
        updateData, 
        { new: true, runValidators: true }
      );
      
      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }
      
      res.json({ success: true, session });
    } catch (error) {
      console.error('Error updating lactate session:', error);
      res.status(500).json({
        error: 'Error updating session',
        message: error.message
      });
    }
  },

  // Complete session and save FIT file
  completeSession: async (req, res) => {
    try {
      const { id } = req.params;
      const { fitFileData, analysisResults } = req.body;
      
      const session = await LactateSession.findById(id);
      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }
      
      // Update session status
      session.status = 'completed';
      session.completedAt = new Date();
      session.duration = session.completedAt - session.startedAt;
      
      // Save FIT file data if provided
      if (fitFileData) {
        const actualFitData = fitFileData.data || fitFileData;
        
        // Log FIT data structure for debugging
        console.log('[completeSession] Saving FIT file data:', {
          hasRecords: !!actualFitData.records,
          recordsCount: actualFitData.records?.length || 0,
          hasLaps: !!actualFitData.laps,
          lapsCount: actualFitData.laps?.length || 0,
          firstRecord: actualFitData.records?.[0],
          lastRecord: actualFitData.records?.[actualFitData.records?.length - 1]
        });
        
        session.fitFile = {
          originalName: fitFileData.originalName || `lactate-session-${session._id}.fit`,
          fileSize: fitFileData.fileSize || JSON.stringify(actualFitData).length,
          uploadDate: new Date(),
          fitData: actualFitData // Support both formats
        };
      } else {
        console.warn('[completeSession] No fitFileData provided!');
      }
      
      // Save analysis results
      if (analysisResults) {
        session.analysisComplete = true;
        session.thresholds = analysisResults.thresholds;
        session.trainingZones = analysisResults.trainingZones;
      }
      
      await session.save();
      
      res.json({
        success: true,
        session,
        message: 'Session completed successfully'
      });
    } catch (error) {
      console.error('Error completing lactate session:', error);
      res.status(500).json({
        error: 'Error completing session',
        message: error.message
      });
    }
  },

  // Delete session
  deleteSession: async (req, res) => {
    try {
      const { id } = req.params;
      const session = await LactateSession.findByIdAndDelete(id);
      
      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }
      
      res.json({
        success: true,
        message: 'Session deleted successfully'
      });
    } catch (error) {
      console.error('Error deleting lactate session:', error);
      res.status(500).json({
        error: 'Error deleting session',
        message: error.message
      });
    }
  },

  // Generate mock FIT file for testing
  generateMockFitFile: async (req, res) => {
    try {
      const { sessionId } = req.params;
      const session = await LactateSession.findById(sessionId);
      
      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }
      
      // Generate mock FIT data based on session measurements
      const mockFitData = {
        sport: session.sport,
        totalElapsedTime: session.measurements.length * 300, // 5 min intervals
        totalDistance: session.sport === 'run' ? session.measurements.length * 1000 : 
                      session.sport === 'bike' ? session.measurements.length * 2000 : 
                      session.measurements.length * 100, // swimming
        avgSpeed: session.measurements.reduce((sum, m) => sum + (m.speed || 0), 0) / session.measurements.length,
        maxSpeed: Math.max(...session.measurements.map(m => m.speed || 0)),
        avgHeartRate: session.measurements.reduce((sum, m) => sum + (m.heartRate || 0), 0) / session.measurements.length,
        maxHeartRate: Math.max(...session.measurements.map(m => m.heartRate || 0)),
        avgPower: session.measurements.reduce((sum, m) => sum + (m.power || 0), 0) / session.measurements.length,
        maxPower: Math.max(...session.measurements.map(m => m.power || 0)),
        records: session.measurements.map((m, index) => ({
          timestamp: new Date(session.startedAt.getTime() + index * 300000), // 5 min intervals
          power: m.power,
          heartRate: m.heartRate,
          speed: m.speed,
          cadence: m.cadence,
          lactate: m.lactate
        })),
        laps: session.measurements.map((m, index) => ({
          lapNumber: index + 1,
          startTime: new Date(session.startedAt.getTime() + index * 300000),
          totalElapsedTime: 300, // 5 minutes
          totalDistance: session.sport === 'run' ? 1000 : 
                        session.sport === 'bike' ? 2000 : 100,
          avgSpeed: m.speed,
          avgHeartRate: m.heartRate,
          avgPower: m.power,
          lactate: m.lactate
        }))
      };
      
      // Save mock FIT data to session
      session.fitFile = {
        originalName: `mock-${session.title.replace(/\s+/g, '-').toLowerCase()}.fit`,
        fileSize: 1024, // Mock file size
        uploadDate: new Date(),
        fitData: mockFitData
      };
      
      await session.save();
      
      res.json({
        success: true,
        fitData: mockFitData,
        message: 'Mock FIT file generated successfully'
      });
    } catch (error) {
      console.error('Error generating mock FIT file:', error);
      res.status(500).json({
        error: 'Error generating mock FIT file',
        message: error.message
      });
    }
  },

  // Download FIT file for session
  downloadFitFile: async (req, res) => {
    try {
      const { id } = req.params;
      const session = await LactateSession.findById(id);
      
      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      if (!session.fitFile || !session.fitFile.fitData) {
        return res.status(404).json({ error: 'FIT file not found for this session' });
      }

      // Generate FIT file from fitData
      // Note: This is a simplified approach - in production, you'd use a proper FIT file generator library
      const fitData = session.fitFile.fitData;
      
      // Log FIT data structure before download
      console.log('[downloadFitFile] FIT data structure:', {
        hasRecords: !!fitData.records,
        recordsCount: fitData.records?.length || 0,
        hasLaps: !!fitData.laps,
        lapsCount: fitData.laps?.length || 0,
        firstRecord: fitData.records?.[0],
        lastRecord: fitData.records?.[fitData.records?.length - 1]
      });
      
      // Convert fitData to a JSON string that can be downloaded
      // For actual .fit binary format, you'd need a library like @garmin/fitsdk
      const fitJson = JSON.stringify(fitData, null, 2);
      
      // Set headers for download
      const fileName = session.fitFile.originalName || `lactate-session-${session._id}.fit`;
      
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.setHeader('Content-Length', Buffer.byteLength(fitJson, 'utf8'));
      
      res.send(fitJson);
    } catch (error) {
      console.error('Error downloading FIT file:', error);
      res.status(500).json({
        error: 'Error downloading FIT file',
        message: error.message
      });
    }
  }
};

module.exports = lactateSessionController;
