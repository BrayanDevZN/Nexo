# Google Maps scraper behind nginx. nginx checks the caller's Nexo API key against the Nexo
# backend (auth_request) before anything reaches the scraper, which has no auth of its own.
FROM gosom/google-maps-scraper:v1.18.1

USER root
RUN apt-get update \
 && apt-get install -y --no-install-recommends nginx gettext-base \
 && rm -rf /var/lib/apt/lists/*

COPY nginx.conf.template /etc/nginx/nginx.conf.template
COPY start.sh /start.sh
RUN chmod +x /start.sh

# Replace the base image's entrypoint (the scraper binary); start.sh launches it.
ENTRYPOINT []
CMD ["/start.sh"]
