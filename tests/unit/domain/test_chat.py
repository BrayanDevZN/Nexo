from io import BytesIO

import pytest
from PIL import Image

from backend.controller.schema.chat import ChatSend
from backend.domain.chat import ChatMediaError, ChatMediaTooLarge, normalize_media


def test_chat_audio_signature_size_and_image_normalization(settings):
    audio = b'RIFF0000WAVE' + b'0' * 20
    assert normalize_media('audio', 'audio/wav', audio, settings) == (audio, 'audio/wav')
    with pytest.raises(ChatMediaError):
        normalize_media('audio', 'audio/wav', b'<script>', settings)
    with pytest.raises(ChatMediaError):
        normalize_media('file', 'text/plain', b'x', settings)
    settings.chat_media_max_bytes = 1
    with pytest.raises(ChatMediaTooLarge):
        normalize_media('audio', 'audio/wav', audio, settings)
    settings.chat_media_max_bytes = 10485760
    data = BytesIO()
    Image.new('RGB', (100, 50), 'blue').save(data, format='PNG')
    photo, content_type = normalize_media('image', 'image/png', data.getvalue(), settings)
    assert content_type == 'image/jpeg' and Image.open(BytesIO(photo)).format == 'JPEG'


def test_chat_command_forbids_forged_sender_and_invalid_payload():
    for data in [{}, {'type': 'chat.send', 'member_id': 'wrong', 'client_id': 'wrong', 'text': 'x'}]:
        with pytest.raises(ValueError):
            ChatSend.model_validate(data)
