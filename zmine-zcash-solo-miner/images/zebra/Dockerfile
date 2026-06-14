# syntax=docker/dockerfile:1
# Thin wrapper around the official Zebra image.
# Adds a custom entrypoint that generates zebrad.toml from environment
# variables at container start, then hands off to the official entrypoint
# (which handles setpriv privilege-dropping and CONFIG_FILE_PATH support).

FROM zfnd/zebra:5.1.1

# The official image is based on debian:trixie-slim and already has:
#   - zebrad at /usr/local/bin/zebrad
#   - curl (for health-checks)
#   - setpriv (util-linux)
#   - zebra user (UID/GID 10001)
#   - ENTRYPOINT ["entrypoint.sh"]  (original at /usr/local/bin/entrypoint.sh)

COPY --chown=0:0 generate-config.sh /usr/local/bin/zebra-generate-config.sh
RUN chmod 755 /usr/local/bin/zebra-generate-config.sh

# Override entrypoint so we can generate the config before Zebra starts.
# generate-config.sh writes the TOML and then exec's the original entrypoint.
ENTRYPOINT ["/usr/local/bin/zebra-generate-config.sh"]
CMD ["zebrad"]
