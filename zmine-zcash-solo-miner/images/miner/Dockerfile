# syntax=docker/dockerfile:1
# nheqminer — ZcashFoundation fork, zebra-mining branch
# Equihash CPU solver using the Tromp algorithm.
#
# Multi-stage build:
#   builder — compiles nheqminer with only the Tromp solver enabled
#   runtime — copies the binary and required shared libs into a slim image

# ── Stage 1: build ────────────────────────────────────────────────────────
FROM ubuntu:22.04 AS builder

ARG DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates \
        build-essential \
        cmake \
        git \
        libboost-all-dev \
        libboost-system1.74.0 \
        libboost-thread1.74.0 \
        libboost-log1.74.0 \
        libboost-filesystem1.74.0 \
        libboost-date-time1.74.0 \
        libgmp-dev \
    && rm -rf /var/lib/apt/lists/*

# Clone the ZcashFoundation nheqminer fork (zebra-mining branch).
# Retry up to 3 times to handle transient network failures at build time.
# We do NOT pass --recurse-submodules: the only submodule is equihash-xenon
# which is only needed for CPU_XENONCAT (disabled). Explicitly deinit it after
# clone to prevent cmake from complaining about missing submodule paths.
RUN for attempt in 1 2 3; do \
        git clone --depth 1 --branch zebra-mining \
            https://github.com/ZcashFoundation/nheqminer.git /build \
        && break; \
        echo "Git clone attempt ${attempt}/3 failed — retrying in 15s..."; \
        rm -rf /build; \
        sleep 15; \
    done && test -d /build/.git

WORKDIR /build

# Remove the xenoncat submodule entry so cmake never tries to look for it.
RUN git submodule deinit --all -f 2>/dev/null || true

RUN mkdir build
WORKDIR /build/build

# Build with only the Tromp CPU solver (no CUDA, no xenoncat ASM).
RUN cmake \
        -DUSE_CUDA_DJEZO=OFF \
        -DUSE_CPU_XENONCAT=OFF \
        -DUSE_CPU_TROMP=ON \
        .. \
    && make -j"$(nproc)"

# ── Stage 2: runtime ──────────────────────────────────────────────────────
FROM ubuntu:22.04

ARG DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
        netcat-openbsd \
        libboost-system1.74.0 \
        libboost-thread1.74.0 \
        libgmp10 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /build/build/nheqminer /usr/local/bin/nheqminer
RUN chmod 755 /usr/local/bin/nheqminer

COPY entrypoint.sh /usr/local/bin/miner-entrypoint.sh
RUN chmod 755 /usr/local/bin/miner-entrypoint.sh

# Non-root user (matches docker-compose user: "1000:1000")
RUN groupadd -g 1000 miner && useradd -u 1000 -g 1000 -s /sbin/nologin miner
USER 1000:1000

ENTRYPOINT ["/usr/local/bin/miner-entrypoint.sh"]
