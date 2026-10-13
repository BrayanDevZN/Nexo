"""Supported client niches shared by the API and persistence layer."""

CLIENT_NICHES = (
    "Contabilidade",
    "Saúde",
    "Beleza e estética",
    "Imobiliário",
    "Advocacia",
    "Educação",
    "Varejo",
    "Comércio",
    "Alimentação",
    "Tecnologia",
    "Construção civil",
    "Indústria",
    "Logística",
    "Serviços profissionais",
    "Marketing e publicidade",
    "Automotivo",
    "Outro",
)


def validate_client_niche(value: str) -> str:
    """Return a canonical supported niche or raise a useful validation error."""
    normalized = next(
        (niche for niche in CLIENT_NICHES if niche.casefold() == value.strip().casefold()),
        None,
    )
    if normalized is None:
        options = ", ".join(CLIENT_NICHES)
        raise ValueError(f"Nicho inválido. Escolha uma das opções: {options}")
    return normalized
