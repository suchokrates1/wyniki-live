# UNO Player Picker - Chrome Extension v0.3.21

Chrome extension for selecting tennis players in UNO Overlays with player database integration and doubles match support.

## Features

- 🎾 **Player Database Integration** - Load players from wyniki-live API
- 👥 **Doubles Mode** - Select 2 players for one slot (Surname1/Surname2)
- 🏁 **Country Flags** - Automatic flag detection from flagcdn.com
- 🔍 **Search** - Quick filter by name or country code
- ⚡ **Caching** - 5-minute API cache to reduce server load

## Installation

### Method 1: Load Unpacked (Developer Mode)

1. Open `chrome://extensions/` (or `edge://extensions/`)
2. Enable **Developer mode** (top right)
3. Click **Load unpacked**
4. Select the `uno-picker/` folder

### Method 2: Download .crx Package

1. Download from: https://score.vestmedia.pl/download
2. Drag the `.crx` file to `chrome://extensions/`
3. Confirm installation

**Note**: The `.crx` file is a signed Chrome Extension package (CRX3 format), not a ZIP archive.

## Configuration

Default API endpoint: `https://score.vestmedia.pl`

To change the API URL, edit line 7 in `content.js`:
```javascript
const API_BASE = 'https://your-domain.com';
```

## Usage

1. Open UNO Overlays: https://app.overlays.uno/*
2. Player picker appears automatically
3. Search and select players
4. Check "Doubles" for team matches
5. Click "Select A" or "Select B" to apply

## Files

- `manifest.json` - Extension configuration
- `content.js` - Main logic and API integration
- `picker.css` - Styling
- `CHANGELOG.md` - Version history
- `UNO-picker-0.3.21.zip` - Latest release package

## Development

After making changes:

1. Edit files in `uno-picker/` directory
2. Reload extension in Chrome
3. Test on UNO Overlays page
4. Update `CHANGELOG.md`
5. Increment version in `manifest.json`

## API Endpoint

**GET** `https://score.vestmedia.pl/api/players`

Response:
```json
[
  {
    "id": 1,
    "first_name": "John",
    "surname": "Doe",
    "flag": "pl",
    "flagUrl": "https://flagcdn.com/w40/pl.png"
  }
]
```

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for version history.

## License

Proprietary. Part of wyniki-live project.
