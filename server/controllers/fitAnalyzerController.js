const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads/fit-files/';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/octet-stream' || path.extname(file.originalname).toLowerCase() === '.fit') {
      cb(null, true);
    } else {
      cb(new Error('Only .fit files are allowed!'), false);
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

// Helper function to format time
const formatTime = (seconds) => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

// Real FIT file parser using Garmin SDK
const parseFitFile = async (filePath) => {
  try {
    const buffer = fs.readFileSync(filePath);
    
    // Dynamic import for ES Module
    const { FitParser, Stream } = await import('@garmin/fitsdk');
    const stream = Stream.fromBuffer(buffer);
    const fitParser = new FitParser(stream);
    
    const { messages, errors } = await fitParser.parse();
    
    if (errors.length > 0) {
      console.warn('FIT parsing warnings:', errors);
    }
    
    // Extract data from messages
    const records = messages.recordMesgs || [];
    const sessions = messages.sessionMesgs || [];
    const laps = messages.lapMesgs || [];
        
    // Extract data from records
    const powerData = [];
    const hrData = [];
    const speedData = [];
    const timeData = [];
    
    records.forEach(record => {
      if (record.power !== undefined) powerData.push(record.power);
      if (record.heartRate !== undefined) hrData.push(record.heartRate);
      if (record.speed !== undefined) speedData.push(record.speed * 3.6); // Convert m/s to km/h
      if (record.timestamp !== undefined) timeData.push(record.timestamp);
    });
    
    // Calculate totals from sessions
    const session = sessions[0] || {};
    const totalTime = session.totalElapsedTime || 0;
    const totalDistance = session.totalDistance || 0;
    const totalCalories = session.totalCalories || 0;
        
    // Calculate averages and max values
    const avgPower = powerData.length > 0 ? Math.round(powerData.reduce((a, b) => a + b, 0) / powerData.length) : 0;
    const maxPower = powerData.length > 0 ? Math.max(...powerData) : 0;
    const avgHR = hrData.length > 0 ? Math.round(hrData.reduce((a, b) => a + b, 0) / hrData.length) : 0;
    const maxHR = hrData.length > 0 ? Math.max(...hrData) : 0;
    const avgSpeed = speedData.length > 0 ? (speedData.reduce((a, b) => a + b, 0) / speedData.length).toFixed(1) : 0;
    const maxSpeed = speedData.length > 0 ? Math.max(...speedData).toFixed(1) : 0;
    
    // Format time
    const hours = Math.floor(totalTime / 3600);
    const minutes = Math.floor((totalTime % 3600) / 60);
    const seconds = totalTime % 60;
    const formattedTime = `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    
    // Process laps
    const processedLaps = laps.map((lap, index) => ({
      lap: index + 1,
      time: formatTime(lap.totalElapsedTime || 0),
      distance: ((lap.totalDistance || 0) / 1000).toFixed(2) + ' km',
      power: Math.round(lap.avgPower || 0) + ' W',
      hr: Math.round(lap.avgHeartRate || 0) + ' bpm'
    }));
        
    // Create chart data (sample every 30 seconds)
    const chartLabels = [];
    const chartPower = [];
    const chartHR = [];
    const chartSpeed = [];
    
    // Sample data every 30 seconds for chart
    const sampleInterval = 30; // seconds
    const startTime = timeData[0] || 0;
    
    for (let i = 0; i < timeData.length; i += sampleInterval) {
      if (i < powerData.length && i < hrData.length && i < speedData.length) {
        chartLabels.push(Math.floor((timeData[i] - startTime) / 60)); // minutes
        chartPower.push(powerData[i]);
        chartHR.push(hrData[i]);
        chartSpeed.push(speedData[i]);
      }
    }
    
    return {
      summary: {
        totalTime: formattedTime,
        totalDistance: (totalDistance / 1000).toFixed(2) + ' km',
        totalCalories: totalCalories,
        avgPower: avgPower + ' W',
        maxPower: maxPower + ' W',
        avgHR: avgHR + ' bpm',
        maxHR: maxHR + ' bpm',
        avgSpeed: avgSpeed + ' km/h',
        maxSpeed: maxSpeed + ' km/h'
      },
      intervals: processedLaps,
      laps: processedLaps,
      chartData: {
        labels: chartLabels,
        power: chartPower,
        heartRate: chartHR,
        speed: chartSpeed
      }
    };
    
  } catch (error) {
    throw error;
  }
};

// Analyze FIT file
const analyzeFitFile = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    console.log('Analyzing FIT file:', req.file.filename);
    
    const filePath = req.file.path;
    const analysisResult = await parseFitFile(filePath);
    
    // Clean up uploaded file
    fs.unlinkSync(filePath);
    
    res.json({
      success: true,
      data: analysisResult
    });
    
  } catch (error) {
    console.error('Error analyzing FIT file:', error);
    
    // Clean up uploaded file if it exists
    if (req.file && req.file.path) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (cleanupError) {
        console.error('Error cleaning up file:', cleanupError);
      }
    }
    
    res.status(500).json({
      error: 'Failed to analyze FIT file',
      message: error.message
    });
  }
};

module.exports = {
  upload,
  analyzeFitFile
};