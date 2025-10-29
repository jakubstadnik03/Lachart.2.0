const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const verifyToken = require('../middleware/verifyToken');
const fitUploadController = require('../controllers/fitUploadController');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads/fit-files');
    
    // Create directory if it doesn't exist
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Generate unique filename
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'fit-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const fileFilter = (req, file, cb) => {
  // Only accept .fit files
  if (file.mimetype === 'application/octet-stream' || 
      file.originalname.toLowerCase().endsWith('.fit')) {
    cb(null, true);
  } else {
    cb(new Error('Only .fit files are allowed'), false);
  }
};

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB limit
  },
  fileFilter: fileFilter
});

/**
 * @swagger
 * /api/fit/upload:
 *   post:
 *     summary: Upload FIT file
 *     tags: [FIT]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       201:
 *         description: FIT file uploaded and parsed successfully
 *       400:
 *         description: Invalid file or no file provided
 *       401:
 *         description: Unauthorized
 */
router.post('/upload', verifyToken, upload.single('file'), fitUploadController.uploadFitFile);

/**
 * @swagger
 * /api/fit/trainings:
 *   get:
 *     summary: Get all FIT trainings for authenticated user
 *     tags: [FIT]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of FIT trainings
 *       401:
 *         description: Unauthorized
 */
router.get('/trainings', verifyToken, fitUploadController.getFitTrainings);

/**
 * @swagger
 * /api/fit/trainings/{id}:
 *   get:
 *     summary: Get single FIT training with all records
 *     tags: [FIT]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Training ID
 *     responses:
 *       200:
 *         description: FIT training details
 *       404:
 *         description: Training not found
 *       401:
 *         description: Unauthorized
 */
router.get('/trainings/:id', verifyToken, fitUploadController.getFitTraining);

/**
 * @swagger
 * /api/fit/trainings/{id}/lactate:
 *   put:
 *     summary: Update lactate values for intervals/records
 *     tags: [FIT]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Training ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               lactateValues:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     type:
 *                       type: string
 *                       enum: [lap, record]
 *                     index:
 *                       type: number
 *                     lactate:
 *                       type: number
 *     responses:
 *       200:
 *         description: Lactate values updated successfully
 *       404:
 *         description: Training not found
 *       401:
 *         description: Unauthorized
 */
/**
 * @swagger
 * /api/fit/trainings/{id}:
 *   delete:
 *     summary: Delete FIT training
 *     tags: [FIT]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Training ID
 *     responses:
 *       200:
 *         description: Training deleted successfully
 *       404:
 *         description: Training not found
 *       401:
 *         description: Unauthorized
 */
router.delete('/trainings/:id', verifyToken, fitUploadController.deleteFitTraining);

module.exports = router;


