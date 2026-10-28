import httpx

from backend.infra.config.settings import Settings


class GroqNotConfigured(Exception):
    pass


class GroqUnavailable(Exception):
    pass


class GroqConnection:
    """Chat completions on Groq (OpenAI-compatible). The key is optional and only needed when a call is made."""
    def __init__(self, settings: Settings, transport: httpx.BaseTransport | None = None):
        self.model = settings.groq_model
        self._key = settings.groq_api_key.get_secret_value() if settings.groq_api_key else None
        self._client = httpx.Client(base_url=settings.groq_url, timeout=settings.groq_timeout_seconds,
                                    trust_env=False, transport=transport)

    @property
    def available(self) -> bool:
        return self._key is not None

    def complete(self, messages: list[dict], *, temperature: float = 0.4, max_tokens: int = 8000) -> str:
        if self._key is None:
            raise GroqNotConfigured("GROQ_API_KEY is not set")
        try:
            response = self._client.post(
                "/chat/completions", headers={"Authorization": f"Bearer {self._key}"},
                json={"model": self.model, "messages": messages, "temperature": temperature,
                      "max_tokens": max_tokens})
        except httpx.HTTPError:
            raise GroqUnavailable("Groq unreachable") from None
        if response.status_code != 200:
            # Never echo Groq's body: it can mention the key or the account.
            raise GroqUnavailable(f"Groq answered {response.status_code}")
        try:
            return response.json()["choices"][0]["message"]["content"] or ""
        except (ValueError, KeyError, IndexError, TypeError):
            raise GroqUnavailable("Groq answered an unexpected payload") from None

    def close(self) -> None:
        self._client.close()
