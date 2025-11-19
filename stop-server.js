const { exec } = require('child_process');
const os = require('os');

const isWindows = os.platform() === 'win32';

if (isWindows) {
  // Windows
  exec('netstat -ano | findstr :3000', (error, stdout) => {
    if (stdout) {
      const lines = stdout.trim().split('\n');
      const pids = new Set();
      
      lines.forEach(line => {
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && pid !== '0' && /^\d+$/.test(pid)) {
          pids.add(pid);
        }
      });
      
      if (pids.size === 0) {
        console.log('Сервер не запущен');
        return;
      }
      
      console.log(`Найдено процессов на порту 3000: ${pids.size}`);
      let stopped = 0;
      
      pids.forEach(pid => {
        exec(`taskkill /PID ${pid} /F`, (err) => {
          if (err) {
            console.log(`❌ Не удалось остановить процесс ${pid}`);
          } else {
            console.log(`✅ Остановлен процесс ${pid}`);
            stopped++;
          }
          
          if (stopped === pids.size) {
            console.log('✅ Все процессы остановлены');
          }
        });
      });
    } else {
      console.log('✅ Сервер не запущен');
    }
  });
} else {
  // Linux/Mac
  exec('lsof -ti:3000', (error, stdout) => {
    if (stdout) {
      const pids = stdout.trim().split('\n').filter(pid => pid);
      
      if (pids.length === 0) {
        console.log('Сервер не запущен');
        return;
      }
      
      console.log(`Найдено процессов на порту 3000: ${pids.length}`);
      let stopped = 0;
      
      pids.forEach(pid => {
        exec(`kill -9 ${pid}`, (err) => {
          if (err) {
            console.log(`❌ Не удалось остановить процесс ${pid}`);
          } else {
            console.log(`✅ Остановлен процесс ${pid}`);
            stopped++;
          }
          
          if (stopped === pids.length) {
            console.log('✅ Все процессы остановлены');
          }
        });
      });
    } else {
      console.log('✅ Сервер не запущен');
    }
  });
}

