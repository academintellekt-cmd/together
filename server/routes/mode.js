const express = require('express');

function createModeRouter(localModeAvailable) {
  const router = express.Router();

  router.get('/', (req, res) => {
    res.json({
      mode: localModeAvailable ? 'available' : 'unavailable',
      currentMode: req.query.mode || 'global'
    });
  });

  router.post('/', (req, res) => {
    const { mode } = req.body;
    console.log(`📝 Клиент установил режим: ${mode}`);
    res.json({ success: true, mode: mode });
  });

  return router;
}

module.exports = {
  createModeRouter
};

