// Преобразует строку формата "Xм Yс" или число в секунды
function parseTimeToSeconds(timeString) {
  if (!timeString || timeString === '') return 0;

  if (typeof timeString === 'number') return timeString;

  const str = timeString.toString().trim();
  if (str === '' || str === '0') return 0;

  let totalSeconds = 0;

  const minutesMatch = str.match(/(\d+)м/);
  if (minutesMatch) {
    totalSeconds += parseInt(minutesMatch[1]) * 60;
  }

  const secondsMatch = str.match(/(\d+)с/);
  if (secondsMatch) {
    totalSeconds += parseInt(secondsMatch[1]);
  }

  if (totalSeconds === 0) {
    const numericValue = parseFloat(str);
    if (!isNaN(numericValue)) {
      return numericValue;
    }
  }

  return totalSeconds;
}

module.exports = {
  parseTimeToSeconds
};

