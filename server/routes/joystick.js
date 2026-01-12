const express = require('express');
const fs = require('fs');
const path = require('path');

function createJoystickRouter() {
  const router = express.Router();

  // Сохранение конфигурации джойстика
  router.post('/', (req, res) => {
    try {
      const config = req.body;
      const configPath = path.join(__dirname, '..', 'data', 'joystick-config.json');

      const dataDir = path.dirname(configPath);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
      console.log('✅ Конфигурация джойстика сохранена в файл');

      res.json({ success: true, message: 'Конфигурация сохранена' });
    } catch (error) {
      console.error('❌ Ошибка при сохранении конфигурации джойстика:', error);
      res.status(500).json({ error: 'Ошибка при сохранении конфигурации', details: error.message });
    }
  });

  // Загрузка конфигурации джойстика
  router.get('/', (req, res) => {
    try {
      const configPath = path.join(__dirname, '..', 'data', 'joystick-config.json');

      if (!fs.existsSync(configPath)) {
        return res.json({ buttons: {}, axes: {} });
      }

      const configData = fs.readFileSync(configPath, 'utf8');
      const config = JSON.parse(configData);

      console.log('✅ Конфигурация джойстика загружена из файла');
      res.json(config);
    } catch (error) {
      console.error('❌ Ошибка при загрузке конфигурации джойстика:', error);
      res.json({ buttons: {}, axes: {} });
    }
  });

  return router;
}

module.exports = {
  createJoystickRouter
};

