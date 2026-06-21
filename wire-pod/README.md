# Wire Pod - Umbrel App

Free, fully-featured server software for the Anki Vector robot.

## About

Wire Pod allows voice commands to work with any Vector 1.0 or 2.0 robot for no fee. This Umbrel app provides a containerized deployment of wire-pod with full configuration support.

## Features

- Full voice command support for Vector robots
- Web interface for configuration and management
- Localization and multiple language support
- Plugin system for extending functionality
- Bluetooth LE support (optional)
- Multiple STT service options (Vosk, PicoVoice, etc.)

## Configuration

Environment variables can be set in the Umbrel UI:

- `WIREPOD_DEBUG_LOGGING` - Enable debug logging (true/false)
- `WIREPOD_STT_SERVICE` - STT service to use (vosk, etc.)
- `WIREPOD_STT_LANGUAGE` - Language for STT (en-US, etc.)
- `WIREPOD_USE_INBUILT_BLE` - Use built-in Bluetooth LE (true/false)
- `WIREPOD_PICOVOICE_APIKEY` - Optional PicoVoice API key

## Ports

- **Port 8080** - Main web interface (proxied)
- **Port 80** - HTTP service
- **Port 443** - HTTPS service
- **Port 8084** - Additional service port

## Data Persistence

All configuration and data is stored in `/data` volume, which persists across app updates and restarts.

## Links

- [Wire Pod GitHub](https://github.com/kercre123/wire-pod)
- [Installation Guide](https://github.com/kercre123/wire-pod/wiki/Installation)
- [Issue Tracker](https://github.com/kercre123/wire-pod/issues)
