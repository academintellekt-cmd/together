/**
 * AudioManager - управление фоновой музыкой и звуками вопросов
 */
class AudioManager {
    constructor() {
        this.backgroundMusic = null;
        this.questionSound = null;
        this.isBackgroundPlaying = false;
        this.fadeDuration = 500;
        this.targetVolume = 0.3;
    }
    
    // Запуск фоновой музыки
    playBackgroundMusic(url, volume = 0.3) {
        if (!url) return;
        
        this.targetVolume = volume;
        this.backgroundMusic = new Audio(url);
        this.backgroundMusic.loop = true;
        this.backgroundMusic.volume = volume;
        this.backgroundMusic.play().catch(e => {
            console.warn('Не удалось воспроизвести фоновую музыку:', e);
        });
        this.isBackgroundPlaying = true;
    }
    
    // Пауза фоновой музыки с затуханием
    pauseBackgroundMusic(fadeDuration = null) {
        if (!this.backgroundMusic || !this.isBackgroundPlaying) return;
        
        const duration = fadeDuration || this.fadeDuration;
        const steps = 20;
        const stepTime = duration / steps;
        const currentVolume = this.backgroundMusic.volume;
        const volumeStep = currentVolume / steps;
        
        const fadeOut = setInterval(() => {
            if (this.backgroundMusic.volume > volumeStep) {
                this.backgroundMusic.volume -= volumeStep;
            } else {
                this.backgroundMusic.pause();
                this.isBackgroundPlaying = false;
                clearInterval(fadeOut);
            }
        }, stepTime);
    }
    
    // Возобновление фоновой музыки с затуханием
    resumeBackgroundMusic(targetVolume = null, fadeDuration = null) {
        if (!this.backgroundMusic) return;
        
        const volume = targetVolume !== null ? targetVolume : this.targetVolume;
        const duration = fadeDuration || this.fadeDuration;
        const steps = 20;
        const stepTime = duration / steps;
        const volumeStep = volume / steps;
        
        this.backgroundMusic.volume = 0;
        this.backgroundMusic.play().catch(e => {
            console.warn('Не удалось возобновить фоновую музыку:', e);
        });
        this.isBackgroundPlaying = true;
        
        const fadeIn = setInterval(() => {
            if (this.backgroundMusic.volume < volume - volumeStep) {
                this.backgroundMusic.volume += volumeStep;
            } else {
                this.backgroundMusic.volume = volume;
                clearInterval(fadeIn);
            }
        }, stepTime);
    }
    
    // Воспроизведение звука вопроса
    playQuestionSound(url) {
        if (!url) return;
        
        // Паузим фоновую музыку перед вопросом
        this.pauseBackgroundMusic();
        
        this.questionSound = new Audio(url);
        this.questionSound.play().catch(e => {
            console.warn('Не удалось воспроизвести звук вопроса:', e);
        });
        
        // После окончания звука возобновляем музыку
        this.questionSound.onended = () => {
            this.resumeBackgroundMusic();
        };
    }
    
    // Остановка всех звуков
    stopAll() {
        if (this.backgroundMusic) {
            this.backgroundMusic.pause();
            this.backgroundMusic.currentTime = 0;
        }
        if (this.questionSound) {
            this.questionSound.pause();
            this.questionSound.currentTime = 0;
        }
        this.isBackgroundPlaying = false;
    }
}

// Экспорт для использования
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AudioManager;
}







