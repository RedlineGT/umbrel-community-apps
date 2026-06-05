# Zcash Mining — Umbrel Community App Store

A community app store for [Umbrel](https://umbrel.com) with a self-contained Zcash solo mining stack.

## Add this store to Umbrel

1. Open your Umbrel dashboard
2. Go to **App Store** → **Community App Stores**
3. Paste this URL: `https://github.com/RedlineGT/umbrel-community-apps`

## Apps

| App | Version | Description |
|-----|---------|-------------|
| [Zcash Solo Miner](./zmine-zcash-solo-miner/) | 1.0.0 | Full Zebra node + s-nomp stratum server + OLED dashboard |

## Structure

Each app lives in its own subdirectory named `<store-id>-<app-name>`:

```
umbrel-community-apps/
├── umbrel-app-store.yml          # Store identity
├── zmine-zcash-solo-miner/       # App directory
│   ├── umbrel-app.yml            # App manifest (name, version, port, etc.)
│   ├── docker-compose.yml        # Container definitions
│   ├── icon.png                  # App icon
│   └── images/                   # Docker build contexts
│       ├── nomp/                 # s-nomp + dashboard
│       ├── zebra/                # Zebra full node
│       └── miner/                # nheqminer CPU solver
└── <future-app>/                 # Add more apps here
```

## Adding a new app

1. Create a folder named `zmine-<your-app-name>/`
2. Add `umbrel-app.yml`, `docker-compose.yml`, and `icon.png`
3. Bump the version and push — Umbrel users will see an update prompt automatically

## Versioning & releases

Pushing a version bump to `umbrel-app.yml` triggers a GitHub Actions workflow that creates a tagged release. Umbrel checks the store repo periodically and shows an **Update** button when it detects a new version.
