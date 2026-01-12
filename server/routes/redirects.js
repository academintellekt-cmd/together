/**
 * URL Redirects for Backward Compatibility
 * Обеспечивает работу старых URL после реструктуризации
 */

const express = require('express');
const router = express.Router();

// ============================================
// LEGACY REDIRECTS (старые имена файлов)
// ============================================

// ЧГК - старые имена
router.get('/quiz-questions-host.html', (req, res) => {
  res.redirect(301, '/chgk-host.html');
});

router.get('/quiz-questions-player.html', (req, res) => {
  res.redirect(301, '/chgk-player.html');
});

router.get('/quiz-questions-commission.html', (req, res) => {
  res.redirect(301, '/chgk-commission.html');
});

// ============================================
// NEW STRUCTURE REDIRECTS (будущие)
// Когда будем переименовывать файлы
// ============================================

// App pages
// router.get('/index.html', (req, res) => {
//   res.redirect(301, '/app/index.html');
// });

// router.get('/mode-select.html', (req, res) => {
//   res.redirect(301, '/app/menu.html');
// });

// router.get('/quiz-mode-select.html', (req, res) => {
//   res.redirect(301, '/app/game-select.html');
// });

// Quiz game
// router.get('/host.html', (req, res) => {
//   res.redirect(301, '/games/quiz/host.html');
// });

// router.get('/player.html', (req, res) => {
//   res.redirect(301, '/games/quiz/player.html');
// });

// CHGK game
// router.get('/chgk-host.html', (req, res) => {
//   res.redirect(301, '/games/chgk/host.html');
// });

// router.get('/chgk-player.html', (req, res) => {
//   res.redirect(301, '/games/chgk/player.html');
// });

// router.get('/chgk-commission.html', (req, res) => {
//   res.redirect(301, '/games/chgk/commission.html');
// });

// Solo game
// router.get('/solo.html', (req, res) => {
//   res.redirect(301, '/games/solo/play.html');
// });

// router.get('/leaderboard.html', (req, res) => {
//   res.redirect(301, '/games/solo/leaderboard.html');
// });

// Admin pages
// router.get('/local-host-control.html', (req, res) => {
//   res.redirect(301, '/admin/stations/control.html');
// });

// router.get('/station-deploy.html', (req, res) => {
//   res.redirect(301, '/admin/stations/deploy.html');
// });

// router.get('/station.html', (req, res) => {
//   res.redirect(301, '/admin/stations/station.html');
// });

// router.get('/dmx-control.html', (req, res) => {
//   res.redirect(301, '/admin/dmx/control.html');
// });

// router.get('/dmx-config.html', (req, res) => {
//   res.redirect(301, '/admin/dmx/config.html');
// });

// router.get('/dmx-showmaker.html', (req, res) => {
//   res.redirect(301, '/admin/dmx/showmaker.html');
// });

// router.get('/joystick-setup.html', (req, res) => {
//   res.redirect(301, '/admin/input/joystick-setup.html');
// });

// router.get('/settings.html', (req, res) => {
//   res.redirect(301, '/admin/system/settings.html');
// });

// Dev pages
// router.get('/test-joystick.html', (req, res) => {
//   res.redirect(301, '/dev/test-joystick.html');
// });

// router.get('/local-test.html', (req, res) => {
//   res.redirect(301, '/dev/local-test.html');
// });

module.exports = router;

