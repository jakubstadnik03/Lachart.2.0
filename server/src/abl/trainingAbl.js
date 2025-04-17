class TrainingAbl {
  // ... existing code ...

  async getTrainingsByTitle(title, userId) {
    try {
      const dao = await this.getDao();
      const trainings = await dao.findByTitle(title, userId);
      return trainings;
    } catch (error) {
      throw new Error(`Error getting trainings by title: ${error.message}`);
    }
  }

  // ... existing code ...
} 