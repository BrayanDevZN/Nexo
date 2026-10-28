import io
import logging
import threading

from backend.infra.config.settings import Settings

logger = logging.getLogger(__name__)

MODEL_FILE = "kokoro-v1.0.int8.onnx"
VOICES_FILE = "voices-v1.0.bin"


class TTSUnavailable(Exception):
    pass


class KokoroTTS:
    """Text to speech on this machine (Kokoro, ONNX): no account, no key. Loaded on the first narration."""
    def __init__(self, settings: Settings):
        self.directory = settings.tts_model_dir
        self.voice, self.lang = settings.tts_voice, settings.tts_lang
        self._model = None
        self._lock = threading.Lock()

    @property
    def available(self) -> bool:
        return (self.directory is not None and (self.directory / MODEL_FILE).is_file()
                and (self.directory / VOICES_FILE).is_file())

    def _load(self):
        if self._model is None:
            try:
                from kokoro_onnx import Kokoro
                self._model = Kokoro(str(self.directory / MODEL_FILE), str(self.directory / VOICES_FILE))
            except Exception:
                logger.exception("Kokoro could not be loaded")
                raise TTSUnavailable("Narration is not available") from None
        return self._model

    def synthesize(self, text: str) -> tuple[bytes, float]:
        """The text as a mono WAV and its length in seconds."""
        if not self.available:
            raise TTSUnavailable("Narration is not available")
        import soundfile
        # One synthesis at a time: it is CPU heavy and the model object is shared.
        with self._lock:
            samples, rate = self._load().create(text, voice=self.voice, speed=1.0, lang=self.lang)
        buffer = io.BytesIO()
        soundfile.write(buffer, samples, rate, format="WAV", subtype="PCM_16")
        return buffer.getvalue(), len(samples) / rate
